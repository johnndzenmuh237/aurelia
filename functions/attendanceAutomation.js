const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

/**
 * Runs once near the end of each working day. Any active employee who has
 * no employeeAttendance record for today (i.e. never clicked "Mark
 * Present") is automatically recorded as Absent — spec §19: "If an
 * employee does not mark themselves present for that working day, the
 * system automatically marks them ABSENT." This keeps attendance
 * percentages honest without requiring a manager to manually catch every
 * no-show.
 */
exports.autoMarkAbsent = onSchedule(
  { schedule: "0 22 * * *", timeZone: "Africa/Douala" },
  async () => {
    const db = getFirestore();
    const todayStr = new Date().toISOString().slice(0, 10);

    const employeesSnap = await db.collection("employees").where("status", "==", "active").get();
    const attendanceSnap = await db.collection("employeeAttendance").where("date", "==", todayStr).get();
    const markedIds = new Set(attendanceSnap.docs.map((d) => d.data().employeeId));

    const batch = db.batch();
    let count = 0;
    employeesSnap.docs.forEach((doc) => {
      if (!markedIds.has(doc.id)) {
        const ref = db.collection("employeeAttendance").doc();
        batch.set(ref, {
          employeeId: doc.id, employeeName: doc.data().fullName, date: todayStr,
          checkIn: null, checkOut: null, status: "absent", autoMarked: true,
          createdAt: FieldValue.serverTimestamp(),
        });
        count += 1;
      }
    });
    if (count) {
      await batch.commit();
      await db.collection("notifications").add({
        type: "attendance_auto_absent", message: `${count} employee(s) automatically marked absent for ${todayStr} — no check-in recorded.`,
        read: false, createdAt: FieldValue.serverTimestamp(),
      });
    }
  }
);
