const { db } = require("../config/firebase");
const financeService = require("../services/financeService");
const debtService = require("../services/debtService");
const salaryPaymentService = require("../services/salaryPaymentService");
const { genericCrud } = require("../services/genericCrud");
const { ApiError } = require("../utils/errors");

const expensesCrud = genericCrud("expenses");

// ---------------- Income statement & reports (spec §11-16) ----------------

async function incomeStatement(req, res, next) {
  try {
    const { from, to } = req.query;
    res.json(await financeService.calculateIncomeStatement({ from, to }));
  } catch (err) { next(err); }
}

async function monthlyReport(req, res, next) {
  try {
    if (!req.query.month) throw new ApiError(400, "month (YYYY-MM) is required.");
    res.json(await financeService.monthlyReport({ month: req.query.month }));
  } catch (err) { next(err); }
}

async function yearlyReport(req, res, next) {
  try {
    if (!req.query.year) throw new ApiError(400, "year is required.");
    res.json(await financeService.yearlyReport({ year: req.query.year }));
  } catch (err) { next(err); }
}

// ---------------- Expenses (list; create/update already live on
// PUT/POST /api/reports/finance — this adds the missing GET + wires the
// budget-alert check onto that existing create path) ----------------

async function listExpenses(req, res, next) {
  try { res.json({ items: await expensesCrud.list({ limit: 500 }) }); }
  catch (err) { next(err); }
}

async function expenseCategories(req, res, next) {
  try {
    const settingsSnap = await db.collection("settings").doc("hotel").get();
    const custom = settingsSnap.exists ? settingsSnap.data()?.expenseCategories : null;
    res.json({ categories: custom?.length ? custom : financeService.DEFAULT_EXPENSE_CATEGORIES });
  } catch (err) { next(err); }
}

// ---------------- Budgets (spec §17) ----------------

async function createBudget(req, res, next) {
  try { res.status(201).json(await financeService.createBudget(req.body, req.user?.uid)); }
  catch (err) { next(err); }
}

async function listBudgets(req, res, next) {
  try { res.json({ items: await financeService.listBudgetsWithStatus() }); }
  catch (err) { next(err); }
}

// ---------------- Debt / credit management (spec §18-19) ----------------

async function createDebt(req, res, next) {
  try { res.status(201).json(await debtService.createCreditTransaction(req.body, req.user?.uid)); }
  catch (err) { next(err); }
}

async function payDebt(req, res, next) {
  try { res.json(await debtService.recordCreditPayment(req.body, req.user?.uid)); }
  catch (err) { next(err); }
}

/** Combined outstanding-debt view (spec §20: "The Debt page must also
 * show employees whose salaries have not yet been paid" alongside
 * customer credit debts). */
async function listOutstandingDebts(req, res, next) {
  try {
    const [customerDebts, salaries] = await Promise.all([
      debtService.listOutstandingCustomerDebts(),
      salaryPaymentService.listOutstandingSalaries(),
    ]);
    res.json({ customerDebts, outstandingSalaries: salaries });
  } catch (err) { next(err); }
}

// ---------------- Salary payments (spec §21) ----------------

async function paySalary(req, res, next) {
  try { res.json(await salaryPaymentService.paySalary(req.body, req.user?.uid)); }
  catch (err) { next(err); }
}

async function listOutstandingSalaries(req, res, next) {
  try { res.json({ items: await salaryPaymentService.listOutstandingSalaries() }); }
  catch (err) { next(err); }
}

module.exports = {
  incomeStatement, monthlyReport, yearlyReport,
  listExpenses, expenseCategories,
  createBudget, listBudgets,
  createDebt, payDebt, listOutstandingDebts,
  paySalary, listOutstandingSalaries,
};
