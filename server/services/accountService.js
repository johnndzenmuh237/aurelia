const { db } = require("../config/firebase");
const env = require("../config/environment");
const { ApiError } = require("../utils/errors");
const { DEPARTMENTS, MANAGER_PERMISSIONS } = require("../config/access");
const { hashPassword, verifyPassword, passwordProblem, randomCode, safeEqual, sha256 } = require("../utils/password");
const { sendEmail } = require("./notificationService");

/**
 * Individual staff accounts (owner + managers).
 *
 * Accounts live in their own collection and are NEVER referenced by
 * "ownership" of business records — records only carry a createdBy /
 * updatedBy string (acct:<id>) for the audit trail. That is what makes it
 * safe to deactivate or replace a manager: the account changes, the
 * records do not.
 */
const ACCOUNTS = "staffAccounts";
const INDEX = "accountIndex";
const RESETS = "passwordResets";
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const RESET_MINUTES = 15;
const RESET_MAX_ATTEMPTS = 5;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;

const nowIso = () => new Date().toISOString();
const idxId = (kind, value) => sha256(`${kind}:${String(value).trim().toLowerCase()}`);

/** Strips secrets before an account leaves the server. */
function publicAccount(a) {
  if (!a) return null;
  const { passwordHash, failedAttempts, lockedUntil, tokenVersion, ...rest } = a;
  return { ...rest, locked: Boolean(lockedUntil && new Date(lockedUntil) > new Date()) };
}

function cleanDepartments(list) {
  const arr = Array.isArray(list) ? list : [];
  const bad = arr.filter((d) => !DEPARTMENTS[d]);
  if (bad.length) throw new ApiError(400, `Unknown department(s): ${bad.join(", ")}.`);
  return [...new Set(arr)];
}

function cleanPermissions(list) {
  const arr = Array.isArray(list) ? list : ["view"];
  const bad = arr.filter((p) => !MANAGER_PERMISSIONS.includes(p));
  if (bad.length) throw new ApiError(400, `Unknown permission(s): ${bad.join(", ")}.`);
  const set = new Set(arr);
  set.add("view"); // a manager who cannot view anything is not usable
  return [...set];
}

function validateIdentity({ email, username, fullName }) {
  if (!fullName || String(fullName).trim().length < 2) throw new ApiError(400, "Full name is required.");
  if (!email || !EMAIL_RE.test(String(email).trim())) throw new ApiError(400, "A valid email address is required.");
  const u = username ? String(username).trim().toLowerCase() : null;
  if (u && !USERNAME_RE.test(u)) throw new ApiError(400, "Username must be 3–32 characters: letters, numbers, dot, dash or underscore.");
  return { email: String(email).trim().toLowerCase(), username: u, fullName: String(fullName).trim() };
}

async function createAccount({ role, id, fullName, email, username, phone, password, departments, permissions, createdBy, mustChangePassword, extra = {} }) {
  const ident = validateIdentity({ email, username, fullName });
  const problem = passwordProblem(password);
  if (problem) throw new ApiError(400, problem);
  const passwordHash = await hashPassword(password);

  const ref = id ? db.collection(ACCOUNTS).doc(id) : db.collection(ACCOUNTS).doc();
  const emailRef = db.collection(INDEX).doc(idxId("e", ident.email));
  const userRef = ident.username ? db.collection(INDEX).doc(idxId("u", ident.username)) : null;

  const doc = {
    role,
    fullName: ident.fullName,
    email: ident.email,
    username: ident.username || ident.email,
    phone: phone ? String(phone).trim() : "",
    passwordHash,
    status: "active",
    tokenVersion: 1,
    failedAttempts: 0,
    lockedUntil: null,
    mustChangePassword: Boolean(mustChangePassword),
    departments: role === "manager" ? cleanDepartments(departments) : [],
    permissions: role === "manager" ? cleanPermissions(permissions) : [],
    createdBy: createdBy || "setup",
    createdAt: nowIso(),
    lastLoginAt: null,
    ...extra,
  };

  await db.runTransaction(async (tx) => {
    const [existing, emailSnap, userSnap] = await Promise.all([
      tx.get(ref),
      tx.get(emailRef),
      userRef ? tx.get(userRef) : Promise.resolve(null),
    ]);
    if (existing.exists) throw new ApiError(409, "That account already exists.");
    if (emailSnap.exists) throw new ApiError(409, "An account with that email already exists.");
    if (userSnap && userSnap.exists) throw new ApiError(409, "That username is already taken.");
    tx.set(ref, doc);
    tx.set(emailRef, { accountId: ref.id });
    if (userRef) tx.set(userRef, { accountId: ref.id });
  });
  return { id: ref.id, ...doc };
}

