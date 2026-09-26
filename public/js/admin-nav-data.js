/* Admin sidebar structure — matches spec section 76 exactly.
   Edited in one place; every admin page renders from this array via
   admin-layout.js, so navigation can never drift page-to-page. */

window.ADMIN_NAV = [
  { group: null, items: [{ href: "/admin/dashboard.html", label: "Dashboard", icon: "⌂" }] },
  { group: "Reservations", items: [
    { href: "/admin/reservation-calendar.html", label: "Calendar", icon: "▦" },
    { href: "/admin/reservations.html", label: "All Reservations", icon: "≡" },
    { href: "/admin/arrivals.html", label: "Arrivals", icon: "→" },
    { href: "/admin/departures.html", label: "Departures", icon: "←" },
    { href: "/admin/in-house.html", label: "In-House Guests", icon: "●" },
    { href: "/admin/walk-in.html", label: "Walk-ins", icon: "＋" },
  ]},
  { group: "Rooms", items: [
    { href: "/admin/rooms.html", label: "All Rooms", icon: "▭" },
    { href: "/admin/room-types.html", label: "Room Types", icon: "▤" },
    { href: "/admin/availability.html", label: "Availability", icon: "▥" },
    { href: "/admin/room-status.html", label: "Room Status", icon: "◐" },
  ]},
  { group: "Guests", items: [
    { href: "/admin/guests.html", label: "All Guests", icon: "☺" },
    { href: "/admin/vip-guests.html", label: "VIP Guests", icon: "★" },
    { href: "/admin/corporate-guests.html", label: "Corporate", icon: "◆" },
    { href: "/admin/guest-requests.html", label: "Guest Requests", icon: "✎" },
  ]},
  { group: "Housekeeping", items: [
    { href: "/admin/housekeeping.html", label: "Dashboard", icon: "⌂" },
    { href: "/admin/housekeeping-tasks.html", label: "Tasks", icon: "☑" },
  ]},
  { group: "Restaurant", items: [
    { href: "/admin/restaurant/pos.html", label: "POS", icon: "$" },
    { href: "/admin/restaurant/orders.html", label: "Orders", icon: "≣" },
    { href: "/admin/restaurant/delivery-orders.html", label: "Delivery Orders", icon: "▶" },
    { href: "/admin/restaurant/menu.html", label: "Menu", icon: "☰" },
    { href: "/admin/restaurant/tables.html", label: "Tables", icon: "▦" },
    { href: "/admin/restaurant/kitchen.html", label: "Kitchen", icon: "♨" },
  ]},
  { group: "Bar", items: [
    { href: "/admin/bar-inventory.html", label: "Inventory", icon: "▣" },
    { href: "/admin/bar-sales.html", label: "Record Sale", icon: "$" },
  ]},
  { group: "Inventory", items: [
    { href: "/admin/inventory.html", label: "Items", icon: "▣" },
    { href: "/admin/inventory-items.html", label: "Stock", icon: "▤" },
    { href: "/admin/purchases.html", label: "Purchases", icon: "▥" },
    { href: "/admin/suppliers.html", label: "Suppliers", icon: "◈" },
  ]},
  { group: "Finance", items: [
    { href: "/admin/finance.html", label: "Overview", icon: "◎" },
    { href: "/admin/invoices.html", label: "Invoices", icon: "▤" },
    { href: "/admin/payments.html", label: "Payments", icon: "◒" },
    { href: "/admin/refunds.html", label: "Refunds", icon: "↺" },
    { href: "/admin/expenses.html", label: "Expenses", icon: "▽" },
  ]},
  { group: "Employees", items: [
    { href: "/admin/employees.html", label: "All Employees", icon: "☺" },
    { href: "/admin/employee-applications.html", label: "Applications", icon: "✉" },
    { href: "/admin/departments.html", label: "Departments", icon: "▦" },
    { href: "/admin/positions.html", label: "Positions", icon: "▤" },
    { href: "/admin/employee-attendance.html", label: "Attendance", icon: "☑" },
    { href: "/admin/schedules.html", label: "Schedules", icon: "◷" },
  ]},
  { group: "Payroll", items: [
    { href: "/admin/salaries.html", label: "Salaries", icon: "◒" },
    { href: "/admin/payroll.html", label: "Payroll", icon: "▤" },
    { href: "/admin/salary-history.html", label: "Salary History", icon: "◷" },
  ]},
  { group: "Maintenance", items: [
    { href: "/admin/maintenance.html", label: "Requests", icon: "⚙" },
    { href: "/admin/maintenance-requests.html", label: "Reports", icon: "▤" },
  ]},
  { group: "Marketing", items: [
    { href: "/admin/promotions.html", label: "Promotions", icon: "◆" },
    { href: "/admin/promo-codes.html", label: "Promo Codes", icon: "%" },
    { href: "/admin/events.html", label: "Events", icon: "☰" },
    { href: "/admin/group-bookings.html", label: "Group Bookings", icon: "▦" },
  ]},
  { group: "Other", items: [
    { href: "/admin/lost-found.html", label: "Lost & Found", icon: "◈" },
    { href: "/admin/laundry.html", label: "Laundry", icon: "◒" },
    { href: "/admin/minibar.html", label: "Minibar", icon: "▣" },
  ]},
  { group: null, items: [
    { href: "/admin/reports.html", label: "Reports", icon: "▤" },
    { href: "/admin/analytics.html", label: "Analytics", icon: "◎" },
    { href: "/admin/ai-insights.html", label: "AI Business Insights", icon: "✦" },
    { href: "/admin/night-audit.html", label: "Night Audit", icon: "◑" },
    { href: "/admin/notifications.html", label: "Notifications", icon: "✉" },
    { href: "/admin/audit-logs.html", label: "Audit Logs", icon: "≡" },
    { href: "/admin/settings.html", label: "Settings", icon: "⚙" },
  ]},
];
