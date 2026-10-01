/**
 * Public runtime config.
<<<<<<< HEAD
 * Firebase web config is NOT secret (it identifies the Firestore project,
 * it doesn't authorize access — firestore.rules does that), so it is safe
 * to ship in the client bundle. Only Firestore is used here — Firebase
 * Authentication and Storage were removed project-wide (see
 * docs/security.md); staff log in with a shared role password against
 * the Express API instead (server/controllers/authController.js), which
 * is where the real secrets (JWT_SECRET, role passwords, payment provider
 * keys, service account) live — only in server/.env, never here.
=======
 * Firebase web config is NOT secret (it identifies the project, it doesn't
 * authorize access — Firestore/Storage security rules do that), so it is
 * safe to ship in the client bundle. Real secrets (payment provider keys,
 * server-side service account) live only in server/.env — never here.
>>>>>>> cee3b36d42600e502dc7bbc822e817b33780b7d5
 *
 * In production this file is generated at deploy time from environment
 * variables (see /docs/deployment.md, step "Inject client config").
 */
window.HOTEL_CONFIG = {
  hotelName: "Aurelia Hotel",
  currency: "FCFA",
  locale: "en-CM",
  timezone: "Africa/Douala",
  apiBaseUrl: "/api",
  firebase: {
<<<<<<< HEAD
    apiKey: "REPLACE_WITH_FIREBASE_API_KEY",
    authDomain: "REPLACE_WITH_PROJECT.firebaseapp.com",
    projectId: "REPLACE_WITH_PROJECT_ID",
    messagingSenderId: "REPLACE_WITH_SENDER_ID",
    appId: "REPLACE_WITH_APP_ID",
=======
    apiKey: "AIzaSyB4zLVvw6SVuFa7TxU4Ee7Ic7381K6Kz0s",
    authDomain: "swiftchain-827f2.firebaseapp.com",
    projectId: "swiftchain-827f2",
    storageBucket: "swiftchain-827f2.firebasestorage.app",
    messagingSenderId: "709059558659",
    appId: "1:709059558659:web:7c3eb1d6ddba07bb14bd36",
>>>>>>> cee3b36d42600e502dc7bbc822e817b33780b7d5
  },
  paymentProviders: ["mtn_momo", "orange_money"],
};
