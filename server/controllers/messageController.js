const { db, FieldValue } = require("../config/firebase");
const { ApiError } = require("../utils/errors");
const { DEPARTMENTS } = require("../config/access");
const { listManagers, getAccount } = require("../services/accountService");
const { notify, toIso } = require("../services/notificationHub");

/**
 * Internal messaging.
 *
 * A participant is an identity key:  acct:<id>  (owner / individual manager)
 * or role:<r>  (a department "mailbox" shared by everyone who signs in
 * with that role — the existing login model has no per-person accounts for
 * departments, so department-to-manager chat works at team level).
 * Read state is tracked per participant key in `reads`.
 */
const CONVOS = "conversations";
const MSGS = "messages";
const OWNER_KEY = "acct:owner";
const roleLabel = (r) => (r === "employee" ? "Employees" : r === "manager" ? "Managers (shared login)" : `${DEPARTMENTS[r] || r} team`);
const safe = (key) => key.replace(/[^a-zA-Z0-9]/g, "_");
const myKey = (u) => u.key || `role:${u.role}`;
const isManagerLike = (u) => u.role === "manager" || u.role === "super_admin";

/** The people/teams this user is allowed to start a conversation with. */
async function allowedRecipients(user) {
  const managers = (await listManagers()).filter((m) => m.status === "active");
  const mgrEntries = managers.filter((m) => `acct:${m.id}` !== myKey(user)).map((m) => ({
    key: `acct:${m.id}`, label: m.fullName, kind: "manager", departments: m.departments.map((d) => DEPARTMENTS[d]),
  }));
  const mailboxes = [...Object.keys(DEPARTMENTS), "employee"].map((r) => ({ key: `role:${r}`, label: roleLabel(r), kind: "department" }));
  const owner = { key: OWNER_KEY, label: "Business Owner", kind: "owner" };

  if (user.role === "owner") return [...mgrEntries, ...mailboxes];
  if (isManagerLike(user)) return [owner, ...mgrEntries, ...mailboxes];
  // department staff / employees: only their managers
  const mine = mgrEntries.filter((m) => {
    const acct = managers.find((x) => `acct:${x.id}` === m.key);
    return acct.departments.includes(user.role);
  });
  const targets = mine.length ? mine : mgrEntries;
  return [...targets, { key: "role:manager", label: roleLabel("manager"), kind: "department" }];
}

function shapeConvo(c, id, me) {
  const reads = c.reads || {};
  const lastRead = reads[safe(me)] || "";
  return {
    id, kind: c.kind, subject: c.subject || "(no subject)",
    participants: c.participants.map((k) => ({ key: k, label: (c.labels || {})[safe(k)] || k })),
    lastMessage: c.lastMessage || "", lastSenderName: c.lastSenderName || "", lastAt: toIso(c.lastAt) || c.lastAtIso || null,
    unread: Boolean(c.lastSenderKey !== me && (c.lastAtIso || "") > lastRead && c.participants.includes(me)),
    replyAllowed: c.replyAllowed !== false,
    isParticipant: c.participants.includes(me),
  };
}

async function conversations(req, res, next) {
  try {
    const me = myKey(req.user);
    let docs;
    if (req.user.role === "owner" && req.query.scope === "all") {
      docs = (await db.collection(CONVOS).orderBy("lastAt", "desc").limit(200).get()).docs;
    } else {
      docs = (await db.collection(CONVOS).where("participants", "array-contains", me).limit(200).get()).docs;
    }
    const items = docs.map((d) => shapeConvo(d.data(), d.id, me)).sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)));
    res.json({ items, unreadCount: items.filter((i) => i.unread).length });
  } catch (err) { next(err); }
}

async function openConversation(req, res, next) {
  try {
    const me = myKey(req.user);
    const ref = db.collection(CONVOS).doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) throw new ApiError(404, "Conversation not found.");
    const c = snap.data();
    const member = c.participants.includes(me);
    if (!member && req.user.role !== "owner") throw new ApiError(403, "You are not part of this conversation.");

    const ms = await db.collection(MSGS).where("conversationId", "==", req.params.id).get();
    const messages = ms.docs.map((d) => ({ id: d.id, ...d.data(), createdAt: toIso(d.data().createdAt) }))
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
      .map((m) => ({ id: m.id, senderKey: m.senderKey, senderName: m.senderName, senderRole: m.senderRole, body: m.body, createdAt: m.createdAt, mine: m.senderKey === me }));

    if (member) await ref.update({ [`reads.${safe(me)}`]: new Date().toISOString() });
    res.json({ conversation: shapeConvo({ ...c, reads: { ...(c.reads || {}), [safe(me)]: new Date().toISOString() } }, snap.id, me), messages });
  } catch (err) { next(err); }
}

function cleanBody(body) {
  const text = String(body || "").trim();
  if (!text) throw new ApiError(400, "Write a message first.");
  if (text.length > 4000) throw new ApiError(400, "Messages are limited to 4,000 characters.");
  return text;
}

