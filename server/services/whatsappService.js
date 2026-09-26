const axios = require("axios");
const { db, FieldValue } = require("../config/firebase");
const env = require("../config/environment");

/**
 * Sends the "new paid booking" WhatsApp message to the receptionist
 * (spec §8-9). Uses the WhatsApp Cloud API (Meta) directly — no
 * simulated/fake notification. The receptionist number is configurable
 * from the Admin dashboard (stored on settings/hotel.whatsapp.receptionistNumber,
 * written via the existing PUT /api/reports/finance { settings } route) and
 * falls back to RECEPTIONIST_WHATSAPP_NUMBER in .env if never configured
 * in-app. Never hard-coded.
 *
 * This function must NEVER throw — a WhatsApp outage must never cancel or
 * corrupt an otherwise-successful booking/payment (spec §9, §35). Every
 * attempt (success or failure) is logged to `whatsappLogs` for the Admin
 * to audit, and a failure also drops an in-app notification so staff still
 * see the booking even if the WhatsApp message never arrives.
 */
async function getReceptionistNumber() {
  try {
    const snap = await db.collection("settings").doc("hotel").get();
    const configured = snap.exists ? snap.data()?.whatsapp?.receptionistNumber : null;
    return configured || env.notifications.receptionistWhatsappNumber || null;
  } catch (err) {
    return env.notifications.receptionistWhatsappNumber || null;
  }
}

function buildBookingMessage({ guestName, phone, roomLabel, checkIn, checkOut, adults, amountPaid, paymentMethod, reservationCode, currency }) {
  return [
    "NEW HOTEL BOOKING",
    "",
    `Customer: ${guestName}`,
    `Phone: ${phone}`,
    "",
    `Room: ${roomLabel}`,
    `Check-in: ${checkIn}`,
    `Check-out: ${checkOut}`,
    "",
    `Guests: ${adults}`,
    "",
    `Amount Paid: ${Number(amountPaid || 0).toLocaleString()} ${currency}`,
    `Payment Method: ${paymentMethod}`,
    "Payment Status: PAID",
    "",
    `Booking Reference: ${reservationCode}`,
    "",
    "Please check the receptionist dashboard for full details.",
  ].join("\n");
}

async function logAttempt({ to, message, status, error }) {
  await db.collection("whatsappLogs").add({
    to: to || null, message, status, error: error || null,
    createdAt: FieldValue.serverTimestamp(),
  });
}

/** Low-level send — one message, one recipient, via the configured
 * WhatsApp Business Cloud API app. Returns { ok, error }. */
async function sendWhatsAppMessage(to, message) {
  if (!to) {
    await logAttempt({ to, message, status: "skipped_no_number" });
    return { ok: false, error: "No receptionist WhatsApp number configured." };
  }
  if (!env.notifications.whatsappAccessToken || !env.notifications.whatsappPhoneNumberId) {
    await logAttempt({ to, message, status: "skipped_not_configured" });
    return { ok: false, error: "WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID not configured." };
  }

  const url = `${env.notifications.whatsappApiUrl}/${env.notifications.whatsappPhoneNumberId}/messages`;
  try {
    await axios.post(
      url,
      { messaging_product: "whatsapp", to: to.replace(/[^\d+]/g, ""), type: "text", text: { body: message } },
      { headers: { Authorization: `Bearer ${env.notifications.whatsappAccessToken}`, "Content-Type": "application/json" }, timeout: 10000 }
    );
    await logAttempt({ to, message, status: "sent" });
    return { ok: true };
  } catch (err) {
    const errorMessage = err.response?.data?.error?.message || err.message;
    await logAttempt({ to, message, status: "failed", error: errorMessage });
    // One retry after a short delay — covers transient network/rate-limit
    // blips without building a full queue/backoff system (spec §9: "retry
    // handling where appropriate").
    try {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await axios.post(
        url,
        { messaging_product: "whatsapp", to: to.replace(/[^\d+]/g, ""), type: "text", text: { body: message } },
        { headers: { Authorization: `Bearer ${env.notifications.whatsappAccessToken}`, "Content-Type": "application/json" }, timeout: 10000 }
      );
      await logAttempt({ to, message, status: "sent_on_retry" });
      return { ok: true };
    } catch (retryErr) {
      const retryError = retryErr.response?.data?.error?.message || retryErr.message;
      await logAttempt({ to, message, status: "failed_after_retry", error: retryError });
      return { ok: false, error: retryError };
    }
  }
}

/**
 * Entry point called from paymentService once a room-booking payment is
 * confirmed server-side. Sends the receptionist WhatsApp message AND drops
 * an in-app notification (so the receptionist/manager dashboards update
 * even if WhatsApp is down) — never throws.
 */
async function notifyReceptionistOfPaidBooking(booking) {
  try {
    const to = await getReceptionistNumber();
    const message = buildBookingMessage({ currency: env.currency, ...booking });
    const result = await sendWhatsAppMessage(to, message);
    await db.collection("notifications").add({
      type: "booking_paid_whatsapp",
      message: `Booking ${booking.reservationCode} paid — receptionist WhatsApp ${result.ok ? "sent" : "FAILED: " + result.error}.`,
      read: false, createdAt: FieldValue.serverTimestamp(),
    });
    return result;
  } catch (err) {
    // Absolute last-resort guard — see the function doc above.
    // eslint-disable-next-line no-console
    console.error("[whatsappService] notifyReceptionistOfPaidBooking failed:", err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { notifyReceptionistOfPaidBooking, sendWhatsAppMessage, getReceptionistNumber, buildBookingMessage };
