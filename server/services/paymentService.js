const { db, FieldValue } = require("../config/firebase");
const { ApiError } = require("../utils/errors");
const { mtnMomo, orangeMoney } = require("../config/payment");
const { generatePaymentRef } = require("../utils/idGenerator");
const { balanceOf } = require("../utils/calculations");
const { logAction } = require("../utils/audit");
const { notifyPaymentReceived } = require("./notificationService");
const { notifyReceptionistOfPaidBooking } = require("./whatsappService");

/**
 * Initiates a Mobile Money charge and creates a `pending` payment record.
 * The reservation is NOT marked paid here — only once `confirmPayment`
 * (called from the provider webhook, or a status-poll job) verifies the
 * transaction really succeeded. This is spec §20's core rule: never trust
 * the frontend response alone.
 */
async function initiatePayment({ reservationId, amount, provider, phone, uid, orderType = "reservation" }) {
  const collectionName = orderType === "delivery" ? "orders" : "reservations";
  const resRef = db.collection(collectionName).doc(reservationId);
  const resSnap = await resRef.get();
  if (!resSnap.exists) throw new ApiError(404, orderType === "delivery" ? "Order not found." : "Reservation not found.");
  const reservation = resSnap.data();

  const paymentRef = await generatePaymentRef();
  const paymentDocRef = db.collection("payments").doc();
  const externalId = paymentDocRef.id;

  let providerResponse;
  if (provider === "mtn_momo") {
    providerResponse = await mtnMomo.requestToPay({ amount, phone, externalId, payerMessage: `Payment for ${reservation.reservationCode || reservation.orderNumber}` });
  } else if (provider === "orange_money") {
    providerResponse = await orangeMoney.requestToPay({
      amount, phone, externalId,
      returnUrl: `${process.env.PUBLIC_APP_URL || ""}/booking-success.html?ref=${reservation.reservationCode || reservation.orderNumber}`,
      cancelUrl: `${process.env.PUBLIC_APP_URL || ""}/booking.html`,
    });
  } else {
    throw new ApiError(400, "Unsupported payment provider. Use mtn_momo or orange_money.");
  }

  await paymentDocRef.set({
    paymentRef, reservationId, orderType, guestUid: uid || reservation.guestUid || null,
    guestName: reservation.guestName || reservation.fullName, amount, currency: "XAF", method: provider,
    status: "pending", providerExternalId: externalId,
    providerReference: providerResponse.referenceId || providerResponse.payToken || null,
    createdAt: FieldValue.serverTimestamp(), createdBy: uid || "guest",
  });

  return { paymentRef, paymentId: paymentDocRef.id, providerResponse };
}

/**
 * Called by the webhook (or a manual "verify" action in dev/sandbox mode)
 * once the provider confirms the transaction really succeeded. Idempotent:
 * calling this twice for the same payment has no additional effect,
 * preventing duplicate-webhook double-crediting (spec §20).
 */
