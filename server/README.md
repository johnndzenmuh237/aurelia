# Aurelia Hotel — Hotel Management System (HMS/PMS)

A complete hotel operating system: public booking website, admin PMS
(reservations, rooms, housekeeping, restaurant/POS, inventory, HR/payroll,
finance, reports), a guest self-service portal, and an employee portal —
all backed by one Node/Express + Firebase Firestore API, with MTN Mobile
Money and Orange Money as the payment providers.

## Quick start

```bash
npm install
cp .env.example .env        # fill in your Firebase + payment credentials
npm run seed                # optional: 100 rooms, 200 guests, 100 reservations of demo data
node scripts/create-admin.js you@example.com "Your Name"
npm run dev                 # API on http://localhost:4000
npx serve public             # frontend on http://localhost:3000 (or similar)
```

Full walkthrough: [`docs/installation.md`](docs/installation.md).
Deploying to production: [`docs/deployment.md`](docs/deployment.md).

## Project structure

```
public/         Static frontend — public site, /admin, /guest, /employee portals
server/         Express API — config, middleware, controllers, services, models, utils, jobs
api/            Single Vercel serverless entry point wrapping server/app.js
database/       Firestore rules, indexes, schema doc, seed script
functions/      Optional Firebase Cloud Functions (scheduled jobs, defensive triggers)
scripts/        CLI utilities (create-admin, seed, migrate)
docs/           Installation, deployment, API, database, payments, security, user manual
tests/          Jest tests for the core business logic
```

## What's real vs. what you need to configure

Every core workflow in this project — search availability, book a room,
take a Mobile Money deposit, check in, post restaurant/laundry charges to
a folio, check out, cascade housekeeping, run payroll, run the night
audit — is wired to a real Express API backed by real Firestore data.
Nothing on the dashboards is hard-coded; if a collection is empty, the
number is genuinely 0.

Two things need your own credentials before they move real
money/messages, by design (see the relevant docs):

- **MTN Mobile Money / Orange Money** — `docs/payments.md`. Until
  configured, `/api/payments/create` returns a clear "not configured"
  error rather than pretending a payment succeeded.
- **Email/SMS notifications** — set `SMTP_*` in `.env`; without it, the
  system silently falls back to in-app notifications only (never fails
  the underlying booking/payment because a notification couldn't send).

## Demo / test accounts

None are seeded automatically — create your first admin with
`node scripts/create-admin.js`, then create additional staff accounts
through Employees → Applications (or directly via `/api/employees/hire`)
once you're signed in. Guests self-register at `/register.html`.

## Scope note

This is a genuinely functional starting point for a real hotel PMS, built
to the file structure and workflow described in the project spec — not a
static UI mockup. That said, "complete production ERP" at the full 87-
section scope described (live OTA/channel-manager sync with
Booking.com/Expedia, full PDF/CSV export pipelines, a fully themed React
Design flow, etc.) is genuinely months of ongoing engineering, not a
single build. Where something is a stub or needs your input to go fully
live, it's labeled clearly in the code and docs — nothing is silently
faked.
