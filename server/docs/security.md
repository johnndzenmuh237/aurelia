# Security

## Where enforcement actually happens

| Concern | Enforced by |
|---|---|
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

## Rate limiting

`server/middleware/rate-limit.js` applies to unauthenticated,
public-facing endpoints (booking creation, payment initiation, job
applications) to reduce abuse. It's in-memory per server instance — see
the comment in that file for what to change if you scale horizontally.

## Password handling

Password hashing and session/token issuance are handled entirely by
Firebase Authentication — this project never stores or handles raw
passwords itself.

## Reporting a vulnerability

If you find a security issue in your deployment, do not open a public
issue — contact your development team directly first.
