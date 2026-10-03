const { db, FieldValue } = require("../config/firebase");
const { genericCrud } = require("../services/genericCrud");
const { createHousekeepingTask, completeHousekeeping } = require("../services/housekeepingService");
const { postChargeToRoom } = require("../services/folioService");
const { generatePayroll, approvePayroll } = require("../services/payrollService");
const { runNightAudit } = require("../services/reportService");
const { checkBudgetAlerts } = require("../services/financeService");
const { recordSale, listSales } = require("../services/saleService");
const { toCsv } = require("../utils/csv");
const { renderTablePdf } = require("../utils/pdf");
const { logAction } = require("../utils/audit");
const { ApiError } = require("../utils/errors");
const { generateEmployeeCode } = require("../utils/idGenerator");

// ---------- Housekeeping ----------
async function assignTask(req, res, next) {
  try {
    const { room, taskType, assignedTo, priority } = req.body;
    if (!room || !taskType) throw new ApiError(400, "room and taskType are required.");
    const id = await createHousekeepingTask({ room, taskType, assignedTo, priority });
    res.status(201).json({ id });
  } catch (err) { next(err); }
}
async function completeTask(req, res, next) {
  try { res.json(await completeHousekeeping(req.body)); }
  catch (err) { next(err); }
}

// ---------- Maintenance ----------
const maintenanceCrud = genericCrud("maintenanceRequests");
async function createMaintenance(req, res, next) {
  try {
    const { room, issue, priority } = req.body;
    if (!room || !issue) throw new ApiError(400, "room and issue are required.");
    const result = await maintenanceCrud.create({ room, issue, priority: priority || "Normal", status: "Open" }, req.user?.uid);
    // Major maintenance takes the room out of sellable inventory immediately (spec §27).
    const roomQuery = await db.collection("rooms").where("number", "==", room).limit(1).get();
    if (!roomQuery.empty) await roomQuery.docs[0].ref.update({ status: "maintenance" });
    res.status(201).json(result);
  } catch (err) { next(err); }
}
async function updateMaintenance(req, res, next) {
  try {
    const { id, status, room, actualCost } = req.body;
    await maintenanceCrud.update(id, { status, actualCost }, req.user?.uid);
    if (status === "Completed" && room) {
      const roomQuery = await db.collection("rooms").where("number", "==", room).limit(1).get();
      if (!roomQuery.empty) await roomQuery.docs[0].ref.update({ status: "inspected" }); // spec §27: OOO -> inspection -> available
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
}

// ---------- Restaurant ----------
async function createOrder(req, res, next) {
  try {
    const { items, table, guestName, chargeToRoom } = req.body;
    if (!items?.length) throw new ApiError(400, "At least one item is required.");
    const total = items.reduce((s, i) => s + Number(i.price || 0), 0);
    const ref = await db.collection("orders").add({
      items, table, guestName: guestName || null, total,
      status: chargeToRoom ? "charged_to_room" : "paid",
      kitchenStatus: "new", createdAt: FieldValue.serverTimestamp(),
    });
    if (chargeToRoom) {
      await postChargeToRoom({
        room: /^\d/.test(table) ? table : null, guestName, category: "restaurant",
        description: `Restaurant order (${items.map((i) => i.name).join(", ")})`, amount: total,
        inventoryItemsConsumed: items.map((i) => ({ name: i.name, quantity: 1 })),
      });
    }
    res.status(201).json({ id: ref.id, total });
  } catch (err) { next(err); }
}
async function updateOrder(req, res, next) {
  try {
    const { id, ...data } = req.body;
    await db.collection("orders").doc(id).update(data);
    res.json({ ok: true });
  } catch (err) { next(err); }
}

/** Public food-delivery order — spec §12: guest checkout, no account
 * required. Calculates (price × quantity) + delivery fee server-side,
 * never trusts a client-computed total, and never marks anything
 * "delivered" until restaurant staff process it from the Orders board. */
async function createDeliveryOrder(req, res, next) {
  try {
    const { items, fullName, phone, whatsapp, deliveryAddress, email, notes } = req.body;
    if (!items?.length) throw new ApiError(400, "At least one food item is required.");
    if (!fullName || !phone || !deliveryAddress) throw new ApiError(400, "fullName, phone and deliveryAddress are required.");

    const DELIVERY_FEE = 1500;
    const itemsTotal = items.reduce((s, i) => s + Number(i.price || 0) * Number(i.quantity || 1), 0);
    const total = itemsTotal + DELIVERY_FEE;

    const orderNumber = `FD-${Date.now().toString().slice(-8)}`;
    const ref = await db.collection("orders").add({
      type: "delivery", orderNumber, items, fullName, phone, whatsapp: whatsapp || null,
      email: email || null, deliveryAddress, notes: notes || null,
      itemsTotal, deliveryFee: DELIVERY_FEE, total,
      status: "pending_payment", kitchenStatus: "new", deliveryStatus: "pending",
      createdAt: FieldValue.serverTimestamp(),
    });

    await db.collection("notifications").add({
      type: "food_delivery_order", message: `New delivery order ${orderNumber} from ${fullName} — ${total} FCFA.`,
      read: false, createdAt: FieldValue.serverTimestamp(),
    });

    res.status(201).json({ orderId: ref.id, orderNumber, itemsTotal, deliveryFee: DELIVERY_FEE, total });
  } catch (err) { next(err); }
}
const menuCrud = genericCrud("menuItems");
async function menuHandler(req, res, next) {
  try {
    if (req.method === "POST") return res.status(201).json(await menuCrud.create(req.body, req.user?.uid));
    res.json(await menuCrud.update(req.body.id, req.body, req.user?.uid));
  } catch (err) { next(err); }
}

// ---------- Inventory ----------
const inventoryCrud = genericCrud("inventoryItems");
async function inventoryItemsHandler(req, res, next) {
  try {
    if (req.method === "POST") return res.status(201).json(await inventoryCrud.create(req.body, req.user?.uid));
    res.json(await inventoryCrud.update(req.body.id, req.body, req.user?.uid));
  } catch (err) { next(err); }
}
const suppliersCrud = genericCrud("suppliers");
async function stockHandler(req, res, next) {
  try {
    // Doubles as purchase-order + supplier creation for the generic admin
    // pages that point at this route (spec §34 purchase workflow).
    const target = req.body.supplier && req.body.total ? genericCrud("purchaseOrders") : suppliersCrud;
    if (req.method === "POST") return res.status(201).json(await target.create(req.body, req.user?.uid));
    res.json(await target.update(req.body.id, req.body, req.user?.uid));
  } catch (err) { next(err); }
}

// ---------- Employees ----------
const employeesCrud = genericCrud("employees");
async function hireEmployee(req, res, next) {
  try {
    const { fullName, phone, email, position, department, salary } = req.body;
    if (!fullName || !position) throw new ApiError(400, "fullName and position are required.");
    const employeeCode = await generateEmployeeCode();
    const result = await employeesCrud.create({ employeeCode, fullName, phone, email, position, department, salary: Number(salary || 0), status: "active" }, req.user?.uid);
    await logAction({ user: req.user || null, action: "Employee hired", entity: "employees", entityId: result.id, newValue: { fullName, position, department } });
    res.status(201).json(result);
  } catch (err) { next(err); }
}
async function updateEmployee(req, res, next) {
  try {
    const uid = req.user?.uid;
    if (req.body.id) {
      const { id, ...data } = req.body;
      const result = await employeesCrud.update(id, data, uid);
      await logAction({ user: req.user || null, action: "Employee modified", entity: "employees", entityId: id, newValue: data });
      return res.json(result);
    }
    // Employee editing their own profile (no admin `id` supplied)
    const empQuery = await db.collection("employees").where("uid", "==", uid).limit(1).get();
    if (!empQuery.empty) await empQuery.docs[0].ref.update(req.body);
    res.json({ ok: true });
  } catch (err) { next(err); }
}
async function employeeApplications(req, res, next) {
  try {
    if (req.method === "POST") {
      const { fullName, position } = req.body;
      if (!fullName || !position) throw new ApiError(400, "fullName and position are required.");
      const ref = await db.collection("employeeApplications").add({ ...req.body, status: "Received", createdAt: FieldValue.serverTimestamp() });
      return res.status(201).json({ id: ref.id });
    }
    // PUT: approve/hire — automatically creates the employee record (spec §36)
    const { id, status } = req.body;
    const appRef = db.collection("employeeApplications").doc(id);
    const appSnap = await appRef.get();
    if (!appSnap.exists) throw new ApiError(404, "Application not found.");
    await appRef.update({ status });
    if (status === "Hired") {
      const app = appSnap.data();
      const employeeCode = await generateEmployeeCode();
      await employeesCrud.create({ employeeCode, fullName: app.fullName, phone: app.phone, email: app.email, position: app.position, department: app.position, salary: 0, status: "active" }, req.user?.uid);
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
}
async function attendanceHandler(req, res, next) {
  try {
    const { employeeId, action } = req.body;
    if (!employeeId || !action) throw new ApiError(400, "employeeId and action are required.");
    const todayStr = new Date().toISOString().slice(0, 10);
    const nowStr = new Date().toLocaleTimeString();
    const existing = await db.collection("employeeAttendance").where("employeeId", "==", employeeId).where("date", "==", todayStr).limit(1).get();
    if (action === "clock_in") {
      if (!existing.empty) throw new ApiError(409, "Already clocked in today.");
      await db.collection("employeeAttendance").add({ employeeId, date: todayStr, checkIn: nowStr, checkOut: null, status: "present" });
    } else {
      if (existing.empty) throw new ApiError(409, "No clock-in found for today.");
      await existing.docs[0].ref.update({ checkOut: nowStr });
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
}

// ---------- Departments (spec §22) ----------
const departmentsCrud = genericCrud("departments");
async function departmentsHandler(req, res, next) {
  try {
    if (req.method === "GET") return res.json({ items: await departmentsCrud.list({ limit: 200 }) });
    if (req.method === "POST") {
      const { name } = req.body;
      if (!name) throw new ApiError(400, "name is required.");
      const result = await departmentsCrud.create(req.body, req.user?.uid);
      await logAction({ user: req.user || null, action: "Department created", entity: "departments", entityId: result.id, newValue: { name } });
      return res.status(201).json(result);
    }
    const { id, ...data } = req.body;
    const result = await departmentsCrud.update(id, data, req.user?.uid);
    await logAction({ user: req.user || null, action: "Department modified", entity: "departments", entityId: id, newValue: data });
    res.json(result);
  } catch (err) { next(err); }
}

// ---------- Sales management (spec §23-25) ----------
async function createSaleHandler(req, res, next) {
  try {
    const result = await recordSale({ ...req.body, staffName: req.body.staffName || req.user?.name }, req.user?.uid);
    res.status(201).json(result);
  } catch (err) { next(err); }
}
async function listSalesHandler(req, res, next) {
  try { res.json({ items: await listSales() }); }
  catch (err) { next(err); }
}

// ---------- Payroll ----------
async function payrollGenerate(req, res, next) {
  try {
    const { period } = req.body;
    if (!period) throw new ApiError(400, "period is required.");
    res.status(201).json(await generatePayroll({ period, uid: req.user?.uid }));
  } catch (err) { next(err); }
}
async function payrollApprove(req, res, next) {
  try { res.json(await approvePayroll({ payrollId: req.body.id, uid: req.user?.uid })); }
  catch (err) { next(err); }
}

// ---------- Reports ----------
async function financeHandler(req, res, next) {
  try {
    if (req.query.nightAudit === "1" || req.body?.nightAudit) {
      return res.json(await runNightAudit({ uid: req.user?.uid }));
    }
    if (req.method === "PUT" && req.body.settings) {
      await db.collection("settings").doc("hotel").set(req.body.settings, { merge: true });
      await logAction({ user: req.user || null, action: "Configuration changed", entity: "settings", entityId: "hotel", newValue: req.body.settings });
      return res.json({ ok: true });
    }
    const generic = genericCrud("expenses");
    if (req.method === "POST") {
      const created = await generic.create(req.body, req.user?.uid);
      // Additive: check whether this expense pushed a budget past 90% used
      // or over budget (spec §17). Never let an alerting hiccup block the
      // expense itself from being recorded.
      if (req.body.category) checkBudgetAlerts(req.body.category).catch(() => {});
      return res.status(201).json(created);
    }
    if (req.method === "PUT") return res.json(await generic.update(req.body.id, req.body, req.user?.uid));
    res.json({ ok: true });
  } catch (err) { next(err); }
}
// ---------- Reports Center — real CSV/PDF export (spec §27) ----------
const REPORT_DEFS = {
  expenses: {
    title: "Expenses Report",
    columns: [
      { key: "description", label: "Description" }, { key: "category", label: "Category" },
      { key: "amount", label: "Amount" }, { key: "date", label: "Date" },
      { key: "paymentMethod", label: "Method" }, { key: "supplier", label: "Supplier" },
    ],
    fetch: async () => (await genericCrud("expenses").list({ limit: 1000 })),
  },
  sales: {
    title: "Sales Report",
    columns: [
      { key: "reference", label: "Reference" }, { key: "product", label: "Product" },
      { key: "quantity", label: "Qty" }, { key: "unitPrice", label: "Unit Price" },
      { key: "total", label: "Total" }, { key: "amountPaid", label: "Paid" },
      { key: "balance", label: "Balance" }, { key: "customerName", label: "Customer" },
    ],
    fetch: async () => listSales({ limit: 1000 }),
  },
  debts: {
    title: "Outstanding Customer Debts",
    columns: [
      { key: "customerName", label: "Customer" }, { key: "product", label: "Product" },
      { key: "total", label: "Total" }, { key: "paid", label: "Paid" },
      { key: "remaining", label: "Remaining" }, { key: "status", label: "Status" }, { key: "dueDate", label: "Due" },
    ],
    fetch: async () => require("../services/debtService").listOutstandingCustomerDebts(),
  },
  salaries: {
    title: "Outstanding Salaries",
    columns: [
      { key: "employeeName", label: "Employee" }, { key: "position", label: "Position" },
      { key: "period", label: "Period" }, { key: "salary", label: "Salary" },
      { key: "paid", label: "Paid" }, { key: "remaining", label: "Remaining" }, { key: "status", label: "Status" },
    ],
    fetch: async () => require("../services/salaryPaymentService").listOutstandingSalaries(),
  },
  inventory: {
    title: "Inventory Report",
    columns: [
      { key: "name", label: "Item" }, { key: "category", label: "Category" },
      { key: "quantity", label: "Qty" }, { key: "purchasePrice", label: "Purchase Price" },
      { key: "sellingPrice", label: "Selling Price" }, { key: "supplier", label: "Supplier" },
    ],
    fetch: async () => (await genericCrud("inventoryItems").list({ limit: 1000 })),
  },
};

async function reportByKey(req, res, next) {
  try {
    const def = REPORT_DEFS[req.params.key];
    if (!def) {
      throw new ApiError(404, `Unknown report key "${req.params.key}". Valid keys: ${Object.keys(REPORT_DEFS).join(", ")}.`);
    }
    const format = (req.query.format || "csv").toLowerCase();
    const rows = await def.fetch();
    const filenameBase = `${req.params.key}-${new Date().toISOString().slice(0, 10)}`;

    if (format === "pdf") {
      const buffer = await renderTablePdf({ title: def.title, columns: def.columns, rows });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}.pdf"`);
      return res.send(buffer);
    }
    if (format !== "csv") throw new ApiError(400, 'format must be "csv" or "pdf".');

    const csv = toCsv(rows, def.columns.map((c) => c.key));
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}.csv"`);
    res.send(csv);
  } catch (err) { next(err); }
}

// ---------- AI Business Insights (spec §23) ----------
const aiInsightService = require("../services/aiInsightService");
async function aiInsightsHandler(req, res, next) {
  try {
    const period = req.query.period || req.body.period || "week";
    if (req.method === "POST") {
      const insights = await aiInsightService.generateInsights({ period, uid: req.user?.uid });
      return res.status(201).json({ insights });
    }
    const insights = await aiInsightService.getLatestInsights({ period });
    res.json({ insights });
  } catch (err) { next(err); }
}

// ---------- Recent business activity feed (spec §27) ----------
async function activityFeed(req, res, next) {
  try {
    const snap = await db.collection("auditLogs").orderBy("createdAt", "desc").limit(30).get();
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ items });
  } catch (err) { next(err); }
}

module.exports = {
  assignTask, completeTask, createMaintenance, updateMaintenance,
  createOrder, updateOrder, createDeliveryOrder, menuHandler,
  inventoryItemsHandler, stockHandler,
  hireEmployee, updateEmployee, employeeApplications, attendanceHandler,
  departmentsHandler, createSaleHandler, listSalesHandler,
  payrollGenerate, payrollApprove,
  financeHandler, reportByKey, aiInsightsHandler, activityFeed,
};