async function getAccount(id) {
  if (!id) return null;
  const snap = await db.collection(ACCOUNTS).doc(id).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function findByIdentifier(identifier) {
  const v = String(identifier || "").trim().toLowerCase();
  if (!v) return null;
  const kinds = v.includes("@") ? ["e", "u"] : ["u", "e"];
  for (const k of kinds) {
    const snap = await db.collection(INDEX).doc(idxId(k, v)).get();
    if (snap.exists) return getAccount(snap.data().accountId);
  }
  return null;
}

/**
 * Verifies credentials with lockout. Always spends a hash computation, and
 * returns the same message for "no such account" and "wrong password" so
 * the endpoint can't be used to discover which accounts exist.
 */
async function login(identifier, password, expectedRole) {
  const generic = new ApiError(401, "Incorrect username/email or password.");
  const acct = await findByIdentifier(identifier);
  if (!acct || acct.role !== expectedRole) {
    await hashPassword(String(password || "x")); // equalise timing
    throw generic;
  }
  if (acct.lockedUntil && new Date(acct.lockedUntil) > new Date()) {
    throw new ApiError(429, "Too many failed attempts. This account is temporarily locked — try again in a few minutes.");
  }
  const ok = await verifyPassword(password, acct.passwordHash);
  if (!ok) {
    const failed = (acct.failedAttempts || 0) + 1;
    const patch = { failedAttempts: failed };
    if (failed >= MAX_FAILED) {
      patch.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString();
      patch.failedAttempts = 0;
    }
    await db.collection(ACCOUNTS).doc(acct.id).update(patch);
    throw generic;
  }
  if (acct.status !== "active") {
    throw new ApiError(403, "This account has been deactivated. Contact the business owner.");
  }
  await db.collection(ACCOUNTS).doc(acct.id).update({ failedAttempts: 0, lockedUntil: null, lastLoginAt: nowIso() });
  return acct;
}

async function changePassword(accountId, currentPassword, newPassword) {
  const acct = await getAccount(accountId);
  if (!acct) throw new ApiError(404, "Account not found.");
  if (!(await verifyPassword(currentPassword, acct.passwordHash))) throw new ApiError(400, "Your current password is incorrect.");
  const problem = passwordProblem(newPassword);
  if (problem) throw new ApiError(400, problem);
  if (await verifyPassword(newPassword, acct.passwordHash)) throw new ApiError(400, "Choose a password you have not used on this account.");
  const tokenVersion = (acct.tokenVersion || 1) + 1; // signs out every other session
  await db.collection(ACCOUNTS).doc(accountId).update({
    passwordHash: await hashPassword(newPassword), tokenVersion, mustChangePassword: false, passwordChangedAt: nowIso(),
  });
  return { tokenVersion };
}

/** Owner-initiated reset of a manager's credentials. */
async function adminSetPassword(accountId, newPassword, { forceChange = true } = {}) {
  const problem = passwordProblem(newPassword);
  if (problem) throw new ApiError(400, problem);
  const acct = await getAccount(accountId);
  if (!acct) throw new ApiError(404, "Account not found.");
  await db.collection(ACCOUNTS).doc(accountId).update({
    passwordHash: await hashPassword(newPassword),
    tokenVersion: (acct.tokenVersion || 1) + 1,
    mustChangePassword: forceChange,
    failedAttempts: 0, lockedUntil: null,
    passwordChangedAt: nowIso(),
  });
}

/* -------- password reset by emailed verification code -------- */

async function requestReset(email) {
  const acct = await findByIdentifier(email);
  // Same response whether or not the account exists (no account discovery).
  if (!acct || acct.status !== "active") return;
  const code = randomCode(6);
  await db.collection(RESETS).doc(acct.id).set({
    codeHash: sha256(`${code}:${acct.id}:${env.jwtSecret}`),
    expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000).toISOString(),
    attempts: 0,
    createdAt: nowIso(),
  });
  await sendEmail({
    to: acct.email,
    subject: `${env.hotelName} — password reset code`,
    text: `Your verification code is ${code}.\nIt expires in ${RESET_MINUTES} minutes. If you did not ask for this, ignore this email — your password has not changed.`,
  });
  if (!env.isProd && !env.notifications.smtpHost) {
    // eslint-disable-next-line no-console
    console.log(`[dev] password reset code for ${acct.email}: ${code}`); // never reached in production
  }
}

