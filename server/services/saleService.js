const { db, FieldValue } = require("../config/firebase");
const { ApiError } = require("../utils/errors");
const { logAction } = require("../utils/audit");
const { generateSaleReference } = require("../utils/idGenerator");
const { createCreditTransaction } = require("./debtService");

/**
 * Records a general product/service sale (spec §23) — distinct from the
 * bar (barService.js) and restaurant (opsControllers.createOrder) sales
 * flows, which already have their own dedicated recording. If tied to an
 * inventory item, stock is decremented in the same transaction as the
 * sale record so it can never be double-counted or missed (spec §24).
 *
 * If `amountPaid` is less than the total, the unpaid remainder is
 * automatically recorded as a credit/debt (spec §25: "If a product is
 * sold on credit ... reduce stock correctly [and] create the credit/debt
 * record") — the inventory is only decremented ONCE, here, not again by
 * the credit-transaction helper.
 */
async function recordSale({ product, inventoryItemId, quantity, unitPrice, customerName, paymentMethod, amountPaid, staffName, notes }, uid) {
  if (!product || !unitPrice) throw new ApiError(400, "product and unitPrice are required.");
  const qty = Number(quantity || 1);
  const total = Math.round(qty * Number(unitPrice));
  const paid = amountPaid === undefined || amountPaid === null ? total : Number(amountPaid);
  if (paid > total) throw new ApiError(400, "amountPaid cannot exceed the total.");
  const balance = total - paid;
  const reference = await generateSaleReference();

  const saleRef = db.collection("sales").doc();
  await db.runTransaction(async (tx) => {
    if (inventoryItemId) {
      const itemRef = db.collection("inventoryItems").doc(inventoryItemId);
      const itemSnap = await tx.get(itemRef);
      if (!itemSnap.exists) throw new ApiError(404, "Inventory item not found.");
      const item = itemSnap.data();
      if (Number(item.quantity || 0) < qty) {
        throw new ApiError(409, `Only ${item.quantity} of ${item.name} in stock — cannot sell ${qty}.`);
      }
      tx.update(itemRef, { quantity: Number(item.quantity) - qty });
      tx.set(db.collection("inventoryTransactions").doc(), {
        itemId: inventoryItemId, type: "sale", quantity: -qty, reference: saleRef.id,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    tx.set(saleRef, {
      product, inventoryItemId: inventoryItemId || null, quantity: qty, unitPrice: Number(unitPrice), total,
      reference, customerName: customerName || "Walk-in", paymentMethod: paymentMethod || "cash",
      amountPaid: paid, balance,
      staffUid: uid || null, staffName: staffName || "Staff",
      notes: notes || null, createdAt: FieldValue.serverTimestamp(),
    });
  });

  let creditTransactionId = null;
  if (balance > 0) {
    if (!customerName) throw new ApiError(400, "customerName is required to record a balance on credit.");
    // Stock was already decremented above by this same operation, so pass
    // no inventoryItemId here — createCreditTransaction would otherwise
    // decrement it a second time (spec §25's "do not double-reduce stock").
    const credit = await createCreditTransaction({
      customerName, phone: null, product, quantity: qty, unitPrice, amountPaid: paid, notes: `Linked to sale ${reference}`,
    }, uid);
    creditTransactionId = credit.id;
    await saleRef.update({ creditTransactionId });
  }

  await logAction({ user: uid ? { uid } : null, action: "Sale recorded", entity: "sales", entityId: saleRef.id, newValue: { product, total, balance } });
  return { id: saleRef.id, reference, total, balance, creditTransactionId };
}

async function listSales({ limit = 200 } = {}) {
  const snap = await db.collection("sales").orderBy("createdAt", "desc").limit(limit).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

module.exports = { recordSale, listSales };
