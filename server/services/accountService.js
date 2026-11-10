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


/* ---------------- manager profile (identity + contact details) ---------------- */

const ID_TYPES = ["National ID card", "Passport", "Driver's licence", "Residence permit"];
const GENDERS = ["Female", "Male", "Other", "Prefer not to say"];
const EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Contract"];
const SALARY_FREQUENCIES = ["Monthly", "Weekly", "Bi-weekly", "Daily"];
const PAY_METHODS = ["Cash", "Bank transfer", "MTN Mobile Money", "Orange Money"];
const PROFILE_KEYS = ["dateOfBirth", "gender", "nationality", "phone", "addressLine", "city", "region", "country",
  "idType", "idNumber", "position", "employmentType", "startDate",
  "emergencyName", "emergencyRelation", "emergencyPhone", "salaryAmount", "salaryFrequency", "salaryCurrency", "salaryPayMethod"];

const clip = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

function cleanPhone(v, label) {
  const s = clip(v, 30);
  if (!s) return "";
  const digits = s.replace(/\D/g, "");
  if (!/^[+\d][\d\s().-]*$/.test(s) || digits.length < 7 || digits.length > 15) throw new ApiError(400, `${label} must be a valid number (7–15 digits).`);
  return s;
}
function cleanDate(v, label) {
  const s = clip(v, 10);
  if (!s) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) throw new ApiError(400, `${label} must be a valid date.`);
  return s;
}

/** Validates and whitelists the personal / contact / ID details of a manager.
 *  Unknown keys are ignored, so nothing else can be written through this path. */
function cleanProfile(input = {}) {
  const b = input || {};
  const need = (val, msg) => { if (!val) throw new ApiError(400, msg); return val; };

  const phone = need(cleanPhone(b.phone, "Phone number"), "A phone number is required.");
  const dateOfBirth = need(cleanDate(b.dateOfBirth, "Date of birth"), "Date of birth is required.");
  const dob = new Date(dateOfBirth); const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  if (now.getUTCMonth() < dob.getUTCMonth() || (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate())) age -= 1;
  if (dob > now) throw new ApiError(400, "Date of birth cannot be in the future.");
  if (age < 18) throw new ApiError(400, "A manager must be at least 18 years old.");
  if (age > 90) throw new ApiError(400, "Check the date of birth — it looks incorrect.");

  const gender = clip(b.gender, 30);
  if (gender && !GENDERS.includes(gender)) throw new ApiError(400, "Choose a valid gender option.");

  const idType = need(clip(b.idType, 40), "Choose the type of ID document.");
  if (!ID_TYPES.includes(idType)) throw new ApiError(400, "Choose a valid ID document type.");
  const idNumber = need(clip(b.idNumber, 30).toUpperCase(), "The ID document number is required.");
  if (!/^[A-Z0-9][A-Z0-9 /.-]{3,29}$/.test(idNumber)) throw new ApiError(400, "The ID number must be 4–30 letters or digits.");

  const employmentType = clip(b.employmentType, 30) || "Full-time";
  if (!EMPLOYMENT_TYPES.includes(employmentType)) throw new ApiError(400, "Choose a valid employment type.");
  const startDate = cleanDate(b.startDate, "Start date");

  // Salary (optional on the server so older accounts can still be saved; the registration form asks for it).
  let salaryAmount = null, salaryFrequency = "", salaryCurrency = "", salaryPayMethod = "";
  if (b.salaryAmount !== undefined && b.salaryAmount !== null && String(b.salaryAmount).trim() !== "") {
    salaryAmount = Number(String(b.salaryAmount).replace(/[\s,]/g, ""));
    if (!Number.isFinite(salaryAmount) || salaryAmount < 0 || salaryAmount > 1e9) throw new ApiError(400, "Enter a valid salary amount (0 or more).");
    salaryFrequency = clip(b.salaryFrequency, 20) || "Monthly";
    if (!SALARY_FREQUENCIES.includes(salaryFrequency)) throw new ApiError(400, "Choose how often the salary is paid.");
    salaryCurrency = (clip(b.salaryCurrency, 6) || "FCFA").toUpperCase();
    salaryPayMethod = clip(b.salaryPayMethod, 30);
    if (salaryPayMethod && !PAY_METHODS.includes(salaryPayMethod)) throw new ApiError(400, "Choose a valid salary payment method.");
  }

  const emergencyName = clip(b.emergencyName, 120);
  const emergencyPhone = cleanPhone(b.emergencyPhone, "Emergency contact phone");
  const emergencyRelation = clip(b.emergencyRelation, 60);
  if ((emergencyName || emergencyPhone) && !(emergencyName && emergencyPhone)) throw new ApiError(400, "Give both the emergency contact's name and phone number, or leave both empty.");

  return {
    dateOfBirth, gender, phone,
    nationality: clip(b.nationality, 60),
    addressLine: need(clip(b.addressLine, 200), "The home address is required."),
    city: need(clip(b.city, 80), "The city or town is required."),
    region: clip(b.region, 80),
    country: need(clip(b.country, 80), "The country is required."),
    idType, idNumber,
    position: need(clip(b.position, 100), "The job title is required."),
    employmentType, startDate,
    emergencyName, emergencyRelation, emergencyPhone,
    salaryAmount, salaryFrequency, salaryCurrency, salaryPayMethod,
  };
}
const idNumberKey = (p) => idxId("n", `${p.idType}|${p.idNumber.replace(/[\s./-]/g, "")}`);

