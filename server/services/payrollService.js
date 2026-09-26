const { db, FieldValue } = require("../config/firebase");
const { ApiError } = require("../utils/errors");

/** Generates a draft payroll run for a period, computing net pay per
 * employee from their base salary plus configured allowances/bonuses minus
 * deductions — never overwrites prior salary history (spec §39-40). */
async function generatePayroll({ period, uid }) {
  const empSnap = await db.collection("employees").where("status", "!=", "terminated").get();
  const employees = empSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const lines = employees.map((e) => {
    const basic = Number(e.salary || 0);
    const allowances = Number(e.allowances || 0);
    const bonuses = Number(e.bonuses || 0);
    const deductions = Number(e.deductions || 0);
    const net = basic + allowances + bonuses - deductions;
    return { employeeId: e.id, employeeName: e.fullName, position: e.position, basic, allowances, bonuses, deductions, net };
  });

  const totalNet = lines.reduce((s, l) => s + l.net, 0);
  const ref = await db.collection("payroll").add({
    period, lines, employeeCount: lines.length, totalNet, status: "Draft",
    createdBy: uid, createdAt: FieldValue.serverTimestamp(),
  });
  return { payrollId: ref.id, employeeCount: lines.length, totalNet };
}

async function approvePayroll({ payrollId, uid }) {
  const ref = db.collection("payroll").doc(payrollId);
  const snap = await ref.get();
  if (!snap.exists) throw new ApiError(404, "Payroll run not found.");
  await ref.update({ status: "Approved", approvedBy: uid, approvedAt: FieldValue.serverTimestamp() });
  return { status: "Approved" };
}

module.exports = { generatePayroll, approvePayroll };
