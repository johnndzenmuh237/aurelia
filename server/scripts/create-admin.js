/**
 * Creates (or promotes) the first super_admin account.
 * Usage: node scripts/create-admin.js you@example.com "Full Name"
 * The account must already exist in Firebase Authentication (create it in
 * the Firebase Console or via `firebase auth:import`), or pass a password
 * as a third argument to create it here.
 */
require("dotenv").config();
const { auth, db, FieldValue } = require("../server/config/firebase");

async function main() {
  const [, , email, name, password] = process.argv;
  if (!email) {
    console.error("Usage: node scripts/create-admin.js <email> [full name] [password]");
    process.exit(1);
  }

  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch {
    if (!password) {
      console.error(`No existing user for ${email}. Pass a password as the 3rd argument to create one.`);
      process.exit(1);
    }
    user = await auth.createUser({ email, password, displayName: name || email });
  }

  await db.collection("users").doc(user.uid).set({
    email, role: "super_admin", fullName: name || email, createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log(`✔ ${email} is now a super_admin (uid: ${user.uid}).`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
