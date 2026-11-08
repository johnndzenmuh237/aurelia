const { db } = require("../config/firebase");
const { ApiError } = require("../utils/errors");
const { COLLECTION_ROLES, OWNER_EXTRA_COLLECTIONS, canReadCollection } = require("../config/access");

/**
 * With Firebase Authentication removed, the Firestore client SDK has no
 * `request.auth` context anymore — so firestore.rules can no longer tell
 * "is this a logged-in staff member reading their own dashboard" from
 * "is this a stranger who found the public API key". Every collection that
 * contains guest data, financial records, or internal operations is
 * therefore denied to direct client reads in firestore.rules, and read
 * through this JWT-protected endpoint instead.
 *
 * Access is now ALSO scoped per role/department (config/access.js):
 * previously any signed-in staff member could read any collection here —
 * e.g. the generic `employee` login could read payroll. The owner (and
 * super_admin) can read everything, including the new account/messaging
 * collections; account secrets are always stripped.
 */
const SECRET_FIELDS = ["passwordHash", "failedAttempts", "lockedUntil", "tokenVersion"];

function stripSecrets(data) {
  const out = { ...data };
  SECRET_FIELDS.forEach((f) => delete out[f]);
  return out;
}

async function list(req, res, next) {
  try {
    const name = req.params.collection;
    const isExtra = OWNER_EXTRA_COLLECTIONS.includes(name);
    if (!isExtra && !(name in COLLECTION_ROLES)) throw new ApiError(400, "Unknown or restricted collection.");
    if (isExtra && req.user.role !== "owner") throw new ApiError(403, "Only the business owner can open this section.");
    if (!isExtra && !canReadCollection(req.user, name)) throw new ApiError(403, "Your role does not have access to this section.");

    let q = db.collection(name);
    const limit = Number(req.query.limit);
    if (limit > 0) q = q.limit(Math.min(limit, 5000));
    const snap = await q.get();
    res.json({ items: snap.docs.map((d) => ({ id: d.id, ...(name === "staffAccounts" ? stripSecrets(d.data()) : d.data()) })) });
  } catch (err) { next(err); }
}

module.exports = { list };
