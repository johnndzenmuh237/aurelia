# CHANGELOG — This Delivery vs. Your Local Copy

You told me you already have: (1) the manual `server/app.js` require-path fix,
and (2) the full `public/` folder from the previous "ticker + images +
rooms/apartments" delivery. Based on that, here is exactly what's new or
changed in **this** zip, split into what you still need to copy over and
what you can skip.

## 🔴 Copy these — you do NOT have them yet

These are backend files. You said you only copied `public/`, so your local
project is still missing the server-side logic that makes the weekly/
monthly discount pricing actually apply at booking time (right now it
would only *display* on the room details page, not calculate correctly
when a guest books).

| File | What changed |
|---|---|
| `server/utils/calculations.js` | Added `tierDiscountForNights()` and `buildRateCard()` — automatically applies a room type's `weeklyDiscountPercent` at 7+ nights, `monthlyDiscountPercent` at 28+ nights, and builds the nightly/weekly/monthly rate table used on the room details page |
| `server/services/bookingService.js` | `previewQuote()` and `createBooking()` now read and apply those discount fields when calculating a real price — was previously ignoring them |
| `database/seed.js` | Demo room types now include `category` (room/apartment), `hasAC`, `hasFan`, `weeklyDiscountPercent`, `monthlyDiscountPercent`, `photoUrl`; menu items now include `description` and `photoUrl` |
| `database/database-schema.md` | Documentation updated to match the new `roomTypes`/`menuItems` fields (reference only, doesn't affect runtime) |
| `tests/rooms.test.js` | Added 2 new tests covering the discount-tier math (reference/CI only, doesn't affect runtime) |

**How to copy them**: replace the matching files at the same paths in your
local `C:\Users\dell\Desktop\aurelia\` folder with the ones from this zip.
Nodemon will auto-restart once you save `calculations.js` and
`bookingService.js`.

## 🟢 Already yours — safe to skip, listed for verification only

If you want to double check your local copy matches, these are every
`public/` file that changed in the previous delivery (the one you already
applied):

`public/css/ticker.css` (new) · `public/js/ticker.js` (new) ·
`public/css/rooms.css` (edited) · `public/index.html` (rewritten) ·
`public/gallery.html` (rewritten) · `public/rooms.html` (rewritten) ·
`public/room-details.html` (rewritten) · `public/about.html` (edited) ·
`public/restaurant.html` (new) · `public/amenities.html` (new) ·
`public/js/layout.js` (edited) · `public/css/style.css` (edited) ·
`public/robots.txt` (new) · `public/sitemap.xml` (new) ·
`public/js/admin-page-configs.js` (edited) · `public/js/admin-crud.js` (edited)

## ⚪ Not changed since your first download

Everything else — `api/`, `functions/`, `scripts/`, `docs/`, `.env.example`,
`vercel.json`, `firebase.json`, `package.json`, and the rest of `server/`
(controllers, middleware, other services) — is identical to what you
already have, aside from the one `server/app.js` fix you already applied
manually.

## After copying the 🔴 files

Your live Firestore data was seeded with the *old* room-type shape (no
category/AC/fan/discount fields). To see the full feature working:

- **Fastest**: go to Admin → Rooms → Room Types, edit each existing room
  type, and fill in Category, Has AC, Has Fan, Weekly Discount %, Monthly
  Discount % using the "Edit" button on each row.
- **Or**: clear the `roomTypes` and `rooms` collections in the Firebase
  Console, then run `npm run seed` again to regenerate everything fresh
  with the new fields already filled in (this also regenerates all
  rooms/reservations/guests, so only do this on a dev project you're okay
  resetting).
