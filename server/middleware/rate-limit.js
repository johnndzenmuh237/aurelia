const { ApiError } = require("../utils/errors");

/**
 * Simple sliding-window rate limiter, in-memory per server instance.
 * Good enough for a single-region small/mid-size hotel deployment; if you
 * scale to multiple server instances behind a load balancer, swap this for
 * a shared store (Redis) so limits apply across instances.
 */
function rateLimit({ windowMs = 60_000, max = 30 } = {}) {
  const hits = new Map();
  return (req, res, next) => {
    const key = req.ip || req.headers["x-forwarded-for"] || "unknown";
    const now = Date.now();
    const windowStart = now - windowMs;
    const timestamps = (hits.get(key) || []).filter((t) => t > windowStart);
    timestamps.push(now);
    hits.set(key, timestamps);
    if (timestamps.length > max) {
      return next(new ApiError(429, "Too many requests. Please slow down and try again shortly."));
    }
    next();
  };
}

module.exports = { rateLimit };
