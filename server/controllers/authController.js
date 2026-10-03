const jwt = require("jsonwebtoken");
const env = require("../config/environment");
const { ApiError } = require("../utils/errors");
const { logAction } = require("../utils/audit");

const VALID_ROLES = Object.keys(env.roles.passwords);

/**
 * Staff login — no accounts, no signup. Each role has ONE shared password
 * (set in .env by the manager, never in code). A correct password issues
 * a JWT carrying { role, name } where "name" is free text the person
 * types in purely for audit-trail display — it is NOT a unique identity,
 * so two people on the Front Desk team can both use the same password and
 * just type their own name in at login.
 */
async function login(req, res, next) {
  try {
    const { role, password, name } = req.body;
    if (!role || !password) throw new ApiError(400, "role and password are required.");
    if (!VALID_ROLES.includes(role)) throw new ApiError(400, `Unknown role. Must be one of: ${VALID_ROLES.join(", ")}`);

    const expected = env.roles.passwords[role];
    if (!expected) {
      throw new ApiError(500, `No password has been configured for the "${role}" role yet. Set it in your server's environment variables.`);
    }
    if (password !== expected) {
      throw new ApiError(401, "Incorrect password.");
    }

    const token = jwt.sign({ role, name: name || role }, env.jwtSecret, { expiresIn: "12h" });
    // Audit trail (spec §28: "Login"). Fire-and-forget — a logging hiccup
    // must never block a staff member from signing in.
    logAction({ user: { name: name || role }, action: `Login (${role})`, entity: "auth", entityId: null }).catch(() => {});
    res.json({ token, role, name: name || role });
  } catch (err) { next(err); }
}

/** Returns the caller's own session info — used by the frontend to
 * confirm the token is still valid and to display "Role (Name)" in the
 * topbar. */
async function verify(req, res, next) {
  try {
    if (!req.user) throw new ApiError(401, "Not authenticated.");
    res.json({ user: { role: req.user.role, name: req.user.name } });
  } catch (err) { next(err); }
}

module.exports = { login, verify };
