const jwt = require("jsonwebtoken");
const env = require("../config/environment");
const { db } = require("../config/firebase");
const { ApiError, requireFields } = require("../utils/errors");
const { logAction } = require("../utils/audit");
const { safeEqual } = require("../utils/password");
const accounts = require("../services/accountService");
const { toIso } = require("../services/notificationHub");
const { DEPARTMENTS, MANAGER_PERMISSIONS } = require("../config/access");

const TTL = { owner: "8h", manager: "12h" };

function issueToken(acct) {
  return jwt.sign({ accountId: acct.id, tv: acct.tokenVersion || 1 }, env.jwtSecret, { algorithm: "HS256", expiresIn: TTL[acct.role] || "8h" });
}
function session(acct) {
  return {
    token: issueToken(acct), role: acct.role, name: acct.fullName, email: acct.email, accountId: acct.id,
    departments: acct.departments || [], permissions: acct.permissions || [],
    mustChangePassword: Boolean(acct.mustChangePassword),
    idleTimeoutMinutes: acct.role === "owner" ? 30 : 60,
  };
}

/* ---------------- owner bootstrap & authentication ---------------- */

async function status(req, res, next) {
  try {
    const snap = await db.collection(accounts.ACCOUNTS).doc("owner").get();
    res.json({ setupRequired: !snap.exists, setupEnabled: Boolean(env.ownerSetupToken) });
  } catch (err) { next(err); }
}

async function setup(req, res, next) {
  try {
    if (!env.ownerSetupToken) throw new ApiError(503, "Owner setup is not enabled. Set OWNER_SETUP_TOKEN in the server environment first.");
    const { setupToken, fullName, email, phone, password, confirmPassword } = req.body || {};
    requireFields(req.body || {}, ["setupToken", "fullName", "email", "password"]);
    if (!safeEqual(setupToken, env.ownerSetupToken)) throw new ApiError(403, "The setup token is not correct.");
    if (password !== confirmPassword) throw new ApiError(400, "The two passwords do not match.");
    let acct;
    try {
      acct = await accounts.createAccount({ id: "owner", role: "owner", fullName, email, username: null, phone, password, createdBy: "setup" });
    } catch (e) {
      if (e.status === 409 && /already exists/.test(e.message) && !/email/.test(e.message)) throw new ApiError(409, "The owner account has already been set up.");
      throw e;
    }
    await logAction({ user: { uid: `acct:${acct.id}`, name: acct.fullName, role: "owner", accountId: acct.id }, action: "Owner account created", entity: "staffAccounts", entityId: acct.id });
    res.status(201).json(session(acct));
  } catch (err) { next(err); }
}

function loginHandler(expectedRole) {
  return async (req, res, next) => {
    try {
      const { identifier, password } = req.body || {};
      if (!identifier || !password) throw new ApiError(400, "Enter your username or email and your password.");
      const acct = await accounts.login(identifier, password, expectedRole);
      logAction({ user: { uid: `acct:${acct.id}`, name: acct.fullName, role: acct.role, accountId: acct.id }, action: `Login (${acct.role})`, entity: "auth", entityId: acct.id }).catch(() => {});
      res.json(session(acct));
    } catch (err) { next(err); }
  };
}

/* ---------------- own account ---------------- */

async function me(req, res, next) {
  try {
    const acct = await accounts.getAccount(req.user.accountId);
    res.json({ account: accounts.publicAccount(acct), departmentLabels: DEPARTMENTS });
  } catch (err) { next(err); }
}

async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body || {};
    requireFields(req.body || {}, ["currentPassword", "newPassword"]);
    if (newPassword !== confirmPassword) throw new ApiError(400, "The two new passwords do not match.");
    await accounts.changePassword(req.user.accountId, currentPassword, newPassword);
    await logAction({ user: req.user, action: "Password changed", entity: "staffAccounts", entityId: req.user.accountId });
    // Old tokens are now invalid; hand back a fresh one so this session continues.
    res.json(session(await accounts.getAccount(req.user.accountId)));
  } catch (err) { next(err); }
}

