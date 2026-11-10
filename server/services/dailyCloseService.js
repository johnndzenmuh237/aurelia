const { db, FieldValue } = require("../config/firebase");
const { ApiError } = require("../utils/errors");
const { logAction } = require("../utils/audit");
const { notify } = require("./notificationHub");

/**
 * END-OF-DAY CLOSE.
 *
 * Each department submits what it counted at the end of the working day:
 *   restaurant -> sales + remaining stock      bar       -> drinks sold + remaining stock
 *   cashier    -> money received               reception -> occupancy, check-ins, check-outs
 *
 * The server then compares every submission with what the system itself
 * recorded for that date and stores the differences. The submitter is NOT
 * shown the system figures (a blind count), so a number cannot simply be
 * copied to make it match. Managers and the owner see the differences.
 *
 * A submission is never silently overwritten: sending it again keeps the
 * earlier version in `revisions`. Payroll is reported beside the day but is
 * kept out of every cash and sales figure.
 */
const DEPARTMENTS = ["restaurant", "bar", "cashier", "reception"];
const LABELS = { restaurant: "Restaurant", bar: "Bar", cashier: "Cashier", reception: "Reception" };
const METHODS = ["cash", "mtn_momo", "orange_money", "card", "other"];
const MAX_DAYS_BACK = 7;

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const today = () => new Date().toISOString().slice(0, 10);
const tsDate = (v) => (v && typeof v.toDate === "function" ? v.toDate() : v instanceof Date ? v : null);
const dayOf = (v) => { const d = tsDate(v); return d ? d.toISOString().slice(0, 10) : null; };

function method(m) {
  const k = String(m || "cash").toLowerCase().replace(/[\s-]+/g, "_");
  if (k.includes("mtn")) return "mtn_momo";
  if (k.includes("orange")) return "orange_money";
  if (k.includes("card") || k.includes("stripe") || k.includes("visa")) return "card";
  if (k === "cash" || k === "") return "cash";
  return "other";
}

function checkDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) throw new ApiError(400, "A valid date (YYYY-MM-DD) is required.");
  const t = today();
  if (date > t) throw new ApiError(400, "You cannot close a day that has not happened yet.");
  const diff = (new Date(t) - new Date(date)) / 86400000;
  if (diff > MAX_DAYS_BACK) throw new ApiError(400, `Only the last ${MAX_DAYS_BACK} days can still be closed. Ask the owner for older days.`);
}

async function rowsOn(collection, date) {
  const snap = await db.collection(collection).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => dayOf(r.createdAt) === date);
}

/* --------------------------- what the system recorded --------------------------- */

async function systemRestaurant(date) {
  const orders = (await rowsOn("orders", date)).filter((o) => !/cancel|void/i.test(o.status || ""));
  const inv = await db.collection("inventoryItems").get();
  const stock = {};
  inv.docs.forEach((d) => { const x = d.data(); stock[String(x.name || "").trim().toLowerCase()] = { name: x.name, quantity: num(x.quantity) }; });
  return {
    sales: orders.reduce((s, o) => s + num(o.total), 0),
    orders: orders.length,
    plates: orders.reduce((s, o) => s + (o.items || []).reduce((n, i) => n + num(i.quantity || 1), 0), 0),
    stock,
  };
}

async function systemBar(date) {
  const sales = await rowsOn("barSales", date);
  const inv = await db.collection("barInventory").get();
  const items = {};
  inv.docs.forEach((d) => { const x = d.data(); items[d.id] = { name: x.brand, unit: x.unit, quantity: num(x.quantity), sold: 0 }; });
  sales.forEach((s) => { if (items[s.itemId]) items[s.itemId].sold += num(s.quantitySold); });
  return { sales: sales.reduce((s, r) => s + num(r.total), 0), drinksSold: sales.reduce((s, r) => s + num(r.quantitySold), 0), items };
}

