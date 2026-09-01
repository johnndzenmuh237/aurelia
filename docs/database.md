# Database

Full schema reference: [`database/database-schema.md`](../database/database-schema.md).

Firestore security rules: [`database/firestore.rules`](../database/firestore.rules).
Composite indexes: [`database/firestore.indexes.json`](../database/firestore.indexes.json).

## Key design decisions

- **Flat, root-level collections** (no nested subcollections) — keeps
  every query simple and lets the same collection serve staff dashboards,
  guest portal, and employee portal with different `where()` filters
  rather than different data shapes.
- **The server (Firebase Admin SDK) is the only writer for anything that
  moves money, blocks inventory, or changes a reservation/room status.**
  Firestore rules deny direct client writes to those collections entirely
  — see the comment at the top of `firestore.rules`. Clients only ever
  read live via `onSnapshot`.
- **Sequential human-readable IDs** (`RES-2026-000001`, `GUEST-000001`,
  etc.) are generated via a Firestore transaction on a `counters/{name}`
  document (`server/utils/idGenerator.js`), so concurrent bookings never
  collide or skip numbers.
- **Folio math is always server-computed.** `folioItems` are the ledger;
  `reservations.total/paid/balance` and `invoices.total/paid/balance` are
  denormalized copies kept in sync by `server/services/folioService.js`
  and `paymentService.js` on every write — never recomputed ad hoc in the
  frontend.

## Backing up data

Use Firestore's built-in export:

```bash
gcloud firestore export gs://your-backup-bucket/$(date +%Y-%m-%d)
```

Schedule this via Cloud Scheduler + a Cloud Function, or run manually
before major changes.