async function forgotPassword(req, res, next) {
  try {
    await accounts.requestReset((req.body || {}).email);
    res.json({ ok: true, message: "If an account exists for that email, a verification code has been sent." });
  } catch (err) { next(err); }
}

async function resetPassword(req, res, next) {
  try {
    const { email, code, newPassword, confirmPassword } = req.body || {};
    requireFields(req.body || {}, ["email", "code", "newPassword"]);
    if (newPassword !== confirmPassword) throw new ApiError(400, "The two passwords do not match.");
    await accounts.confirmReset(email, code, newPassword);
    res.json({ ok: true, message: "Your password has been reset. You can sign in now." });
  } catch (err) { next(err); }
}

/* ---------------- manager administration (owner only) ---------------- */

const audit = (req, action, id, value) =>
  logAction({ user: req.user, action, entity: "staffAccounts", entityId: id, newValue: value ?? null });

async function listManagers(req, res, next) {
  try { res.json({ items: await accounts.listManagers(), departments: DEPARTMENTS, permissions: MANAGER_PERMISSIONS }); }
  catch (err) { next(err); }
}

async function getManager(req, res, next) {
  try {
    const a = await accounts.getAccount(req.params.id);
    if (!a || a.role !== "manager") throw new ApiError(404, "Manager not found.");
    res.json({ item: accounts.publicAccount(a) });
  } catch (err) { next(err); }
}

async function createManager(req, res, next) {
  try {
    const b = req.body || {};
    requireFields(b, ["fullName", "email", "password"]);
    if (!Array.isArray(b.departments) || !b.departments.length) throw new ApiError(400, "Assign the manager to at least one department.");
    const profile = accounts.cleanProfile(b);
    const acct = await accounts.createAccount({
      role: "manager", fullName: b.fullName, email: b.email, username: b.username, phone: profile.phone, profile, password: b.password,
      departments: b.departments, permissions: b.permissions || ["view", "create", "edit"],
      createdBy: req.user.key, mustChangePassword: b.mustChangePassword !== false, // first sign-in forces a personal password
      extra: b.replaces ? { replaces: b.replaces } : {},
    });
    await audit(req, "Manager account created", acct.id, { departments: acct.departments, permissions: acct.permissions });
    res.status(201).json({ item: accounts.publicAccount(acct) });
  } catch (err) { next(err); }
}

async function updateManager(req, res, next) {
  try {
    const b = req.body || {};
    if (b.role !== undefined && b.role !== "manager") throw new ApiError(403, "Roles cannot be changed here.");
    const item = await accounts.updateManager(req.params.id, b, req.user.key);
    await audit(req, "Manager account edited", req.params.id, { departments: item.departments, permissions: item.permissions });
    res.json({ item });
  } catch (err) { next(err); }
}

async function setManagerStatus(req, res, next) {
  try {
    const active = (req.body || {}).active === true;
    const item = await accounts.setStatus(req.params.id, active, req.user.key);
    await audit(req, active ? "Manager access restored" : "Manager access revoked", req.params.id);
    res.json({ item });
  } catch (err) { next(err); }
}

