const { initiatePayment, confirmPayment, refundPayment } = require("../services/paymentService");
const { mtnMomo, orangeMoney } = require("../config/payment");
const { db } = require("../config/firebase");
const { ApiError } = require("../utils/errors");

async function create(req, res, next) {
  try {
    const { reservationId, amount, provider, phone, orderType } = req.body;
    if (!reservationId || !amount || !provider || !phone) {
      throw new ApiError(400, "reservationId, amount, provider and phone are required.");
    }
    const result = await initiatePayment({ reservationId, amount, provider, phone, uid: req.user?.uid, orderType });
    res.status(201).json(result);
  } catch (err) { next(err); }
}

/** Manually re-checks a pending payment's status with the provider — used
 * as a fallback if a webhook is delayed or not yet configured in sandbox. */
async function verify(req, res, next) {
  try {
    const { paymentId } = req.body;
    const snap = await db.collection("payments").doc(paymentId).get();
    if (!snap.exists) throw new ApiError(404, "Payment not found.");
    const payment = snap.data();

    let providerStatus;
    if (payment.method === "mtn_momo") {
      providerStatus = await mtnMomo.checkStatus({ referenceId: payment.providerExternalId, accessToken: req.body.accessToken });
    } else {
      providerStatus = await orangeMoney.checkStatus({ orderId: payment.providerExternalId, accessToken: req.body.accessToken });
    }
    const result = await confirmPayment({ paymentId, providerStatus });
    res.json(result);
  } catch (err) { next(err); }
}

async function refund(req, res, next) {
  try {
    const { paymentId, amount, reason } = req.body;
    if (!paymentId || !amount) throw new ApiError(400, "paymentId and amount are required.");
    res.json(await refundPayment({ paymentId, amount, reason, authorizedByUid: req.user?.uid }));
  } catch (err) { next(err); }
}

/** Provider webhook endpoint — the ONLY place a payment is trusted as final
 * without a client in the loop (spec §20). Verifies signature per provider
 * docs before trusting the payload (left as a clearly marked TODO since it
 * depends on your live merchant setup). */
async function webhook(req, res, next) {
  try {
    // TODO: verify the request signature/IP per your MTN/Orange merchant
    // dashboard docs before trusting req.body in production.
    const { externalId, status } = req.body;
    const snap = await db.collection("payments").where("providerExternalId", "==", externalId).limit(1).get();
    if (snap.empty) return res.status(200).json({ ok: true }); // ack anyway — don't leak internal state
    await confirmPayment({ paymentId: snap.docs[0].id, providerStatus: status });
    res.status(200).json({ ok: true });
  } catch (err) { next(err); }
}

module.exports = { create, verify, refund, webhook };
