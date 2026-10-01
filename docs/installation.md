# Installation

## Prerequisites

- Node.js 18+
- A Firebase project (free "Spark" plan works for development; use
  "Blaze" plan for production, required for Cloud Functions and outbound
<<<<<<< HEAD
  network calls to MTN/Orange) — used ONLY for Firestore, the database.
  Firebase Authentication and Storage are not used anywhere in this
  project (see `docs/security.md` for how staff login works instead).
=======
  network calls to MTN/Orange)
>>>>>>> cee3b36d42600e502dc7bbc822e817b33780b7d5
- `firebase-tools` CLI: `npm install -g firebase-tools`
- (Optional, for real payments) an MTN Mobile Money developer account and
  an Orange Money merchant account

## 1. Clone and install dependencies

```bash
<<<<<<< HEAD
cd aurelia
=======
cd hotel-management-system
>>>>>>> cee3b36d42600e502dc7bbc822e817b33780b7d5
npm install
cd functions && npm install && cd ..
```

## 2. Create a Firebase project

1. Go to https://console.firebase.google.com and create a new project.
<<<<<<< HEAD
2. Enable **Firestore Database** (production mode). That's it — do NOT
   enable Authentication or Storage; this project doesn't use them.
3. Go to Project Settings → Service Accounts → **Generate new private
   key**. This downloads a JSON file with your admin credentials (used
   only so the server can read/write Firestore).
=======
2. Enable **Firestore Database** (production mode).
3. Enable **Authentication** → Email/Password sign-in method.
4. (Optional) Enable **Storage** if you'll upload real room photos, guest
   ID documents, etc.
5. Go to Project Settings → Service Accounts → **Generate new private
   key**. This downloads a JSON file with your admin credentials.
>>>>>>> cee3b36d42600e502dc7bbc822e817b33780b7d5

## 3. Configure environment variables

```bash
cp .env.example .env
```

<<<<<<< HEAD
Fill in:
- The `FIREBASE_*` values from the JSON file you downloaded.
- `JWT_SECRET` — generate one with `npm run generate-secret`, paste the
  output in.
- One password per staff team (`MANAGER_PASSWORD`, `FRONT_DESK_PASSWORD`,
  etc.) — run `npm run generate-secret` again for each one, or pick your
  own. This is your entire staff login system — see `docs/security.md`.

Leave the MTN/Orange fields blank for now if you don't have merchant
credentials yet — the booking flow will still work end-to-end; only the
final payment step will show a clear configuration error until you add
real keys (see `docs/payments.md`).
=======
Fill in the `FIREBASE_*` values from the JSON file you downloaded (see
`.env.example` for the exact field mapping). Leave the MTN/Orange fields
blank for now if you don't have merchant credentials yet — the booking
flow will still work end-to-end; only the final payment step will show a
clear configuration error until you add real keys (see `docs/payments.md`).
>>>>>>> cee3b36d42600e502dc7bbc822e817b33780b7d5

## 4. Configure the client (public/js/config.js)

Open `public/js/config.js` and fill in the `firebase` object with your
project's **web app** config (Firebase Console → Project Settings →
General → Your apps → Web app → SDK setup and configuration). This is
<<<<<<< HEAD
NOT secret — it identifies your Firestore project, it doesn't authorize
access (firestore.rules does that, and firestore.rules denies all direct
client access to anything staff-related regardless — see
`docs/security.md`).
=======
NOT secret — it identifies your project, it doesn't authorize access
(Firestore security rules do that).
>>>>>>> cee3b36d42600e502dc7bbc822e817b33780b7d5

## 5. Deploy Firestore rules and indexes

```bash
firebase login
firebase use --add          # select your project, give it an alias
firebase deploy --only firestore:rules,firestore:indexes
```

## 6. Seed demo data (optional, recommended for development)

```bash
npm run seed
```

<<<<<<< HEAD
This creates the hotel's real inventory (10 Fan rooms, 10 AC rooms, 23
apartments), demo guests and reservations, bar stock, and a rotating
daily restaurant menu — see `database/seed.js`.

## 7. Sign in as staff

There's nothing to create — just start the server (next step), go to
`/login.html`, pick a team, and use the password you set in `.env`.
=======
This creates 100 rooms, 5 room types, 200 guests, 100 reservations in a
mix of statuses, plus sample employees, menu items, and inventory — see
`database/seed.js`.

## 7. Create your first admin account

First create a user in Firebase Console → Authentication → Add user (or
sign up through `/register.html` on your running site, then promote that
account):

```bash
node scripts/create-admin.js you@example.com "Your Name"
```
>>>>>>> cee3b36d42600e502dc7bbc822e817b33780b7d5

## 8. Run locally

```bash
npm run dev
```

The API runs at `http://localhost:4000`. Serve `public/` with any static
file server for local frontend development, e.g.:

```bash
npx serve public
```

Then update `apiBaseUrl` in `public/js/config.js` to
`http://localhost:4000/api` for local testing (it defaults to `/api`,
correct for the deployed single-origin setup on Vercel).

See `docs/deployment.md` for deploying to production.
