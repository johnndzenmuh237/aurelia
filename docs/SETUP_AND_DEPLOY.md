# Setup, Run, Deploy & Push to Git — Full Guide

This consolidates `docs/installation.md` + `docs/deployment.md` into one
copy-paste path, and adds the steps specific to this session's extension
(financial management, debt/credit, salary payments, WhatsApp
notifications, departments, sales, report exports). Read the two docs
above for background on any step; this file is the "just run these
commands" version.

A git repo has already been initialized in this folder for you (one
commit, branch `main`, `.env` correctly excluded) — skip straight to
**Part 5** if you just want the git push commands.

---

## Part 1 — Prerequisites

- Node.js 18+
- A Firebase project, Firestore enabled, **Blaze** (pay-as-you-go) plan
  if you want the Cloud Functions in `functions/` (night audit, low-stock
  sweep, stale-payment expiry) — the core app runs fine on the free
  Spark plan without them.
- `firebase-tools`: `npm install -g firebase-tools`
- (Optional) MTN Mobile Money developer account + Orange Money merchant
  account, for real payments.
- (Optional, new) a Meta developer account for the **WhatsApp Cloud
  API**, for the receptionist booking-notification feature.

## Part 2 — Install & configure

```bash
cd aurelia
npm install
cd functions && npm install && cd ..
```

Create your Firebase project (console.firebase.google.com), enable
Firestore only (not Auth, not Storage — this project doesn't use them),
then Project Settings → Service Accounts → Generate new private key.

```bash
cp .env.example .env
```

Fill in `.env`:
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
  from the service-account JSON you just downloaded.
- `JWT_SECRET` — generate with `npm run generate-secret`.
- One password per staff role (`MANAGER_PASSWORD`, `FRONT_DESK_PASSWORD`,
  `HOUSEKEEPING_PASSWORD`, `MAINTENANCE_PASSWORD`, `RESTAURANT_PASSWORD`,
  `HR_PASSWORD`, `ACCOUNTANT_PASSWORD`, `RESERVATIONS_PASSWORD`,
  `EMPLOYEE_PASSWORD`) — run `npm run generate-secret` again per role, or
  pick your own strong values. This is the entire staff login system.
- MTN/Orange Mobile Money keys — leave blank to develop without real
  payments (booking flow still works end-to-end up to the payment step).
- **New this pass** — WhatsApp Cloud API, optional:
  ```env
  WHATSAPP_API_URL=https://graph.facebook.com/v20.0
  WHATSAPP_ACCESS_TOKEN=          # from developers.facebook.com > WhatsApp > API Setup
  WHATSAPP_PHONE_NUMBER_ID=
  RECEPTIONIST_WHATSAPP_NUMBER=   # fallback only — see below
  ```
  Leave `WHATSAPP_ACCESS_TOKEN` blank to develop without it: bookings and
  payments work exactly the same, the WhatsApp step is skipped and logged
  to the `whatsappLogs` collection instead of failing anything. The
  **real** receptionist number should be set from the app once it's
  running, not just the `.env` fallback:
  ```bash
  # after logging in as manager/super_admin and grabbing the JWT:
  curl -X PUT http://localhost:4000/api/reports/finance \
    -H "Content-Type: application/json" \
    -H "Cookie: token=<your JWT>" \
    -d '{"settings": {"whatsapp": {"receptionistNumber": "+237XXXXXXXXX"}}}'
  ```

Open `public/js/config.js` and fill in the Firebase **web app** config
(Console → Project Settings → General → Your apps → Web app). This is
not secret — `firestore.rules` denies all direct client access
regardless.

## Part 3 — Deploy Firestore rules/indexes & seed data

```bash
firebase login
firebase use --add            # pick your project, give it an alias
firebase deploy --only firestore:rules,firestore:indexes
npm run seed                  # optional: demo rooms, guests, bar stock, menu
```

No `firestore.rules` changes were needed for this session's new
collections (`budgets`, `creditTransactions`, `creditPayments`,
`salaryPayments`, `whatsappLogs`, `sales`, `departments`) — the existing
rules file already denies all direct client reads/writes with a
catch-all, so every new collection is covered automatically. Re-running
the deploy command above is still safe/idempotent if you want to be sure.

## Part 4 — Run it

```bash
npm run dev              # API at http://localhost:4000, auto-reload
```

```bash
npx serve public         # separate terminal: serves the frontend
```

If serving the frontend separately, set `apiBaseUrl` in
`public/js/config.js` to `http://localhost:4000/api`. Then:

```bash
npm test                 # pure-logic test suite (payments, payroll,
                          # credit/debt status, budget %, salary balance,
                          # CSV export — no live Firestore needed)
npm run lint
```

Go to `/login.html`, pick a role, use the password you set in `.env`.
Nothing to "create" — there are no staff accounts, just shared
role-passwords (see `docs/security.md`).

### Quick smoke test of this session's new endpoints

```bash
# income statement for a date range
curl "http://localhost:4000/api/finance/income-statement?from=2026-09-01&to=2026-09-30" \
  -H "Cookie: token=<manager or accountant JWT>"

# a real, downloadable CSV
curl "http://localhost:4000/api/reports/expenses?format=csv" \
  -H "Cookie: token=<manager or accountant JWT>" -o expenses.csv

# a real, downloadable PDF
curl "http://localhost:4000/api/reports/debts?format=pdf" \
  -H "Cookie: token=<manager or accountant JWT>" -o debts.pdf
```

## Part 5 — Push to git

Everything is already committed locally (branch `main`, one commit). You
just need to point it at your own remote and push — I can't do this last
step for you: this sandbox has no outbound network access, and pushing
requires *your* GitHub/GitLab credentials, which I don't have and
shouldn't.

**Create an empty remote repo first** (GitHub: New repository, do NOT
initialize with a README/license/gitignore — you already have all
three), then:

```bash
cd aurelia
git remote add origin git@github.com:<your-username>/<your-repo>.git
git push -u origin main
```

Using HTTPS instead of SSH:

```bash
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

If your default branch is `master` on the remote instead of `main`:

```bash
git branch -M main          # already done, included for reference
git push -u origin main
```

Double-check `.env` never gets committed by accident — it's already in
`.gitignore` and wasn't part of the initial commit, but it's worth one
more look before your first push:

```bash
git status                  # .env should NOT appear here
git ls-files | grep '\.env$'   # should print nothing
```

From here on, your normal workflow:

```bash
git add -A
git commit -m "your message"
git push
```

## Part 6 — Deploy (Vercel + Firebase)

Full detail in `docs/deployment.md` — summary:

```bash
# 1. Push to GitHub/GitLab (Part 5 above), then:
# 2. https://vercel.com/new -> import the repo -> framework preset "Other"
# 3. Project Settings -> Environment Variables -> add EVERY var from
#    .env.example (including the new WHATSAPP_* / RECEPTIONIST_WHATSAPP_NUMBER
#    ones), for Production (and Preview if you want staging to work)
# 4. Set PUBLIC_APP_URL to your real domain
# 5. Deploy
```

Then register payment webhooks (`docs/payments.md`) and, if you're using
real WhatsApp sending, confirm `WHATSAPP_ACCESS_TOKEN` /
`WHATSAPP_PHONE_NUMBER_ID` are set in Vercel's environment variables too
— without them the app still runs fine, it just skips the WhatsApp send
and logs why.

Firebase side (rules/indexes/functions) deploys separately, straight
from your machine, same as Part 3 — Vercel only hosts the app + API, not
your Firestore project.

## Known limitation carried over from previous passes

None of the above includes the PostgreSQL migration discussed earlier —
that's still an open decision on your end, not started.
