const { db } = require("../config/firebase");
const { rangesOverlap } = require("../utils/dateUtils");

const BLOCKING_STATUSES = ["maintenance", "outoforder", "out_of_order"];
const BLOCKING_RESERVATION_STATUSES = ["Pending", "Confirmed", "Checked In"];

/**
 * Returns every room that is free for [checkIn, checkOut): not maintenance/
 * out-of-order, and not already reserved for any overlapping date range.
 * This runs entirely server-side — the client never decides availability
 * (spec §12: "Use server-side validation. Never rely only on frontend
 * availability.").
 */
async function findAvailableRooms({ checkIn, checkOut, typeId }) {
  const roomsSnap = await db.collection("rooms").get();
  let rooms = roomsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  rooms = rooms.filter((r) => !BLOCKING_STATUSES.includes(r.status));
  if (typeId) rooms = rooms.filter((r) => r.roomTypeId === typeId || r.type === typeId);

  const resSnap = await db.collection("reservations")
    .where("status", "in", BLOCKING_RESERVATION_STATUSES)
    .get();
  const activeReservations = resSnap.docs.map((d) => d.data());

  return rooms.filter((room) => {
    const conflict = activeReservations.some((res) =>
      res.room === room.number && rangesOverlap(checkIn, checkOut, res.checkIn, res.checkOut)
    );
    return !conflict;
  });
}

/** Throws if the specific room is not actually free — the final guard right
 * before a reservation is committed (prevents race-condition double booking
 * together with the Firestore transaction in bookingService). */
async function assertRoomAvailable({ roomNumber, checkIn, checkOut, excludeReservationId }) {
  const resSnap = await db.collection("reservations")
    .where("room", "==", roomNumber)
    .where("status", "in", BLOCKING_RESERVATION_STATUSES)
    .get();
  const conflict = resSnap.docs.some((d) => {
    if (d.id === excludeReservationId) return false;
    const res = d.data();
    return rangesOverlap(checkIn, checkOut, res.checkIn, res.checkOut);
  });
  if (conflict) {
    const { ApiError } = require("../utils/errors");
    throw new ApiError(409, `Room ${roomNumber} is no longer available for those dates.`);
  }
}

module.exports = { findAvailableRooms, assertRoomAvailable };
