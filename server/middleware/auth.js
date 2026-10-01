<<<<<<< HEAD
const jwt = require("jsonwebtoken");
const env = require("../config/environment");
const { ApiError } = require("../utils/errors");

/**
 * Verifies the JWT issued by POST /api/auth/login and attaches
 * req.user = { uid, role, name }. "uid" here is synthetic (`role:manager`
 * etc) — there are no individual accounts in this system, only shared
 * role passwords, so req.user.uid exists purely so the rest of the
 * codebase (audit logging, createdBy fields) keeps working the same way
 * it would with a real per-person ID. req.userProfile mirrors the same
 * shape so server/middleware/roles.js's requireRole() needs no changes.
 */
function authenticate({ optional = false } = {}) {
  return (req, res, next) => {
=======
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
>>>>>>> cee3b36d42600e502dc7bbc822e817b33780b7d5
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      if (optional) return next();
<<<<<<< HEAD
      return next(new ApiError(401, "Please sign in."));
    }

    try {
      const decoded = jwt.verify(token, env.jwtSecret);
      req.user = { uid: `role:${decoded.role}`, role: decoded.role, name: decoded.name };
      req.userProfile = { role: decoded.role, fullName: decoded.name };
=======
      return next(new ApiError(401, "Authentication required."));
    }

    try {
      const decoded = await auth.verifyIdToken(token);
      req.user = decoded;
      const profileSnap = await db.collection("users").doc(decoded.uid).get();
      req.userProfile = profileSnap.exists ? { id: profileSnap.id, ...profileSnap.data() } : null;
>>>>>>> cee3b36d42600e502dc7bbc822e817b33780b7d5
      return next();
    } catch (err) {
      if (optional) return next();
      return next(new ApiError(401, "Your session has expired. Please sign in again."));
    }
  };
}

module.exports = { authenticate };
