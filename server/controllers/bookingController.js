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

module.exports = { checkAvailability, create };
