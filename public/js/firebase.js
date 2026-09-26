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
  getFirestore, collection, doc, onSnapshot, query, where, orderBy, limit,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const app = initializeApp(window.HOTEL_CONFIG.firebase);
const db = getFirestore(app);

window.firebaseApp = app;
window.firebaseDb = db;
window.fb = { collection, doc, onSnapshot, query, where, orderBy, limit };

document.dispatchEvent(new CustomEvent("firebase-ready"));
