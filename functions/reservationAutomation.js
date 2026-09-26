const { onSchedule } = require("firebase-functions/v2/scheduler");
const { runNightAudit } = require("../server/services/reportService");

/** Runs automatically every night at 02:00 (hotel local time) so night
 * audit doesn't depend on a staff member remembering to click "Run" in
 * the admin panel — spec §62. Staff can still trigger it manually from
 * /admin/night-audit.html at any time via the API route. */
exports.scheduledNightAudit = onSchedule(
  { schedule: "0 2 * * *", timeZone: "Africa/Douala" },
  async () => {
    const result = await runNightAudit({ uid: "system-scheduler" });
    // eslint-disable-next-line no-console
    console.log("[scheduledNightAudit]", result);
  }
);