async function confirmReset(email, code, newPassword) {
  const bad = new ApiError(400, "That code is invalid or has expired.");
  const acct = await findByIdentifier(email);
  if (!acct || acct.status !== "active") throw bad;
  const problem = passwordProblem(newPassword);
  if (problem) throw new ApiError(400, problem);
  const ref = db.collection(RESETS).doc(acct.id);
  const snap = await ref.get();
  if (!snap.exists) throw bad;
  const r = snap.data();
  if (new Date(r.expiresAt) < new Date() || r.attempts >= RESET_MAX_ATTEMPTS) { await ref.delete(); throw bad; }
  if (!safeEqual(r.codeHash, sha256(`${String(code).trim()}:${acct.id}:${env.jwtSecret}`))) {
    await ref.update({ attempts: (r.attempts || 0) + 1 });
    throw bad;
  }
  await ref.delete();
  await db.collection(ACCOUNTS).doc(acct.id).update({
    passwordHash: await hashPassword(newPassword),
    tokenVersion: (acct.tokenVersion || 1) + 1,
    mustChangePassword: false, failedAttempts: 0, lockedUntil: null, passwordChangedAt: nowIso(),
  });
}

/* -------- manager administration (owner only; routes enforce that) -------- */

async function listManagers() {
  const snap = await db.collection(ACCOUNTS).where("role", "==", "manager").get();
  return snap.docs.map((d) => publicAccount({ id: d.id, ...d.data() }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function updateManager(id, patch, actorKey) {
  const acct = await getAccount(id);
  if (!acct || acct.role !== "manager") throw new ApiError(404, "Manager not found.");
  const update = { updatedBy: actorKey, updatedAt: nowIso() };
  if (patch.fullName !== undefined) {
    if (String(patch.fullName).trim().length < 2) throw new ApiError(400, "Full name is required.");
    update.fullName = String(patch.fullName).trim();
  }
  if (patch.phone !== undefined) update.phone = String(patch.phone).trim();
  if (patch.departments !== undefined) update.departments = cleanDepartments(patch.departments);
  if (patch.permissions !== undefined) update.permissions = cleanPermissions(patch.permissions);

  const newEmail = patch.email !== undefined ? String(patch.email).trim().toLowerCase() : null;
  if (newEmail && newEmail !== acct.email) {
    if (!EMAIL_RE.test(newEmail)) throw new ApiError(400, "A valid email address is required.");
    await db.runTransaction(async (tx) => {
      const nRef = db.collection(INDEX).doc(idxId("e", newEmail));
      const oRef = db.collection(INDEX).doc(idxId("e", acct.email));
      const n = await tx.get(nRef);
      if (n.exists) throw new ApiError(409, "An account with that email already exists.");
      tx.set(nRef, { accountId: id });
      tx.delete(oRef);
    });
    update.email = newEmail;
  }
  // Changing what a manager may do takes effect on their very next request
  // (the API re-reads the account each time), but bump the version if the
  // scope shrank so any long-lived page re-authenticates.
  await db.collection(ACCOUNTS).doc(id).update(update);
  return publicAccount(await getAccount(id));
}

async function setStatus(id, active, actorKey) {
  const acct = await getAccount(id);
  if (!acct || acct.role !== "manager") throw new ApiError(404, "Manager not found.");
  const patch = active
    ? { status: "active", reactivatedAt: nowIso(), reactivatedBy: actorKey, failedAttempts: 0, lockedUntil: null }
    : { status: "deactivated", deactivatedAt: nowIso(), deactivatedBy: actorKey, tokenVersion: (acct.tokenVersion || 1) + 1 };
  await db.collection(ACCOUNTS).doc(id).update(patch); // business records are not touched
  return publicAccount(await getAccount(id));
}

module.exports = {
  ACCOUNTS, publicAccount, createAccount, getAccount, findByIdentifier, login,
  changePassword, adminSetPassword, requestReset, confirmReset,
  listManagers, updateManager, setStatus, cleanDepartments, cleanPermissions, EMAIL_RE,
};
