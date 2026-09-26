# CHANGELOG — Departments, Sales Management, Real Report Exports & Audit-Trail Completeness

Second additive pass, on top of the financial/debt/salary/WhatsApp pass
above. Still no Postgres migration — same reasoning as before, and this
pass didn't touch that decision either.

## Added

- **Departments** (spec §22) as a first-class managed entity:
  `server/controllers/opsControllers.js` `departmentsHandler` +
  `GET/POST/PUT /api/departments`. Previously the `departments`
  collection existed only as a name in the staff read-allowlist with no
  way to create or edit one.
- **Sales management** (spec §23-25): `server/services/saleService.js`,
  `POST/GET /api/sales`. Decrements linked inventory atomically; any
  unpaid balance auto-creates a `creditTransactions` row via the existing
  `debtService.createCreditTransaction()` without double-decrementing
  stock. Wired into `financeService.calculateIncomeStatement()` as a new
  revenue channel that reports booked vs. cash-received vs. outstanding
  receivable separately.
- **Real report exports** (spec §27): `GET /api/reports/:key?format=csv|pdf`
  now generates and streams an actual file for `expenses`, `sales`,
  `debts`, `salaries`, `inventory` — replacing the previous
  acknowledgement-only stub. New `server/utils/csv.js`; `renderTablePdf()`
  added to `server/utils/pdf.js` alongside the existing invoice renderer.
- **Audit-trail completeness** (spec §28): added `logAction()` calls for
  login, booking modified, booking cancelled, employee hired, employee
  modified, and hotel-settings changed. (Payments, refunds, payroll,
  budgets, credit sales/payments and salary payments were already logged
  by the earlier pass or the pre-existing code.)

## Known limitations / not done in this pass

- Frontend (admin dashboard pages) for departments/sales/report-export
  is not built — these are backend endpoints only, matching this
  project's existing pattern of backend-first, frontend-second delivery.
  Wire them into `public/admin/` when you're ready for the UI side.
- The deployment guide (§48) and the full "what was preserved / added /
  modified" audit document (§46-50) are still not produced as
  standalone artifacts — the CHANGELOG entries here serve that purpose
  for what's been done so far, but a consolidated document covering the
  *entire* original system (not just these two passes) hasn't been
  written.
- Every other still-open item from the previous CHANGELOG entry's
  "Known limitations" section remains open (Postgres migration, full
  responsive-design audit, remaining admin-configuration surfaces, etc.)

---

# CHANGELOG — Financial Management, Debt/Credit, Salary Payments & WhatsApp Notifications

Additive extension on top of the existing system — nothing below removes
or changes prior behavior; Firestore remains the database, unchanged.

## Added

- **Income statement & reports** (`server/services/financeService.js`,
  `server/controllers/financeController.js`): revenue is assembled
  server-side from confirmed `payments`, `barSales` and directly-paid
  `orders`, minus `expenses`, with no double-counting. New endpoints:
  `GET /api/finance/income-statement`, `GET /api/finance/report/monthly`,
  `GET /api/finance/report/yearly`, `GET /api/finance/expenses`,
  `GET /api/finance/expense-categories`.
- **Budgets** (spec §17): `POST/GET /api/finance/budgets`. Spend,
  remaining and used% are always derived live from `expenses` — never
  stored — and crossing 90% used (or going over) drops a
  `budget_alert` notification. Wired into the existing expense-create
  path in `opsControllers.financeHandler` as one additive check.
- **Debt/credit management** (spec §18-19,
  `server/services/debtService.js`): `POST /api/debts` (credit sale,
  decrements linked inventory in the same transaction),
  `POST /api/debts/pay` (partial or final payment), `GET /api/debts`
  (combined outstanding customer debts + outstanding salaries).
- **Salary payment tracking** (spec §20-21,
  `server/services/salaryPaymentService.js`): `POST /api/salaries/pay`
  and `GET /api/salaries/outstanding` add partial-payment balances on top
  of existing Approved payroll runs — a line disappears from the
  outstanding list only once fully paid.
