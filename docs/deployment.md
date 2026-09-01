# Deployment Guide

This project deploys in two parts: the **app** (public site + admin/guest/
employee portals + API) to **Vercel**, and **Firestore rules/indexes** +
optional **Cloud Functions** to **Firebase**.

## Part 1 — Firebase (data layer)

```bash
firebase login
firebase use --add                 # link this folder to your Firebase project
firebase deploy --only firestore:rules,firestore:indexes
```

If you want the scheduled jobs (night audit, low-stock sweep, stale-payment
expiry — see `functions/`), you need the **Blaze** (pay-as-you-go) plan,
then:

```bash
cd functions && npm install && cd ..
firebase deploy --only functions
```

Cloud Functions are optional — the core app (booking, check-in/out,
payments, housekeeping cascade) already runs synchronously in the Express
API and does not depend on Functions being deployed.

## Part 2 — Vercel (app + API)

1. Push this repository to GitHub/GitLab/Bitbucket.
2. Go to https://vercel.com/new and import the repository.
3. Vercel will detect `vercel.json` automatically. Framework preset:
   **Other**.
4. Add every variable from `.env.example` under **Project Settings →
   Environment Variables** (Production, and Preview if you want staging
   deploys to work too). Do NOT commit your real `.env` file.
5. Set `PUBLIC_APP_URL` to your real production URL (e.g.
   `https://aureliahotel.com`) — used to build payment return/cancel URLs.
6. Deploy.

Vercel builds `api/index.js` as a single serverless function (see
`api/README.md` for why) and serves `public/` as static files, with
`vercel.json` rewriting clean paths like `/admin/dashboard` if you choose
to drop the `.html` extension later.

### Custom domain

Project Settings → Domains → add `aureliahotel.com` (or your domain) and
follow Vercel's DNS instructions. Update:
- `public/js/config.js` — no change needed (relative `/api` path)
- `.env` `PUBLIC_APP_URL` and `MTN_MOMO_CALLBACK_URL` /
  `ORANGE_MONEY_CALLBACK_URL` to the final domain
- `public/index.html` and other pages' `<link rel="canonical">` tags

## Part 3 — Payment provider webhooks

Once your domain is live, register your webhook URL with each provider:

- **MTN MoMo**: set `MTN_MOMO_CALLBACK_URL` in your MTN developer
  dashboard to `https://your-domain.com/api/webhooks/payment`
- **Orange Money**: set the notification URL in your Orange merchant
  dashboard to the same endpoint, or use the Firebase Functions
  alternative at `functions/paymentWebhook.js` if you'd rather host
  webhooks there — both call the identical `confirmPayment()` logic.

See `docs/payments.md` for the full payment configuration walkthrough and
sandbox-to-production checklist.

## Part 4 — Verify the acceptance scenario end-to-end

Walk through spec §86 on your live deployment:

1. Search availability on `/rooms.html` for real dates.
2. Complete a booking on `/booking.html` with a small test deposit via
   MTN/Orange sandbox.
3. Confirm the reservation appears in `/admin/arrivals.html`.
4. Check the guest in from `/admin/reservations.html`.
5. Post a restaurant charge to the room from `/admin/restaurant/pos.html`.
6. Check the guest out from `/admin/departures.html` — confirm the room
   flips to "dirty" on `/admin/room-status.html` and a housekeeping task
   appears on `/admin/housekeeping.html`.
7. Complete the housekeeping cascade (dirty → clean → inspected →
   available).

If every step reflects immediately across the dashboard without a manual
refresh, the real-time listeners and automation cascade are working
correctly.

## Rolling back

Vercel keeps every deployment; use **Deployments → (previous one) →
Promote to Production** to roll back instantly. Firestore rules/indexes
are versioned in git — redeploy the previous commit's
`database/firestore.rules` if you need to roll those back too.
