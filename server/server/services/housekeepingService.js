const { db, FieldValue } = require("../config/firebase");
const { ApiError } = require("../utils/errors");
const { logAction } = require("../utils/audit");

async function createHousekeepingTask({ room, taskType, assignedTo, priority = "Normal", reason }) {
  const ref = await db.collection("housekeepingTasks").add({
    room, taskType, assignedTo: assignedTo || null, priority, status: "pending",
    reason: reason || null, createdAt: FieldValue.serverTimestamp(), startedAt: null, completedAt: null,
  });
  return ref.id;
}

/**
 * Advances a room through the housekeeping lifecycle:
 * DIRTY -> CLEAN -> INSPECTED -> AVAILABLE (spec §8, §25).
 * Accepts either a roomId + explicit next status (from the room-status
 * board) or a taskId (from an employee's task list, which infers the next
 * status from the current room status).
 */
async function completeHousekeeping({ roomId, taskId, status }) {
  let targetRoomRef;

  if (taskId) {
    const taskRef = db.collection("housekeepingTasks").doc(taskId);
    const taskSnap = await taskRef.get();
    if (!taskSnap.exists) throw new ApiError(404, "Task not found.");
    const task = taskSnap.data();
    await taskRef.update({ status: "completed", completedAt: FieldValue.serverTimestamp() });
    const roomQuery = await db.collection("rooms").where("number", "==", task.room).limit(1).get();
    if (roomQuery.empty) return { ok: true };
    targetRoomRef = roomQuery.docs[0].ref;
    status = "clean";
  } else if (roomId) {
    targetRoomRef = db.collection("rooms").doc(roomId);
  } else {
    throw new ApiError(400, "roomId or taskId is required.");
  }

  const roomSnap = await targetRoomRef.get();
  if (!roomSnap.exists) throw new ApiError(404, "Room not found.");
  const previousStatus = roomSnap.data().status;

  await targetRoomRef.update({ status });
  await logAction({ user: null, action: `Room status: ${previousStatus} → ${status}`, entity: "rooms", entityId: targetRoomRef.id, previousValue: previousStatus, newValue: status });

  return { ok: true, newStatus: status };
}

module.exports = { createHousekeepingTask, completeHousekeeping };
