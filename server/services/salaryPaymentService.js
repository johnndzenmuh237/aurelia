const { db, FieldValue } = require("../config/firebase");
const { ApiError } = require("../utils/errors");
const { logAction } = require("../utils/audit");
const { balanceOf } = require("../utils/calculations");

/**
 * Records a salary payment against one employee's line in an Approved
 * payroll run (spec §20-21). Partial payments are supported; the line is
 * only marked PAID (and disappears from the outstanding list) once its
 * full net pay has been paid. Wrapped in a transaction so two payments hit
 * on the same line at once can never together overpay it.
 */
async function paySalary({ payrollId, employeeId, amount, method }, uid) {
  if (!payrollId || !employeeId || !amount || amount <= 0) {
    throw new ApiError(400, "payrollId, employeeId and a positive amount are required.");
  }
  const payrollRef = db.collection("payroll").doc(payrollId);

  const result = await db.runTransaction(async (tx) => {
    const payrollSnap = await tx.get(payrollRef);
    if (!payrollSnap.exists) throw new ApiError(404, "Payroll run not found.");
    const payroll = payrollSnap.data();
    if (payroll.status !== "Approved") {
      throw new ApiError(409, "Only an Approved payroll run's salaries can be paid.");
    }
    const lines = payroll.lines || [];
    const lineIndex = lines.findIndex((l) => l.employeeId === employeeId);
    if (lineIndex === -1) throw new ApiError(404, "Employee not found on this payroll run.");
    const line = lines[lineIndex];

    const paidSoFar = Number(line.paidSoFar || 0);
    const remaining = balanceOf({ total: line.net, paid: paidSoFar });
    if (amount > remaining) throw new ApiError(400, `Payment (${amount}) exceeds remaining salary balance (${remaining}).`);

    const newPaid = paidSoFar + Number(amount);
    const newRemaining = balanceOf({ total: line.net, paid: newPaid });
    const newLines = [...lines];
    newLines[lineIndex] = {
      ...line, paidSoFar: newPaid, remaining: newRemaining,
      salaryStatus: newRemaining <= 0 ? "PAID" : "PARTIALLY_PAID",
    };
    tx.update(payrollRef, { lines: newLines });

    const paymentRef = db.collection("salaryPayments").doc();
    tx.set(paymentRef, {
      payrollId, employeeId, employeeName: line.employeeName, amount: Number(amount),
      method: method || "bank_transfer", period: payroll.period,
      createdBy: uid || null, createdAt: FieldValue.serverTimestamp(),
    });

    return { status: newLines[lineIndex].salaryStatus, remaining: newRemaining, employeeName: line.employeeName };
  });

  await logAction({ user: uid ? { uid } : null, action: "Salary payment recorded", entity: "payroll", entityId: payrollId, newValue: { employeeId, amount } });
  return result;
}

/**
 * Every unpaid/partially-paid line across all Approved payroll runs — the
 * employee-salary half of the combined Debt page (spec §20). Draft runs
 * are excluded: they aren't a real obligation until a manager approves
 * them (spec §39-40's existing Draft -> Approved workflow).
 */
async function listOutstandingSalaries() {
  const snap = await db.collection("payroll").where("status", "==", "Approved").get();
  const outstanding = [];
  for (const doc of snap.docs) {
    const payroll = doc.data();
    for (const line of payroll.lines || []) {
      const remaining = balanceOf({ total: line.net, paid: line.paidSoFar || 0 });
      if (remaining > 0) {
        outstanding.push({
          payrollId: doc.id, period: payroll.period,
          employeeId: line.employeeId, employeeName: line.employeeName, position: line.position,
          salary: line.net, paid: line.paidSoFar || 0, remaining,
          status: line.paidSoFar > 0 ? "PARTIALLY_PAID" : "UNPAID",
        });
      }
    }
  }
  return outstanding;
}

module.exports = { paySalary, listOutstandingSalaries };
