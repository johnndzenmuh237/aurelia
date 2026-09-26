# User Manual

## Signing in

Go to `/login.html`. Your role (set when your account was created)
determines where you land after signing in — front desk staff go to the
dashboard, housekeeping to the housekeeping board, restaurant staff to
the POS, and so on.

## Front Desk

- **New booking over the phone/in person**: Admin sidebar → Reservations
  → Walk-ins. Search dates, pick a room, enter guest details, take a
  deposit, and it checks them in immediately if you choose.
- **Guest arriving with an existing booking**: Reservations → Arrivals →
  click **Check In** next to their name.
- **Guest leaving**: Reservations → Departures → settle any balance, then
  **Check Out**. The room automatically becomes "dirty" and a
  housekeeping task is created — you don't need to do anything else.
- **Where's my guest's bill?**: open their reservation from All
  Reservations to see the folio total and balance live.

## Housekeeping

- Go to Housekeeping → Dashboard. Rooms needing attention are shown as
  tiles.
- Finished cleaning a room? Click **Mark Clean**.
- A supervisor then clicks **Mark Inspected**, then **Release Room** to
  put it back into sellable inventory.
- Your personal task list is under the Employee portal → My Tasks (if
  you're logged in as an employee/housekeeping role rather than admin).

## Restaurant

- POS (Restaurant → POS): tap menu items to build an order, then either
  **Charge to Room** (posts straight to the guest's folio) or **Paid Now**
  for walk-in restaurant customers.
- Kitchen (Restaurant → Kitchen): drag orders through New → Preparing →
  Ready → Delivered.

## HR

- New hire from a job application: Employees → Applications → change
  status to **Hired** — this automatically creates the employee record,
  you don't need to re-type anything.
- Attendance and schedules are under Employees → Attendance / Schedules.

## Accountant / Finance

- Finance → Overview shows revenue by department, ADR, RevPAR and
  outstanding balances, computed live.
- Payroll: generate a draft run under Payroll → Payroll, review the
  totals, then approve it.

## Manager / Super Admin

- Everything above, plus Settings (hotel profile, tax rate, payment
  provider status) and Audit Logs (who changed what, and when — read-only,
  cannot be edited by anyone).
- Night Audit: run manually any time from Night Audit, or let the
  scheduled Cloud Function run it automatically at 2 AM if you've deployed
  Firebase Functions.

## Guests

- Book at `/rooms.html` → pick dates → pick a room → pay a deposit with
  MTN Mobile Money or Orange Money → done.
- Manage everything afterward from `/guest/dashboard.html`: reservations,
  active folio, payment history, receipts, and service requests (extra
  towels, room cleaning, etc.).
