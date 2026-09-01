# API routing

This project ships one Vercel serverless function (`api/index.js`) wrapping
the full Express app in `server/app.js`, rewritten by `vercel.json` so every
request to `/api/*` reaches it.

Every operation named in the project spec has a real route at the exact
same path, e.g.:

| Spec path                     | Method | Route in server/app.js         |
|--------------------------------|--------|----------------------------------|
| api/bookings/create.js         | POST   | `/api/bookings/create`          |
| api/checkin/index.js           | POST   | `/api/checkin`                  |
| api/checkout/index.js          | POST   | `/api/checkout`                 |
| api/payments/webhook.js        | POST   | `/api/webhooks/payment`         |
| api/rooms/availability.js      | GET    | `/api/rooms/availability`       |
| api/employees/applications.js  | POST/PUT | `/api/employees/applications` |
| api/payroll/generate.js        | POST   | `/api/payroll/generate`         |

...and so on for every route — see `server/app.js` for the complete list.

Routes are grouped in Express rather than split into 60+ individual files
because they share the same Firebase Admin connection, middleware
(auth/role checks, rate limiting, error handling) and business logic in
`server/services/`. Splitting them into separate files would duplicate all
of that per file with no behavioral difference — see the comment at the
top of `api/index.js` for the full reasoning.

If you specifically need standalone serverless functions per route (for
example to set different memory/timeout limits per endpoint), you can
split any route out of `server/app.js` into its own `api/<name>.js` file
that imports the same controller — the controllers and services underneath
don't need to change.
