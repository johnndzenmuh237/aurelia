# Security

<<<<<<< HEAD
## How staff login works (no accounts, no Firebase Authentication)

There are no individual staff accounts. Each team (Manager, Front Desk,
Housekeeping, Restaurant & Bar, HR, Accountant, Employee, etc.) shares
**one password**, set by whoever administers the server in environment
variables (`MANAGER_PASSWORD`, `FRONT_DESK_PASSWORD`, ...). Generate
strong values with:

```bash
npm run generate-secret
```

A correct password at `/login.html` gets a JWT (signed with `JWT_SECRET`,
also in `.env`) containing `{ role, name }` — "name" is whatever the
person typed in, used only so the activity log and folio entries show
"Front Desk (Amina)" rather than an anonymous role. It is not a unique
identity and confers no extra access beyond the role.

**Rotating a password**: change the value in `.env` (and in your hosting
provider's environment variables) and redeploy — every existing session
for that team is invalidated once its JWT expires (12 hours) or you
change `JWT_SECRET` (which invalidates everything immediately).

=======
>>>>>>> cee3b36d42600e502dc7bbc822e817b33780b7d5
## Where enforcement actually happens

| Concern | Enforced by |
|---|---|
<<<<<<< HEAD
| Who can log in as which role | `server/controllers/authController.js` checks the submitted password against that role's `.env` value — never against Firebase |
| Who can call which API route | `server/middleware/roles.js` (`requireRole`) on every route in `server/app.js` — the client-side UI hiding a button is a convenience, not the boundary |
| Who can read staff-only data (reservations, guests, payments, payroll, etc.) | `server/controllers/dataController.js` — a JWT-protected endpoint. Firestore's own rules (`database/firestore.rules`) deny ALL direct client access to this data, because there is no more Firebase Auth session for Firestore's rules engine to check (see the comment at the top of that file for the full reasoning) |
| Which Firestore collections the browser can read directly | Only genuinely public data with no login required at all: `rooms`, `roomTypes`, `menuItems`, `barInventory`, `promotions`, `settings` — everything else is `allow read, write: if false` |
| Room availability / no double-booking | `server/services/availabilityService.js`, called server-side inside a Firestore transaction — never trusted from the client |
| Payment confirmation | `server/services/paymentService.js#confirmPayment` — only a verified provider status (webhook or authenticated status-check) flips a payment to `confirmed`; the frontend's own "success" response is never sufficient |
| Folio/invoice totals | Always recomputed server-side in `server/utils/calculations.js`, never accepted from the client |
| Audit trail | `server/utils/audit.js` writes to `auditLogs`, readable only through the JWT-protected staff data endpoint |

## Secrets

Real secrets (`JWT_SECRET`, role passwords, Firebase service account key,
MTN/Orange credentials, SMTP credentials) live only in server environment
variables (`.env` locally, your hosting provider's Environment Variables
in production) — see `.env.example`. They are never present in any file
under `public/`.

`public/js/config.js` contains the Firebase **web** config, which is not
a secret — it only identifies which Firestore project to talk to; access
is controlled by `firestore.rules` and the API, not by that config being
hidden.
=======
| Who can call which API route | `server/middleware/roles.js` (`requireRole`) on every route in `server/app.js` — the client-side UI hiding a button is a convenience, not the boundary |
| Who can read which Firestore collection directly | `database/firestore.rules` — the client SDK is used for live reads (`onSnapshot`); the Admin SDK (server) bypasses these rules entirely |
| Room availability / no double-booking | `server/services/availabilityService.js`, called server-side inside a Firestore transaction — never trusted from the client |
| Payment confirmation | `server/services/paymentService.js#confirmPayment` — only a verified provider status (webhook or authenticated status-check) flips a payment to `confirmed`; the frontend's own "success" response is never sufficient (spec §20) |
| Folio/invoice totals | Always recomputed server-side in `server/utils/calculations.js`, never accepted from the client |
| Audit trail | `server/utils/audit.js` writes to `auditLogs`, readable only by `super_admin`, and Firestore rules block all client writes to that collection entirely (spec §70) |

## Secrets

Real secrets (Firebase service account key, MTN/Orange credentials, SMTP
credentials) live only in server environment variables (`.env` locally,
Vercel/Firebase Environment Variables in production) — see
`.env.example`. They are never present in any file under `public/`.

`public/js/config.js` contains the Firebase **web** config, which is not
a secret — see the comment at the top of that file for why.
>>>>>>> cee3b36d42600e502dc7bbc822e817b33780b7d5

## Rate limiting

`server/middleware/rate-limit.js` applies to unauthenticated,
<<<<<<< HEAD
public-facing endpoints (booking creation, payment initiation, food
delivery orders, job applications, staff login attempts) to reduce abuse
and brute-forcing of role passwords. It's in-memory per server instance —
see the comment in that file for what to change if you scale horizontally.

## Password handling

There is no password *storage* in this system at all — role passwords
live only as plaintext environment variables on the server (never in
Firestore, never in a file that gets committed to git) and are compared
directly at login. This is an intentional tradeoff for a small shared-
password model: it means there's nothing to hash or leak from a database
breach, but it also means the passwords themselves must be kept as
carefully as any other secret — treat `.env` and your hosting provider's
environment variable settings with the same care as an API key.

## Dependency audit

Every production dependency is actually used (verified — no unused
packages shipped). Run `npm audit` periodically; as of this build there
are unresolved **moderate/high advisories in `firebase-admin`'s bundled,
transitive `@google-cloud/storage` dependency** (a package this project
never calls, since Firebase Storage was removed — see the top of this
file). Upgrading `firebase-admin` to the version that resolves them
(v14+) introduces a breaking API change that crashes on boot with the
Admin SDK initialization used here; a full upgrade needs its own testing
pass rather than a drive-by dependency bump. Track this and revisit when
you next touch `server/config/firebase.js`.

## Security headers, CORS, and input handling

- `helmet` is applied to every response (`server/app.js`) for standard
  security headers (CSP, X-Content-Type-Options, etc).
- CORS is enabled broadly since the API and frontend are deployed to the
  same origin in production; tighten `cors()` in `server/app.js` to a
  specific origin list if you ever split them across domains.
- Every write endpoint validates required fields (`server/middleware/
  validation.js`, `server/utils/errors.js#requireFields`) before touching
  the database.
- User-supplied text (guest names, notes, reviews) is stored as-is in
  Firestore and rendered via template strings in the frontend; Firestore
  has no query language injection risk (unlike SQL), and there is no
  `innerHTML` of raw, un-escaped user input on any page that displays
  guest-submitted free text without going through `textContent` or a
  controlled template — review any custom page you add against this
  before shipping it.
=======
public-facing endpoints (booking creation, payment initiation, job
applications) to reduce abuse. It's in-memory per server instance — see
the comment in that file for what to change if you scale horizontally.

## Password handling

Password hashing and session/token issuance are handled entirely by
Firebase Authentication — this project never stores or handles raw
passwords itself.
>>>>>>> cee3b36d42600e502dc7bbc822e817b33780b7d5

## Reporting a vulnerability

If you find a security issue in your deployment, do not open a public
issue — contact your development team directly first.
