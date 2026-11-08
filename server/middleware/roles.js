const { ApiError } = require("../utils/errors");
const { DEPARTMENTS } = require("../config/access");

/**
 * Restricts a route to specific roles. Client-side UI hides buttons staff
 * can't use, but THIS is the actual security boundary (spec §3, §71) — an
 * authenticated request from the wrong role is rejected here regardless of
 * what the frontend allowed.
 *
 *  • owner and super_admin pass every check.
 *  • a legacy shared-password manager passes wherever "manager" is listed
 *    (behaviour unchanged).
 *  • an individual manager account passes only where one of ITS departments
 *    is listed (department keys are the same strings as the legacy roles),
 *    or — on routes listing only "manager"/"super_admin" — when the owner
 *    granted it the "approve" permission.
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const user = req.user;
    const role = user?.role || req.userProfile?.role;
    if (!role) return next(new ApiError(403, "No role assigned to this account. Contact an administrator."));
    if (role === "owner" || role === "super_admin") return next();

    if (role === "manager" && user?.accountId) {
      const deptRoles = allowedRoles.filter((r) => DEPARTMENTS[r]);
      if (deptRoles.some((d) => user.departments.includes(d))) return next();
      if (deptRoles.length === 0 && allowedRoles.includes("manager") && user.permissions.includes("approve")) return next();
      return next(new ApiError(403, "This is outside the departments your account manages."));
    }

    if (!allowedRoles.includes(role)) {
      return next(new ApiError(403, "You do not have permission to perform this action."));
    }
    return next();
  };
}

/** Owner-only routes (manager administration, owner overview). */
function requireOwner(req, res, next) {
  if (req.user?.role === "owner" && req.user.accountId) return next();
  return next(new ApiError(403, "Only the business owner can do this."));
}

/** Any individual account (owner or manager) — not a shared-role login. */
function requireAccount(req, res, next) {
  if (req.user?.accountId) return next();
  return next(new ApiError(403, "This feature needs a personal account."));
}

module.exports = { requireRole, requireOwner, requireAccount };
