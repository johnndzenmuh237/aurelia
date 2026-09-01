const { ApiError } = require("../utils/errors");

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const isApiError = err instanceof ApiError;
  const status = isApiError ? err.status : 500;

  if (!isApiError) {
    // Unexpected/internal error — log full detail server-side, but never
    // expose stack traces or raw driver errors to the client (spec §81).
    // eslint-disable-next-line no-console
    console.error("[unhandled error]", err);
  }

  res.status(status).json({
    error: {
      message: isApiError ? err.message : "Something went wrong on our end. Please try again.",
      ...(isApiError && err.details ? { details: err.details } : {}),
    },
  });
}

module.exports = { errorHandler };
