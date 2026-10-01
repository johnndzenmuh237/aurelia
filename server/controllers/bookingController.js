const { createBooking, previewQuote } = require("../services/bookingService");
const { findAvailableRooms } = require("../services/availabilityService");
const { ApiError } = require("../utils/errors");

async function checkAvailability(req, res, next) {
  try {
    const { checkIn, checkOut, typeId } = req.query;
    if (!checkIn || !checkOut) throw new ApiError(400, "checkIn and checkOut query params are required.");
    const rooms = await findAvailableRooms({ checkIn, checkOut, typeId });
    res.json({
      available: rooms.map((r) => ({
        id: r.id, number: r.number, type: r.roomTypeName || r.type, typeId: r.roomTypeId || r.type,
        capacity: r.capacity, rate: r.rate,
      })),
    });
  } catch (err) { next(err); }
}

<<<<<<< HEAD
/**
 * Public "track my booking" lookup — since guests never create accounts
 * or log in, this is how they check their reservation/folio status:
 * reservation code + the phone number they booked with. No password, but
 * also nothing sensitive beyond what the guest already knows about their
 * own stay.
 */
async function lookupBooking(req, res, next) {
  try {
    const { code, phone } = req.query;
    if (!code || !phone) throw new ApiError(400, "Reservation code and phone number are required.");
    const { db } = require("../config/firebase");
    const snap = await db.collection("reservations").where("reservationCode", "==", code.trim().toUpperCase()).limit(1).get();
    if (snap.empty) throw new ApiError(404, "No reservation found with that code.");
    const reservation = snap.docs[0].data();
    if (String(reservation.phone).replace(/\D/g, "") !== String(phone).replace(/\D/g, "")) {
      throw new ApiError(404, "No reservation found with that code and phone number.");
    }
    res.json({
      reservationCode: reservation.reservationCode, guestName: reservation.guestName,
      room: reservation.room, roomTypeName: reservation.roomTypeName,
      checkIn: reservation.checkIn, checkOut: reservation.checkOut,
      status: reservation.status, total: reservation.total, paid: reservation.paid, balance: reservation.balance,
    });
  } catch (err) { next(err); }
}

=======
>>>>>>> cee3b36d42600e502dc7bbc822e817b33780b7d5
/** Handles both the price-preview call (GET-style query params, ?preview=1)
 * and the real POST that creates the reservation — kept in one handler
 * since the booking page calls the same path for both. */
async function create(req, res, next) {
  try {
    if (req.query.preview === "1") {
      const { type, checkIn, checkOut } = req.query;
      const quote = await previewQuote({ typeId: type, checkIn, checkOut });
      return res.json(quote);
    }
    const uid = req.user?.uid || null;
    const result = await createBooking(req.body, { uid });
    res.status(201).json(result);
  } catch (err) { next(err); }
}

<<<<<<< HEAD
module.exports = { checkAvailability, create, lookupBooking };
=======
module.exports = { checkAvailability, create };
>>>>>>> cee3b36d42600e502dc7bbc822e817b33780b7d5
