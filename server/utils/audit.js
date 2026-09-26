const { db, FieldValue } = require("../config/firebase");

/**
 * Writes one immutable audit-log entry. Called from controllers after any
 * state-changing action (status change, refund, salary edit, etc). Regular
 * users have no Firestore write access to auditLogs at all — see
 * database/firestore.rules — so this server-side write is the only way
 * entries are ever created, and nothing can edit or delete them afterward.
 */
async function logAction({ user, action, entity, entityId, previousValue, newValue }) {
  await db.collection("auditLogs").add({
    userId: user?.uid || "system",
    userName: user?.name || user?.email || "System",
    action,
    entity,
    entityId: entityId || null,
    previousValue: previousValue ?? null,
    newValue: newValue ?? null,
    createdAt: FieldValue.serverTimestamp(),
  });
}

module.exports = { logAction };
