/**
 * Public runtime config.
 * Firebase web config is NOT secret (it identifies the Firestore project,
 * it doesn't authorize access — firestore.rules does that), so it is safe
 * to ship in the client bundle. Only Firestore is used here — Firebase
 * Authentication and Storage were removed project-wide (see
 * docs/security.md); staff log in with a shared role password against
 * the Express API instead (server/controllers/authController.js), which
 * is where the real secrets (JWT_SECRET, role passwords, payment provider
 * keys, service account) live — only in server/.env, never here.
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
    apiKey: "REPLACE_WITH_FIREBASE_API_KEY",
    authDomain: "REPLACE_WITH_PROJECT.firebaseapp.com",
    projectId: "REPLACE_WITH_PROJECT_ID",
    messagingSenderId: "REPLACE_WITH_SENDER_ID",
    appId: "REPLACE_WITH_APP_ID",
  },
  paymentProviders: ["mtn_momo", "orange_money"],
};
