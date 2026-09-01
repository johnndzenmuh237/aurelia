const { db } = require("../config/firebase");
const { genericCrud } = require("../services/genericCrud");
const { findAvailableRooms } = require("../services/availabilityService");
const { completeHousekeeping } = require("../services/housekeepingService");
const { ApiError } = require("../utils/errors");

const reservationsCrud = genericCrud("reservations");
const roomsCrud = genericCrud("rooms");
const guestsCrud = genericCrud("guests");

// ---------- reservations ----------
async function updateReservation(req, res, next) {
  try {
    const { id, ...data } = req.body;
    const result = await reservationsCrud.update(id, data, req.user?.uid);
    res.json(result);
  } catch (err) { next(err); }
}
async function deleteReservationHandler(req, res, next) {
  try {
    const { id } = req.body;
    await db.collection("reservations").doc(id).update({ status: "Cancelled" });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

// ---------- rooms ----------
async function createRoom(req, res, next) {
  try { res.status(201).json(await roomsCrud.create({ ...req.body, status: "available" }, req.user?.uid)); }
  catch (err) { next(err); }
}
async function updateRoom(req, res, next) {
  try { res.json(await roomsCrud.update(req.body.id, req.body, req.user?.uid)); }
  catch (err) { next(err); }
}
async function updateRoomStatus(req, res, next) {
  try {
    const { id, status } = req.body;
    if (!id || !status) throw new ApiError(400, "id and status are required.");
    const result = await completeHousekeeping({ roomId: id, status });
    res.json(result);
  } catch (err) { next(err); }
}
async function roomAvailabilityQuery(req, res, next) {
  try {
    const { checkIn, checkOut } = req.query;
    if (!checkIn || !checkOut) throw new ApiError(400, "checkIn and checkOut are required.");
    const rooms = await findAvailableRooms({ checkIn, checkOut });
    res.json({ available: rooms.map((r) => ({ id: r.id, number: r.number, type: r.roomTypeName || r.type, capacity: r.capacity, rate: r.rate })) });
  } catch (err) { next(err); }
}

// ---------- guests ----------
async function createGuestOrRequest(req, res, next) {
  try {
    const { type, ...data } = req.body;
    // Contact form / careers / guest-request submissions all land through
    // this one public endpoint, routed by `type`, so the public site never
    // needs an authenticated call just to reach the front desk.
    if (type === "contact_message") {
      await db.collection("notifications").add({ type: "contact_message", message: `${data.name}: ${data.message}`, read: false, createdAt: new Date() });
      return res.json({ ok: true });
    }
    if (type === "guest_request") {
      const uid = req.user?.uid || null;
      const ref = await db.collection("guestRequests").add({ ...data, guestUid: uid, status: "pending", createdAt: new Date() });
      return res.status(201).json({ id: ref.id });
    }
    res.status(201).json(await guestsCrud.create(data, req.user?.uid));
  } catch (err) { next(err); }
}
async function updateGuest(req, res, next) {
  try {
    const uid = req.user?.uid;
    const guestQuery = await db.collection("guests").where("uid", "==", uid).limit(1).get();
    if (guestQuery.empty) throw new ApiError(404, "Guest profile not found.");
    await guestQuery.docs[0].ref.update(req.body);
    res.json({ ok: true });
  } catch (err) { next(err); }
}

module.exports = {
  updateReservation, deleteReservationHandler,
  createRoom, updateRoom, updateRoomStatus, roomAvailabilityQuery,
  createGuestOrRequest, updateGuest,
};
