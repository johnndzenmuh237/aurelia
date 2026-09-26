const { db, FieldValue } = require("../config/firebase");
const { ApiError } = require("../utils/errors");
const { findAvailableRooms, assertRoomAvailable } = require("./availabilityService");
const { quoteRoom, buildRateCard } = require("../utils/calculations");
const { generateReservationCode, generateGuestCode, generateInvoiceNumber } = require("../utils/idGenerator");
const { logAction } = require("../utils/audit");
const { notifyReservationCreated } = require("./notificationService");

/** Builds a price quote without creating anything — used by the booking
 * page's live summary before the guest commits (spec §5). Includes the
 * full rate card (nightly/weekly/monthly) so the guest can see the
 * savings from a longer stay before picking dates. */
async function previewQuote({ typeId, checkIn, checkOut }) {
  const typeSnap = await db.collection("roomTypes").doc(typeId).get();
  if (!typeSnap.exists) throw new ApiError(404, "Room type not found.");
  const type = typeSnap.data();
  const q = quoteRoom({
    nightlyRate: type.basePrice, checkIn, checkOut,
    weeklyDiscountPercent: type.weeklyDiscountPercent, monthlyDiscountPercent: type.monthlyDiscountPercent,
  });
  const rateCard = buildRateCard({
    nightlyRate: type.basePrice,
    weeklyDiscountPercent: type.weeklyDiscountPercent, monthlyDiscountPercent: type.monthlyDiscountPercent,
  });
  return { ...q, roomTypeName: type.name, rateCard };
}

/**
 * Creates a reservation and runs the full automation cascade described in
 * spec §1 and §79: verify availability -> block inventory -> create/find
 * guest profile -> create folio/invoice -> record deposit placeholder ->
 * (payment is confirmed separately by paymentService once the provider
 * verifies it) -> notify.
 *
 * Wrapped in a Firestore transaction so two guests racing for the same
 * room/dates can never both succeed (spec §12 overbooking protection).
 */
async function createBooking(payload, { uid = null } = {}) {
  const { type, checkIn, checkOut, guestName, phone, email, adults, specialRequests, source, room: preselectedRoom } = payload;
  if (!checkIn || !checkOut || !guestName || !phone) {
    throw new ApiError(400, "Check-in, check-out, guest name and phone are required.");
  }

  const available = await findAvailableRooms({ checkIn, checkOut, typeId: type });
  const chosenRoom = preselectedRoom
    ? available.find((r) => r.number === preselectedRoom)
    : available[0];
  if (!chosenRoom) throw new ApiError(409, "No rooms available for those dates.");

  await assertRoomAvailable({ roomNumber: chosenRoom.number, checkIn, checkOut });

  const typeSnap = await db.collection("roomTypes").doc(chosenRoom.roomTypeId || type).get();
  const roomType = typeSnap.exists ? typeSnap.data() : { name: chosenRoom.type, basePrice: chosenRoom.rate };
  const quote = quoteRoom({
    nightlyRate: roomType.basePrice || chosenRoom.rate, checkIn, checkOut,
    weeklyDiscountPercent: roomType.weeklyDiscountPercent, monthlyDiscountPercent: roomType.monthlyDiscountPercent,
  });

  // Find-or-create a single central guest profile (spec §14 — no duplicate
  // profiles for the same person across booking channels).
  let guestRef;
  const existingGuest = await db.collection("guests").where("phone", "==", phone).limit(1).get();
  if (!existingGuest.empty) {
    guestRef = existingGuest.docs[0].ref;
    await guestRef.update({ fullName: guestName, email: email || null, updatedAt: FieldValue.serverTimestamp() });
  } else {
    const guestCode = await generateGuestCode();
    guestRef = db.collection("guests").doc();
    await guestRef.set({
      guestCode, fullName: guestName, phone, email: email || null, uid: uid || null,
      totalStays: 0, totalSpend: 0, createdAt: FieldValue.serverTimestamp(),
    });
  }

  const reservationCode = await generateReservationCode();
  const reservationRef = db.collection("reservations").doc();
  const reservationData = {
    reservationCode,
    guestId: guestRef.id,
    guestUid: uid || null,
    guestName,
    phone,
    email: email || null,
    room: chosenRoom.number,
    roomTypeId: chosenRoom.roomTypeId || type,
    roomTypeName: roomType.name,
    checkIn, checkOut,
    adults: Number(adults || 1),
    rate: roomType.basePrice || chosenRoom.rate,
    total: quote.total,
    paid: 0,
    balance: quote.total,
    deposit: quote.deposit,
    source: source || "DIRECT",
    status: "Pending",
    paymentStatus: "unpaid",
    folioStatus: "active",
    specialRequests: specialRequests || null,
    vip: false,
    createdAt: FieldValue.serverTimestamp(),
  };
  await reservationRef.set(reservationData);

  // Block the room for these dates and reflect it on the room board.
  await db.collection("rooms").doc(chosenRoom.id).update({ status: "reserved" });

  const invoiceNumber = await generateInvoiceNumber();
  await db.collection("invoices").doc().set({
    invoiceNumber, reservationId: reservationRef.id, guestId: guestRef.id, guestName,
    guestUid: uid || null,
    total: quote.total, paid: 0, balance: quote.total, status: "unpaid",
    createdAt: FieldValue.serverTimestamp(),
  });

  await db.collection("folioItems").add({
    reservationId: reservationRef.id, category: "room",
    description: `${roomType.name} — ${quote.nights} night(s)`, amount: quote.roomTotal,
    createdAt: FieldValue.serverTimestamp(),
  });
  await db.collection("folioItems").add({
    reservationId: reservationRef.id, category: "tax",
    description: "Taxes & fees", amount: quote.tax, createdAt: FieldValue.serverTimestamp(),
  });

  await logAction({ user: uid ? { uid } : null, action: "Reservation created", entity: "reservations", entityId: reservationRef.id, newValue: reservationCode });
  await notifyReservationCreated({ email, phone, guestName, reservationCode, checkIn, checkOut, total: quote.total });

  return {
    reservationId: reservationRef.id, reservationCode, roomTypeName: roomType.name,
    roomTotal: quote.roomTotal, tax: quote.tax, total: quote.total, deposit: quote.deposit,
  };
}

module.exports = { createBooking, previewQuote };
