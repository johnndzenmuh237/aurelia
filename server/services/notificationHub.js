const { db, FieldValue } = require("../config/firebase");
const { ApiError } = require("../utils/errors");
const { DEPARTMENTS } = require("../config/access");

/**
 * Targeted in-app notifications.
 *
 * Each notification carries `audienceKeys`, the identities allowed to see
 * it:   acct:<id>   one individual account
 *       role:<r>    everyone signed in with that shared role
 *       dept:<d>    individual managers responsible for department d
 * The business owner (and super_admin / the legacy shared manager) sees all
 * non-private notifications; `private` ones (messages) are only visible to
 * their addressees — plus the owner, who has full oversight.
 */
const COLLECTION = "notifications";

function toIso(v) {
  if (!v) return null;
  if (typeof v.toDate === "function") return v.toDate().toISOString();
  if (v._seconds !== undefined) return new Date(v._seconds * 1000).toISOString();
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function viewKeys(user) {
  if (user.accountId) {
    const keys = [`acct:${user.accountId}`];
    if (user.role === "manager") (user.departments || []).forEach((d) => keys.push(`dept:${d}`));
    return keys.slice(0, 10);
  }
  return [`role:${user.role}`];
}

const sees_all = (user) => user.role === "owner" || user.role === "super_admin" || (user.role === "manager" && !user.accountId);

function visibleTo(user, doc) {
  const keys = viewKeys(user);
  const aud = doc.audienceKeys || [];
  if (doc.private) return user.role === "owner" || aud.some((k) => keys.includes(k));
  if (sees_all(user)) return true;
  return aud.some((k) => keys.includes(k));
}

function readKey(user) { return user.key || `role:${user.role}`; }

function departmentAudience(dept) {
  const d = DEPARTMENTS[dept] ? dept : null;
  return d ? [`dept:${d}`, `role:${d}`, "role:manager"] : ["role:manager"];
}

/** Creates a notification. Never throws — a failed notification must not
 *  fail the business action that triggered it. */
async function notify({ title, message, type = "activity", dept, audienceKeys, actor, link, entity, entityId, isPrivate = false }) {
  try {
    const keys = audienceKeys && audienceKeys.length ? audienceKeys : departmentAudience(dept);
    const actorKey = actor?.key || null;
    const ref = await db.collection(COLLECTION).add({
      type, title: title || "", message: message || title || "",
      department: dept || null,
      audienceKeys: [...new Set(keys)],
      private: Boolean(isPrivate),
      senderKey: actorKey,
      senderName: actor?.name || "System",
      senderRole: actor?.role || null,
      link: link || null, entity: entity || null, entityId: entityId || null,
      readBy: actorKey ? [actorKey] : [],   // you don't get "unread" for your own action
      archivedBy: [],
      read: false,                           // kept for the legacy admin list page
      createdAt: FieldValue.serverTimestamp(),
    });
    // Phone alert for everyone who may see it — fire and forget.
    require("./pushService").pushNotification(ref.id, {
      title: title || "", message: message || title || "", private: Boolean(isPrivate), senderKey: actorKey, senderName: actor?.name || "System",
      link: link || null, audienceKeys: [...new Set(keys)],
    }).catch(() => {});
    return ref.id;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[notificationHub] notify failed:", err.message);
    return null;
  }
}

function shape(user, id, d) {
  const key = readKey(user);
  return {
    id,
    type: d.type || "info",
    title: d.title || (d.message ? String(d.message).slice(0, 60) : "Notification"),
    message: d.message || "",
    department: d.department ? (DEPARTMENTS[d.department] || d.department) : null,
    senderName: d.senderName || "System",
    senderRole: d.senderRole || null,
    link: d.link || null,
    entity: d.entity || null,
    entityId: d.entityId || null,
    createdAt: toIso(d.createdAt),
    read: (d.readBy || []).includes(key) || d.read === true && !d.audienceKeys,
    archived: (d.archivedBy || []).includes(key),
  };
}

async function fetchVisible(user, max = 300) {
  let docs = [];
  if (sees_all(user)) {
    const snap = await db.collection(COLLECTION).orderBy("createdAt", "desc").limit(max).get();
    docs = snap.docs;
  } else {
    const keys = viewKeys(user);
    const snap = await db.collection(COLLECTION).where("audienceKeys", "array-contains-any", keys).limit(max).get();
    docs = snap.docs;
  }
  return docs.filter((d) => visibleTo(user, d.data()));
}

async function listFor(user, { limit = 50, unreadOnly = false, includeArchived = false } = {}) {
  const docs = await fetchVisible(user);
  let items = docs.map((d) => shape(user, d.id, d.data()));
  const unreadCount = items.filter((n) => !n.read && !n.archived).length;
  if (!includeArchived) items = items.filter((n) => !n.archived);
  if (unreadOnly) items = items.filter((n) => !n.read);
  items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return { items: items.slice(0, Math.min(Number(limit) || 50, 200)), unreadCount };
}

async function mark(user, ids, field) {
  const key = readKey(user);
  const list = Array.isArray(ids) ? ids.slice(0, 200) : [];
  let n = 0;
  for (const id of list) {
    const ref = db.collection(COLLECTION).doc(String(id));
    const snap = await ref.get();
    if (!snap.exists || !visibleTo(user, snap.data())) continue; // can't touch what you can't see
    await ref.update({ [field]: FieldValue.arrayUnion(key) });
    n++;
  }
  return n;
}

async function markAllRead(user) {
  const docs = await fetchVisible(user);
  const key = readKey(user);
  const unread = docs.filter((d) => !(d.data().readBy || []).includes(key));
  for (const d of unread) await d.ref.update({ readBy: FieldValue.arrayUnion(key) });
  return unread.length;
}

module.exports = { notify, listFor, mark, markAllRead, departmentAudience, viewKeys, readKey, visibleTo, toIso, sees_all, shape };