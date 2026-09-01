const { db, FieldValue } = require("../config/firebase");
const { ApiError } = require("../utils/errors");

/** Called right after Firebase Auth account creation on the client — creates
 * the matching Firestore user profile (role: guest) and guest record.
 * Employee/admin accounts are created by HR/super-admin via /employees/hire
 * and /auth/register-staff (not exposed publicly). */
async function register(req, res, next) {
  try {
    const { uid, email, fullName, phone } = req.body;
    if (!uid || !email) throw new ApiError(400, "uid and email are required.");

    await db.collection("users").doc(uid).set({
      email, role: "guest", fullName: fullName || null, phone: phone || null,
      createdAt: FieldValue.serverTimestamp(),
    });

    const existing = await db.collection("guests").where("phone", "==", phone || "").limit(1).get();
    if (existing.empty) {
      const { generateGuestCode } = require("../utils/idGenerator");
      const guestCode = await generateGuestCode();
      await db.collection("guests").add({
        guestCode, uid, fullName: fullName || null, email, phone: phone || null,
        totalStays: 0, totalSpend: 0, createdAt: FieldValue.serverTimestamp(),
      });
    } else {
      await existing.docs[0].ref.update({ uid });
    }

    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
}

/** Returns the caller's own profile — used by the frontend to decide which
 * portal to route into and to display role/name in the topbar. */
async function verify(req, res, next) {
  try {
    if (!req.user) throw new ApiError(401, "Not authenticated.");
    res.json({ user: { uid: req.user.uid, email: req.user.email, ...req.userProfile } });
  } catch (err) { next(err); }
}

module.exports = { register, verify };