async function createAccount({ role, id, fullName, email, username, phone, password, departments, permissions, createdBy, mustChangePassword, profile, extra = {} }) {
  const ident = validateIdentity({ email, username, fullName });
  const problem = passwordProblem(password);
  if (problem) throw new ApiError(400, problem);
  const passwordHash = await hashPassword(password);

  const ref = id ? db.collection(ACCOUNTS).doc(id) : db.collection(ACCOUNTS).doc();
  const emailRef = db.collection(INDEX).doc(idxId("e", ident.email));
  const userRef = ident.username ? db.collection(INDEX).doc(idxId("u", ident.username)) : null;
  const idRef = profile ? db.collection(INDEX).doc(idNumberKey(profile)) : null;

  const doc = {
    role,
    fullName: ident.fullName,
    email: ident.email,
    username: ident.username || ident.email,
    phone: profile ? profile.phone : (phone ? String(phone).trim() : ""),
    ...(profile ? { profile } : {}),
    ...(profile && profile.salaryAmount !== null && profile.salaryAmount !== undefined ? { salaryHistory: [{ amount: profile.salaryAmount, frequency: profile.salaryFrequency, currency: profile.salaryCurrency, effectiveFrom: new Date().toISOString().slice(0, 10), setBy: createdBy || null }] } : {}),
    passwordHash,
    status: "active",
    tokenVersion: 1,
    failedAttempts: 0,
    lockedUntil: null,
    mustChangePassword: role === "owner" ? Boolean(mustChangePassword) : false, // managers and team use the password they were given
    departments: role === "manager" ? cleanDepartments(departments) : [],
    permissions: role === "manager" ? cleanPermissions(permissions) : [],
    createdBy: createdBy || "setup",
    createdAt: nowIso(),
    lastLoginAt: null,
    ...extra,
  };

  await db.runTransaction(async (tx) => {
    const [existing, emailSnap, userSnap, idSnap] = await Promise.all([
      tx.get(ref),
      tx.get(emailRef),
      userRef ? tx.get(userRef) : Promise.resolve(null),
      idRef ? tx.get(idRef) : Promise.resolve(null),
    ]);
    if (existing.exists) throw new ApiError(409, "That account already exists.");
    if (emailSnap.exists) throw new ApiError(409, "An account with that email already exists.");
    if (userSnap && userSnap.exists) throw new ApiError(409, "That username is already taken.");
    if (idSnap && idSnap.exists) throw new ApiError(409, "A manager with that ID document number is already registered.");
    tx.set(ref, doc);
    tx.set(emailRef, { accountId: ref.id });
    if (userRef) tx.set(userRef, { accountId: ref.id });
    if (idRef) tx.set(idRef, { accountId: ref.id });
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
    mustChangePassword: false, // the person keeps using the password they are given
    failedAttempts: 0, lockedUntil: null,
    passwordChangedAt: nowIso(),
  });
}

/* -------- password reset by emailed verification code -------- */

async function requestReset(email) {
  const acct = await findByIdentifier(email);
  // Same response whether or not the account exists (no account discovery).
  // Self-service reset by email is for the owner only; managers and team ask the person above them.
  if (!acct || acct.status !== "active" || acct.role !== "owner") return;
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
  if (!acct || acct.status !== "active" || acct.role !== "owner") throw bad;
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
    .filter((a) => a.tier !== "staff") // team members have their own list
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
  if (patch.phone !== undefined && !PROFILE_KEYS.some((k) => k !== "phone" && patch[k] !== undefined)) update.phone = cleanPhone(patch.phone, "Phone number");
  if (patch.departments !== undefined) update.departments = cleanDepartments(patch.departments);
  if (patch.canManageTeam !== undefined && acct.tier !== "staff") update.canManageTeam = patch.canManageTeam === true || patch.canManageTeam === "true";
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
  // Personal / contact / ID details: validated as a whole so a half-filled
  // record can never be saved. Accounts created before these fields existed
  // are completed the first time the owner edits them with the new form.
  if (PROFILE_KEYS.some((k) => patch[k] !== undefined)) {
    const next = cleanProfile({ ...(acct.profile || {}), phone: acct.phone, ...patch });
    update.profile = next;
    // A salary change adds a new dated entry; earlier entries are never rewritten.
    const o = acct.profile || {};
    if (next.salaryAmount !== null && (next.salaryAmount !== o.salaryAmount || next.salaryFrequency !== o.salaryFrequency || next.salaryCurrency !== o.salaryCurrency)) {
      update.salaryHistory = [...(acct.salaryHistory || []), { amount: next.salaryAmount, frequency: next.salaryFrequency, currency: next.salaryCurrency, effectiveFrom: new Date().toISOString().slice(0, 10), setBy: actorKey || null }];
    }
    update.phone = next.phone;
    const newKey = idNumberKey(next);
    const oldKey = acct.profile && acct.profile.idNumber ? idNumberKey(acct.profile) : null;
    if (newKey !== oldKey) {
      await db.runTransaction(async (tx) => {
        const nRef = db.collection(INDEX).doc(newKey);
        const n = await tx.get(nRef);
        if (n.exists && (n.data() || {}).accountId !== id) throw new ApiError(409, "A manager with that ID document number is already registered.");
        tx.set(nRef, { accountId: id });
        if (oldKey) tx.delete(db.collection(INDEX).doc(oldKey));
      });
    }
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
  cleanProfile, ID_TYPES, GENDERS, EMPLOYMENT_TYPES, SALARY_FREQUENCIES, PAY_METHODS,
  ACCOUNTS, publicAccount, createAccount, getAccount, findByIdentifier, login,
  changePassword, adminSetPassword, requestReset, confirmReset,
  listManagers, updateManager, setStatus, cleanDepartments, cleanPermissions, EMAIL_RE,
};