const { db, FieldValue } = require("../config/firebase");
const { ApiError } = require("../utils/errors");
const { logAction } = require("../utils/audit");

const CATEGORIES = ["Whiskey", "Champagne", "Beer", "Juice"];

/** Creates a bar inventory item. Automatically computes totalValue =
 * quantity × unitPrice so the manager dashboard never has to recompute it
 * client-side (spec §16). */
async function createInventoryItem({ category, brand, unit, quantity, unitPrice, uid }) {
  if (!CATEGORIES.includes(category)) throw new ApiError(400, `Category must be one of: ${CATEGORIES.join(", ")}`);
  if (!brand) throw new ApiError(400, "Brand is required.");
  const qty = Number(quantity || 0);
  const price = Number(unitPrice || 0);
  const ref = await db.collection("barInventory").add({
    category, brand, unit: unit || "bottle", quantity: qty, unitPrice: price,
    totalValue: qty * price, quantitySold: 0, totalSalesRevenue: 0,
    createdBy: uid || null, createdAt: FieldValue.serverTimestamp(),
  });
  return { id: ref.id };
}

async function updateInventoryItem({ id, ...fields }, uid) {
  const ref = db.collection("barInventory").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new ApiError(404, "Bar inventory item not found.");
  const current = snap.data();
  const quantity = fields.quantity !== undefined ? Number(fields.quantity) : current.quantity;
  const unitPrice = fields.unitPrice !== undefined ? Number(fields.unitPrice) : current.unitPrice;
  await ref.update({ ...fields, quantity, unitPrice, totalValue: quantity * unitPrice, updatedBy: uid || null, updatedAt: FieldValue.serverTimestamp() });
  return { id };
}

/**
 * Records a physical bar sale — the ONLY way drinks are sold, since the
 * public site never accepts online drink orders (spec §14: "Customers
 * should NOT be allowed to order drinks online"). Deducts inventory,
 * calculates revenue, and records who sold it and when — all inside a
 * transaction so concurrent sales can never oversell stock.
 */
async function sellDrink({ itemId, quantitySold, uid, userName }) {
  const qty = Number(quantitySold || 0);
  if (qty <= 0) throw new ApiError(400, "Quantity sold must be greater than zero.");

  const itemRef = db.collection("barInventory").doc(itemId);
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(itemRef);
    if (!snap.exists) throw new ApiError(404, "Drink not found in inventory.");
    const item = snap.data();
    if (item.quantity < qty) {
      throw new ApiError(409, `Only ${item.quantity} ${item.unit}(s) of ${item.brand} remaining — cannot sell ${qty}.`);
    }
    const total = qty * item.unitPrice;
    const newQuantity = item.quantity - qty;
    tx.update(itemRef, {
      quantity: newQuantity,
      totalValue: newQuantity * item.unitPrice,
      quantitySold: FieldValue.increment(qty),
      totalSalesRevenue: FieldValue.increment(total),
    });
    const saleRef = db.collection("barSales").doc();
    tx.set(saleRef, {
      itemId, category: item.category, brand: item.brand, unit: item.unit,
      quantitySold: qty, unitPrice: item.unitPrice, total,
      soldBy: uid || null, soldByName: userName || "Staff",
      createdAt: FieldValue.serverTimestamp(),
    });
    return { saleId: saleRef.id, total, remainingQuantity: newQuantity, brand: item.brand };
  });

  await logAction({ user: { uid, name: userName }, action: `Bar sale: ${qty} × ${result.brand}`, entity: "barSales", entityId: result.saleId, newValue: result.total });
  await db.collection("notifications").add({
    type: "bar_sale", message: `${qty} × ${result.brand} sold for ${result.total} FCFA.`,
    read: false, createdAt: FieldValue.serverTimestamp(),
  });

  return result;
}

module.exports = { CATEGORIES, createInventoryItem, updateInventoryItem, sellDrink };
