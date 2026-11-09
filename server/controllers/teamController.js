/**
 * Team accounts: personal logins that an owner or a manager creates for the
 * people who work for them (receptionist, cashier, housekeeping ...).
 *
 * They are ordinary accounts in the same central staffAccounts collection and
 * sign in through the same endpoint as managers, so there is no second
 * authentication system. What makes them different is `tier: "staff"`:
 *   • they can never create accounts themselves;
 *   • they can never be given delete or approve rights;
 *   • a manager can only give them departments and rights she holds herself;
 *   • a manager only ever sees and edits her own team (the owner sees all).
 */
const { db } = require("../config/firebase");
const { ApiError, requireFields } = require("../utils/errors");
const { logAction } = require("../utils/audit");
const accounts = require("../services/accountService");
const { DEPARTMENTS, STAFF_JOB_ROLES, STAFF_PERMISSIONS } = require("../config/access");

const isOwner = (u) => u.role === "owner";
const audit = (req, action, entityId, details) =>
  logAction({ user: req.user, action, entity: "staffAccounts", entityId, details });

function scopeOf(user) {
  if (isOwner(user)) return { departments: Object.keys(DEPARTMENTS), permissions: STAFF_PERMISSIONS };
  return { departments: user.departments || [], permissions: (user.permissions || []).filter((p) => STAFF_PERMISSIONS.includes(p)) };
}

/** Validates what is being handed to a team member against what the giver holds. */
function checkGrant(user, { departments, permissions }) {
  const scope = scopeOf(user);
  const out = {};
  if (departments !== undefined) {
    const deps = accounts.cleanDepartments(departments);
    const over = deps.filter((d) => !scope.departments.includes(d));
    if (over.length) throw new ApiError(403, `You can only give departments you manage yourself (not: ${over.map((d) => DEPARTMENTS[d]).join(", ")}).`);
    out.departments = deps;
  }
  if (permissions !== undefined) {
    const perms = accounts.cleanPermissions(permissions);
    if (perms.some((p) => !STAFF_PERMISSIONS.includes(p))) throw new ApiError(400, "Team members can view, create and edit only — they cannot delete or approve.");
    const over = perms.filter((p) => !scope.permissions.includes(p) && p !== "view");
    if (over.length) throw new ApiError(403, `You can only give rights you hold yourself (not: ${over.join(", ")}).`);
    out.permissions = perms;
  }
  return out;
}

function checkJobRole(v) {
  const role = String(v || "").trim();
  if (!role) throw new ApiError(400, "Choose the team member's job role.");
  if (!Object.prototype.hasOwnProperty.call(STAFF_JOB_ROLES, role)) throw new ApiError(400, "Choose a valid job role.");
  return role;
}

async function owned(req) {
  const acct = await accounts.getAccount(req.params.id);
  if (!acct || acct.role !== "manager" || acct.tier !== "staff") throw new ApiError(404, "Team member not found.");
  if (!isOwner(req.user) && acct.createdByAccount !== req.user.accountId) throw new ApiError(404, "Team member not found.");
  return acct;
}

async function options(req, res, next) {
  try {
    const scope = scopeOf(req.user);
    res.json({
      jobRoles: STAFF_JOB_ROLES,
      departments: Object.fromEntries(scope.departments.map((d) => [d, DEPARTMENTS[d]])),
      permissions: scope.permissions,
    });
  } catch (err) { next(err); }
}

async function list(req, res, next) {
  try {
    const snap = await db.collection(accounts.ACCOUNTS).where("role", "==", "manager").get();
    const items = snap.docs.map((d) => accounts.publicAccount({ id: d.id, ...d.data() }))
      .filter((a) => a.tier === "staff" && (isOwner(req.user) || a.createdByAccount === req.user.accountId))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    res.json({ items });
  } catch (err) { next(err); }
}

async function get(req, res, next) {
  try { res.json({ item: accounts.publicAccount(await owned(req)) }); } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const b = req.body || {};
    requireFields(b, ["fullName", "email", "password"]);
    const staffRole = checkJobRole(b.staffRole);
    const grant = checkGrant(req.user, { departments: b.departments || [], permissions: b.permissions || ["view"] });
    const profile = accounts.cleanProfile(b);
    const acct = await accounts.createAccount({
      role: "manager", fullName: b.fullName, email: b.email, username: b.username, phone: profile.phone, profile, password: b.password,
      departments: grant.departments, permissions: grant.permissions,
      createdBy: req.user.key, mustChangePassword: true,
      extra: { tier: "staff", staffRole, canManageTeam: false, createdByAccount: req.user.accountId || "owner", createdByName: req.user.name },
    });
    await audit(req, `Team account created (${staffRole})`, acct.id, { departments: acct.departments, permissions: acct.permissions });
    res.status(201).json({ item: accounts.publicAccount(acct) });
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const acct = await owned(req);
    const b = req.body || {};
    const patch = { ...b };
    delete patch.tier; delete patch.canManageTeam; delete patch.createdByAccount; delete patch.role; delete patch.status; delete patch.password;
    Object.assign(patch, checkGrant(req.user, { departments: b.departments, permissions: b.permissions }));
    let staffRole;
    if (b.staffRole !== undefined) staffRole = checkJobRole(b.staffRole);
    const item = await accounts.updateManager(acct.id, patch, req.user.key);
    if (staffRole) { await db.collection(accounts.ACCOUNTS).doc(acct.id).update({ staffRole }); item.staffRole = staffRole; }
    await audit(req, "Team account updated", acct.id);
    res.json({ item });
  } catch (err) { next(err); }
}

async function setStatus(req, res, next) {
  try {
    const acct = await owned(req);
    const item = await accounts.setStatus(acct.id, Boolean((req.body || {}).active), req.user.key);
    await audit(req, item.status === "active" ? "Team account reactivated" : "Team account deactivated", acct.id);
    res.json({ item });
  } catch (err) { next(err); }
}

async function resetPassword(req, res, next) {
  try {
    requireFields(req.body || {}, ["newPassword"]);
    const acct = await owned(req);
    await accounts.adminSetPassword(acct.id, req.body.newPassword, { forceChange: true });
    await audit(req, "Team member password reset", acct.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
}

module.exports = { options, list, get, create, update, setStatus, resetPassword };