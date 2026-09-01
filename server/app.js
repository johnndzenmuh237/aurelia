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

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

const staff = authenticate(); // required
const optionalAuth = authenticate({ optional: true }); // guests may be anonymous

// ---------------- Auth ----------------
app.post("/api/auth/register", authController.register);
app.get("/api/auth/verify", staff, authController.verify);

// ---------------- Bookings (public + walk-in) ----------------
app.get("/api/bookings/check-availability", bookingController.checkAvailability);
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
app.get("/api/reports/:key", staff, requireRole("manager", "accountant"), opsControllers.reportByKey);
app.post("/api/reports/finance", staff, requireRole("manager", "accountant"), opsControllers.financeHandler);
app.put("/api/reports/finance", staff, requireRole("manager", "accountant", "super_admin"), opsControllers.financeHandler);

app.get("/api/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use((req, res) => res.status(404).json({ error: { message: "Not found." } }));
app.use(errorHandler);

module.exports = app;
