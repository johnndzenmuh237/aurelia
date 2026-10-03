const { db, FieldValue } = require("../config/firebase");
const { ApiError } = require("../utils/errors");
const { logAction } = require("../utils/audit");
const { computeDrinkFigures } = require("../utils/calculations");

const CATEGORIES = ["Whiskey", "Champagne", "Beer", "Juice"];
// Full default category set from the bar spec §3 — CATEGORIES above is
// kept for backward compatibility with the original createInventoryItem
// validation; DEFAULT_CATEGORIES is the richer, manager-configurable set
// used by the new barCategories collection below.
const DEFAULT_CATEGORIES = ["Beer", "Juice", "Whiskey", "Champagne", "Soft Drinks", "Water", "Energy Drinks", "Other Drinks"];

/** Creates a bar inventory item. Automatically computes totalValue =
 * quantity × unitPrice so the manager dashboard never has to recompute it
 * client-side (spec §16).
 *
 * EXTENDED (additive, backward-compatible): optionally accepts the full
 * universal-engine fields (containerName, unitsPerContainer,
 * costPerContainer, minStockContainers, openingContainers) from the bar
 * management spec §4-10. An item created the old way (just
 * category/brand/unit/quantity/unitPrice) still works exactly as before —
 * computeDrinkFigures() in utils/calculations.js falls back gracefully
 * when those fields are absent. */
async function createInventoryItem({ category, brand, unit, quantity, unitPrice, uid, containerName, unitsPerContainer, costPerContainer, minStockContainers, openingContainers, supplier }) {
  if (!brand) throw new ApiError(400, "Brand is required.");
  const qty = Number(quantity || 0);
  const price = Number(unitPrice || 0);

  const usingContainerEngine = containerName && unitsPerContainer;
  const openingUnits = usingContainerEngine ? Math.round(Number(openingContainers || 0) * Number(unitsPerContainer)) : qty;

  const docData = {
    category, brand, unit: unit || "bottle",
    quantity: openingUnits, unitPrice: price,
    totalValue: openingUnits * price, quantitySold: 0, totalSalesRevenue: 0,
    createdBy: uid || null, createdAt: FieldValue.serverTimestamp(),
  };
  if (usingContainerEngine) {
    Object.assign(docData, {
      containerName, unitsPerContainer: Number(unitsPerContainer),
      costPerContainer: Number(costPerContainer || 0), sellingPricePerUnit: price,
      minStockContainers: Number(minStockContainers ?? 1),
    });
  }
  const ref = await db.collection("barInventory").add(docData);

  if (usingContainerEngine && openingUnits > 0) {
    await db.collection("barInventoryTransactions").add({
      itemId: ref.id, type: "opening_stock", containers: Number(openingContainers), unitsAdded: openingUnits,
      costPerContainer: Number(costPerContainer || 0), supplier: supplier || null,
      createdBy: uid || null, createdAt: FieldValue.serverTimestamp(),
    });
  }
  await logAction({ user: uid ? { uid } : null, action: "Bar drink created", entity: "barInventory", entityId: ref.id, newValue: { brand } });
  return { id: ref.id };
}

async function updateInventoryItem({ id, ...fields }, uid) {
  const ref = db.collection("barInventory").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new ApiError(404, "Bar inventory item not found.");
  const current = snap.data();
  const quantity = fields.quantity !== undefined ? Number(fields.quantity) : current.quantity;
  const unitPrice = fields.unitPrice !== undefined ? Number(fields.unitPrice) : current.unitPrice;
  const updates = { ...fields, quantity, unitPrice, totalValue: quantity * unitPrice, updatedBy: uid || null, updatedAt: FieldValue.serverTimestamp() };
  if (fields.unitPrice !== undefined && current.sellingPricePerUnit !== undefined) updates.sellingPricePerUnit = unitPrice;
  await ref.update(updates);
  await logAction({ user: uid ? { uid } : null, action: "Bar drink price/config changed", entity: "barInventory", entityId: id, newValue: fields });
  return { id };
}

// ---------------- Drink categories (bar spec §3) ----------------

