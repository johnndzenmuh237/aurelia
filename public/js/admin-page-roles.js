/* Which roles each admin page allows — generated from the data-roles attribute on every admin page, so the sidebar can hide
   links a person cannot open. The server remains the real gatekeeper. Regenerate with: node scripts/build-page-roles.js */
window.ADMIN_PAGE_ROLES = {
 "/admin/ai-insights.html": [
  "super_admin",
  "manager"
 ],
 "/admin/analytics.html": [
  "super_admin",
  "manager",
  "accountant"
 ],
 "/admin/arrivals.html": [
  "super_admin",
  "manager",
  "front_desk"
 ],
 "/admin/audit-logs.html": [
  "super_admin"
 ],
 "/admin/availability.html": [
  "super_admin",
  "manager",
  "front_desk",
  "reservations"
 ],
 "/admin/bar-dashboard.html": [
  "super_admin",
  "manager",
  "restaurant"
 ],
 "/admin/bar-inventory.html": [
  "super_admin",
  "manager",
  "restaurant"
 ],
 "/admin/bar-pos.html": [
  "super_admin",
  "manager",
  "restaurant"
 ],
 "/admin/bar-sales.html": [
  "super_admin",
  "manager",
  "restaurant"
 ],
 "/admin/corporate-guests.html": [
  "super_admin",
  "manager",
  "accountant"
 ],
 "/admin/dashboard.html": [
  "super_admin",
  "manager",
  "front_desk",
  "accountant"
 ],
 "/admin/departments.html": [
  "super_admin",
  "manager",
  "hr"
 ],
 "/admin/departures.html": [
  "super_admin",
  "manager",
  "front_desk"
 ],
 "/admin/employee-applications.html": [
  "super_admin",
  "manager",
  "hr"
 ],
 "/admin/employee-attendance.html": [
  "super_admin",
  "manager",
  "hr"
 ],
 "/admin/employees.html": [
  "super_admin",
  "manager",
  "hr"
 ],
 "/admin/events.html": [
  "super_admin",
  "manager",
  "reservations"
 ],
 "/admin/expenses.html": [
  "super_admin",
  "manager",
  "accountant"
 ],
 "/admin/finance.html": [
  "super_admin",
  "manager",
  "accountant"
 ],
 "/admin/group-bookings.html": [
  "super_admin",
  "manager",
  "reservations"
 ],
 "/admin/guest-requests.html": [
  "super_admin",
  "manager",
  "front_desk",
  "housekeeping"
 ],
 "/admin/guests.html": [
  "super_admin",
  "manager",
  "front_desk",
  "reservations"
 ],
 "/admin/housekeeping-tasks.html": [
  "super_admin",
  "manager",
  "housekeeping"
 ],
 "/admin/housekeeping.html": [
  "super_admin",
  "manager",
  "housekeeping"
 ],
 "/admin/in-house.html": [
  "super_admin",
  "manager",
  "front_desk",
  "housekeeping"
 ],
 "/admin/inventory-items.html": [
  "super_admin",
  "manager",
  "accountant"
 ],
 "/admin/inventory.html": [
  "super_admin",
  "manager",
  "accountant"
 ],
 "/admin/invoices.html": [
  "super_admin",
  "manager",
  "accountant",
  "front_desk"
 ],
 "/admin/laundry.html": [
  "super_admin",
  "manager",
  "housekeeping"
 ],
 "/admin/lost-found.html": [
  "super_admin",
  "manager",
  "housekeeping",
  "front_desk"
 ],
 "/admin/maintenance-requests.html": [
  "super_admin",
  "manager",
  "maintenance"
 ],
 "/admin/maintenance.html": [
  "super_admin",
  "manager",
  "maintenance"
 ],
 "/admin/minibar.html": [
  "super_admin",
  "manager",
  "housekeeping"
 ],
 "/admin/night-audit.html": [
  "super_admin",
  "manager",
  "accountant"
 ],
 "/admin/notifications.html": [
  "super_admin",
  "manager"
 ],
 "/admin/payments.html": [
  "super_admin",
  "manager",
  "accountant",
  "front_desk"
 ],
 "/admin/payroll.html": [
  "super_admin",
  "manager",
  "hr",
  "accountant"
 ],
 "/admin/pending-payments.html": [
  "super_admin",
  "manager",
  "accountant",
  "front_desk"
 ],
 "/admin/positions.html": [
  "super_admin",
  "manager",
  "hr"
 ],
 "/admin/promo-codes.html": [
  "super_admin",
  "manager",
  "reservations"
 ],
 "/admin/promotions.html": [
  "super_admin",
  "manager",
  "reservations"
 ],
 "/admin/purchases.html": [
  "super_admin",
  "manager",
  "accountant"
 ],
 "/admin/refunds.html": [
  "super_admin",
  "manager",
  "accountant"
 ],
 "/admin/reports.html": [
  "super_admin",
  "manager",
  "accountant"
 ],
 "/admin/reservation-calendar.html": [
  "super_admin",
  "manager",
  "front_desk",
  "reservations"
 ],
 "/admin/reservations.html": [
  "super_admin",
  "manager",
  "front_desk",
  "reservations"
 ],
 "/admin/restaurant/delivery-orders.html": [
  "super_admin",
  "manager",
  "restaurant"
 ],
 "/admin/restaurant/kitchen.html": [
  "super_admin",
  "manager",
  "restaurant"
 ],
 "/admin/restaurant/menu.html": [
  "super_admin",
  "manager",
  "restaurant"
 ],
 "/admin/restaurant/orders.html": [
  "super_admin",
  "manager",
  "restaurant"
 ],
 "/admin/restaurant/pos.html": [
  "super_admin",
  "manager",
  "restaurant"
 ],
 "/admin/restaurant/tables.html": [
  "super_admin",
  "manager",
  "restaurant"
 ],
 "/admin/room-status.html": [
  "super_admin",
  "manager",
  "front_desk",
  "housekeeping"
 ],
 "/admin/room-types.html": [
  "super_admin",
  "manager",
  "reservations"
 ],
 "/admin/rooms.html": [
  "super_admin",
  "manager",
  "front_desk",
  "reservations",
  "housekeeping"
 ],
 "/admin/salaries.html": [
  "super_admin",
  "manager",
  "hr",
  "accountant"
 ],
 "/admin/salary-history.html": [
  "super_admin",
  "manager",
  "hr",
  "accountant"
 ],
 "/admin/schedules.html": [
  "super_admin",
  "manager",
  "hr"
 ],
 "/admin/settings.html": [
  "super_admin"
 ],
 "/admin/suppliers.html": [
  "super_admin",
  "manager",
  "accountant"
 ],
 "/admin/vip-guests.html": [
  "super_admin",
  "manager",
  "front_desk"
 ],
 "/admin/walk-in.html": [
  "super_admin",
  "manager",
  "front_desk"
 ]
};
