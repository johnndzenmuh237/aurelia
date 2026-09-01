const { checkIn, checkOut } = require("../services/folioService");
const { ApiError } = require("../utils/errors");

async function checkInHandler(req, res, next) {
  try {
    const { reservationId } = req.body;
    if (!reservationId) throw new ApiError(400, "reservationId is required.");
    res.json(await checkIn({ reservationId, uid: req.user?.uid }));
  } catch (err) { next(err); }
}

async function checkOutHandler(req, res, next) {
  try {
    const { reservationId, allowCreditBalance } = req.body;
    if (!reservationId) throw new ApiError(400, "reservationId is required.");
    res.json(await checkOut({ reservationId, uid: req.user?.uid, allowCreditBalance }));
  } catch (err) { next(err); }
}

module.exports = { checkInHandler, checkOutHandler };
