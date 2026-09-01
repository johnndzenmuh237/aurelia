const { db } = require("../config/firebase");

/**
 * Generates sequential IDs like RES-2026-000001, GUEST-000001, INV-000001,
 * PAY-000001 (spec §5, §86) using a Firestore transaction on a counters/
 * document so concurrent requests never collide or skip numbers.
 */
async function nextSequence(counterName) {
  const ref = db.collection("counters").doc(counterName);
  const next = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? snap.data().value || 0 : 0;
    const value = current + 1;
    tx.set(ref, { value }, { merge: true });
    return value;
  });
  return next;
}

function pad(num, length = 6) {
  return String(num).padStart(length, "0");
}

async function generateReservationCode() {
  const year = new Date().getFullYear();
  const seq = await nextSequence(`reservations_${year}`);
  return `RES-${year}-${pad(seq)}`;
}

async function generateGuestCode() {
  const seq = await nextSequence("guests");
  return `GUEST-${pad(seq)}`;
}

async function generateInvoiceNumber() {
  const seq = await nextSequence("invoices");
  return `INV-${pad(seq)}`;
}

async function generatePaymentRef() {
  const seq = await nextSequence("payments");
  return `PAY-${pad(seq)}`;
}

async function generateEmployeeCode() {
  const seq = await nextSequence("employees");
  return `EMP-${pad(seq, 4)}`;
}

module.exports = {
  generateReservationCode, generateGuestCode, generateInvoiceNumber,
  generatePaymentRef, generateEmployeeCode, nextSequence,
};
