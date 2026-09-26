const { db, FieldValue } = require("../config/firebase");
const { ApiError } = require("../utils/errors");
const { logAction } = require("../utils/audit");

const DEFAULT_EXPENSE_CATEGORIES = [
  "Salaries", "Electricity", "Water", "Internet", "Food", "Cleaning",
  "Maintenance", "Repairs", "Transport", "Supplies", "Stock", "Rent",
  "Marketing", "Taxes", "Other",
];

function toDate(value) {
  if (!value) return null;
  if (value.toDate) return value.toDate(); // Firestore Timestamp
  return new Date(value);
}

function inRange(date, from, to) {
  if (!date) return false;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

/**
 * All financial totals are computed here, server-side, from the
 * underlying transactional collections — never trust a client-supplied
 * total (spec §2, §43). Revenue is assembled from every place money
 * actually lands, without double-counting:
 *   - `payments` (status "confirmed"): room bookings + food-delivery
 *     orders paid via Mobile Money/webhook-verified payment.
 *   - `barSales`: cash bar sales (never routed through `payments`).
 *   - `orders` with status "paid" and NOT chargeToRoom: cash restaurant
 *     sales paid directly at the table. (chargeToRoom orders are folded
 *     into the guest's folio/invoice and collected via `payments`
 *     already, so counting them again here would double-count revenue.)
 */
async function calculateIncomeStatement({ from, to }) {
  const fromDate = from ? new Date(from) : null;
  const toDate_ = to ? new Date(`${to}T23:59:59.999Z`) : null;

  const [paymentsSnap, barSalesSnap, ordersSnap, expensesSnap, salesSnap] = await Promise.all([
    db.collection("payments").where("status", "==", "confirmed").get(),
    db.collection("barSales").get(),
    db.collection("orders").where("status", "==", "paid").get(),
    db.collection("expenses").get(),
    db.collection("sales").get(),
  ]);

  let roomAndDeliveryRevenue = 0;
  for (const doc of paymentsSnap.docs) {
    const p = doc.data();
    const date = toDate(p.confirmedAt);
    if (inRange(date, fromDate, toDate_)) roomAndDeliveryRevenue += Number(p.amount || 0);
  }

  let barRevenue = 0;
  for (const doc of barSalesSnap.docs) {
    const s = doc.data();
    const date = toDate(s.createdAt);
    if (inRange(date, fromDate, toDate_)) barRevenue += Number(s.total || 0);
  }

  let restaurantCashRevenue = 0;
  for (const doc of ordersSnap.docs) {
    const o = doc.data();
    if (o.status === "charged_to_room") continue;
    const date = toDate(o.createdAt);
    if (inRange(date, fromDate, toDate_)) restaurantCashRevenue += Number(o.total || 0);
  }

  // Product/service sales (spec §23): distinguish revenue booked
  // (`total`, the invoiced value) from cash actually received
  // (`amountPaid`) — an unpaid remainder is tracked as a receivable in
  // `creditTransactions`, not as revenue that never arrived (spec §25).
  let salesRevenueBooked = 0;
  let salesCashReceived = 0;
  for (const doc of salesSnap.docs) {
    const s = doc.data();
    const date = toDate(s.createdAt);
    if (!inRange(date, fromDate, toDate_)) continue;
    salesRevenueBooked += Number(s.total || 0);
    salesCashReceived += Number(s.amountPaid || 0);
  }

  const expensesByCategory = {};
  let totalExpenses = 0;
  for (const doc of expensesSnap.docs) {
    const e = doc.data();
    const date = toDate(e.date) || toDate(e.createdAt);
    if (!inRange(date, fromDate, toDate_)) continue;
    const amount = Number(e.amount || 0);
    const category = e.category || "Other";
    expensesByCategory[category] = (expensesByCategory[category] || 0) + amount;
    totalExpenses += amount;
  }

  const totalRevenue = roomAndDeliveryRevenue + barRevenue + restaurantCashRevenue + salesCashReceived;
  const netProfit = totalRevenue - totalExpenses;

  return {
    period: { from: from || null, to: to || null },
    revenue: {
      roomsAndDelivery: roomAndDeliveryRevenue,
      bar: barRevenue,
      restaurant: restaurantCashRevenue,
      sales: { booked: salesRevenueBooked, cashReceived: salesCashReceived, outstandingReceivable: salesRevenueBooked - salesCashReceived },
      // `total` is cash-basis (matches every other line here) — a sale's
      // unpaid remainder shows up in `sales.outstandingReceivable` and in
      // GET /api/debts, never counted twice as both revenue and a debt.
      total: totalRevenue,
    },
    expenses: { byCategory: expensesByCategory, total: totalExpenses },
    netProfit,
    isLoss: netProfit < 0,
  };
}

function monthBounds(monthStr) {
  // monthStr like "2026-09"
  const [year, month] = monthStr.split("-").map(Number);
  const from = new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const to = new Date(Date.UTC(year, month - 1, lastDay)).toISOString().slice(0, 10);
  return { from, to };
}

async function monthlyReport({ month }) {
  if (!/^\d{4}-\d{2}$/.test(month || "")) throw new ApiError(400, "month must be in YYYY-MM format.");
  const { from, to } = monthBounds(month);
  const statement = await calculateIncomeStatement({ from, to });

  const bookingsSnap = await db.collection("reservations")
    .where("checkIn", ">=", from).where("checkIn", "<=", to).get();

  return { month, ...statement, bookingCount: bookingsSnap.size };
}

async function yearlyReport({ year }) {
  if (!/^\d{4}$/.test(String(year || ""))) throw new ApiError(400, "year must be a 4-digit year.");
  const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
  const monthly = [];
  for (const m of months) {
    const monthStr = `${year}-${m}`;
    // Sequential (not Promise.all) to keep Firestore read concurrency
    // sane for a 12-report rollup — this endpoint is not latency-critical.
    // eslint-disable-next-line no-await-in-loop
    monthly.push(await monthlyReport({ month: monthStr }));
  }
  const totals = monthly.reduce((acc, m) => ({
    revenue: acc.revenue + m.revenue.total,
    expenses: acc.expenses + m.expenses.total,
    netProfit: acc.netProfit + m.netProfit,
    bookingCount: acc.bookingCount + m.bookingCount,
  }), { revenue: 0, expenses: 0, netProfit: 0, bookingCount: 0 });

  return { year: Number(year), monthly, totals };
}

// ---------------- Budgets (spec §17) ----------------

/** A budget's spend is derived live from `expenses` matching its category
 * and period — never stored/duplicated, so it can never drift out of sync
 * with the expenses it's tracking. */
async function budgetStatus(budget) {
  const { from, to } = budget.period === "month" && budget.month
    ? monthBounds(budget.month)
    : { from: budget.from, to: budget.to };
  const expensesSnap = await db.collection("expenses").where("category", "==", budget.category).get();
  let spent = 0;
  for (const doc of expensesSnap.docs) {
    const e = doc.data();
    const date = toDate(e.date) || toDate(e.createdAt);
    if (inRange(date, from ? new Date(from) : null, to ? new Date(`${to}T23:59:59.999Z`) : null)) {
      spent += Number(e.amount || 0);
    }
  }
  const amount = Number(budget.amount || 0);
  const remaining = amount - spent;
  const usedPercent = amount > 0 ? Math.round((spent / amount) * 1000) / 10 : 0;
  return { ...budget, spent, remaining, usedPercent, overBudget: spent > amount };
}

async function createBudget({ category, amount, period, month, from, to }, uid) {
  if (!category || !amount) throw new ApiError(400, "category and amount are required.");
  const ref = await db.collection("budgets").add({
    category, amount: Number(amount), period: period || "month", month: month || null,
    from: from || null, to: to || null,
    createdBy: uid || null, createdAt: FieldValue.serverTimestamp(),
  });
  await logAction({ user: uid ? { uid } : null, action: "Budget created", entity: "budgets", entityId: ref.id, newValue: { category, amount } });
  return { id: ref.id };
}

async function listBudgetsWithStatus() {
  const snap = await db.collection("budgets").get();
  const budgets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const withStatus = await Promise.all(budgets.map(budgetStatus));
  return withStatus;
}

/** Called after a budget-tracked expense is saved so an Admin notification
 * fires the moment a budget crosses 90% used or goes over (spec §17). */
async function checkBudgetAlerts(category) {
  const snap = await db.collection("budgets").where("category", "==", category).get();
  for (const doc of snap.docs) {
    // eslint-disable-next-line no-await-in-loop
    const status = await budgetStatus({ id: doc.id, ...doc.data() });
    if (status.usedPercent >= 90) {
      // eslint-disable-next-line no-await-in-loop
      await db.collection("notifications").add({
        type: "budget_alert",
        message: status.overBudget
          ? `Budget "${category}" is OVER budget: ${status.spent} / ${status.amount}.`
          : `Budget "${category}" is at ${status.usedPercent}% (${status.spent} / ${status.amount}).`,
        read: false, createdAt: FieldValue.serverTimestamp(),
      });
    }
  }
}

module.exports = {
  DEFAULT_EXPENSE_CATEGORIES,
  calculateIncomeStatement, monthlyReport, yearlyReport,
  createBudget, listBudgetsWithStatus, budgetStatus, checkBudgetAlerts,
  monthBounds,
};
