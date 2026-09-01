const { ApiError } = require("../utils/errors");

/**
 * Restricts a route to specific roles. Client-side UI hides buttons staff
 * can't use, but THIS is the actual security boundary (spec §3, §71) — an
 * authenticated request from the wrong role is rejected here regardless of
 * what the frontend allowed.
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const role = req.userProfile?.role;
    if (!role) return next(new ApiError(403, "No role assigned to this account. Contact an administrator."));
    if (!allowedRoles.includes(role) && role !== "super_admin") {
      return next(new ApiError(403, "You do not have permission to perform this action."));
    }
    return next();
  };
}

module.exports = { requireRole };
