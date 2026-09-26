const { db, FieldValue } = require("../config/firebase");
const { todayStr } = require("../utils/dateUtils");

/**
 * Runs the night audit: flags reservations that should have arrived today
 * but never checked in (no-shows) and any Checked-In reservation whose
 * checkout date has passed with an open folio. Never force-closes the day
 * automatically when exceptions exist (spec §62) — it reports them so a
 * manager can act.
 */
async function runNightAudit({ uid, cutoffHours = 6 }) {
  const today = todayStr();

  const dueArrivals = await db.collection("reservations")
    .where("checkIn", "==", today).where("status", "==", "Pending").get();
  let noShows = 0;
  for (const doc of dueArrivals.docs) {
    await doc.ref.update({ status: "No Show" });
    const roomQuery = await db.collection("rooms").where("number", "==", doc.data().room).limit(1).get();
    if (!roomQuery.empty) await roomQuery.docs[0].ref.update({ status: "available" });
    noShows += 1;
  }

  const overdueSnap = await db.collection("reservations")
    .where("status", "==", "Checked In").where("checkOut", "<", today).get();
  const openFolios = overdueSnap.size;

  const paymentsSnap = await db.collection("payments").where("status", "==", "confirmed").get();
  const revenue = paymentsSnap.docs.reduce((sum, d) => {
    const p = d.data();
    const created = p.confirmedAt?.toDate ? p.confirmedAt.toDate() : new Date();
    return created.toISOString().slice(0, 10) === today ? sum + Number(p.amount || 0) : sum;
  }, 0);

  const closed = openFolios === 0;
  await db.collection("auditLogs").add({
    userId: uid || "system", action: "Night audit run", entity: "system", entityId: today,
    newValue: { noShows, openFolios, revenue, closed }, createdAt: FieldValue.serverTimestamp(),
  });

  return { closed, noShows, openFolios, revenue };
}

module.exports = { runNightAudit };
