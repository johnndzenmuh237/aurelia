const admin = require("firebase-admin");
const env = require("./environment");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: env.firebase.projectId,
      clientEmail: env.firebase.clientEmail,
      privateKey: env.firebase.privateKey,
    }),
  });
}

// Firestore remains the database — only Firebase Authentication and
// Firebase Storage were removed. `admin.auth()` is intentionally not
// exported anywhere in this project anymore.
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const Timestamp = admin.firestore.Timestamp;

module.exports = { admin, db, FieldValue, Timestamp };
