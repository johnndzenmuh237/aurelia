class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** Throws a 400 ApiError if any of `fields` is missing/empty on req.body. */
function requireFields(body, fields) {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === "");
  if (missing.length) {
    throw new ApiError(400, `Missing required field(s): ${missing.join(", ")}`);
  }
}

module.exports = { ApiError, requireFields };
