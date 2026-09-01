# Database Schema — Aurelia Hotel PMS (Firestore)

Firestore is schemaless, so this document is the source of truth for field
shapes — keep it updated when you add fields. All collections are at the
root level (no nested subcollections) to keep queries simple across roles.

## Core reservation flow

**rooms**
`{ number, roomTypeId, type, floor, building, capacity, rate, status,
   createdAt }`
`status`: available | reserved | occupied | dirty | cleaning | clean |
inspected | maintenance | outoforder

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

**orders** (restaurant) `{ items[], table, guestName, total, status,
   kitchenStatus, createdAt }`

**menuItems** `{ name, category, price, description, photoUrl, available }`

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

## System

**notifications** `{ type, message, read, createdAt }`

**auditLogs** `{ userId, userName, action, entity, entityId,
   previousValue, newValue, createdAt }` — write-only from the server,
readable only by super_admin.

**counters** `{ value }` — server-only, backs sequential ID generation
(server/utils/idGenerator.js).

**settings** `{ hotelName, currency, taxRate, timezone, noShowCutoff }`