async function confirmPayment({ paymentId, providerStatus }) {
  const paymentRef = db.collection("payments").doc(paymentId);
  const paymentSnap = await paymentRef.get();
  if (!paymentSnap.exists) throw new ApiError(404, "Payment not found.");
  const payment = paymentSnap.data();

  if (payment.status === "confirmed") {
    return { alreadyConfirmed: true }; // idempotency guard
  }
  const isSuccess = ["SUCCESSFUL", "SUCCESS"].includes(String(providerStatus).toUpperCase());
  if (!isSuccess) {
    await paymentRef.update({ status: "failed", providerStatus });
    return { confirmed: false };
  }

  await paymentRef.update({ status: "confirmed", confirmedAt: FieldValue.serverTimestamp(), providerStatus });

  if (payment.orderType === "delivery") {
    // Food-delivery order: mark paid and hand off to restaurant staff — no
    // folio/reservation balance math involved (spec §12: food delivery).
    await db.collection("orders").doc(payment.reservationId).update({
      status: "paid", paymentStatus: "paid",
    });
    await db.collection("notifications").add({
      type: "food_delivery_paid", message: `Delivery order paid — ${payment.amount} FCFA. Ready for kitchen.`,
      read: false, createdAt: FieldValue.serverTimestamp(),
    });
    await logAction({ user: null, action: "Delivery order payment confirmed", entity: "payments", entityId: paymentId, newValue: payment.amount });
    return { confirmed: true };
  }

  const resRef = db.collection("reservations").doc(payment.reservationId);
  await db.runTransaction(async (tx) => {
    const resSnap = await tx.get(resRef);
    if (!resSnap.exists) return;
    const reservation = resSnap.data();
    const newPaid = Number(reservation.paid || 0) + Number(payment.amount);
    const newBalance = balanceOf({ total: reservation.total, paid: newPaid });
    tx.update(resRef, {
      paid: newPaid, balance: newBalance,
      paymentStatus: newBalance <= 0 ? "fully_paid" : "partially_paid",
      status: reservation.status === "Pending" ? "Confirmed" : reservation.status,
    });

    const invoiceQuery = await db.collection("invoices").where("reservationId", "==", payment.reservationId).limit(1).get();
    if (!invoiceQuery.empty) {
      tx.update(invoiceQuery.docs[0].ref, {
        paid: newPaid, balance: newBalance, status: newBalance <= 0 ? "paid" : "partially_paid",
      });
    }
  });

  await logAction({ user: null, action: "Payment confirmed", entity: "payments", entityId: paymentId, newValue: payment.amount });
  await notifyPaymentReceived({ reservationId: payment.reservationId, amount: payment.amount, paymentRef: payment.paymentRef });

  // Receptionist/manager WhatsApp + dashboard notification for the newly
  // paid room booking (spec §8-9). Re-reads the reservation for its
  // current room/dates rather than trusting the pre-payment snapshot,
  // and never throws — a WhatsApp outage must not affect the payment
  // that already succeeded above.
  const freshReservationSnap = await resRef.get();
  if (freshReservationSnap.exists) {
    const r = freshReservationSnap.data();
    await notifyReceptionistOfPaidBooking({
      guestName: r.guestName, phone: r.phone, roomLabel: `${r.roomTypeName || ""} Room ${r.room}`.trim(),
      checkIn: r.checkIn, checkOut: r.checkOut, adults: r.adults,
      amountPaid: payment.amount, paymentMethod: payment.method, reservationCode: r.reservationCode,
    });
  }

  return { confirmed: true };
}

async function refundPayment({ paymentId, amount, reason, authorizedByUid }) {
  const paymentSnap = await db.collection("payments").doc(paymentId).get();
  if (!paymentSnap.exists) throw new ApiError(404, "Payment not found.");
  const payment = paymentSnap.data();
  if (amount > payment.amount) throw new ApiError(400, "Refund amount cannot exceed the original payment.");

  const refundRef = db.collection("refunds").doc();
  await refundRef.set({
    paymentId, reservationId: payment.reservationId, guestName: payment.guestName,
    amount, reason: reason || null, authorizedBy: authorizedByUid,
    createdAt: FieldValue.serverTimestamp(),
  });
  await logAction({ user: { uid: authorizedByUid }, action: "Refund issued", entity: "payments", entityId: paymentId, newValue: amount });
  return { refundId: refundRef.id };
}

// ==================== Manual Mobile Money confirmation ====================
// Real MTN/Orange merchant API access (initiatePayment above) requires a
// business merchant account and API approval that most small hotels won't
// have on day one. This is the WORKING fallback used in production until
// that's set up: the guest sends money directly to the hotel's published
// MTN/Orange number, types in the transaction ID their provider's SMS/app
// gave them, and a staff member manually checks that ID against the
// hotel's own phone/MTN dashboard before confirming — same manual-review
// pattern used for other manually-verified payment flows, just applied
// here to room bookings. Nothing above (initiatePayment/confirmPayment/
// refundPayment) is touched; this is purely additive.

/** Normalizes a transaction ID for duplicate checking — same ID typed
 * with different casing/spacing is still the same transaction. */
function normalizeTxId(raw) {
  return String(raw || "").trim().toLowerCase().replace(/\s+/g, "");
}

/**
 * Guest submits their transaction ID after sending money manually. This
 * does NOT confirm the payment — it only records the claim as
 * `pending_manual_review` for a staff member to check and confirm (see
 * confirmManualPayment below). Duplicate protection mirrors the
 * `usedReferences`-as-document-id trick: the normalized transaction ID is
 * the id of a doc in `paymentReferences`, created in the SAME transaction
 * as the payment record, so Firestore itself — not just a client check —
 * rejects a transaction ID that's already been used, even for a
 * different reservation.
 */
