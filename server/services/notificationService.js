const nodemailer = require("nodemailer");
const env = require("../config/environment");
const { db, FieldValue } = require("../config/firebase");

let transporter = null;
function getTransporter() {
  if (!env.notifications.smtpHost) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.notifications.smtpHost,
      port: env.notifications.smtpPort,
      auth: { user: env.notifications.smtpUser, pass: env.notifications.smtpPass },
    });
  }
  return transporter;
}

/** Sends an email if SMTP is configured; otherwise logs an in-app
 * notification only. Never throws — a notification failure should never
 * fail the reservation/payment/etc it's attached to. */
async function sendEmail({ to, subject, text }) {
  try {
    const t = getTransporter();
    if (t && to) {
      await t.sendMail({ from: env.notifications.fromEmail, to, subject, text });
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[notificationService] email failed:", err.message);
  }
}

async function pushInApp(message, type = "info") {
  await db.collection("notifications").add({ type, message, read: false, createdAt: FieldValue.serverTimestamp() });
}

async function notifyReservationCreated({ email, guestName, reservationCode, checkIn, checkOut, total }) {
  await sendEmail({
    to: email,
    subject: `Your reservation ${reservationCode} — ${env.hotelName}`,
    text: `Hi ${guestName},\n\nYour reservation ${reservationCode} is confirmed for ${checkIn} to ${checkOut}.\nTotal: ${total} ${env.currency}.\n\nSee you soon!\n${env.hotelName}`,
  });
  await pushInApp(`New booking: ${reservationCode}`, "new_booking");
}

async function notifyPaymentReceived({ reservationId, amount, paymentRef }) {
  await pushInApp(`Payment received (${paymentRef}) for reservation ${reservationId}: ${amount} ${env.currency}`, "payment_received");
}

module.exports = { sendEmail, pushInApp, notifyReservationCreated, notifyPaymentReceived };
