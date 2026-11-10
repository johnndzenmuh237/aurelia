const { db, FieldValue } = require("../config/firebase");
const { ApiError } = require("../utils/errors");
const { logAction } = require("../utils/audit");
const { notify } = require("./notificationHub");

/**
 * RESTAURANT STOCK AND INVENTORY.
 * Built on the existing `inventoryItems` and `inventoryTransactions` collections (no new
 * parallel system): restaurant items are the inventory rows tagged department = "restaurant",
 * so the kitchen's automatic ingredient deduction, the end-of-day close and the owner's
 * Business Records all keep working on the same numbers.
 *
 * Every total is calculated here from the movements. Nobody types a calculated figure.
 * Nothing is deleted: a mistake is corrected with an "adjusted" movement that carries a reason.
 */
const MOVES = { issued: -1, consumed: -1, wasted: -1, returned: 1, adjusted: 0 };
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : NaN; };
const money = (v) => Math.round(v * 100) / 100;
const AUDIENCE = ["role:manager", "role:super_admin"];

function positive(v, label) { const n = num(v); if (!(n > 0)) throw new ApiError(400, `${label} must be more than zero.`); return n; }
function nonNegative(v, label) { if (v === undefined || v === "" || v === null) return 0; const n = num(v); if (!(n >= 0)) throw new ApiError(400, `${label} cannot be negative.`); return n; }
function validDate(v, label, { required = false } = {}) {
  if (!v) { if (required) throw new ApiError(400, `${label} is required.`); return null; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw new ApiError(400, `${label} must be a valid date.`);
  return v;
}

async function findByName(name) {
  const snap = await db.collection("inventoryItems").get();
  const key = name.trim().toLowerCase();
  const hit = snap.docs.find((d) => String(d.data().name || "").trim().toLowerCase() === key && (!d.data().department || d.data().department === "restaurant"));
  return hit || null;
}

async function receive(b, user) {
  const name = String(b.name || "").trim();
  if (!name) throw new ApiError(400, "Item name is required.");
  const quantity = positive(b.quantity, "Quantity purchased");
  const unitCost = nonNegative(b.unitCost, "Unit purchase price");
  const unit = String(b.unit || "").trim();
  if (!unit) throw new ApiError(400, "Unit of measurement is required (bag, kg, carton, piece…).");
  const purchaseDate = validDate(b.purchaseDate, "Purchase date", { required: true });
  if (purchaseDate > new Date().toISOString().slice(0, 10)) throw new ApiError(400, "Purchase date cannot be in the future.");
  const expiryDate = validDate(b.expiryDate, "Expiry date");
  if (expiryDate && expiryDate < purchaseDate) throw new ApiError(400, "Expiry date cannot be before the purchase date.");
  const cost = money(quantity * unitCost);                       // calculated, never typed
  if (b.totalCost !== undefined && b.totalCost !== "" && Math.abs(num(b.totalCost) - cost) > 0.5) {
    throw new ApiError(400, `Total cost must equal quantity × unit price (${cost}). Fix the quantity or the price.`);
  }
  const expectedRevenue = nonNegative(b.expectedRevenue, "Expected selling price / revenue");

  const found = await findByName(name);
  const at = FieldValue.serverTimestamp();
  const detail = {
    category: String(b.category || "General").trim(), unit,
    supplier: String(b.supplier || "").trim(), location: String(b.storageLocation || "").trim(),
    description: String(b.description || "").slice(0, 500), notes: String(b.notes || "").slice(0, 500),
    lastPurchaseDate: purchaseDate, expiryDate: expiryDate || null,
  };
  let id, itemName = name;
  if (found) {
    const d = found.data(); id = found.id; itemName = d.name;
    const purchased = (d.totalPurchased ?? d.quantity ?? 0) + quantity;
    const spent = money((d.totalSpent ?? (d.quantity || 0) * (d.unitCost || 0)) + cost);
    await found.ref.update({ ...detail, department: "restaurant", quantity: (d.quantity || 0) + quantity, totalPurchased: purchased, totalSpent: spent, unitCost: purchased ? money(spent / purchased) : unitCost, expectedRevenue: money((d.expectedRevenue || 0) + expectedRevenue), minStock: b.minStock !== undefined && b.minStock !== "" ? nonNegative(b.minStock, "Minimum stock") : (d.minStock || 0), updatedAt: at });
  } else {
    const ref = await db.collection("inventoryItems").add({
      ...detail, name, department: "restaurant", sku: "", quantity, totalPurchased: quantity, totalSpent: cost, unitCost,
      consumed: 0, wasted: 0, issued: 0, returned: 0, expectedRevenue, minStock: nonNegative(b.minStock, "Minimum stock"),
      createdBy: user?.key || user?.uid || null, createdByName: user?.name || "Staff", createdAt: at, updatedAt: at,
    });
    id = ref.id;
  }
  await move({ itemId: id, itemName, type: "received", quantity, unitCost, cost, purchaseDate, supplier: detail.supplier, receipt: String(b.receiptRef || "").slice(0, 100), user });
  await logAction({ user, action: `Restaurant stock received: ${quantity} ${unit} ${itemName} (${cost})`, entity: "inventoryItems", entityId: id, newValue: { quantity, cost } });
  await notify({ title: `Restaurant stock received: ${itemName}`, message: `${quantity} ${unit} bought for ${cost} FCFA${detail.supplier ? " from " + detail.supplier : ""}.`, type: "stock", audienceKeys: AUDIENCE, actor: user, link: "/admin/restaurant/stock.html", entity: "inventoryItems", entityId: id });
  return { id, name: itemName, cost, created: !found };
}

async function move({ itemId, itemName, type, quantity, unitCost, cost, purchaseDate, supplier, receipt, reason, user }) {
  return db.collection("inventoryTransactions").add({
    item: itemName, itemId, department: "restaurant", type,
    quantity: type === "received" || type === "returned" ? quantity : -Math.abs(quantity),   // signed: + in, − out
    unitCost: unitCost ?? null, cost: cost ?? null, supplier: supplier || null, receipt: receipt || null, reason: reason || null,
    reference: purchaseDate || null, by: user?.key || user?.uid || null, byName: user?.name || "Staff", createdAt: FieldValue.serverTimestamp(),
  });
}

async function adjust({ itemId, type, quantity, reason, direction }, user) {
  if (!(type in MOVES)) throw new ApiError(400, "Choose: issued to kitchen, consumed, wasted, returned or adjusted.");
  const ref = db.collection("inventoryItems").doc(itemId);
  const snap = await ref.get();
  if (!snap.exists || (snap.data().department && snap.data().department !== "restaurant")) throw new ApiError(404, "Restaurant stock item not found.");
  const d = snap.data();
  const q = positive(quantity, "Quantity");
  if (["wasted", "adjusted"].includes(type) && !String(reason || "").trim()) throw new ApiError(400, "A reason is required for waste and adjustments.");
  let delta = MOVES[type] * q;
  if (type === "adjusted") delta = direction === "decrease" ? -q : q;
  const after = (d.quantity || 0) + delta;
  if (after < 0) throw new ApiError(400, `Only ${d.quantity || 0} ${d.unit || ""} of ${d.name} is in stock. Stock cannot go below zero.`);
  const patch = { quantity: after, updatedAt: FieldValue.serverTimestamp() };
  if (type === "consumed") patch.consumed = (d.consumed || 0) + q;
  if (type === "wasted") patch.wasted = (d.wasted || 0) + q;
  if (type === "issued") patch.issued = (d.issued || 0) + q;
  if (type === "returned") patch.returned = (d.returned || 0) + q;
  await ref.update(patch);
  await move({ itemId, itemName: d.name, type, quantity: Math.abs(delta), unitCost: d.unitCost, cost: money(Math.abs(delta) * (d.unitCost || 0)), reason: String(reason || "").slice(0, 300), user });
  await logAction({ user, action: `Restaurant stock ${type}: ${d.name} ${delta > 0 ? "+" : ""}${delta}`, entity: "inventoryItems", entityId: itemId, previousValue: { quantity: d.quantity }, newValue: { quantity: after } });
  const big = type === "adjusted" && Math.abs(delta) > 0.2 * (d.quantity || 1);
  const loss = type === "wasted" && q > 0.1 * (d.totalPurchased || q);
  if (after <= (d.minStock || 0) || big || loss) {
    await notify({
      title: after === 0 ? `Out of stock: ${d.name}` : big ? `Large stock adjustment: ${d.name}` : loss ? `Unusual waste: ${d.name}` : `Low stock: ${d.name}`,
      message: `${d.name}: ${after} ${d.unit || ""} left${reason ? ` (${reason})` : ""}.`, type: "stock_alert", audienceKeys: AUDIENCE, actor: user, link: "/admin/restaurant/stock.html", entity: "inventoryItems", entityId: itemId,
    });
  }
  return { ok: true, quantity: after };
}

async function summary() {
  const items = (await db.collection("inventoryItems").get()).docs.map((x) => ({ id: x.id, ...x.data() })).filter((i) => i.department === "restaurant");
  const today = new Date().toISOString().slice(0, 10), soon = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const rows = items.map((i) => {
    const purchased = i.totalPurchased || 0, qty = i.quantity || 0, cost = i.unitCost || 0;
    return { id: i.id, name: i.name, category: i.category, unit: i.unit, quantity: qty, minStock: i.minStock || 0, purchased, spent: money(i.totalSpent || 0), consumed: i.consumed || 0, wasted: i.wasted || 0, issued: i.issued || 0, returned: i.returned || 0, unitCost: cost, valueRemaining: money(qty * cost), expectedRevenue: money(i.expectedRevenue || 0), supplier: i.supplier || "", location: i.location || "", expiryDate: i.expiryDate || null, lastPurchaseDate: i.lastPurchaseDate || null };
  });
  const alerts = [];
  rows.forEach((r) => {
    if (r.quantity <= 0) alerts.push({ level: "danger", item: r.name, text: `${r.name} is out of stock.` });
    else if (r.quantity <= r.minStock) alerts.push({ level: "warn", item: r.name, text: `${r.name} is low: ${r.quantity} ${r.unit} left (minimum ${r.minStock}).` });
    if (r.expiryDate && r.quantity > 0 && r.expiryDate < today) alerts.push({ level: "danger", item: r.name, text: `${r.name} expired on ${r.expiryDate}.` });
    else if (r.expiryDate && r.quantity > 0 && r.expiryDate <= soon) alerts.push({ level: "warn", item: r.name, text: `${r.name} expires on ${r.expiryDate}.` });
    if (r.purchased && r.wasted > 0.1 * r.purchased) alerts.push({ level: "warn", item: r.name, text: `${r.name}: ${r.wasted} ${r.unit} wasted (over 10% of what was bought).` });
  });
  const orders = (await db.collection("orders").get()).docs.map((d) => d.data()).filter((o) => !/cancel|void/i.test(o.status || ""));
  const spent = money(rows.reduce((s, r) => s + r.spent, 0));
  const expected = money(rows.reduce((s, r) => s + r.expectedRevenue, 0));
  const actualSales = money(orders.reduce((s, o) => s + (Number(o.total) || 0), 0));
  const consumedCost = money(rows.reduce((s, r) => s + r.consumed * r.unitCost, 0));
  const moves = (await db.collection("inventoryTransactions").get()).docs.map((d) => ({ id: d.id, ...d.data() })).filter((m) => m.department === "restaurant")
    .sort((a, b) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0)).slice(0, 60)
    .map((m) => ({ item: m.item, type: m.type, quantity: m.quantity, cost: m.cost, reason: m.reason, supplier: m.supplier, byName: m.byName, at: m.createdAt?.toDate ? m.createdAt.toDate().toISOString() : null }));
  return {
    items: rows, alerts, movements: moves,
    totals: {
      itemCount: rows.length, totalSpent: spent, stockValueRemaining: money(rows.reduce((s, r) => s + r.valueRemaining, 0)),
      consumedCost, wastedCost: money(rows.reduce((s, r) => s + r.wasted * r.unitCost, 0)),
      expectedRevenue: expected, expectedProfit: money(expected - spent),
      actualSales, actualProfit: money(actualSales - consumedCost),
    },
  };
}

module.exports = { receive, adjust, summary };