async function submitManualPayment({ reservationId, orderType = "reservation", amount, provider, transactionId, senderPhone, uid }) {
  if (!reservationId || !amount || !provider || !transactionId) {
    throw new ApiError(400, "reservationId, amount, provider and transactionId are required.");
  }
  if (!["mtn_momo", "orange_money"].includes(provider)) throw new ApiError(400, "provider must be mtn_momo or orange_money.");
  const normalized = normalizeTxId(transactionId);
  if (normalized.length < 4) throw new ApiError(400, "Please enter a valid transaction ID.");

  const collectionName = orderType === "delivery" ? "orders" : "reservations";
  const resRef = db.collection(collectionName).doc(reservationId);
  const paymentRef = db.collection("payments").doc();
  const refRef = db.collection("paymentReferences").doc(normalized);
  const paymentRefCode = await generatePaymentRef();

  await db.runTransaction(async (tx) => {
    const resSnap = await tx.get(resRef);
    if (!resSnap.exists) throw new ApiError(404, orderType === "delivery" ? "Order not found." : "Reservation not found.");
    const refSnap = await tx.get(refRef);
    if (refSnap.exists) throw new ApiError(409, "This transaction ID has already been submitted. Please check the ID or contact us if you believe this is an error.");
    const reservation = resSnap.data();

    tx.set(refRef, { paymentId: paymentRef.id, reservationId, createdAt: FieldValue.serverTimestamp() });
    tx.set(paymentRef, {
      paymentRef: paymentRefCode, reservationId, orderType, guestUid: uid || reservation.guestUid || null,
      guestName: reservation.guestName || reservation.fullName, amount: Number(amount), currency: "XAF",
      method: provider, status: "pending_manual_review",
      transactionId, senderPhone: senderPhone || null, manualSubmission: true,
      createdAt: FieldValue.serverTimestamp(), createdBy: uid || "guest",
    });
  });

  await logAction({ user: null, action: "Manual payment submitted (awaiting staff confirmation)", entity: "payments", entityId: paymentRef.id, newValue: { reservationId, amount, transactionId } });
  return { paymentId: paymentRef.id, paymentRef: paymentRefCode, status: "pending_manual_review" };
}

/** Staff confirms a manually-submitted payment after checking the
 * transaction ID against the hotel's own MTN/Orange account — reuses
 * the exact same confirmPayment() finalize logic as the webhook path
 * (folio update, WhatsApp notification, etc.), so there is only ONE
 * code path that actually marks a reservation paid, regardless of how
 * the payment was verified. */
async function confirmManualPayment({ paymentId, uid, userName }) {
  const paymentSnap = await db.collection("payments").doc(paymentId).get();
  if (!paymentSnap.exists) throw new ApiError(404, "Payment not found.");
  const payment = paymentSnap.data();
  if (payment.status !== "pending_manual_review") {
    throw new ApiError(409, `This payment is not awaiting manual confirmation (current status: ${payment.status}).`);
  }
  const result = await confirmPayment({ paymentId, providerStatus: "SUCCESSFUL" });
  await logAction({ user: { uid, name: userName }, action: "Manual payment confirmed by staff", entity: "payments", entityId: paymentId, newValue: payment.amount });
  return result;
}

async function rejectManualPayment({ paymentId, reason, uid, userName }) {
  const paymentRef = db.collection("payments").doc(paymentId);
  const paymentSnap = await paymentRef.get();
  if (!paymentSnap.exists) throw new ApiError(404, "Payment not found.");
  if (paymentSnap.data().status !== "pending_manual_review") {
    throw new ApiError(409, "This payment is not awaiting manual confirmation.");
  }
  await paymentRef.update({ status: "rejected", rejectionReason: reason || null });
  await logAction({ user: { uid, name: userName }, action: "Manual payment rejected", entity: "payments", entityId: paymentId, newValue: reason });
  return { paymentId, status: "rejected" };
}

async function listPendingManualPayments() {
  const snap = await db.collection("payments").where("status", "==", "pending_manual_review").get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

module.exports = {
  initiatePayment, confirmPayment, refundPayment,
  submitManualPayment, confirmManualPayment, rejectManualPayment, listPendingManualPayments,
};