async function resetManagerPassword(req, res, next) {
  try {
    requireFields(req.body || {}, ["newPassword"]);
    const target = await accounts.getAccount(req.params.id);
    if (!target || target.role !== "manager") throw new ApiError(404, "Manager not found.");
    await accounts.adminSetPassword(req.params.id, req.body.newPassword, { forceChange: true });
    await audit(req, "Manager password reset by owner", req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
}

/** Hands a department over: new manager inherits departments/permissions,
 *  the old account is deactivated, and neither touches any business record. */
async function replaceManager(req, res, next) {
  try {
    const old = await accounts.getAccount(req.params.id);
    if (!old || old.role !== "manager") throw new ApiError(404, "Manager not found.");
    const b = req.body || {};
    requireFields(b, ["fullName", "email", "password"]);
    const profile = accounts.cleanProfile(b);
    const fresh = await accounts.createAccount({
      role: "manager", fullName: b.fullName, email: b.email, username: b.username, phone: profile.phone, profile, password: b.password,
      departments: b.departments || old.departments, permissions: b.permissions || old.permissions,
      createdBy: req.user.key, mustChangePassword: true, extra: { replaces: old.id },
    });
    await accounts.setStatus(old.id, false, req.user.key);
    await db.collection(accounts.ACCOUNTS).doc(old.id).update({ replacedBy: fresh.id });
    await audit(req, "Manager replaced", old.id, { replacedBy: fresh.id });
    res.status(201).json({ previous: accounts.publicAccount(await accounts.getAccount(old.id)), item: accounts.publicAccount(fresh) });
  } catch (err) { next(err); }
}

async function managerActivity(req, res, next) {
  try {
    const snap = await db.collection("auditLogs").where("userId", "==", `acct:${req.params.id}`).limit(500).get();
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data(), createdAt: toIso(d.data().createdAt) }))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 200);
    res.json({ items });
  } catch (err) { next(err); }
}

/* ---------------- owner overview ---------------- */

async function count(name, field, op, val) {
  let q = db.collection(name);
  if (field) q = q.where(field, op, val);
  const snap = await q.count().get();
  return snap.data().count;
}

async function total(name, field, where, since) {
  let q = db.collection(name);
  if (where) q = q.where(where[0], where[1], where[2]);
  const snap = await q.limit(5000).get();
  let all = 0, month = 0;
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  snap.docs.forEach((d) => {
    const x = d.data(); const v = Number(x[field] || 0);
    all += v;
    const t = x.createdAt && (x.createdAt.toDate ? x.createdAt.toDate() : new Date(x.createdAt));
    if (t && t >= monthStart) month += v;
  });
  return { all, month };
}

async function overview(req, res, next) {
  try {
    const [
      reservations, guests, employees, managersActive, managersTotal, orders, barSales, payments, pendingPayments,
      expenses, inventoryItems, applications, openMaintenance, housekeepingOpen, conversations, notifications,
    ] = await Promise.all([
      count("reservations"), count("guests"), count("employees"),
      count("staffAccounts", "role", "==", "manager").then(async (t) => ({ t, a: (await accounts.listManagers()).filter((m) => m.status === "active").length })),
      Promise.resolve(0), count("orders"), count("barSales"), count("payments"), count("payments", "status", "==", "pending"),
      count("expenses"), count("inventoryItems"), count("employeeApplications"),
      count("maintenanceRequests", "status", "==", "open").catch(() => 0), count("housekeepingTasks", "status", "==", "pending").catch(() => 0),
      count("conversations"), count("notifications"),
    ]);
    const [paid, sales, barRev, spent] = await Promise.all([
      total("payments", "amount", ["status", "==", "confirmed"]), total("sales", "total"), total("barSales", "total"), total("expenses", "amount"),
    ]);
    const recent = await db.collection("auditLogs").orderBy("createdAt", "desc").limit(15).get();
    res.json({
      generatedAt: new Date().toISOString(), currency: env.currency,
      counts: { reservations, guests, employees, managersActive: managersActive.a, managersTotal: managersActive.t, orders, barSales, payments, pendingPayments, expenses, inventoryItems, applications, openMaintenance, housekeepingOpen, conversations, notifications },
      money: { confirmedPayments: paid, sales, barSales: barRev, expenses: spent },
      recentActivity: recent.docs.map((d) => { const x = d.data(); return { id: d.id, userName: x.userName, userRole: x.userRole || null, action: x.action, entity: x.entity, entityId: x.entityId, createdAt: toIso(x.createdAt) }; }),
    });
  } catch (err) { next(err); }
}

module.exports = {
  status, setup, ownerLogin: loginHandler("owner"), managerLogin: loginHandler("manager"),
  me, changePassword, forgotPassword, resetPassword,
  listManagers, getManager, createManager, updateManager, setManagerStatus, resetManagerPassword, replaceManager, managerActivity,
  overview,
};