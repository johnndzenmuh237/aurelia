const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const { authenticate } = require("./middleware/auth");
const { requireRole } = require("./middleware/roles");
const { rateLimit } = require("./middleware/rate-limit");
const { errorHandler } = require("./middleware/error-handler");

const authController = require("./controllers/authController");
const bookingController = require("./controllers/bookingController");
const stayController = require("./controllers/stayController");
const paymentController = require("./controllers/paymentController");
const entityControllers = require("./controllers/entityControllers");
const opsControllers = require("./controllers/opsControllers");
<<<<<<< HEAD
const barController = require("./controllers/barController");
const dataController = require("./controllers/dataController");
const financeController = require("./controllers/financeController");

const app = express();
// Hides the "X-Powered-By: Express" header and disables Express's debug
// route-listing behavior fingerprinting — standard hardening so an
// attacker can't trivially fingerprint the framework/version in use.
app.disable("x-powered-by");
=======

const app = express();
>>>>>>> cee3b36d42600e502dc7bbc822e817b33780b7d5
app.use(helmet());
app.use(cors());
app.use(express.json());

const staff = authenticate(); // required
const optionalAuth = authenticate({ optional: true }); // guests may be anonymous

// ---------------- Auth ----------------
<<<<<<< HEAD
app.post("/api/auth/login", rateLimit({ max: 15 }), authController.login);
=======
app.post("/api/auth/register", authController.register);
>>>>>>> cee3b36d42600e502dc7bbc822e817b33780b7d5
app.get("/api/auth/verify", staff, authController.verify);

// ---------------- Bookings (public + walk-in) ----------------
app.get("/api/bookings/check-availability", bookingController.checkAvailability);
<<<<<<< HEAD
app.get("/api/bookings/lookup", rateLimit({ max: 20 }), bookingController.lookupBooking);
=======
>>>>>>> cee3b36d42600e502dc7bbc822e817b33780b7d5
app.get("/api/rooms/availability", optionalAuth, entityControllers.roomAvailabilityQuery);
app.get("/api/bookings/create", bookingController.create); // preview quote (?preview=1)
app.post("/api/bookings/create", optionalAuth, rateLimit({ max: 20 }), bookingController.create);

// ---------------- Check-in / Check-out ----------------
app.post("/api/checkin", staff, requireRole("front_desk", "manager"), stayController.checkInHandler);
app.post("/api/checkout", staff, requireRole("front_desk", "manager"), stayController.checkOutHandler);

// ---------------- Payments ----------------
app.post("/api/payments/create", optionalAuth, rateLimit({ max: 10 }), paymentController.create);
app.post("/api/payments/verify", staff, paymentController.verify);
app.post("/api/payments/refund", staff, requireRole("accountant", "manager"), paymentController.refund);
app.post("/api/webhooks/payment", paymentController.webhook); // provider callback, no user auth

// ---------------- Rooms ----------------
app.post("/api/rooms/create", staff, requireRole("manager", "reservations"), entityControllers.createRoom);
app.put("/api/rooms/update", staff, requireRole("manager", "reservations"), entityControllers.updateRoom);
app.put("/api/rooms/status", staff, requireRole("front_desk", "housekeeping", "manager"), entityControllers.updateRoomStatus);

// ---------------- Reservations ----------------
app.put("/api/reservations/update", staff, requireRole("front_desk", "reservations", "manager"), entityControllers.updateReservation);
app.delete("/api/reservations/delete", staff, requireRole("front_desk", "reservations", "manager"), entityControllers.deleteReservationHandler);

// ---------------- Guests ----------------
app.post("/api/guests/create", optionalAuth, entityControllers.createGuestOrRequest);
app.put("/api/guests/update", staff, entityControllers.updateGuest);

// ---------------- Housekeeping ----------------
app.post("/api/housekeeping/assign", staff, requireRole("housekeeping", "manager", "front_desk"), opsControllers.assignTask);
app.post("/api/housekeeping/complete", staff, requireRole("housekeeping", "manager"), opsControllers.completeTask);

// ---------------- Maintenance ----------------
app.post("/api/maintenance/create", staff, requireRole("maintenance", "manager", "front_desk"), opsControllers.createMaintenance);
app.put("/api/maintenance/update", staff, requireRole("maintenance", "manager"), opsControllers.updateMaintenance);

// ---------------- Restaurant ----------------
app.post("/api/restaurant/orders", staff, requireRole("restaurant", "manager"), opsControllers.createOrder);
app.put("/api/restaurant/orders", staff, requireRole("restaurant", "manager"), opsControllers.updateOrder);
app.post("/api/restaurant/menu", staff, requireRole("restaurant", "manager"), opsControllers.menuHandler);
app.put("/api/restaurant/menu", staff, requireRole("restaurant", "manager"), opsControllers.menuHandler);
<<<<<<< HEAD
app.post("/api/restaurant/delivery", optionalAuth, rateLimit({ max: 15 }), opsControllers.createDeliveryOrder);

// ---------------- Bar (spec §14-17: display-only public site, staff-only sales) ----------------
app.post("/api/bar/inventory", staff, requireRole("manager", "restaurant"), barController.createItem);
app.put("/api/bar/inventory", staff, requireRole("manager", "restaurant"), barController.updateItem);
app.post("/api/bar/sell", staff, requireRole("manager", "restaurant"), barController.sell);
=======
>>>>>>> cee3b36d42600e502dc7bbc822e817b33780b7d5

