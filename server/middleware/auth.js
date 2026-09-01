const { auth, db } = require("../config/firebase");
const { ApiError } = require("../utils/errors");

/**
 * Verifies the Firebase ID token in the Authorization header and attaches
 * req.user (decoded token) and req.userProfile (Firestore users/{uid} doc,
 * which carries the role used by requireRole). Routes that guests can hit
 * anonymously (browsing availability, initial booking creation) skip this
 * via `optional: true`.
 */
function authenticate({ optional = false } = {}) {
  return async (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      if (optional) return next();
      return next(new ApiError(401, "Authentication required."));
    }

    try {
      const decoded = await auth.verifyIdToken(token);
      req.user = decoded;
      const profileSnap = await db.collection("users").doc(decoded.uid).get();
      req.userProfile = profileSnap.exists ? { id: profileSnap.id, ...profileSnap.data() } : null;
      return next();
    } catch (err) {
      if (optional) return next();
      return next(new ApiError(401, "Your session has expired. Please sign in again."));
    }
  };
}

module.exports = { authenticate };