async function listBarCategories() {
  const snap = await db.collection("barCategories").get();
  if (snap.empty) {
    // First use: seed the spec's default categories so a manager can
    // start adding drinks immediately, same pattern as Aurelia's expense
    // categories (financeService.DEFAULT_EXPENSE_CATEGORIES).
    const batch = db.batch();
    DEFAULT_CATEGORIES.forEach((name) => batch.set(db.collection("barCategories").doc(), { name, isDefault: true, createdAt: FieldValue.serverTimestamp() }));
    await batch.commit();
    const reSnap = await db.collection("barCategories").get();
    return reSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function createBarCategory({ name }, uid) {
  if (!name) throw new ApiError(400, "name is required.");
  const ref = await db.collection("barCategories").add({ name, isDefault: false, createdAt: FieldValue.serverTimestamp() });
  await logAction({ user: uid ? { uid } : null, action: "Bar category created", entity: "barCategories", entityId: ref.id, newValue: { name } });
  return { id: ref.id };
}

// ---------------- Restocking & stock adjustment (bar spec §19-20) ----------------

/** Adds new stock WITHOUT destroying previous records — the running
 * `quantity` increases, and a separate, permanent `barInventoryTransactions`
 * row records exactly when/how much/at what cost/by whom stock entered
 * the business (spec §19). */
async function restockBarItem({ itemId, containers, costPerContainer, supplier }, uid) {
  if (!itemId || !containers || containers <= 0) throw new ApiError(400, "itemId and a positive containers count are required.");
  const ref = db.collection("barInventory").doc(itemId);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ApiError(404, "Bar inventory item not found.");
    const item = snap.data();
    if (!item.unitsPerContainer) throw new ApiError(400, "This drink was not set up with container tracking — edit it to add containerName/unitsPerContainer first.");
    const unitsAdded = Math.round(Number(containers) * item.unitsPerContainer);
    const newQuantity = Number(item.quantity || 0) + unitsAdded;
    const updates = { quantity: newQuantity, totalValue: newQuantity * (item.unitPrice || 0) };
    if (costPerContainer !== undefined) updates.costPerContainer = Number(costPerContainer);
    tx.update(ref, updates);

    tx.set(db.collection("barInventoryTransactions").doc(), {
      itemId, type: "restock", containers: Number(containers), unitsPerContainer: item.unitsPerContainer, unitsAdded,
      costPerContainer: costPerContainer !== undefined ? Number(costPerContainer) : item.costPerContainer,
      supplier: supplier || null, createdBy: uid || null, createdAt: FieldValue.serverTimestamp(),
    });
    return { newQuantity, brand: item.brand };
  });

  await logAction({ user: uid ? { uid } : null, action: "Bar stock restocked", entity: "barInventory", entityId: itemId, newValue: { containers, newQuantity: result.newQuantity } });
  return result;
}

const ADJUSTMENT_REASONS = ["broken", "damaged", "expired", "complimentary", "missing", "manual_correction"];

/** Controlled stock adjustment (spec §20) — every correction, whatever
 * caused it, is a logged, reasoned transaction, never a silent edit.
 * Transactional so inventory can never go negative (spec §27). */
async function adjustBarStock({ itemId, deltaUnits, reason, notes }, uid) {
  if (!itemId || !deltaUnits || !ADJUSTMENT_REASONS.includes(reason)) {
    throw new ApiError(400, `itemId, a non-zero deltaUnits, and reason (one of: ${ADJUSTMENT_REASONS.join(", ")}) are required.`);
  }
  const ref = db.collection("barInventory").doc(itemId);
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ApiError(404, "Bar inventory item not found.");
    const item = snap.data();
    const newQuantity = Number(item.quantity || 0) + Number(deltaUnits);
    if (newQuantity < 0) throw new ApiError(409, `Adjustment would take stock negative (currently ${item.quantity}).`);
    tx.update(ref, { quantity: newQuantity, totalValue: newQuantity * (item.unitPrice || 0) });
    tx.set(db.collection("barStockAdjustments").doc(), {
      itemId, deltaUnits: Number(deltaUnits), reason, notes: notes || null,
      createdBy: uid || null, createdAt: FieldValue.serverTimestamp(),
    });
    return { newQuantity };
  });
  await logAction({ user: uid ? { uid } : null, action: `Bar stock adjusted (${reason})`, entity: "barInventory", entityId: itemId, newValue: { deltaUnits, reason } });
  return result;
}

/** Inventory list with every universal-engine figure attached (stock
 * status, stockLabel, expected revenue/profit) — used by the upgraded
 * bar-inventory.html dashboard. */
async function listInventoryWithFigures() {
  const snap = await db.collection("barInventory").get();
  return snap.docs.map((d) => { const item = { id: d.id, ...d.data() }; return { ...item, figures: computeDrinkFigures(item) }; });
}

// ---------------- Reporting (bar spec §16, §24) ----------------

