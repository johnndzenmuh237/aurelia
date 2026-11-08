/**
 * Single source of truth for WHO may see WHAT.
 *
 * Legacy shared-password roles (front_desk, housekeeping, …) keep working
 * exactly as before. Individual manager accounts are scoped by
 * `departments`, and a department key is the same string as the legacy role
 * that does that department's work — so "manager of restaurant" is
 * authorised for exactly what the `restaurant` role is authorised for,
 * and nothing else.
 */

const DEPARTMENTS = {
  front_desk:   "Front Desk",
  reservations: "Reservations",
  housekeeping: "Housekeeping",
  maintenance:  "Maintenance",
  restaurant:   "Restaurant & Bar",
  hr:           "Human Resources",
  accountant:   "Finance & Accounts",
};

// Everything an individual manager account may be granted.
const MANAGER_PERMISSIONS = ["view", "create", "edit", "delete", "approve"];
const METHOD_PERMISSION = { GET: "view", HEAD: "view", POST: "create", PUT: "edit", PATCH: "edit", DELETE: "delete" };

// Every role that can sign in with a shared password (messaging mailboxes).
const STAFF_ROLES = ["super_admin", "manager", ...Object.keys(DEPARTMENTS), "employee"];

/**
 * Collections readable through GET /api/staff/data/:collection, and which
 * roles may read each. Derived from the data-roles guard on every admin /
 * employee page that polls the collection, so the API now enforces what the
 * UI already implied. super_admin and owner always pass; individual
 * managers pass when one of their departments is listed.
 */
const ALL_STAFF = ["front_desk", "reservations", "housekeeping", "maintenance", "restaurant", "hr", "accountant", "employee"];
const COLLECTION_ROLES = {
  // front office
  reservations: ["front_desk", "reservations", "housekeeping", "accountant", "restaurant", "hr"],
  guests: ["front_desk", "reservations"],
  guestRequests: ["front_desk", "reservations", "housekeeping", "maintenance"],
  corporateAccounts: ["front_desk", "reservations", "accountant"],
  groupBookings: ["front_desk", "reservations"],
  events: ["front_desk", "reservations", "restaurant"],
  promoCodes: ["front_desk", "reservations"],
  folioItems: ["front_desk", "reservations", "accountant", "restaurant", "hr"],
  invoices: ["front_desk", "reservations", "accountant", "restaurant", "hr"],
  payments: ["front_desk", "reservations", "accountant", "restaurant", "hr"],
  refunds: ["accountant", "front_desk"],
  lostAndFound: ["front_desk", "housekeeping"],
  laundryOrders: ["front_desk", "housekeeping"],
  minibarItems: ["front_desk", "housekeeping", "restaurant"],
  // operations
  housekeepingTasks: ["housekeeping", "front_desk", "employee", "maintenance"],
  maintenanceRequests: ["maintenance", "front_desk", "housekeeping"],
  orders: ["restaurant", "front_desk", "accountant", "hr", "reservations"],
  restaurantTables: ["restaurant", "front_desk"],
  barSales: ["restaurant", "accountant", "front_desk", "hr", "reservations"],
  barCategories: ["restaurant", "accountant"],
  barInventoryTransactions: ["restaurant", "accountant"],
  barStockAdjustments: ["restaurant", "accountant"],
  inventoryItems: ["accountant", "restaurant", "housekeeping", "maintenance"],
  inventoryTransactions: ["accountant", "restaurant"],
  suppliers: ["accountant", "restaurant"],
  purchaseOrders: ["accountant", "restaurant"],
  // people
  employees: ["hr", "accountant", "front_desk", "reservations", "restaurant", "housekeeping", "maintenance"],
  employeeApplications: ["hr"],
  departments: ALL_STAFF,
  positions: ["hr"],
  employeeAttendance: ["hr", "employee", "front_desk", "reservations", "restaurant", "housekeeping", "maintenance"],
  schedules: ["hr", "employee", "front_desk", "housekeeping", "maintenance", "restaurant"],
  // money
  expenses: ["accountant"],
  budgets: ["accountant"],
  creditTransactions: ["accountant", "restaurant"],
  creditPayments: ["accountant"],
  sales: ["accountant", "restaurant", "front_desk"],
  payroll: ["hr", "accountant"],
  salaryHistory: ["hr", "accountant"],
  salaryPayments: ["hr", "accountant"],
  paymentReferences: ["accountant", "front_desk"],
  // oversight
  auditLogs: [],            // owner / super_admin / legacy manager only
  whatsappLogs: [],
  notifications: [],        // read through /api/notifications instead
  // public site data — any signed-in staff member
  rooms: ALL_STAFF, roomTypes: ALL_STAFF, menuItems: ALL_STAFF, barInventory: ALL_STAFF, promotions: ALL_STAFF,
};