/** Money that should be in the till/accounts for the day, by payment method. */
async function systemCash(date) {
  const byMethod = Object.fromEntries(METHODS.map((m) => [m, 0]));
  const parts = { restaurant: 0, bar: 0, otherSales: 0, hotel: 0 };
  // Restaurant: only orders actually paid at the till (room charges are billed to the folio, not collected).
  (await rowsOn("orders", date)).filter((o) => o.status === "paid").forEach((o) => { const a = num(o.total); byMethod[method(o.paymentMethod)] += a; parts.restaurant += a; });
  (await rowsOn("barSales", date)).forEach((s) => { const a = num(s.total); byMethod[method(s.paymentMethod)] += a; parts.bar += a; });
  (await rowsOn("sales", date)).forEach((s) => { const a = num(s.amountPaid ?? s.total); byMethod[method(s.paymentMethod)] += a; parts.otherSales += a; });
  const pay = await db.collection("payments").get();
  pay.docs.map((d) => d.data()).filter((p) => p.status === "confirmed" && dayOf(p.confirmedAt || p.createdAt) === date)
    .forEach((p) => { const a = num(p.amount); byMethod[method(p.method)] += a; parts.hotel += a; });
  const total = Object.values(byMethod).reduce((s, v) => s + v, 0);
  return { byMethod, parts, total };
}

async function systemReception(date) {
  const res = (await db.collection("reservations").get()).docs.map((d) => d.data());
  const rooms = (await db.collection("rooms").get()).docs.map((d) => d.data());
  return {
    checkIns: res.filter((r) => r.checkIn === date && ["Checked In", "Checked Out"].includes(r.status)).length,
    checkOuts: res.filter((r) => r.checkOut === date && r.status === "Checked Out").length,
    occupied: rooms.filter((r) => String(r.status || "").toLowerCase() === "occupied").length,
  };
}

async function payrollPaid(date) {
  const rows = await rowsOn("salaryPayments", date);
  return { paid: rows.reduce((s, r) => s + num(r.amount), 0), payments: rows.length };
}

/* --------------------------- comparison per department --------------------------- */

const line = (label, expected, actual, kind = "money", extra = {}) => {
  const diff = Math.round((num(actual) - num(expected)) * 100) / 100;
  return { label, expected: num(expected), actual: num(actual), diff, kind, flagged: diff !== 0, ...extra };
};

async function compare(dept, date, b) {
  if (dept === "restaurant") {
    const sys = await systemRestaurant(date);
    const lines = [line("Restaurant sales", sys.sales, b.salesReported)];
    if (b.platesSold !== undefined && b.platesSold !== "") lines.push(line("Plates sold", sys.plates, b.platesSold, "count"));
    (b.stock || []).forEach((s) => {
      const hit = sys.stock[String(s.name || "").trim().toLowerCase()];
      if (!hit) lines.push({ label: `${s.name} (not in inventory)`, expected: null, actual: num(s.counted), diff: null, kind: "count", flagged: true, note: "Item is not registered in restaurant stock." });
      else lines.push(line(`Stock: ${hit.name}`, hit.quantity, s.counted, "count", { note: "remaining" }));
    });
    return { system: { sales: sys.sales, orders: sys.orders, plates: sys.plates }, lines };
  }
  if (dept === "bar") {
    const sys = await systemBar(date);
    const lines = [line("Bar sales", sys.sales, b.salesReported), line("Drinks sold", sys.drinksSold, (b.drinks || []).reduce((s, d) => s + num(d.sold), 0), "count")];
    (b.drinks || []).forEach((d) => {
      const hit = sys.items[d.itemId];
      if (!hit) { lines.push({ label: `Unknown drink ${d.itemId}`, expected: null, actual: num(d.remaining), diff: null, kind: "count", flagged: true }); return; }
      lines.push(line(`${hit.name}: sold`, hit.sold, d.sold, "count"));
      lines.push(line(`${hit.name}: remaining`, hit.quantity, d.remaining, "count", { note: "remaining" }));
    });
    return { system: { sales: sys.sales, drinksSold: sys.drinksSold }, lines };
  }
  if (dept === "cashier") {
    const sys = await systemCash(date);
    const rec = b.received || {};
    const lines = METHODS.filter((m) => sys.byMethod[m] || num(rec[m])).map((m) => line(`Received: ${m.replace("_", " ")}`, sys.byMethod[m], rec[m]));
    const total = METHODS.reduce((s, m) => s + num(rec[m]), 0);
    lines.push(line("Total received", sys.total, total));
    return { system: { total: sys.total, byMethod: sys.byMethod, parts: sys.parts }, lines };
  }
  const sys = await systemReception(date);
  return { system: sys, lines: [line("Check-ins", sys.checkIns, b.checkIns, "count"), line("Check-outs", sys.checkOuts, b.checkOuts, "count"), line("Rooms occupied", sys.occupied, b.occupied, "count")] };
}

