const { db } = require("../config/firebase");
const { ApiError } = require("../utils/errors");

/**
 * With Firebase Authentication removed, the Firestore client SDK has no
 * `request.auth` context anymore — so database.rules can no longer tell
 * "is this a logged-in staff member reading their own dashboard" from
 * "is this a stranger who found the public API key". For every
 * collection that contains guest data, financial records, or internal
 * operations (anything NOT meant to be world-readable), the fix is: deny
 * ALL direct client reads in firestore.rules, and read through this
 * JWT-protected endpoint instead. Public collections (rooms, roomTypes,
 * menuItems, barInventory, promotions, settings) still read directly via
 * the client SDK since they're meant to be visible to anyone anyway.
 */
const ALLOWED_COLLECTIONS = new Set([
  "reservations", "guests", "guestRequests", "housekeepingTasks", "maintenanceRequests",
  "orders", "inventoryItems", "inventoryTransactions", "suppliers", "purchaseOrders",
  "invoices", "payments", "refunds", "expenses", "employees", "employeeApplications",
  "departments", "positions", "employeeAttendance", "schedules", "payroll", "salaryHistory",
  "promoCodes", "corporateAccounts", "groupBookings", "events",
  "lostAndFound", "laundryOrders", "minibarItems", "notifications", "auditLogs",
  "barSales", "folioItems", "restaurantTables",
  // Added for the financial-management, debt/credit and salary-payment
  // extension: expense budgets, customer credit sales and their payments,
  // per-employee salary payments, and the WhatsApp delivery/error log.
  "budgets", "creditTransactions", "creditPayments", "salaryPayments", "whatsappLogs", "sales",
  // Bar management extension: configurable categories, restock history,
  // and stock-adjustment audit trail (bar spec §3, §19-20).
  "barCategories", "barInventoryTransactions", "barStockAdjustments",
  // Manual Mobile Money payment confirmation extension (duplicate
  // transaction-ID protection doc; not normally browsed directly, but
  // listed here for consistency/debugging access).
  "paymentReferences",
  // Also public via Firestore rules, but admin-crud.js reads everything
  // through this one endpoint uniformly for simplicity — no harm in a
  // signed-in staff member reading data that's public anyway.
  "rooms", "roomTypes", "menuItems", "barInventory", "promotions",
]);

async function list(req, res, next) {
  try {
    const name = req.params.collection;
    if (!ALLOWED_COLLECTIONS.has(name)) throw new ApiError(400, "Unknown or restricted collection.");
    const snap = await db.collection(name).get();
    res.json({ items: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (err) { next(err); }
}

module.exports = { list };
