const { db, FieldValue } = require("../config/firebase");
const { ApiError } = require("../utils/errors");
const { balanceOf } = require("../utils/calculations");
const { logAction } = require("../utils/audit");
const { createHousekeepingTask } = require("./housekeepingService");
const { decrementInventoryForOrder } = require("./inventoryService");

/** Check-in cascade — spec §15, §79 "Check-In". */
async function checkIn({ reservationId, uid }) {
  const resRef = db.collection("reservations").doc(reservationId);
  const resSnap = await resRef.get();
  if (!resSnap.exists) throw new ApiError(404, "Reservation not found.");
  const reservation = resSnap.data();
  if (reservation.status === "Checked In") throw new ApiError(409, "Guest is already checked in.");
  if (["Cancelled", "No Show"].includes(reservation.status)) throw new ApiError(409, `Cannot check in a ${reservation.status.toLowerCase()} reservation.`);

  await resRef.update({ status: "Checked In", checkedInAt: FieldValue.serverTimestamp(), folioStatus: "active" });

  const roomQuery = await db.collection("rooms").where("number", "==", reservation.room).limit(1).get();
  if (!roomQuery.empty) await roomQuery.docs[0].ref.update({ status: "occupied" });

  await db.collection("guests").doc(reservation.guestId).update({ totalStays: FieldValue.increment(1) });

  await logAction({ user: { uid }, action: "Guest checked in", entity: "reservations", entityId: reservationId });
  return { status: "Checked In" };
}

/** Check-out cascade — spec §17-19, §79 "Check-Out". Refuses to close a
 * folio with an outstanding balance unless explicitly overridden. */
async function checkOut({ reservationId, uid, allowCreditBalance = false }) {
  const resRef = db.collection("reservations").doc(reservationId);
  const resSnap = await resRef.get();
  if (!resSnap.exists) throw new ApiError(404, "Reservation not found.");
  const reservation = resSnap.data();
  if (reservation.status !== "Checked In") throw new ApiError(409, "Guest is not currently checked in.");

  if (reservation.balance > 0 && !allowCreditBalance) {
    throw new ApiError(402, `Outstanding balance of ${reservation.balance} must be settled before check-out.`);
  }

  await resRef.update({ status: "Checked Out", checkedOutAt: FieldValue.serverTimestamp(), folioStatus: "closed" });

  const roomQuery = await db.collection("rooms").where("number", "==", reservation.room).limit(1).get();
  if (!roomQuery.empty) {
    const roomDoc = roomQuery.docs[0];
    await roomDoc.ref.update({ status: "dirty" });
    // Automated housekeeping cascade — spec §17, §25: checkout always
    // creates a cleaning task, no manual step required.
    await createHousekeepingTask({ room: reservation.room, taskType: "Clean Room", priority: "Normal", reason: "checkout" });
  }

  await db.collection("guests").doc(reservation.guestId).update({ totalSpend: FieldValue.increment(reservation.total) });

  await logAction({ user: { uid }, action: "Guest checked out", entity: "reservations", entityId: reservationId, newValue: reservation.total });
  return { status: "Checked Out" };
}

/**
 * Posts a charge to a guest's active folio — used by restaurant "charge to
 * room", laundry, minibar, etc (spec §28-29, §59-60). Finds the guest's
 * currently checked-in reservation by name/room, adds the folio line,
 * recalculates the reservation balance, and (for restaurant) decrements
 * matching inventory automatically.
 */
async function postChargeToRoom({ room, guestName, category, description, amount, inventoryItemsConsumed }) {
  let query = db.collection("reservations").where("status", "==", "Checked In");
  if (room) query = query.where("room", "==", room);
  const snap = await query.get();
  const match = room
    ? snap.docs[0]
    : snap.docs.find((d) => (d.data().guestName || "").toLowerCase() === String(guestName || "").toLowerCase());

  if (!match) throw new ApiError(404, "No active in-house guest found for that room/name.");

  const reservation = match.data();
  await db.collection("folioItems").add({
    reservationId: match.id, category, description, amount,
    createdAt: FieldValue.serverTimestamp(),
  });

  const newTotal = Number(reservation.total) + Number(amount);
  const newBalance = balanceOf({ total: newTotal, paid: reservation.paid });
  await match.ref.update({ total: newTotal, balance: newBalance });

  const invoiceQuery = await db.collection("invoices").where("reservationId", "==", match.id).limit(1).get();
  if (!invoiceQuery.empty) {
    await invoiceQuery.docs[0].ref.update({ total: newTotal, balance: newBalance });
  }

  if (inventoryItemsConsumed?.length) {
    await decrementInventoryForOrder(inventoryItemsConsumed);
  }

  return { reservationId: match.id, newBalance };
}

module.exports = { checkIn, checkOut, postChargeToRoom };
