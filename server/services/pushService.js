const crypto = require("crypto");
const webpush = require("web-push");
const { db, FieldValue } = require("../config/firebase");
const { ApiError } = require("../utils/errors");

/**
 * Phone / browser push alerts ("Web Push"): a notification reaches the person's
 * device even when the app is closed.
 *
 * - The signing keys (VAPID) are made automatically the first time and kept in
 *   Firestore (`appConfig/webPush`), so no setup is needed. VAPID_PUBLIC_KEY /
 *   VAPID_PRIVATE_KEY in the environment override them if you ever want to.
 * - A subscription remembers who the person is and which departments they hold,
 *   and is only used for notifications that person is allowed to see.
 * - Private messages never put their text on a lock screen.
 * - Sending never blocks or fails the action that caused the notification.
 */
const SUBS = "pushSubscriptions";
let keyCache = null;

async function keys() {
  if (keyCache) return keyCache;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    keyCache = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  } else {
    const ref = db.collection("appConfig").doc("webPush");
    const snap = await ref.get();
    if (snap.exists && snap.data().publicKey) keyCache = { publicKey: snap.data().publicKey, privateKey: snap.data().privateKey };
    else { keyCache = webpush.generateVAPIDKeys(); await ref.set({ ...keyCache, createdAt: FieldValue.serverTimestamp() }); }
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@aurelia.local", keyCache.publicKey, keyCache.privateKey);
  return keyCache;
}
const publicKey = async () => (await keys()).publicKey;

const idOf = (endpoint) => crypto.createHash("sha256").update(endpoint).digest("hex").slice(0, 40);
const who = (u) => ({ role: u.role, accountId: u.accountId || null, departments: u.departments || [], name: u.name || "" });

async function subscribe(user, sub) {
  if (!sub || typeof sub.endpoint !== "string" || !/^https:\/\//.test(sub.endpoint) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) throw new ApiError(400, "That is not a valid push subscription.");
  await db.collection(SUBS).doc(idOf(sub.endpoint)).set({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, user: who(user), updatedAt: FieldValue.serverTimestamp() });
  return { ok: true };
}
async function unsubscribe(endpoint) {
  if (endpoint) await db.collection(SUBS).doc(idOf(String(endpoint))).delete();
  return { ok: true };
}

/** Push one stored notification to every subscribed device that may see it. */
async function pushNotification(id, doc) {
  try {
    const snap = await db.collection(SUBS).get();
    if (snap.empty) return 0;
    await keys();
    const { visibleTo } = require("./notificationHub");          // lazy: avoids a require cycle
    const { getAccount } = require("./accountService");
    const payload = JSON.stringify(doc.private
      ? { title: doc.title || "New message", body: `From ${doc.senderName || "a colleague"}`, url: doc.link || "/portal/messages.html", tag: id }
      : { title: doc.title || "Notification", body: String(doc.message || "").slice(0, 140), url: doc.link || "/portal/notifications.html", tag: id });
    let sent = 0;
    for (const s of snap.docs) {
      const d = s.data();
      const user = d.user || {};
      if (!visibleTo(user, doc)) continue;
      if (doc.senderKey && user.accountId && doc.senderKey === `acct:${user.accountId}`) continue;   // not to the sender
      if (user.accountId) { const a = await getAccount(user.accountId); if (!a || a.status !== "active") continue; }
      try { await webpush.sendNotification({ endpoint: d.endpoint, keys: d.keys }, payload, { TTL: 86400, urgency: "high" }); sent++; }
      catch (err) { if (err && (err.statusCode === 404 || err.statusCode === 410)) await s.ref.delete(); }
    }
    return sent;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[push] failed:", err.message);
    return 0;
  }
}

module.exports = { publicKey, subscribe, unsubscribe, pushNotification };