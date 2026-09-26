const { db, FieldValue } = require("../config/firebase");
const { ApiError } = require("../utils/errors");

/** Minimal, reusable Firestore CRUD for entities with no special business
 * rules beyond "create/update/list" — the core loop entities (bookings,
 * check-in/out, payments, housekeeping) have their own dedicated services
 * instead because they carry real automation logic. */
function genericCrud(collectionName) {
  return {
    async create(data, uid) {
      const ref = await db.collection(collectionName).add({
        ...data, createdBy: uid || null, createdAt: FieldValue.serverTimestamp(),
      });
      return { id: ref.id };
    },
    async update(id, data, uid) {
      if (!id) throw new ApiError(400, "id is required.");
      const ref = db.collection(collectionName).doc(id);
      const snap = await ref.get();
      if (!snap.exists) throw new ApiError(404, "Record not found.");
      await ref.update({ ...data, updatedBy: uid || null, updatedAt: FieldValue.serverTimestamp() });
      return { id };
    },
    async get(id) {
      const snap = await db.collection(collectionName).doc(id).get();
      if (!snap.exists) throw new ApiError(404, "Record not found.");
      return { id: snap.id, ...snap.data() };
    },
    async list({ limit = 100 } = {}) {
      const snap = await db.collection(collectionName).limit(limit).get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
  };
}

module.exports = { genericCrud };
