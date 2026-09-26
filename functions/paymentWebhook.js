const { onRequest } = require("firebase-functions/v2/https");
const { getFirestore } = require("firebase-admin/firestore");
const { confirmPayment } = require("../server/services/paymentService");

/**
 * Alternate webhook endpoint if you prefer MTN/Orange to call a Firebase
 * Functions URL instead of the Vercel /api/webhooks/payment route (both
 * call the exact same confirmPayment() service, so behavior is identical —
 * use whichever fits your infra, not both).
 */
exports.paymentWebhook = onRequest(async (req, res) => {
  try {
    // TODO: verify the request signature per your provider's docs before
    // trusting req.body in production — same requirement noted in
    // server/controllers/paymentController.js.
    const { externalId, status } = req.body;
    const db = getFirestore();
    const snap = await db.collection("payments").where("providerExternalId", "==", externalId).limit(1).get();
    if (snap.empty) return res.status(200).json({ ok: true });
    await confirmPayment({ paymentId: snap.docs[0].id, providerStatus: status });
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[paymentWebhook]", err);
    res.status(200).json({ ok: true }); // ack to provider even on internal error to avoid retries storming
  }
});
