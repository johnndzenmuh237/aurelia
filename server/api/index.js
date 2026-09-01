/**
 * Single Vercel serverless entry point for the entire API.
 *
 * The spec's file tree lists one file per operation under /api (e.g.
 * api/bookings/create.js, api/bookings/cancel.js, ...). In Express, those
 * are routes, not separate files — server/app.js defines each one at the
 * exact same path (POST /api/bookings/create, etc.), backed by real
 * controllers/services. Deploying 60+ near-duplicate serverless functions
 * would add cold-start overhead and duplicate the same Firebase Admin
 * connection 60+ times for no benefit; one function handling the whole
 * Express app (rewritten here via vercel.json) is the standard, correct
 * pattern for Express-on-Vercel and keeps every route path identical to
 * what the frontend already calls.
 */
module.exports = require("../server/app");