/* --------------------------- validation of what was typed --------------------------- */

function cleanSubmission(dept, b = {}) {
  const need = (v, label) => { if (v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) || Number(v) < 0) throw new ApiError(400, `${label} is required and cannot be negative.`); return Number(v); };
  const notes = String(b.notes || "").slice(0, 1000);
  if (dept === "restaurant") {
    const stock = Array.isArray(b.stock) ? b.stock : [];
    return { salesReported: need(b.salesReported, "Total restaurant sales"), platesSold: b.platesSold === undefined || b.platesSold === "" ? undefined : need(b.platesSold, "Plates sold"), stock: stock.filter((s) => s && s.name).map((s) => ({ name: String(s.name).slice(0, 80), counted: need(s.counted, `Remaining ${s.name}`) })), notes };
  }
  if (dept === "bar") {
    const drinks = Array.isArray(b.drinks) ? b.drinks : [];
    if (!drinks.length) throw new ApiError(400, "Count at least one drink.");
    return { salesReported: need(b.salesReported, "Total bar sales"), drinks: drinks.filter((d) => d && d.itemId).map((d) => ({ itemId: String(d.itemId), sold: need(d.sold, "Drinks sold"), remaining: need(d.remaining, "Drinks remaining") })), notes };
  }
  if (dept === "cashier") {
    const received = {}; METHODS.forEach((m) => { received[m] = need((b.received || {})[m] ?? 0, `Amount received (${m})`); });
    return { received, notes };
  }
  return { occupied: need(b.occupied, "Rooms occupied"), checkIns: need(b.checkIns, "Check-ins"), checkOuts: need(b.checkOuts, "Check-outs"), notes };
}

/* --------------------------- submit / read --------------------------- */

async function submit({ dept, date, body, user }) {
  if (!DEPARTMENTS.includes(dept)) throw new ApiError(400, "Unknown department.");
  date = date || today();
  checkDate(date);
  const submitted = cleanSubmission(dept, body);
  const { system, lines } = await compare(dept, date, submitted);
  const flagged = lines.filter((l) => l.flagged);
  const ref = db.collection("dailyClose").doc(`${date}_${dept}`);
  const prev = await ref.get();
  const revisions = prev.exists ? [...(prev.data().revisions || []), { submitted: prev.data().submitted, submittedByName: prev.data().submittedByName, submittedAt: prev.data().submittedAt || null, lines: prev.data().lines }] : [];

  await ref.set({
    date, department: dept, submitted, system, lines,
    status: flagged.length ? "flagged" : "balanced", flaggedCount: flagged.length,
    submittedBy: user?.key || user?.uid || null, submittedByName: user?.name || "Staff",
    submittedAt: FieldValue.serverTimestamp(), revisions,
  });
  await logAction({ user, action: `Daily close ${prev.exists ? "corrected" : "submitted"}: ${LABELS[dept]} ${date}`, entity: "dailyClose", entityId: ref.id, newValue: { status: flagged.length ? "flagged" : "balanced", flagged: flagged.length } });

  await notify({
    title: `${LABELS[dept]} closed ${date}${flagged.length ? ` — ${flagged.length} difference(s)` : " — balanced"}`,
    message: flagged.length ? flagged.slice(0, 3).map((l) => `${l.label}: ${l.diff > 0 ? "+" : ""}${l.diff}`).join("; ") : "Everything counted matches the system.",
    type: flagged.length ? "daily_close_flag" : "daily_close", audienceKeys: ["role:manager", "role:super_admin"], actor: user, link: "/admin/daily-close.html", entity: "dailyClose", entityId: ref.id,
  });
  const all = await Promise.all(DEPARTMENTS.map((d) => db.collection("dailyClose").doc(`${date}_${d}`).get()));
  if (all.every((s) => s.exists)) {
    const bad = all.filter((s) => s.data().status === "flagged").length;
    await notify({ title: `Daily report ready for ${date}`, message: bad ? `${bad} of 4 departments have differences to review.` : "All four departments balanced.", type: "daily_report", audienceKeys: ["role:manager", "role:super_admin"], link: "/admin/daily-close.html" });
  }
  return { ok: true, id: ref.id, corrected: prev.exists };
}

