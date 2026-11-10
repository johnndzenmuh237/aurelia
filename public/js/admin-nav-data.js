/* Admin sidebar structure — matches spec section 76 exactly. Icons are Lucide names (see js/icons.js).
   Edited in one place; every admin page renders from this array via
   admin-layout.js, so navigation can never drift page-to-page. */

window.ADMIN_NAV = [
  { group: null, items: [{ href: "/admin/dashboard.html", label: "Dashboard", icon: "layout-dashboard" }] },
  { group: "Daily Close", items: [{ href: "/admin/daily-close.html", label: "End-of-Day Close", icon: "clipboard-check" }] },
  { group: "Reservations", items: [
    { href: "/admin/reservation-calendar.html", label: "Calendar", icon: "calendar-days" },
    { href: "/admin/reservations.html", label: "All Reservations", icon: "list-checks" },
    { href: "/admin/arrivals.html", label: "Arrivals", icon: "arrow-right-to-line" },
    { href: "/admin/departures.html", label: "Departures", icon: "arrow-left-from-line" },
    { href: "/admin/in-house.html", label: "In-House Guests", icon: "bed-double" },
    { href: "/admin/walk-in.html", label: "Walk-ins", icon: "user-plus" },
  ]},
  { group: "Rooms", items: [
    { href: "/admin/rooms.html", label: "All Rooms", icon: "door-open" },
    { href: "/admin/room-types.html", label: "Room Types", icon: "layers" },
    { href: "/admin/availability.html", label: "Availability", icon: "calendar" },
    { href: "/admin/room-status.html", label: "Room Status", icon: "clipboard-check" },
  ]},
  { group: "Guests", items: [
    { href: "/admin/guests.html", label: "All Guests", icon: "users" },
    { href: "/admin/vip-guests.html", label: "VIP Guests", icon: "star" },
    { href: "/admin/corporate-guests.html", label: "Corporate", icon: "building-2" },
    { href: "/admin/guest-requests.html", label: "Guest Requests", icon: "square-pen" },
  ]},
  { group: "Housekeeping", items: [
    { href: "/admin/housekeeping.html", label: "Dashboard", icon: "layout-dashboard" },
    { href: "/admin/housekeeping-tasks.html", label: "Tasks", icon: "clipboard-list" },
  ]},
  { group: "Restaurant", items: [
    { href: "/admin/restaurant/pos.html", label: "POS", icon: "utensils" },
    { href: "/admin/restaurant/orders.html", label: "Orders", icon: "receipt" },
    { href: "/admin/restaurant/delivery-orders.html", label: "Delivery Orders", icon: "truck" },
    { href: "/admin/restaurant/menu.html", label: "Menu", icon: "book-open" },
    { href: "/admin/restaurant/tables.html", label: "Tables", icon: "calendar-days" },
    { href: "/admin/restaurant/kitchen.html", label: "Kitchen", icon: "chef-hat" },
    { href: "/admin/restaurant/stock.html", label: "Stock & Inventory", icon: "boxes" },
  ]},
  { group: "Bar", items: [
    { href: "/admin/bar-dashboard.html", label: "Dashboard", icon: "layout-dashboard" },
    { href: "/admin/bar-pos.html", label: "Bar POS — Fast Sell", icon: "wine" },
    { href: "/admin/bar-inventory.html", label: "Inventory", icon: "boxes" },
    { href: "/admin/bar-sales.html", label: "Record Sale (Simple Form)", icon: "beer" },
  ]},
  { group: "Inventory", items: [
    { href: "/admin/inventory.html", label: "Items", icon: "boxes" },
    { href: "/admin/inventory-items.html", label: "Stock", icon: "layers" },
    { href: "/admin/purchases.html", label: "Purchases", icon: "calendar" },
    { href: "/admin/suppliers.html", label: "Suppliers", icon: "store" },
  ]},
  { group: "Finance", items: [
    { href: "/admin/finance.html", label: "Overview", icon: "chart-pie" },
    { href: "/admin/invoices.html", label: "Invoices", icon: "layers" },
    { href: "/admin/payments.html", label: "Payments", icon: "credit-card" },
    { href: "/admin/pending-payments.html", label: "Pending Manual Payments", icon: "clock" },
    { href: "/admin/refunds.html", label: "Refunds", icon: "rotate-ccw" },
    { href: "/admin/expenses.html", label: "Expenses", icon: "trending-down" },
  ]},
  { group: "Employees", items: [
    { href: "/admin/employees.html", label: "All Employees", icon: "users" },
    { href: "/admin/employee-applications.html", label: "Applications", icon: "briefcase" },
    { href: "/admin/departments.html", label: "Departments", icon: "calendar-days" },
    { href: "/admin/positions.html", label: "Positions", icon: "id-card" },
    { href: "/admin/employee-attendance.html", label: "Attendance", icon: "clipboard-list" },
    { href: "/admin/schedules.html", label: "Schedules", icon: "calendar-clock" },
  ]},
  { group: "Payroll", items: [
    { href: "/admin/salaries.html", label: "Salaries", icon: "credit-card" },
    { href: "/admin/payroll.html", label: "Payroll", icon: "layers" },
    { href: "/admin/salary-history.html", label: "Salary History", icon: "calendar-clock" },
  ]},
  { group: "Maintenance", items: [
    { href: "/admin/maintenance.html", label: "Requests", icon: "wrench" },
    { href: "/admin/maintenance-requests.html", label: "Reports", icon: "layers" },
  ]},
  { group: "Marketing", items: [
    { href: "/admin/promotions.html", label: "Promotions", icon: "building-2" },
    { href: "/admin/promo-codes.html", label: "Promo Codes", icon: "percent" },
    { href: "/admin/events.html", label: "Events", icon: "party-popper" },
    { href: "/admin/group-bookings.html", label: "Group Bookings", icon: "users-round" },
  ]},
  { group: "Other", items: [
    { href: "/admin/lost-found.html", label: "Lost & Found", icon: "search" },
    { href: "/admin/laundry.html", label: "Laundry", icon: "shirt" },
    { href: "/admin/minibar.html", label: "Minibar", icon: "glass-water" },
  ]},
  { group: null, items: [
    { href: "/admin/reports.html", label: "Reports", icon: "file-text" },
    { href: "/admin/analytics.html", label: "Analytics", icon: "chart-column" },
    { href: "/admin/ai-insights.html", label: "AI Business Insights", icon: "sparkles" },
    { href: "/admin/night-audit.html", label: "Night Audit", icon: "moon" },
    { href: "/admin/notifications.html", label: "Notifications", icon: "bell" },
    { href: "/admin/audit-logs.html", label: "Audit Logs", icon: "scroll-text" },
    { href: "/admin/settings.html", label: "Settings", icon: "settings" },
  ]},
];