async function deliver({ user, convoRef, convo, text, recipients, subject }) {
  const me = myKey(user);
  const nowIso = new Date().toISOString();
  const msgRef = await db.collection(MSGS).add({
    conversationId: convoRef.id, senderKey: me, senderName: user.name, senderRole: user.role,
    body: text, createdAt: FieldValue.serverTimestamp(), createdAtIso: nowIso,
  });
  await convoRef.update({
    lastMessage: text.slice(0, 140), lastSenderKey: me, lastSenderName: user.name,
    lastAt: FieldValue.serverTimestamp(), lastAtIso: nowIso,
    [`reads.${safe(me)}`]: nowIso,
  });
  await notify({
    type: "message", title: `New message from ${user.name}`,
    message: `${subject ? `${subject}: ` : ""}${text.slice(0, 100)}`,
    audienceKeys: recipients, actor: user, isPrivate: true, link: `/portal/messages.html?c=${convoRef.id}`,
  });
  return msgRef.id;
}

async function send(req, res, next) {
  try {
    const user = req.user;
    const me = myKey(user);
    const text = cleanBody(req.body.body);
    const subject = String(req.body.subject || "").trim().slice(0, 120);

    // ---- reply inside an existing conversation ----
    if (req.body.conversationId) {
      const ref = db.collection(CONVOS).doc(String(req.body.conversationId));
      const snap = await ref.get();
      if (!snap.exists) throw new ApiError(404, "Conversation not found.");
      const c = snap.data();
      if (!c.participants.includes(me)) throw new ApiError(403, "You are not part of this conversation.");
      if (c.replyAllowed === false) throw new ApiError(403, "This is a one-way announcement. Start a direct conversation to reply.");
      const recipients = c.participants.filter((k) => k !== me);
      const id = await deliver({ user, convoRef: ref, convo: c, text, recipients, subject: c.subject });
      return res.status(201).json({ id, conversationId: ref.id });
    }

    // ---- new direct conversation ----
    const to = [...new Set(Array.isArray(req.body.to) ? req.body.to : [req.body.to])].filter(Boolean);
    if (!to.length) throw new ApiError(400, "Choose who to send this to.");
    if (to.length > 20) throw new ApiError(400, "Too many recipients.");
    const allowed = await allowedRecipients(user);
    const labels = {};
    for (const k of to) {
      const r = allowed.find((a) => a.key === k);
      if (!r) throw new ApiError(403, "You are not allowed to message one of those recipients.");
      labels[safe(k)] = r.label;
    }
    labels[safe(me)] = user.role === "owner" ? "Business Owner" : user.accountId ? user.name : (user.role === "manager" ? roleLabel("manager") : `${roleLabel(user.role)}`);
    const participants = [me, ...to];

    // Re-use the one-to-one thread if it exists, so history stays together.
    const pairKey = to.length === 1 ? [me, to[0]].sort().join("|") : null;
    let ref = null; let convo = null;
    if (pairKey) {
      const ex = await db.collection(CONVOS).where("pairKey", "==", pairKey).limit(1).get();
      if (!ex.empty) { ref = ex.docs[0].ref; convo = ex.docs[0].data(); }
    }
    if (!ref) {
      convo = { kind: "direct", subject: subject || "Conversation", participants, labels, pairKey, replyAllowed: true, createdBy: me, createdAt: FieldValue.serverTimestamp(), lastAt: FieldValue.serverTimestamp(), lastAtIso: new Date().toISOString(), reads: {} };
      ref = await db.collection(CONVOS).add(convo);
    }
    const id = await deliver({ user, convoRef: ref, convo, text, recipients: to, subject: convo.subject });
    res.status(201).json({ id, conversationId: ref.id });
  } catch (err) { next(err); }
}

async function announce(req, res, next) {
  try {
    const user = req.user;
    if (!(user.role === "owner" || isManagerLike(user))) throw new ApiError(403, "Only the owner and managers can send announcements.");
    const text = cleanBody(req.body.body);
    const subject = String(req.body.subject || "").trim().slice(0, 120);
    if (!subject) throw new ApiError(400, "An announcement needs a subject.");
    const valid = new Set([...Object.keys(DEPARTMENTS), "employee"]);
    let depts = Array.isArray(req.body.departments) ? req.body.departments : [];
    if (depts.includes("all")) depts = [...valid];
    depts = [...new Set(depts)];
    if (!depts.length || depts.some((d) => !valid.has(d))) throw new ApiError(400, "Choose at least one valid department.");

    const me = myKey(user);
    const to = depts.map((d) => `role:${d}`);
    const labels = { [safe(me)]: user.role === "owner" ? "Business Owner" : user.name };
    to.forEach((k) => { labels[safe(k)] = roleLabel(k.slice(5)); });
    const ref = await db.collection(CONVOS).add({
      kind: "announcement", subject, participants: [me, ...to], labels, pairKey: null, replyAllowed: false,
      createdBy: me, createdAt: FieldValue.serverTimestamp(), lastAt: FieldValue.serverTimestamp(), lastAtIso: new Date().toISOString(), reads: {},
    });
    const id = await deliver({ user, convoRef: ref, convo: {}, text, recipients: to, subject });
    res.status(201).json({ id, conversationId: ref.id });
  } catch (err) { next(err); }
}

async function recipients(req, res, next) {
  try { res.json({ items: await allowedRecipients(req.user) }); } catch (err) { next(err); }
}

module.exports = { conversations, openConversation, send, announce, recipients, OWNER_KEY, allowedRecipients };
