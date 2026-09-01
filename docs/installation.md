# Installation

## Prerequisites

- Node.js 18+
- A Firebase project (free "Spark" plan works for development; use
  "Blaze" plan for production, required for Cloud Functions and outbound
  network calls to MTN/Orange)
- `firebase-tools` CLI: `npm install -g firebase-tools`
- (Optional, for real payments) an MTN Mobile Money developer account and
  an Orange Money merchant account

## 1. Clone and install dependencies

```bash
cd hotel-management-system
npm install
cd functions && npm install && cd ..
```

## 2. Create a Firebase project

1. Go to https://console.firebase.google.com and create a new project.
2. Enable **Firestore Database** (production mode).
3. Enable **Authentication** → Email/Password sign-in method.
4. (Optional) Enable **Storage** if you'll upload real room photos, guest
   ID documents, etc.
5. Go to Project Settings → Service Accounts → **Generate new private
   key**. This downloads a JSON file with your admin credentials.

## 3. Configure environment variables

```bash
cp .env.example .env
```

Fill in the `FIREBASE_*` values from the JSON file you downloaded (see
`.env.example` for the exact field mapping). Leave the MTN/Orange fields
blank for now if you don't have merchant credentials yet — the booking
flow will still work end-to-end; only the final payment step will show a
clear configuration error until you add real keys (see `docs/payments.md`).

## 4. Configure the client (public/js/config.js)

Open `public/js/config.js` and fill in the `firebase` object with your
project's **web app** config (Firebase Console → Project Settings →
General → Your apps → Web app → SDK setup and configuration). This is
NOT secret — it identifies your project, it doesn't authorize access
(Firestore security rules do that).

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
