# Business Owner, Managers, Notifications & Messaging

This extends the original system without replacing it. The shared role
passwords (front desk, housekeeping, …) still work exactly as before.

## 1. First-time owner setup

1. In the server environment set `OWNER_SETUP_TOKEN` to a long random value
   (`npm run generate-secret`) and restart.
2. Open `/owner/setup.html`, enter the token, your details and a private
   password (10+ characters, upper + lower case + a number).
3. Remove `OWNER_SETUP_TOKEN` afterwards. The page only works while **no
   owner exists**, and only one owner can ever be created.

Sign in at `/owner/login.html`. Forgot password: `/portal/reset-password.html`
(a 6-digit code is emailed — needs SMTP configured; single use, 15 minutes,
5 attempts). Without SMTP, run `node scripts/reset-owner-password.js` on the server.

## 2. Managers

Owner → **Managers** (`/owner/managers.html`):
create, edit, assign departments & permissions, reset password, revoke/restore,
**replace** (new manager inherits the departments; old one is deactivated),
and view a manager's recorded activity.

* A manager's **departments** are the same keys as the existing roles
  (`front_desk, reservations, housekeeping, maintenance, restaurant, hr, accountant`).
  A manager of `restaurant` can do exactly what the `restaurant` role can do — nothing else.
* **Permissions**: `view / create / edit / delete` (mapped to GET / POST+PUT / DELETE)
  and `approve` (manager-level routes that list only "manager").
* New accounts must change their temporary password at first sign-in.
* **Revoking never deletes records.** Accounts live in `staffAccounts`; business
  records only carry a `createdBy`/`updatedBy` text id. Access ends on the very
  next request (tokens are checked against the account on every call).
* Managers can never reach `/api/owner/*`, create an owner, or change roles.

## 3. Notifications

Every successful business action (rules in `server/config/access.js → ACTIVITY_RULES`)
creates a notification for that department's staff, its managers and the owner;
messages notify only their recipients. The bell appears on every page for any
signed-in person (`public/js/app-core.js`) and polls every 15 s.
Read/archive state is per person (per team for shared-password roles).

## 4. Messaging

`/portal/messages.html`. Owner ⇄ managers; managers → any department or team;
departments → their managers. Department staff use shared logins, so a
department is one shared **mailbox** (read state is shared inside it).
Announcements (owner/managers) are one-way to chosen departments.
The owner can switch on an oversight view of every conversation (read-only).

## 5. Data access

`GET /api/staff/data/:collection` is now scoped per role
(`COLLECTION_ROLES` in `server/config/access.js`). Before, any signed-in staff
member could read every collection (e.g. `employee` → payroll).

## 6. Security notes

* scrypt password hashing; 5 failed sign-ins lock an account for 15 minutes.
* Owner sessions last 8 h (30 min idle), managers 12 h (60 min idle).
* `DISABLE_SHARED_ROLE_LOGIN=true` turns the old shared passwords off once
  everyone has a personal account.
* **Rotate the Firebase service-account key** that was in the `.env` you shared.

## 7. Install as an app (PWA)

`manifest.webmanifest` + `sw.js` + icons. The install card appears only after the
browser itself offers installation, only when signed in, is remembered when
dismissed (14 days) and is never shown once the browser reports `appinstalled`.
iPhone/iPad (no install API) get a how-to hint. Live `/api` data is never cached.

## 8. Tests

`npm test` — `tests/owner-managers-messaging.test.js` runs the real Express app
against an in-memory Firestore (`tests/helpers/fakeFirestore.js`).
After adding pages run `node scripts/inject-app-shell.js` and
`node scripts/build-page-roles.js`.