// Collections the owner can browse record-by-record (everything above plus
// the new account/communication collections).
const OWNER_EXTRA_COLLECTIONS = ["staffAccounts", "conversations", "messages"];

/** Which request viewers see which collection. */
function canReadCollection(user, collection) {
  if (!user) return false;
  if (user.role === "owner" || user.role === "super_admin") return true;
  const allowed = COLLECTION_ROLES[collection];
  if (!allowed) return false;
  if (user.role === "manager") {
    if (!user.accountId) return true;                                // legacy shared manager = unchanged
    if (collection === "auditLogs" || collection === "whatsappLogs") return user.permissions?.includes("approve") === true;
    return (user.departments || []).some((d) => allowed.includes(d));
  }
  return allowed.includes(user.role);
}

/**
 * Activity notifications: which successful API calls tell somebody else
 * about it. `dept` decides who sees it (staff of that department, managers
 * responsible for it, the owner always).
 */
const ACTIVITY_RULES = [
  ["POST",   /^\/api\/checkin$/,                  { dept: "front_desk",   title: "Guest checked in",            entity: "reservations", link: "/admin/in-house.html" }],
  ["POST",   /^\/api\/checkout$/,                 { dept: "front_desk",   title: "Guest checked out",           entity: "reservations", link: "/admin/departures.html" }],
  ["POST",   /^\/api\/payments\/manual-submit$/,  { dept: "accountant",   title: "Manual payment submitted",    entity: "payments",     link: "/admin/pending-payments.html" }],
  ["POST",   /^\/api\/payments\/manual-confirm$/, { dept: "accountant",   title: "Payment confirmed",           entity: "payments",     link: "/admin/payments.html" }],
  ["POST",   /^\/api\/payments\/manual-reject$/,  { dept: "accountant",   title: "Payment rejected",            entity: "payments",     link: "/admin/pending-payments.html" }],
  ["POST",   /^\/api\/payments\/refund$/,         { dept: "accountant",   title: "Refund issued",               entity: "refunds",      link: "/admin/refunds.html" }],
  ["POST",   /^\/api\/rooms\/create$/,            { dept: "reservations", title: "Room created",                entity: "rooms",        link: "/admin/rooms.html" }],
  ["PUT",    /^\/api\/rooms\/update$/,            { dept: "reservations", title: "Room updated",                entity: "rooms",        link: "/admin/rooms.html" }],
  ["PUT",    /^\/api\/rooms\/status$/,            { dept: "housekeeping", title: "Room status changed",         entity: "rooms",        link: "/admin/room-status.html" }],
  ["PUT",    /^\/api\/reservations\/update$/,     { dept: "reservations", title: "Reservation updated",         entity: "reservations", link: "/admin/reservations.html" }],
  ["DELETE", /^\/api\/reservations\/delete$/,     { dept: "reservations", title: "Reservation deleted",         entity: "reservations", link: "/admin/reservations.html" }],
  ["POST",   /^\/api\/guests\/create$/,           { dept: "front_desk",   title: "New guest or request received", entity: "guests",     link: "/admin/guests.html" }],
  ["PUT",    /^\/api\/guests\/update$/,           { dept: "front_desk",   title: "Guest record updated",        entity: "guests",       link: "/admin/guests.html" }],
  ["POST",   /^\/api\/housekeeping\/assign$/,     { dept: "housekeeping", title: "Housekeeping task assigned",  entity: "housekeepingTasks", link: "/admin/housekeeping-tasks.html" }],
  ["POST",   /^\/api\/housekeeping\/complete$/,   { dept: "housekeeping", title: "Housekeeping task completed", entity: "housekeepingTasks", link: "/admin/housekeeping-tasks.html" }],
  ["POST",   /^\/api\/maintenance\/create$/,      { dept: "maintenance",  title: "Maintenance request created", entity: "maintenanceRequests", link: "/admin/maintenance.html" }],
  ["PUT",    /^\/api\/maintenance\/update$/,      { dept: "maintenance",  title: "Maintenance request updated", entity: "maintenanceRequests", link: "/admin/maintenance.html" }],
  ["POST",   /^\/api\/restaurant\/orders$/,       { dept: "restaurant",   title: "Restaurant order created",    entity: "orders",       link: "/admin/restaurant/orders.html" }],
  ["PUT",    /^\/api\/restaurant\/orders$/,       { dept: "restaurant",   title: "Restaurant order updated",    entity: "orders",       link: "/admin/restaurant/orders.html" }],
  ["POST",   /^\/api\/restaurant\/menu$/,         { dept: "restaurant",   title: "Menu item added",             entity: "menuItems",    link: "/admin/restaurant/menu.html" }],
  ["PUT",    /^\/api\/restaurant\/menu$/,         { dept: "restaurant",   title: "Menu item updated",           entity: "menuItems",    link: "/admin/restaurant/menu.html" }],
  ["POST",   /^\/api\/restaurant\/delivery$/,     { dept: "restaurant",   title: "New delivery order",          entity: "orders",       link: "/admin/restaurant/delivery-orders.html" }],
  ["POST",   /^\/api\/bar\/sell$/,                { dept: "restaurant",   title: "Bar sale recorded",           entity: "barSales",     link: "/admin/bar-sales.html" }],
  ["POST",   /^\/api\/bar\/(inventory|categories|restock|adjust)$/, { dept: "restaurant", title: "Bar inventory changed", entity: "barInventory", link: "/admin/bar-inventory.html" }],
  ["PUT",    /^\/api\/bar\/inventory$/,           { dept: "restaurant",   title: "Bar item updated",            entity: "barInventory", link: "/admin/bar-inventory.html" }],
  ["POST",   /^\/api\/inventory\/(items|stock)$/, { dept: "accountant",   title: "Inventory record added",      entity: "inventoryItems", link: "/admin/inventory.html" }],
  ["PUT",    /^\/api\/inventory\/(items|stock)$/, { dept: "accountant",   title: "Inventory record updated",    entity: "inventoryItems", link: "/admin/inventory.html" }],
  ["POST",   /^\/api\/employees\/hire$/,          { dept: "hr",           title: "Employee hired",              entity: "employees",    link: "/admin/employees.html" }],
  ["PUT",    /^\/api\/employees\/update$/,        { dept: "hr",           title: "Employee record updated",     entity: "employees",    link: "/admin/employees.html" }],
  ["POST",   /^\/api\/employees\/applications$/,  { dept: "hr",           title: "New job application",         entity: "employeeApplications", link: "/admin/employee-applications.html" }],
  ["PUT",    /^\/api\/employees\/applications$/,  { dept: "hr",           title: "Job application updated",     entity: "employeeApplications", link: "/admin/employee-applications.html" }],
  ["POST",   /^\/api\/employees\/attendance$/,    { dept: "hr",           title: "Attendance recorded",         entity: "employeeAttendance", link: "/admin/employee-attendance.html" }],
  ["POST",   /^\/api\/payroll\/generate$/,        { dept: "hr",           title: "Payroll generated",           entity: "payroll",      link: "/admin/payroll.html" }],
  ["PUT",    /^\/api\/payroll\/approve$/,         { dept: "accountant",   title: "Payroll approved",            entity: "payroll",      link: "/admin/payroll.html" }],
  ["POST",   /^\/api\/reports\/finance$/,         { dept: "accountant",   title: "Finance record added",        entity: "expenses",     link: "/admin/expenses.html" }],
  ["PUT",    /^\/api\/reports\/finance$/,         { dept: "accountant",   title: "Finance record or settings updated", entity: "expenses", link: "/admin/expenses.html" }],
  ["POST",   /^\/api\/departments$/,              { dept: "hr",           title: "Department created",         entity: "departments",  link: "/admin/departments.html" }],
  ["PUT",    /^\/api\/departments$/,              { dept: "hr",           title: "Department updated",          entity: "departments",  link: "/admin/departments.html" }],
  ["POST",   /^\/api\/sales$/,                    { dept: "accountant",   title: "Sale recorded",               entity: "sales",        link: "/admin/finance.html" }],
  ["POST",   /^\/api\/debts$/,                    { dept: "accountant",   title: "Credit sale recorded",        entity: "creditTransactions", link: "/admin/finance.html" }],
  ["POST",   /^\/api\/debts\/pay$/,               { dept: "accountant",   title: "Debt payment recorded",       entity: "creditPayments", link: "/admin/finance.html" }],
  ["POST",   /^\/api\/salaries\/pay$/,            { dept: "accountant",   title: "Salary payment recorded",     entity: "salaryPayments", link: "/admin/salaries.html" }],
  ["POST",   /^\/api\/finance\/budgets$/,         { dept: "accountant",   title: "Budget created",              entity: "budgets",      link: "/admin/finance.html" }],
];

module.exports = {
  DEPARTMENTS, MANAGER_PERMISSIONS, METHOD_PERMISSION, STAFF_ROLES,
  COLLECTION_ROLES, OWNER_EXTRA_COLLECTIONS, canReadCollection, ACTIVITY_RULES,
};
