/* Firebase client SDK init. Loaded as an ES module (see script type="module" in pages).
   Used for: (1) authentication state + ID tokens, (2) real-time read listeners
   (room status, dashboard counters, housekeeping tasks) via onSnapshot.
   All writes that affect money, inventory or availability go through /api
   (server/) so business rules and role checks are enforced in one place —
   the client never writes reservations, payments or folios directly. */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, collection, doc, onSnapshot, query, where, orderBy, limit,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const app = initializeApp(window.HOTEL_CONFIG.firebase);
const auth = getAuth(app);
const db = getFirestore(app);

window.firebaseApp = app;
window.firebaseAuth = auth;
window.firebaseDb = db;
window.fb = {
  collection, doc, onSnapshot, query, where, orderBy, limit,
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
};

document.dispatchEvent(new CustomEvent("firebase-ready"));
