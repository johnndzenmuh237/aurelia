# Database Schema — Aurelia Hotel PMS (Firestore)

Firestore is schemaless, so this document is the source of truth for field
shapes — keep it updated when you add fields. All collections are at the
root level (no nested subcollections) to keep queries simple across roles.

## Core reservation flow

**rooms**
`{ number, displayNumber, roomTypeId, type, floor, building, capacity, rate, status,
   createdAt }`
`status`: available | reserved | occupied | dirty | cleaning | clean |
inspected | maintenance | outoforder
`number` is the internal unique identifier (e.g. `F3` for Fan Room 3, `A3`
for AC Room 3, `APT12` for Apartment 12) — Fan and AC rooms sharing the
same guest-facing number never collide because their internal `number` is
different. `displayNumber` is the guest-facing label ("Room 3", "Apartment
12"); the client also derives this automatically from `number` via
`Utils.formatRoomLabel()` wherever a room is displayed without a full room
document on hand (e.g. inside a reservation).

**roomTypes**
`{ name, category, description, basePrice, maxAdults, maxChildren, bedType,
   hasAC, hasFan, weeklyDiscountPercent, monthlyDiscountPercent, photoUrl,
   roomCount, active, photos[] }`
`category`: room | apartment — apartments are self-contained units with a
kitchenette, priced and displayed the same way as rooms but flagged
separately on the public site's filter and in the admin room-types list.
`weeklyDiscountPercent` / `monthlyDiscountPercent`: applied automatically
by `server/utils/calculations.js#quoteRoom` once a stay reaches 7 or 28
nights respectively — this is what powers the nightly/weekly/monthly rate
card shown on the room details page.

**reservations**
`{ reservationCode, guestId, guestUid, guestName, phone, email, room,
   roomTypeId, roomTypeName, checkIn, checkOut, adults, rate, total, paid,
   balance, deposit, source, status, paymentStatus, folioStatus,
   specialRequests, vip, createdAt, checkedInAt, checkedOutAt }`
`status`: Pending | Confirmed | Checked In | Checked Out | Cancelled |
No Show | Waitlisted
`source`: DIRECT | WALK-IN | PHONE | EMAIL | AGENT | CORPORATE | OTA

**guests**
`{ guestCode, uid, fullName, phone, email, nationality, tier,
   totalStays, totalSpend, bedPreference, createdAt }`

**folioItems**
`{ reservationId, category, description, amount, createdAt }`
`category`: room | tax | restaurant | laundry | minibar | other

**invoices**
`{ invoiceNumber, reservationId, guestId, guestUid, guestName, total,
   paid, balance, status }`
`status`: unpaid | partially_paid | paid

**payments**
`{ paymentRef, reservationId, guestUid, guestName, amount, currency,
   method, status, providerExternalId, providerReference, createdAt,
   confirmedAt }`
`method`: mtn_momo | orange_money | cash | card | bank_transfer
`status`: pending | confirmed | failed

**refunds**
`{ paymentId, reservationId, guestName, amount, reason, authorizedBy,
   createdAt }`

## Operations

**housekeepingTasks** `{ room, taskType, assignedTo, priority, status,
   reason, createdAt, startedAt, completedAt }`

**maintenanceRequests** `{ room, issue, priority, assignedTechnician,
   status, estimatedCost, actualCost, createdAt, completedDate }`

**orders** (restaurant) `{ type, items[], table, guestName, total, status,
   kitchenStatus, createdAt }` — plus, when `type: "delivery"`:
`{ orderNumber, fullName, phone, whatsapp, email, deliveryAddress, notes,
   itemsTotal, deliveryFee, paymentStatus, deliveryStatus }`
`deliveryStatus`: pending | out_for_delivery | delivered

**menuItems** `{ name, category, day, price, description, photoUrl, available }`
`day` (optional): Monday..Sunday — only set on Breakfast/Lunch/Dinner
items that rotate daily; omit for items served every day (Drinks,
Desserts, or a dish available all week).

**inventoryItems** `{ sku, name, category, quantity, minStock, unitCost,
   sellingPrice, location }`

**inventoryTransactions** `{ item, type, quantity, reference, createdAt }`

**suppliers** `{ name, contact, phone, email, balance }`

**purchaseOrders** `{ poNumber, supplier, total, status, createdAt }`

**expenses** `{ category, amount, supplier, description, approvalStatus,
   createdAt }`

## People

**users** `{ email, role, fullName, phone, employeeId, createdAt }`
`role`: super_admin | manager | front_desk | reservations | housekeeping |
maintenance | restaurant | hr | accountant | employee | guest

**employees** `{ employeeCode, uid, fullName, phone, email, position,
   department, salary, allowances, bonuses, deductions, status,
   emergencyContact }`

**employeeApplications** `{ fullName, phone, email, position, experience,
   status, createdAt }`
`status`: Received | Shortlisted | Interview | Approved | Hired | Rejected

**employeeAttendance** `{ employeeId, date, checkIn, checkOut, status }`

**schedules** `{ employeeId, employeeName, department, shift, day }`

**payroll** `{ period, lines[], employeeCount, totalNet, status }`
`status`: Draft | Approved | Paid

**salaryHistory** `{ employeeId, employeeName, oldSalary, newSalary,
   effectiveDate }`

## Guest-facing extras

**guestRequests** `{ guestUid, guestName, room, category, priority,
   description, status, createdAt }`

**lostAndFound** `{ item, foundLocation, description, status, createdAt }`

**laundryOrders** `{ guestName, room, items, price, status }`

**minibarItems** `{ room, item, quantity, price }`

**promotions** `{ name, discountPercent, startDate, endDate, active }`

**promoCodes** `{ code, discountPercent, usageCount, active }`

**corporateAccounts** `{ company, contactPerson, email, phone,
   creditLimit, paymentTerms }`

**groupBookings** `{ groupName, roomCount, checkIn, checkOut, status }`

**events** `{ eventName, client, date, guestCount, charges }`

**barInventory** `{ category, brand, unit, quantity, unitPrice, totalValue,
   quantitySold, totalSalesRevenue }`
`category`: Whiskey | Champagne | Beer | Juice. `totalValue` and
`totalSalesRevenue` are maintained automatically by
`server/services/barService.js` — never edited directly.

**barSales** `{ itemId, category, brand, unit, quantitySold, unitPrice,
   total, soldBy, soldByName, createdAt }` — one row per physical sale
(spec §14: drinks are never sold online, only recorded by bar staff).

**aiInsights** `{ level, title, message, category, period, generatedBy,
   createdAt }` — one document per insight per generation run, written by
`server/services/aiInsightService.js`. `level`: good | warning | critical.
`period`: today | week | month | year.

## Financial management, debt/credit & salary payments (extension)

**expenses** `{ description, category, amount, date, paymentMethod,
   supplier, employee, reference, notes, createdBy, createdAt }` — the
category should be one of `financeService.DEFAULT_EXPENSE_CATEGORIES`
(configurable per-hotel via `settings/hotel.expenseCategories`).
Created via the existing `POST /api/reports/finance`; listed via the new
`GET /api/finance/expenses`. Revenue and expense totals used across the
income statement, monthly/yearly reports and budgets are always computed
live server-side in `server/services/financeService.js` — never stored
as a running total that could drift.

**budgets** `{ category, amount, period ("month"|"custom"), month,
   from, to, createdBy, createdAt }` — spend/remaining/usedPercent/
overBudget are derived live from `expenses` (see `budgetStatus()` in
`financeService.js`), never stored, so they can't go stale. Crossing 90%
used or going over drops a `budget_alert` row into `notifications`.

**creditTransactions** `{ customerName, phone, product, inventoryItemId,
   quantity, unitPrice, total, paid, remaining, status, dueDate, notes,
   createdBy, createdAt }` — a product/service sold on credit (spec §18).
`status` (`UNPAID` | `PARTIALLY_PAID` | `OVERDUE` | `PAID`) is derived from
`paid` vs `total` by `debtService.creditStatus()`. Paid-off transactions
are kept (never deleted) for history/auditing (spec §19).

**creditPayments** `{ creditTransactionId, amount, method, createdBy,
   createdAt }` — one immutable row per payment against a credit
transaction.

**salaryPayments** `{ payrollId, employeeId, employeeName, amount,
   method, period, createdBy, createdAt }` — one row per salary payment.
The authoritative running balance for each employee lives on that
employee's line inside the `payroll` document itself
(`paidSoFar` / `remaining` / `salaryStatus`), updated transactionally by
`server/services/salaryPaymentService.js` so two payments can never
together overpay a salary line.

**whatsappLogs** `{ to, message, status, error, createdAt }` — every
WhatsApp send attempt (`sent` | `sent_on_retry` | `failed_after_retry` |
`skipped_no_number` | `skipped_not_configured`), written by
`server/services/whatsappService.js`. A failure here never blocks or
reverses the booking/payment it's attached to (spec §9).

The receptionist WhatsApp number is admin-configurable at
`settings/hotel.whatsapp.receptionistNumber` (written via the existing
`PUT /api/reports/finance { settings }` route), falling back to
`RECEPTIONIST_WHATSAPP_NUMBER` in `.env` only if never set in-app.

## Departments, sales, real report exports & audit-trail completeness (extension)

**departments** `{ name, ... }` — first-class managed entity (spec §22):
`GET/POST/PUT /api/departments`. Previously this collection was
read-only via the staff data API with no way to create or edit one.

**sales** `{ product, inventoryItemId, quantity, unitPrice, total,
   reference, customerName, paymentMethod, amountPaid, balance,
   creditTransactionId, staffUid, staffName, notes, createdAt }` — general
product/service sales distinct from the existing bar/restaurant sale
flows (spec §23). If `amountPaid < total`, the unpaid remainder is
automatically recorded as a `creditTransactions` row (spec §25) — stock
is decremented exactly once, by the sale itself, never twice.
`financeService.calculateIncomeStatement()` now includes this channel,
reporting booked revenue, cash actually received, and the outstanding
receivable separately, per spec §25's "distinguish between revenue,
cash received, and outstanding receivables."

**Reports Center exports** (spec §27): `GET /api/reports/:key?format=csv|pdf`
now actually generates and streams a file (previously a stub
acknowledgement). Keys: `expenses`, `sales`, `debts`, `salaries`,
`inventory`. New `server/utils/csv.js` (dependency-free CSV writer) and
`renderTablePdf()` added to the existing `server/utils/pdf.js`.

**Audit trail additions** (spec §28): login, booking modified/cancelled,
employee hired/modified, and hotel-settings changes now call
`logAction()` — previously only a subset of money-moving actions did.
Routine list/detail reads and the guest's own self-service profile edit
are intentionally still not logged (matches the existing convention:
`auditLogs` records staff-initiated, state-changing actions).

## Bar management upgrade & manual Mobile Money confirmation (extension)

**barInventory** (existing collection, EXTENDED — backward-compatible):
items created the original simple way (`category`, `brand`, `unit`,
`quantity`, `unitPrice`) keep working unchanged. New, optional universal-
engine fields (bar spec §9): `containerName`, `unitsPerContainer`,
`costPerContainer`, `sellingPricePerUnit` (mirrors `unitPrice`),
`minStockContainers`. `quantity` remains the single source of truth for
stock on hand either way — there is no separate parallel "stock" field.
Figures (unit cost, stock status, expected profit, container+loose-unit
stock label) are always derived live by `computeDrinkFigures()` in
`server/utils/calculations.js`, never stored.

**barCategories** `{ name, isDefault, createdAt }` — manager-configurable
drink categories (bar spec §3), auto-seeded with the spec's 8 defaults
(Beer, Juice, Whiskey, Champagne, Soft Drinks, Water, Energy Drinks,
Other Drinks) on first use.

**barInventoryTransactions** `{ itemId, type ("opening_stock"|"restock"),
   containers, unitsPerContainer, unitsAdded, costPerContainer, supplier,
   createdBy, createdAt }` — permanent restock history (bar spec §19);
stock increases are never a silent edit to `quantity` alone.

**barStockAdjustments** `{ itemId, deltaUnits, reason, notes, createdBy,
   createdAt }` — controlled corrections for breakage/damage/expiry/
comps/missing stock/manual fixes (bar spec §20), transactional so stock
can never go negative.

**barSales** (existing collection, EXTENDED): now also stores
`paymentMethod` (cash/mtn_momo/orange_money/card/other, bar spec §21)
and `unitCostAtSale` (snapshotted at sale time, same historical-accuracy
principle as room-booking payments — a later price/cost edit never
rewrites a past sale's profit).

New endpoints: `GET/POST /api/bar/categories`, `POST /api/bar/restock`,
`POST /api/bar/adjust`, `GET /api/bar/dashboard` (today/month bar
sales+profit, low/out-of-stock), `GET /api/bar/seller-performance`,
`GET /api/bar/inventory` (figures-attached list, for any future
non-live-listener consumer). New frontend: `public/admin/bar-pos.html`
(fast-sell screen — category tabs, large tiles, +1/+2/+5/custom
quantity) alongside the original `bar-sales.html` form and the upgraded
`bar-inventory.html` (categories, container fields, Restock/Adjust
actions).

**Manual Mobile Money payment confirmation** (replaces the automatic-
webhook flow as the primary path in `booking.html`, since that flow
requires real MTN/Orange merchant API credentials most small hotels
won't have on day one — `initiatePayment`/the webhook path are
untouched and still available if/when real credentials exist):
`payments` (existing collection) gets two new possible `status` values,
`pending_manual_review` and `rejected`, plus `transactionId`,
`senderPhone`, `manualSubmission: true` when submitted this way.

**paymentReferences** `{ paymentId, reservationId, createdAt }` — doc ID
is the normalized transaction ID; its sole purpose is duplicate-
submission protection (the same anti-fraud pattern used elsewhere:
Firestore itself rejects a second submission of the same transaction
ID, not just a client-side check).

New endpoints: `POST /api/payments/manual-submit` (public — guest
submits after sending money), `POST /api/payments/manual-confirm` /
`POST /api/payments/manual-reject` (staff), `GET /api/payments/pending-manual`.
New frontend: `public/admin/pending-payments.html`; `booking.html`'s
payment step now shows the hotel's MTN/Orange number (from
`settings/hotel.payment.{mtnNumber,orangeNumber,...}`, admin-editable via
the existing `PUT /api/reports/finance { settings }` route), a
transaction-ID help box with a worked example, and a confirmation-delay
call-only phone number (`settings/hotel.payment.confirmationPhone`).

## System

**notifications** `{ type, message, read, createdAt }`

**auditLogs** `{ userId, userName, action, entity, entityId,
   previousValue, newValue, createdAt }` — write-only from the server,
readable only by super_admin.

**counters** `{ value }` — server-only, backs sequential ID generation
(server/utils/idGenerator.js).

**settings** `{ hotelName, currency, taxRate, timezone, noShowCutoff }`
