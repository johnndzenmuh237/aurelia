/**
 * Optional Firebase Cloud Functions deployment.
 *
 * The primary automation cascade (booking -> availability -> folio ->
 * check-in -> housekeeping -> checkout, etc.) already runs synchronously
 * inside the Express API (server/services/*) for every request — that's
 * what guarantees consistency described in spec §79. These Functions add
 * two things the request/response API can't do by itself:
 *
 *   1. Scheduled jobs (night audit, low-stock/no-show sweeps) that need to
 *      run on a timer, not in response to a user action.
 *   2. A defensive Firestore trigger that keeps invoices/folios in sync
 *      even if a document is ever edited directly in the Firebase Console
 *      (bypassing the API) — belt-and-suspenders, not the primary path.
 *
 * Deploy with `firebase deploy --only functions` from the project root
 * (requires `firebase-tools` and a `firebase.json` — see docs/deployment.md).
 */
const nightAudit = require("./reservationAutomation");
const roomStatusAutomation = require("./roomStatusAutomation");
const paymentAutomation = require("./paymentAutomation");
const housekeepingAutomation = require("./housekeepingAutomation");
const employeeAutomation = require("./employeeAutomation");
const attendanceAutomation = require("./attendanceAutomation");
const paymentWebhook = require("./paymentWebhook");

module.exports = {
  ...nightAudit,
  ...roomStatusAutomation,
  ...paymentAutomation,
  ...housekeepingAutomation,
  ...employeeAutomation,
  ...attendanceAutomation,
  ...paymentWebhook,
};
