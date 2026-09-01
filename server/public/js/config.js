/**
 * Public runtime config.
 * Firebase web config is NOT secret (it identifies the project, it doesn't
 * authorize access — Firestore/Storage security rules do that), so it is
 * safe to ship in the client bundle. Real secrets (payment provider keys,
 * server-side service account) live only in server/.env — never here.
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
    storageBucket: "REPLACE_WITH_PROJECT.appspot.com",
    messagingSenderId: "REPLACE_WITH_SENDER_ID",
    appId: "REPLACE_WITH_APP_ID",
  },
  paymentProviders: ["mtn_momo", "orange_money"],
};
