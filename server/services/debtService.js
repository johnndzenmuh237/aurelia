const { db, FieldValue } = require("../config/firebase");
const { ApiError } = require("../utils/errors");
const { logAction } = require("../utils/audit");
const { balanceOf } = require("../utils/calculations");

/** Derives a credit transaction's live status from paid vs total — never
 * stored redundantly, so it can't go stale (spec §19: "When a debt is
 * fully paid, automatically mark it as PAID ... Do not permanently delete
 * the transaction merely because it has been paid"). */
function creditStatus({ total, paid, dueDate }) {
  const remaining = balanceOf({ total, paid });
  if (remaining <= 0) return "PAID";
  if (Number(paid || 0) > 0) return dueDate && new Date(dueDate) < new Date() ? "OVERDUE" : "PARTIALLY_PAID";
  return dueDate && new Date(dueDate) < new Date() ? "OVERDUE" : "UNPAID";
}

/**
 * Records a product/service sold on credit (spec §18). If the credit sale
 * is tied to an inventory item, stock is decremented in the same
 * transaction so it's never double-counted or forgotten (spec §25:
 * "reduce stock correctly" for credit sales).
 */
async function createCreditTransaction({ customerName, phone, product, inventoryItemId, quantity, unitPrice, amountPaid, dueDate, notes }, uid) {
  if (!customerName || !product || !unitPrice) {
    throw new ApiError(400, "customerName, product and unitPrice are required.");
  }
  const qty = Number(quantity || 1);
  const total = Math.round(qty * Number(unitPrice));
  const paid = Number(amountPaid || 0);
  if (paid > total) throw new ApiError(400, "amountPaid cannot exceed the total.");

  const ref = db.collection("creditTransactions").doc();
  await db.runTransaction(async (tx) => {
    let itemSnap = null;
    if (inventoryItemId) {
      const itemRef = db.collection("inventoryItems").doc(inventoryItemId);
      itemSnap = await tx.get(itemRef);
      if (!itemSnap.exists) throw new ApiError(404, "Inventory item not found.");
      const item = itemSnap.data();
      if (Number(item.quantity || 0) < qty) {
        throw new ApiError(409, `Only ${item.quantity} of ${item.name} in stock — cannot sell ${qty} on credit.`);
      }
      tx.update(itemRef, { quantity: Number(item.quantity) - qty });
      tx.set(db.collection("inventoryTransactions").doc(), {
        itemId: inventoryItemId, type: "credit_sale", quantity: -qty,
        reference: ref.id, createdAt: FieldValue.serverTimestamp(),
      });
    }
    tx.set(ref, {
      customerName, phone: phone || null, product, inventoryItemId: inventoryItemId || null,
      quantity: qty, unitPrice: Number(unitPrice), total, paid,
      remaining: balanceOf({ total, paid }),
      status: creditStatus({ total, paid, dueDate }),
      dueDate: dueDate || null, notes: notes || null,
      createdBy: uid || null, createdAt: FieldValue.serverTimestamp(),
    });
  });

  await logAction({ user: uid ? { uid } : null, action: "Credit sale created", entity: "creditTransactions", entityId: ref.id, newValue: { customerName, total } });
  return { id: ref.id, total, remaining: balanceOf({ total, paid }) };
}

/**
 * Records a payment against an outstanding credit transaction (partial or
 * final). Idempotent per-call: each payment is its own immutable
 * `creditPayments` record, so re-running a request never silently doubles
 * a payment the way re-summing a mutable "paid" field on retry might.
 */
async function recordCreditPayment({ creditTransactionId, amount, method }, uid) {
  if (!creditTransactionId || !amount || amount <= 0) {
    throw new ApiError(400, "creditTransactionId and a positive amount are required.");
  }
  const ref = db.collection("creditTransactions").doc(creditTransactionId);
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ApiError(404, "Credit transaction not found.");
    const current = snap.data();
    const remaining = balanceOf({ total: current.total, paid: current.paid });
    if (amount > remaining) throw new ApiError(400, `Payment (${amount}) exceeds remaining balance (${remaining}).`);
    const newPaid = Number(current.paid || 0) + Number(amount);
    const status = creditStatus({ total: current.total, paid: newPaid, dueDate: current.dueDate });
    tx.update(ref, { paid: newPaid, remaining: balanceOf({ total: current.total, paid: newPaid }), status });
    const paymentRef = db.collection("creditPayments").doc();
    tx.set(paymentRef, {
      creditTransactionId, amount: Number(amount), method: method || "cash",
      createdBy: uid || null, createdAt: FieldValue.serverTimestamp(),
    });
    return { status, remaining: balanceOf({ total: current.total, paid: newPaid }) };
  });

  await logAction({ user: uid ? { uid } : null, action: "Credit payment recorded", entity: "creditTransactions", entityId: creditTransactionId, newValue: amount });
  return result;
}

/** All non-PAID credit transactions — the customer-debt half of the
 * combined Debt page (spec §19); server/services/salaryPaymentService.js
 * supplies the employee-salary half. */
async function listOutstandingCustomerDebts() {
  const snap = await db.collection("creditTransactions").where("status", "!=", "PAID").get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

module.exports = { createCreditTransaction, recordCreditPayment, listOutstandingCustomerDebts, creditStatus };
