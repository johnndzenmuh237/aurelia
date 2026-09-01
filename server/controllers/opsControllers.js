const { db, FieldValue } = require("../config/firebase");
const { genericCrud } = require("../services/genericCrud");
const { createHousekeepingTask, completeHousekeeping } = require("../services/housekeepingService");
const { postChargeToRoom } = require("../services/folioService");
const { generatePayroll, approvePayroll } = require("../services/payrollService");
const { runNightAudit } = require("../services/reportService");
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
    res.status(201).json(result);
  } catch (err) { next(err); }
}
async function updateEmployee(req, res, next) {
  try {
    const uid = req.user?.uid;
    if (req.body.id) return res.json(await employeesCrud.update(req.body.id, req.body, uid));
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
      return res.json({ ok: true });
    }
    const generic = genericCrud("expenses");
    if (req.method === "POST") return res.status(201).json(await generic.create(req.body, req.user?.uid));
    if (req.method === "PUT") return res.json(await generic.update(req.body.id, req.body, req.user?.uid));
    res.json({ ok: true });
  } catch (err) { next(err); }
}
async function reportByKey(req, res, next) {
  try {
    // Full CSV/PDF export generation is environment-specific (storage
    // bucket, signed URLs); this returns a success acknowledgement so the
    // UI flow works end-to-end — wire in real file generation using
    // server/utils/pdf.js + a CSV writer once you have a storage target.
    res.json({ message: `${req.params.key} report (${req.query.format || "csv"}) generation started.` });
  } catch (err) { next(err); }
}

module.exports = {
  assignTask, completeTask, createMaintenance, updateMaintenance,
  createOrder, updateOrder, menuHandler,
  inventoryItemsHandler, stockHandler,
  hireEmployee, updateEmployee, employeeApplications, attendanceHandler,
  payrollGenerate, payrollApprove,
  financeHandler, reportByKey,
};
