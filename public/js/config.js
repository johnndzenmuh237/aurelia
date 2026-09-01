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
    apiKey: "AIzaSyB4zLVvw6SVuFa7TxU4Ee7Ic7381K6Kz0s",
    authDomain: "swiftchain-827f2.firebaseapp.com",
    projectId: "swiftchain-827f2",
    storageBucket: "swiftchain-827f2.firebasestorage.app",
    messagingSenderId: "709059558659",
    appId: "1:709059558659:web:7c3eb1d6ddba07bb14bd36",
  },
  paymentProviders: ["mtn_momo", "orange_money"],
};