// ---------------- Inventory ----------------
app.post("/api/inventory/items", staff, requireRole("manager", "accountant"), opsControllers.inventoryItemsHandler);
app.put("/api/inventory/items", staff, requireRole("manager", "accountant"), opsControllers.inventoryItemsHandler);
app.post("/api/inventory/stock", staff, requireRole("manager", "accountant"), opsControllers.stockHandler);
app.put("/api/inventory/stock", staff, requireRole("manager", "accountant"), opsControllers.stockHandler);

// ---------------- Employees ----------------
app.post("/api/employees/hire", staff, requireRole("hr", "manager"), opsControllers.hireEmployee);
app.put("/api/employees/update", staff, opsControllers.updateEmployee); // employees may edit their own profile
app.post("/api/employees/applications", rateLimit({ max: 10 }), opsControllers.employeeApplications); // public careers form
app.put("/api/employees/applications", staff, requireRole("hr", "manager"), opsControllers.employeeApplications);
app.post("/api/employees/attendance", staff, opsControllers.attendanceHandler);

// ---------------- Payroll ----------------
app.post("/api/payroll/generate", staff, requireRole("hr", "accountant", "manager"), opsControllers.payrollGenerate);
app.put("/api/payroll/approve", staff, requireRole("accountant", "manager"), opsControllers.payrollApprove);

// ---------------- Reports / finance / settings ----------------
<<<<<<< HEAD
// Specific routes MUST come before the generic "/api/reports/:key" catch-all
// below, or Express would match "/api/reports/activity" as key="activity".
app.get("/api/reports/ai/insights", staff, requireRole("manager", "super_admin"), opsControllers.aiInsightsHandler);
app.post("/api/reports/ai/insights", staff, requireRole("manager", "super_admin"), opsControllers.aiInsightsHandler);
app.get("/api/reports/activity", staff, requireRole("manager", "super_admin"), opsControllers.activityFeed);
=======
>>>>>>> cee3b36d42600e502dc7bbc822e817b33780b7d5
app.get("/api/reports/:key", staff, requireRole("manager", "accountant"), opsControllers.reportByKey);
app.post("/api/reports/finance", staff, requireRole("manager", "accountant"), opsControllers.financeHandler);
app.put("/api/reports/finance", staff, requireRole("manager", "accountant", "super_admin"), opsControllers.financeHandler);

<<<<<<< HEAD
// ---------------- Departments (spec §22) ----------------
app.get("/api/departments", staff, opsControllers.departmentsHandler);
app.post("/api/departments", staff, requireRole("hr", "manager"), opsControllers.departmentsHandler);
app.put("/api/departments", staff, requireRole("hr", "manager"), opsControllers.departmentsHandler);

// ---------------- Sales management (spec §23-25) ----------------
app.post("/api/sales", staff, requireRole("manager", "accountant", "restaurant", "front_desk"), opsControllers.createSaleHandler);
app.get("/api/sales", staff, requireRole("manager", "accountant"), opsControllers.listSalesHandler);

// ---------------- Financial management, debt/credit, salary payments ----------------
// (extension: income statement, monthly/yearly reports, budgets, customer
// credit sales, and per-employee salary-balance tracking — additive,
// on top of the existing /api/reports/finance expense route above)
app.get("/api/finance/income-statement", staff, requireRole("manager", "accountant"), financeController.incomeStatement);
app.get("/api/finance/report/monthly", staff, requireRole("manager", "accountant"), financeController.monthlyReport);
app.get("/api/finance/report/yearly", staff, requireRole("manager", "accountant"), financeController.yearlyReport);
app.get("/api/finance/expenses", staff, requireRole("manager", "accountant"), financeController.listExpenses);
app.get("/api/finance/expense-categories", staff, requireRole("manager", "accountant", "hr", "front_desk"), financeController.expenseCategories);

app.post("/api/finance/budgets", staff, requireRole("manager", "accountant"), financeController.createBudget);
app.get("/api/finance/budgets", staff, requireRole("manager", "accountant"), financeController.listBudgets);

app.post("/api/debts", staff, requireRole("manager", "accountant", "restaurant"), financeController.createDebt);
app.post("/api/debts/pay", staff, requireRole("manager", "accountant"), financeController.payDebt);
app.get("/api/debts", staff, requireRole("manager", "accountant"), financeController.listOutstandingDebts);

app.post("/api/salaries/pay", staff, requireRole("accountant", "manager"), financeController.paySalary);
app.get("/api/salaries/outstanding", staff, requireRole("accountant", "manager", "hr"), financeController.listOutstandingSalaries);

app.get("/api/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Any signed-in staff member can read any allowed collection — coarse-
// grained on purpose; each admin page's own role guard (data-roles on
// #admin-shell, checked client-side, mirrored by page-specific routes
// above for writes) already scopes what's *shown*, and nothing in this
// list is writable through this route (POST/PUT/DELETE all stay on their
// own dedicated, role-checked routes above).
app.get("/api/staff/data/:collection", staff, dataController.list);

=======
app.get("/api/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

>>>>>>> cee3b36d42600e502dc7bbc822e817b33780b7d5
app.use((req, res) => res.status(404).json({ error: { message: "Not found." } }));
app.use(errorHandler);

module.exports = app;
