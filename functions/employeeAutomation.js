const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

/**
 * When an employee record is created (via /api/employees/hire — see
 * server/controllers/opsControllers.js), this ensures a matching
 * notification goes out to HR/management so hiring is visible in the
 * admin Notifications panel without a manual step (spec §36, §79
 * "Employee Hired").
 */
exports.onEmployeeCreated = onDocumentCreated("employees/{employeeId}", async (event) => {
  const employee = event.data.data();
  const db = getFirestore();
  await db.collection("notifications").add({
    type: "employee_hired",
    message: `${employee.fullName} was added as ${employee.position} (${employee.department || "Unassigned"}).`,
    read: false, createdAt: FieldValue.serverTimestamp(),
  });
});