function dayBounds() { const iso = new Date().toISOString().slice(0, 10); return { from: iso, to: iso }; }
function monthBounds() {
  const d = new Date();
  const from = new Date(d.getFullYear(), d.getMonth(), 1);
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

async function barSalesInRange({ from, to }) {
  const snap = await db.collection("barSales").get();
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(`${to}T23:59:59.999Z`) : null;
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((s) => {
      const date = s.createdAt?.toDate ? s.createdAt.toDate() : null;
      if (!date) return true;
      if (fromDate && date < fromDate) return false;
      if (toDate && date > toDate) return false;
      return true;
    });
}

/** The Bar Manager Dashboard's always-visible cards (spec §16/§26):
 * today/month totals, bottles sold, low/out-of-stock counts, stock value. */
async function barFinancialDashboard() {
  const [today, month, items] = await Promise.all([
    barSalesInRange(dayBounds()), barSalesInRange(monthBounds()), listInventoryWithFigures(),
  ]);
  const sumOf = (rows, key) => rows.reduce((s, r) => s + Number(r[key] || 0), 0);
  const todayCost = today.reduce((s, r) => s + Number(r.quantitySold || 0) * Number(r.unitCostAtSale || 0), 0);
  const monthCost = month.reduce((s, r) => s + Number(r.quantitySold || 0) * Number(r.unitCostAtSale || 0), 0);
  const lowStock = items.filter((i) => i.figures.status === "Low Stock");
  const outOfStock = items.filter((i) => i.figures.status === "Out of Stock");

  return {
    stockValue: items.reduce((s, i) => s + i.figures.totalCost, 0),
    expectedRevenue: items.reduce((s, i) => s + i.figures.expectedRevenue, 0),
    today: { sales: sumOf(today, "total"), profit: sumOf(today, "total") - todayCost, bottlesSold: sumOf(today, "quantitySold"), transactions: today.length },
    month: { sales: sumOf(month, "total"), profit: sumOf(month, "total") - monthCost, bottlesSold: sumOf(month, "quantitySold") },
    lowStockCount: lowStock.length, outOfStockCount: outOfStock.length,
    lowStockItems: lowStock.map((i) => ({ id: i.id, brand: i.brand, stockLabel: i.figures.stockLabel })),
    outOfStockItems: outOfStock.map((i) => ({ id: i.id, brand: i.brand })),
  };
}

async function sellerPerformance({ from, to }) {
  const sales = await barSalesInRange({ from, to });
  const bySeller = {};
  for (const s of sales) {
    const key = s.soldByName || "Unknown";
    const row = (bySeller[key] ||= { transactions: 0, bottlesSold: 0, revenue: 0 });
    row.transactions += 1; row.bottlesSold += Number(s.quantitySold || 0); row.revenue += Number(s.total || 0);
  }
  return Object.entries(bySeller).map(([sellerName, stats]) => ({ sellerName, ...stats }));
}

/**
 * Records a physical bar sale — the ONLY way drinks are sold, since the
 * public site never accepts online drink orders (spec §14: "Customers
 * should NOT be allowed to order drinks online"). Deducts inventory,
 * calculates revenue, and records who sold it and when — all inside a
 * transaction so concurrent sales can never oversell stock.
 */
/** EXTENDED (additive): now also accepts `paymentMethod` (bar spec §21 —
 * cash/MTN/Orange/card/other) and snapshots `unitCostAtSale` whenever the
 * item has container-engine cost data, so historical profit reporting
 * survives later price/cost changes (spec §29) exactly like room-booking
 * payments already do. Both are optional — omitting them keeps the exact
 * original behavior (defaults to "cash", no cost snapshot). */
async function sellDrink({ itemId, quantitySold, uid, userName, paymentMethod }) {
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
    const sellingPrice = item.sellingPricePerUnit ?? item.unitPrice;
    const total = qty * sellingPrice;
    const unitCostAtSale = item.unitsPerContainer ? Number(item.costPerContainer || 0) / item.unitsPerContainer : 0;
    const newQuantity = item.quantity - qty;
    tx.update(itemRef, {
      quantity: newQuantity,
      totalValue: newQuantity * sellingPrice,
      quantitySold: FieldValue.increment(qty),
      totalSalesRevenue: FieldValue.increment(total),
    });
    const saleRef = db.collection("barSales").doc();
    tx.set(saleRef, {
      itemId, category: item.category, brand: item.brand, unit: item.unit,
      quantitySold: qty, unitPrice: sellingPrice, unitCostAtSale, total,
      paymentMethod: paymentMethod || "cash",
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

module.exports = {
  CATEGORIES, DEFAULT_CATEGORIES, createInventoryItem, updateInventoryItem, sellDrink,
  listBarCategories, createBarCategory,
  restockBarItem, adjustBarStock, ADJUSTMENT_REASONS,
  listInventoryWithFigures, barFinancialDashboard, sellerPerformance,
};
