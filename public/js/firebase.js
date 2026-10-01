<<<<<<< HEAD
/* Firebase client SDK init — Firestore ONLY. Firebase Authentication was
   removed project-wide in favor of simple shared role passwords (see
   public/js/auth.js and server/controllers/authController.js); Firebase
   Storage was never used (no document/photo uploads in this build), so
   neither is initialized here. Firestore itself stays as the database —
   used for real-time reads on public pages (rooms, restaurant, bar) via
   onSnapshot, and as the data store the server (Firebase Admin SDK)
   writes to for everything staff-facing. */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
=======
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
>>>>>>> cee3b36d42600e502dc7bbc822e817b33780b7d5
  getFirestore, collection, doc, onSnapshot, query, where, orderBy, limit,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const app = initializeApp(window.HOTEL_CONFIG.firebase);
<<<<<<< HEAD
const db = getFirestore(app);

window.firebaseApp = app;
window.firebaseDb = db;
window.fb = { collection, doc, onSnapshot, query, where, orderBy, limit };
=======
const auth = getAuth(app);
const db = getFirestore(app);

window.firebaseApp = app;
window.firebaseAuth = auth;
window.firebaseDb = db;
window.fb = {
  collection, doc, onSnapshot, query, where, orderBy, limit,
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
};
>>>>>>> cee3b36d42600e502dc7bbc822e817b33780b7d5

document.dispatchEvent(new CustomEvent("firebase-ready"));
