/**
 * Recovery tool: sets a new password for the owner account directly in the
 * database (use when the emailed reset isn't available, e.g. SMTP isn't set
 * up). Needs the same .env as the server. Run on the server:
 *
 *   node scripts/reset-owner-password.js
 *
 * The password is typed at a hidden prompt, never passed on the command line.
 */
require("dotenv").config();
const readline = require("readline");
const { db } = require("../server/config/firebase");
const { hashPassword, passwordProblem } = require("../server/utils/password");

function askHidden(q) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(q)) rl.output.write(s); };
    rl.question(q, (a) => { rl.close(); process.stdout.write("\n"); resolve(a); });
  });
}

(async () => {
  const ref = db.collection("staffAccounts").doc("owner");
  const snap = await ref.get();
  if (!snap.exists) { console.error("No owner account exists yet — use /owner/setup.html instead."); process.exit(1); }
  const pw = await askHidden("New owner password: ");
  const again = await askHidden("Repeat password: ");
  if (pw !== again) { console.error("Passwords do not match."); process.exit(1); }
  const problem = passwordProblem(pw);
  if (problem) { console.error(problem); process.exit(1); }
  const cur = snap.data();
  await ref.update({ passwordHash: await hashPassword(pw), tokenVersion: (cur.tokenVersion || 1) + 1, failedAttempts: 0, lockedUntil: null, mustChangePassword: false, passwordChangedAt: new Date().toISOString() });
  console.log(`Password updated for ${cur.email}. All existing owner sessions were ended.`);
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
