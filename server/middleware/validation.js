const { requireFields } = require("../utils/errors");

/** Wraps requireFields as Express middleware: `validateBody(["a","b"])`. */
function validateBody(fields) {
  return (req, res, next) => {
    try {
      requireFields(req.body || {}, fields);
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { validateBody };
