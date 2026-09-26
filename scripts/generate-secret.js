/**
 * Generates a random, strong value suitable for JWT_SECRET or any of the
 * role passwords in .env — there are no accounts to create anymore
 * (staff sign in with a shared role password, see docs/security.md), so
 * this replaces the old create-admin.js script.
 *
 * Usage: node scripts/generate-secret.js
 */
const crypto = require("crypto");
console.log(crypto.randomBytes(32).toString("hex"));