- **WhatsApp booking notifications** (spec §8-9,
  `server/services/whatsappService.js`): on payment confirmation for a
  room booking, sends the receptionist a WhatsApp message via the
  WhatsApp Cloud API (with one automatic retry) and drops an in-app
  notification either way. Never blocks or reverses the booking/payment
  it's attached to. Receptionist number is admin-configurable
  (`settings/hotel.whatsapp.receptionistNumber`), falling back to
  `RECEPTIONIST_WHATSAPP_NUMBER` in `.env`. Every attempt is logged to
  the new `whatsappLogs` collection.
- New collections: `budgets`, `creditTransactions`, `creditPayments`,
  `salaryPayments`, `whatsappLogs` — documented in
  `database/database-schema.md`, added to `dataController.js`'s staff
  read allowlist. No `firestore.rules` change needed: the existing
  catch-all `{document=**} { allow read, write: if false; }` already
  denies direct client access to any new collection.
- New env vars: `WHATSAPP_API_URL`, `WHATSAPP_ACCESS_TOKEN`,
  `WHATSAPP_PHONE_NUMBER_ID`, `RECEPTIONIST_WHATSAPP_NUMBER` (all
  optional — booking/payment flows work unchanged if left blank).
- `tests/finance.test.js`: pure-logic tests for credit/debt status,
  budget percentage math and salary-balance math, in the same
  Firestore-free style as the existing test suite.

## Known limitations / not done in this pass

- The Postgres migration described elsewhere in the spec was
  deliberately **not** performed — this codebase already made and
  documented the choice to keep Firestore as its database (only Firebase
  *Auth* was removed previously; see the changelog entry below). Doing a
  blind full rewrite of every controller/service to Postgres without a
  live environment to test against would be far riskier than valuable
  here. Flag if you do want that migration and it can be scoped as its
  own dedicated pass.
- CSV/PDF export for the new finance/debt/salary reports is not yet
  wired up (the pre-existing `reportByKey` export stub still applies —
  see its comment in `opsControllers.js`).
- Credit-sale creation is currently scoped to `manager`, `accountant`
  and `restaurant` roles; adjust `requireRole(...)` in `server/app.js`
  if other roles should be able to record a credit sale.

---

# CHANGELOG — Firebase Authentication Removed, Legal & Security Hardening

This is a major architecture change: **Firebase Authentication and
Firebase Storage are gone entirely.** Staff now sign in with one shared
password per team (no accounts, no signup). Firestore stays as the
database — that was never the source of the setup pain, so it wasn't
touched. Also added: full legal/compliance pages and a security hardening
pass.

## Staff login — completely rebuilt

- `/login.html` is now a role picker + name + shared password form.
  There is no signup, ever.
- Each team's password lives in server environment variables
  (`MANAGER_PASSWORD`, `FRONT_DESK_PASSWORD`, `HOUSEKEEPING_PASSWORD`,
  `RESTAURANT_PASSWORD`, `HR_PASSWORD`, `ACCOUNTANT_PASSWORD`,
  `RESERVATIONS_PASSWORD`, `MAINTENANCE_PASSWORD`, `EMPLOYEE_PASSWORD`,
  `SUPER_ADMIN_PASSWORD`). Generate strong ones with `npm run
  generate-secret`.
- A correct password issues a JWT (`server/controllers/
  authController.js`, `server/middleware/auth.js`) carrying only
  `{ role, name }` — "name" is free text typed at login for audit-trail
  display, not a unique identity.
- `scripts/create-admin.js` (Firebase-Auth-specific) removed; replaced
  with `scripts/generate-secret.js` for generating passwords/secrets.

## The hard part: staff data access without Firebase Auth

Removing Firebase Auth meant Firestore's own security rules could no
longer tell "a logged-in staff member" from "anyone with the public
Firebase config" — that distinction used to come entirely from Firebase
Auth. Fixed by:

- **New endpoint**: `GET /api/staff/data/:collection`
  (`server/controllers/dataController.js`) — JWT-protected, reads any
  allow-listed collection. This is now how every admin/employee page
  gets its data for anything sensitive.