/** Consolidated report for one day (managers + owner). */
async function report(date) {
  date = date || today();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError(400, "A valid date (YYYY-MM-DD) is required.");
  const docs = await Promise.all(DEPARTMENTS.map((d) => db.collection("dailyClose").doc(`${date}_${d}`).get()));
  const departments = DEPARTMENTS.map((d, i) => {
    const s = docs[i];
    if (!s.exists) return { department: d, label: LABELS[d], status: "missing" };
    const x = s.data();
    return { department: d, label: LABELS[d], status: x.status, submittedByName: x.submittedByName, submittedAt: x.submittedAt?.toDate ? x.submittedAt.toDate().toISOString() : null, notes: x.submitted?.notes || "", lines: x.lines, system: x.system, flaggedCount: x.flaggedCount, corrections: (x.revisions || []).length };
  });
  const issues = [];
  departments.forEach((d) => {
    if (d.status === "missing") issues.push({ department: d.label, type: "missing", text: `${d.label} has not submitted its close.` });
    (d.lines || []).filter((l) => l.flagged).forEach((l) => {
      const gap = l.diff === null ? "not found in the system" : `${l.diff > 0 ? "+" : ""}${l.diff} (counted ${l.actual}, system ${l.expected})`;
      let type = "difference";
      if (l.kind === "money" && /sales/i.test(l.label)) type = l.diff > 0 ? "unrecorded_sale" : "overstated_sale";
      else if (/received/i.test(l.label)) type = l.diff < 0 ? "cash_short" : "cash_over";
      else if (l.note === "remaining") type = l.diff < 0 ? "missing_stock" : "stock_surplus";
      issues.push({ department: d.label, type, text: `${l.label}: ${gap}` });
    });
  });
  const get = (d) => departments.find((x) => x.department === d);
  const sales = { restaurant: get("restaurant").system?.sales ?? null, bar: get("bar").system?.sales ?? null };
  const cash = get("cashier").system || null;
  return {
    date, departments, issues,
    complete: departments.every((d) => d.status !== "missing"),
    totals: { systemSales: (sales.restaurant || 0) + (sales.bar || 0), systemCashExpected: cash?.total ?? null, cashShortOrOver: (get("cashier").lines || []).find((l) => l.label === "Total received")?.diff ?? null },
    payroll: { ...(await payrollPaid(date)), note: "Salary payments are shown for information only. They are kept out of daily cash and sales." },
  };
}

/** Which departments have already closed a date (used to show ticks on the form). */
async function status(date) {
  date = date || today();
  const docs = await Promise.all(DEPARTMENTS.map((d) => db.collection("dailyClose").doc(`${date}_${d}`).get()));
  return { date, departments: DEPARTMENTS.map((d, i) => ({ department: d, label: LABELS[d], submitted: docs[i].exists, status: docs[i].exists ? docs[i].data().status : null })) };
}

/** Drink and stock lists the closing forms need (names only — no quantities, so the count stays blind). */
async function formLists() {
  const bar = (await db.collection("barInventory").get()).docs.map((d) => ({ id: d.id, name: d.data().brand, unit: d.data().unit }));
  const stock = (await db.collection("inventoryItems").get()).docs.map((d) => ({ name: d.data().name, unit: d.data().unit || "" }));
  return { bar, stock };
}

module.exports = { DEPARTMENTS, submit, report, status, formLists };