const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getFirestore } = require("firebase-admin/firestore");

/** Marks Mobile Money payments that have sat "pending" for more than 30
 * minutes as failed, so a guest who never approved the MTN/Orange prompt
 * doesn't leave a phantom pending charge blocking their reservation
 * indefinitely (spec §21 payment statuses). */
exports.expireStalePayments = onSchedule(
  { schedule: "*/15 * * * *", timeZone: "Africa/Douala" },
  async () => {
    const db = getFirestore();
    const cutoff = new Date(Date.now() - 30 * 60 * 1000);
    const snap = await db.collection("payments").where("status", "==", "pending").get();
    const batch = db.batch();
    let count = 0;
    snap.docs.forEach((d) => {
      const created = d.data().createdAt?.toDate ? d.data().createdAt.toDate() : null;
      if (created && created < cutoff) {
        batch.update(d.ref, { status: "failed", providerStatus: "EXPIRED" });
        count += 1;
      }
    });
    if (count) await batch.commit();
  }
);
