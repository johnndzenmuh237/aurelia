const { db, FieldValue } = require("../config/firebase");
const { ApiError } = require("../utils/errors");
const { mtnMomo, orangeMoney } = require("../config/payment");
const { generatePaymentRef } = require("../utils/idGenerator");
const { balanceOf } = require("../utils/calculations");
const { logAction } = require("../utils/audit");
const { notifyPaymentReceived } = require("./notificationService");

/**
 * Initiates a Mobile Money charge and creates a `pending` payment record.
 * The reservation is NOT marked paid here — only once `confirmPayment`
 * (called from the provider webhook, or a status-poll job) verifies the
 * transaction really succeeded. This is spec §20's core rule: never trust
 * the frontend response alone.
 */
async function initiatePayment({ reservationId, amount, provider, phone, uid }) {
  const resRef = db.collection("reservations").doc(reservationId);
  const resSnap = await resRef.get();
  if (!resSnap.exists) throw new ApiError(404, "Reservation not found.");
  const reservation = resSnap.data();

  const paymentRef = await generatePaymentRef();
  const paymentDocRef = db.collection("payments").doc();
  const externalId = paymentDocRef.id;

  let providerResponse;
  if (provider === "mtn_momo") {
    providerResponse = await mtnMomo.requestToPay({ amount, phone, externalId, payerMessage: `Deposit for ${reservation.reservationCode}` });
  } else if (provider === "orange_money") {
    providerResponse = await orangeMoney.requestToPay({
      amount, phone, externalId,
      returnUrl: `${process.env.PUBLIC_APP_URL || ""}/booking-success.html?ref=${reservation.reservationCode}`,
      cancelUrl: `${process.env.PUBLIC_APP_URL || ""}/booking.html`,
    });
  } else {
    throw new ApiError(400, "Unsupported payment provider. Use mtn_momo or orange_money.");
  }

  await paymentDocRef.set({
    paymentRef, reservationId, guestUid: uid || reservation.guestUid || null,
    guestName: reservation.guestName, amount, currency: "XAF", method: provider,
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

module.exports = { initiatePayment, confirmPayment, refundPayment };
