const jwt = require("jsonwebtoken");
const env = require("../config/environment");
const { ApiError } = require("../utils/errors");
const { METHOD_PERMISSION } = require("../config/access");

// Paths every signed-in person needs regardless of department permissions.
const PERMISSION_EXEMPT = [/^\/api\/team/, /^\/api\/auth\//, /^\/api\/account\//, /^\/api\/messages/, /^\/api\/notifications/, /^\/api\/owner\//];

/**
 * Verifies the Bearer JWT and attaches req.user.
 *
 * Two kinds of token exist:
 *  • legacy shared-role token  { role, name }                — unchanged
 *  • individual account token  { accountId, tv }             — owner/manager
 *
 * For account tokens the role, departments, permissions and active status
 * are re-read from the database on EVERY request, never trusted from the
 * token. That is what makes "revoke access" immediate: deactivating a
 * manager (or changing their password) bumps tokenVersion, so their very
 * next request fails with 401 even though the JWT itself hasn't expired.
 */
function authenticate({ optional = false } = {}) {
  return async (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    const fail = (status, msg) => (optional ? next() : next(new ApiError(status, msg)));

    if (!token) return fail(401, "Please sign in.");

    let decoded;
    try {
      decoded = jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"] });
    } catch {
      return fail(401, "Your session has expired. Please sign in again.");
    }

    try {
      if (decoded.accountId) {
        const { getAccount } = require("../services/accountService"); // lazy: avoids a require cycle
        const acct = await getAccount(decoded.accountId);
        if (!acct || acct.status !== "active" || (acct.tokenVersion || 1) !== decoded.tv) {
          return fail(401, "Your access has ended or your session is no longer valid. Please sign in again.");
        }
        req.user = {
          uid: `acct:${acct.id}`, key: `acct:${acct.id}`, accountId: acct.id,
          role: acct.role, name: acct.fullName, email: acct.email,
          departments: acct.departments || [], permissions: acct.permissions || [],
          tier: acct.tier || (acct.role === "manager" ? "manager" : acct.role),
          canManageTeam: acct.role === "manager" && acct.tier !== "staff" && acct.canManageTeam !== false,
          mustChangePassword: acct.role === "owner" && Boolean(acct.mustChangePassword),
        };
        req.userProfile = { role: acct.role, fullName: acct.fullName };

        // An account that must change its password may do nothing else.
        if (req.user.mustChangePassword && !/^\/api\/(account\/|auth\/verify)/.test(req.originalUrl.split("?")[0])) {
          return next(new ApiError(403, "You must change your password before continuing.", { code: "PASSWORD_CHANGE_REQUIRED" }));
        }
        // Individual managers: method-level permission (view/create/edit/delete).
        if (acct.role === "manager" && !PERMISSION_EXEMPT.some((re) => re.test(req.originalUrl.split("?")[0]))) {
          const needed = METHOD_PERMISSION[req.method];
          if (needed && !req.user.permissions.includes(needed)) {
            return next(new ApiError(403, `Your account is not permitted to ${needed} records.`));
          }
        }
        return next();
      }

      // ---- legacy shared-role token ----
      if (!decoded.role || decoded.role === "owner") return fail(401, "Please sign in.");
      if (env.disableSharedLogin) return fail(401, "Shared-password sign-in has been turned off. Use your personal account.");
      req.user = { uid: `role:${decoded.role}`, key: `role:${decoded.role}`, role: decoded.role, name: decoded.name };
      req.userProfile = { role: decoded.role, fullName: decoded.name };
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { authenticate };