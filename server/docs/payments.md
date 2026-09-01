# Payment Configuration — MTN Mobile Money & Orange Money

This project's payment layer (`server/config/payment.js`,
`server/services/paymentService.js`) is a real integration shape for both
providers. It will not move real money until you complete the setup below
for each one — until then, `/api/payments/create` will fail with a clear
"not configured" error rather than pretending to succeed.

## MTN Mobile Money (Collections API)

1. Register at https://momodeveloper.mtn.com and subscribe to the
   **Collections** product.
2. In the sandbox, generate an API user + API key
   (`MTN_MOMO_API_USER`, `MTN_MOMO_API_KEY`) following MTN's
   "Create API User" / "Create API Key" sandbox docs.
3. Copy your **Subscription Key** from the Collections product page into
   `MTN_MOMO_SUBSCRIPTION_KEY`.
4. Set `MTN_MOMO_TARGET_ENV=sandbox` and `MTN_MOMO_BASE_URL` to the
   sandbox base URL (already the default in `.env.example`).
5. Test with MTN's sandbox test MSISDNs (documented in their sandbox
   guide) before requesting production access.
6. For production: apply for a live Collections merchant account, then
   update `MTN_MOMO_TARGET_ENV=live`, `MTN_MOMO_BASE_URL` to the
   production base URL, and replace all three credentials with your live
   ones.

## Orange Money (Web Payment API — Cameroon)

1. Register at https://developer.orange.com and request access to
   **Orange Money Web Payment - Cameroon**.
2. Once approved, you'll receive a `client_id` / `client_secret`
   (`ORANGE_MONEY_CLIENT_ID`, `ORANGE_MONEY_CLIENT_SECRET`) and a
   merchant key (`ORANGE_MONEY_MERCHANT_KEY`).
3. Orange's flow redirects the guest to a hosted payment page rather than
   a pure API request-to-pay — `orangeMoney.requestToPay()` in
   `server/config/payment.js` returns a `paymentUrl`; wire this into the
   booking page if you want to redirect guests there instead of / in
   addition to the MTN-style in-app flow currently used in
   `public/booking.html`.

## Webhooks (both providers)

Set each provider's callback/notification URL to:

```
https://your-domain.com/api/webhooks/payment
```

`server/controllers/paymentController.js#webhook` receives the callback
and calls the same `confirmPayment()` used everywhere else — **this is
idempotent**: a duplicate webhook delivery for an already-confirmed
payment is a no-op, so provider retries can never double-credit a
reservation (spec §20).

**Before going live**, add real signature verification in the `webhook`
handler per each provider's documentation — it's left as a clearly marked
`TODO` in the code because the exact verification method depends on your
specific merchant dashboard configuration.

## Currency note

Both providers operate in XAF (CFA franc) for Cameroon. The app displays
amounts as "FCFA" (the common local usage) while API calls to the
providers use the ISO code `XAF` — this is intentional, not a bug.

## Testing without live credentials

Every other part of the system (booking, availability, check-in/out,
housekeeping, restaurant, HR) works fully without payment credentials
configured. Only the final "confirm payment" step needs them — for
development, you can manually mark a payment confirmed for testing by
calling `POST /api/payments/verify` with a super_admin token, or by
editing the `payments/{id}.status` field directly in the Firebase Console
(the reservation's balance will not update automatically in that case —
use `confirmPayment()` via the API for a realistic test).
