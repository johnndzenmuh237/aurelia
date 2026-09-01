/**
 * Placeholder migration runner. This project's schema is simple enough
 * (see database/database-schema.md) that most changes are additive fields
 * handled by Firestore's schemaless nature — no migration needed. Use this
 * file when you DO need a one-off data migration (e.g. renaming a field
 * across every document in a collection): add a numbered migration
 * function below and run `node scripts/migrate.js`.
 */
require("dotenv").config();
const { db } = require("../server/config/firebase");

const migrations = [
  // Example:
  // async function 001_add_vip_tier_default() {
  //   const snap = await db.collection("guests").get();
  //   const batch = db.batch();
  //   snap.docs.forEach((d) => { if (!d.data().tier) batch.update(d.ref, { tier: "regular" }); });
  //   await batch.commit();
  // },
];

async function main() {
  for (const migration of migrations) {
    console.log(`Running ${migration.name}...`);
    await migration();
  }
  console.log(migrations.length ? "All migrations complete." : "No migrations to run.");
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
