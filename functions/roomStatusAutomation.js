const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { getFirestore } = require("firebase-admin/firestore");

/**
 * Defensive backstop: if a reservation's status is ever changed to
 * "Cancelled" or "No Show" by any path other than the API (e.g. a direct
 * Firestore Console edit during support/debugging), make sure the room
 * this reservation was holding is released back to "available" rather
 * than staying stuck as "reserved" forever. The primary path (API
 * check-in/checkout/cancel) already does this — see
 * server/services/folioService.js and reportService.js.
 */
exports.onReservationStatusChanged = onDocumentUpdated("reservations/{reservationId}", async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  if (before.status === after.status) return;

  if (["Cancelled", "No Show"].includes(after.status)) {
    const db = getFirestore();
    const roomQuery = await db.collection("rooms").where("number", "==", after.room).limit(1).get();
    if (!roomQuery.empty && roomQuery.docs[0].data().status === "reserved") {
      await roomQuery.docs[0].ref.update({ status: "available" });
    }
  }
});
