const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

/** Runs every morning and creates one consolidated low-stock notification
 * for housekeeping/minibar supplies at or below minimum, as a backstop
 * alongside the real-time check already done at the moment of consumption
 * (server/services/inventoryService.js) — spec §32. */
exports.dailyLowStockSweep = onSchedule(
  { schedule: "0 7 * * *", timeZone: "Africa/Douala" },
  async () => {
    const db = getFirestore();
    const snap = await db.collection("inventoryItems").get();
    const low = snap.docs.map((d) => d.data()).filter((i) => Number(i.quantity || 0) <= Number(i.minStock || 0));
    if (!low.length) return;
    await db.collection("notifications").add({
      type: "low_stock_summary",
      message: `${low.length} item(s) at or below minimum stock: ${low.map((i) => i.name).join(", ")}`,
      read: false, createdAt: FieldValue.serverTimestamp(),
    });
  }
);
