const { db, FieldValue } = require("../config/firebase");

/**
 * Decrements stock for a list of {name, quantity} items consumed (e.g. by a
 * restaurant order or minibar restock) and creates a low-stock notification
 * automatically when an item crosses its configured minimum (spec §32).
 * Best-effort by design: an unmatched item name logs a transaction but does
 * not block the parent operation (a restaurant sale should never fail just
 * because inventory bookkeeping has a gap).
 */
async function decrementInventoryForOrder(items) {
  for (const item of items) {
    const snap = await db.collection("inventoryItems").where("name", "==", item.name).limit(1).get();
    if (snap.empty) continue;
    const doc = snap.docs[0];
    const data = doc.data();
    const newQty = Math.max(0, Number(data.quantity || 0) - Number(item.quantity || 1));
    await doc.ref.update({ quantity: newQty });

    await db.collection("inventoryTransactions").add({
      item: item.name, type: "consumption", quantity: -Math.abs(item.quantity || 1),
      reference: item.reference || "order", createdAt: FieldValue.serverTimestamp(),
    });

    if (newQty <= Number(data.minStock || 0)) {
      await db.collection("notifications").add({
        type: "low_stock", message: `${item.name} is at or below minimum stock (${newQty} left).`,
        read: false, createdAt: FieldValue.serverTimestamp(),
      });
    }
  }
}

module.exports = { decrementInventoryForOrder };