- **`Utils.pollCollection()`** added to `public/js/utils.js` — fetches
  immediately then re-fetches every 8s, matching the callback shape
  `onSnapshot` used to provide, so pages could be converted with minimal
  disruption. Real-time push updates became 8-second polling as a
  result — a deliberate, disclosed tradeoff.
- **`database/firestore.rules` rewritten**: only `rooms`, `roomTypes`,
  `menuItems`, `barInventory`, `promotions`, `settings` (genuinely public
  data, no login needed at all) are directly readable by the browser.
  Everything else — reservations, guests, payments, payroll, audit logs,
  everything — is `allow read, write: if false` at the database level.
  The server (Admin SDK) bypasses this as always.
- **Every page converted**: `admin-crud.js` (covers ~35 generic admin
  pages in one change) plus every bespoke page that read a staff-only
  collection directly — dashboard, reservations, arrivals, departures,
  in-house, reservation-calendar, restaurant kitchen board, delivery
  orders, bar sales, finance, analytics, and all 4 employee portal pages.
  Verified with an automated scan: zero remaining direct reads on
  sensitive collections.

## Guest accounts removed

- `register.html` and the entire `/guest/` account-based portal deleted
  — guests never had to create accounts for booking or food delivery
  (that already worked as guest checkout), but the old guest *dashboard*
  required a Firebase Auth login, which no longer exists.
- **New**: `/track-booking.html` — guests check their reservation status
  with just their reservation code + phone number, no login, via a new
  public `GET /api/bookings/lookup` endpoint.
- Header/footer "Sign in" relabeled "Staff Login" to avoid implying
  guests need an account; "Create account" link removed, replaced with
  "Track my booking".

## Legal & compliance pages (new)

- `/privacy-policy.html`, `/terms.html`, `/refund-policy.html`,
  `/cookies-policy.html` — written specifically for what this site
  actually does (guest checkout, MTN/Orange payment, Firestore storage,
  no tracking cookies), not generic boilerplate.
- A cookie consent banner (`public/js/cookie-consent.js`) now loads on
  every public page automatically via `layout.js` — no per-page changes
  needed.
- All four legal pages linked in the site footer and added to
  `sitemap.xml`.

## Security hardening

- `app.disable("x-powered-by")` added — hides Express fingerprinting.
- `npm audit` run; `firebase-admin` bumped as far as possible (12.7.0)
  without breaking the Admin SDK init used here — v14+ has a breaking
  API change that crashes on boot, documented in `docs/security.md`
  rather than silently shipped or silently ignored. Remaining moderate/
  high advisories are in a transitive, unused (`@google-cloud/storage`)
  dependency bundled inside `firebase-admin` itself.
- Verified every production dependency is actually used — no dead
  packages shipped.
- `docs/security.md` rewritten to document exactly how the new login
  system works and where every security boundary actually lives.

## Verified

48 tests across 9 suites passing. 85 HTML pages, zero parse errors, zero
JS syntax errors. Full end-to-end curl test of the login flow: correct
password succeeds, wrong password rejected, unconfigured role rejected,
protected routes reject requests with no token and accept requests with
a valid one, and the staff-data endpoint correctly rejects unlisted
collection names before ever touching the database.

## What you need to do differently now

- Your `.env` needs new variables: `JWT_SECRET` and one password per
  role — see the updated `.env.example`. Nothing about your Firebase
  project setup changes (still Firestore only, same credentials).
- You do **not** need to enable Firebase Authentication or Storage in
  the Firebase Console at all anymore — if you already did, you can
  leave them off/unused, they're simply not referenced by this code.
- Re-deploy the updated `database/firestore.rules` (`firebase deploy
  --only firestore:rules`) — the old rules referenced Firebase Auth in a
  way that will now always deny access; the new rules are what makes
  staff pages work again.
- Full folder replace is recommended again this time, for the same
  reason as before — see the previous CHANGELOG for the exact steps
  (delete everything except `.env` and `.git`, extract, copy in, `npm
  install`, `npm run dev`, `git add . && git commit && git push`).
