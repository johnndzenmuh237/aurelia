# API Reference

Base URL: `/api` (same origin as the deployed site). All bodies/responses
are JSON. Authenticated routes expect `Authorization: Bearer <Firebase ID
token>`.

See `api/README.md` for why every route lives in one Express app
(`server/app.js`) instead of one file per route.

## Auth
<<<<<<< HEAD
No accounts, no signup — every staff team shares one password (set in
server environment variables, see `docs/security.md`).

| Method | Path | Auth | Body |
|---|---|---|---|
| POST | `/auth/login` | none (rate-limited) | `{ role, password, name }` — returns `{ token, role, name }`; use `token` as the Bearer token on every subsequent request |
| GET | `/auth/verify` | required | — returns `{ user: { role, name } }` |
| GET | `/staff/data/:collection` | required | Generic authenticated read for staff-only collections (reservations, guests, payments, etc.) — replaces direct Firestore reads now that there's no Firebase Auth for `firestore.rules` to check (see `docs/security.md`) |
| GET | `/bookings/lookup?code&phone` | none | Guest self-service "track my booking" — no login |
=======
| Method | Path | Auth | Body |
|---|---|---|---|
| POST | `/auth/register` | none | `{ uid, email, fullName, phone }` — called right after client-side Firebase Auth signup |
| GET | `/auth/verify` | required | — returns `{ user }` (uid, email, role, profile fields) |
>>>>>>> cee3b36d42600e502dc7bbc822e817b33780b7d5

## Bookings & availability
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/bookings/check-availability?checkIn&checkOut` | none | Public availability search |
| GET | `/rooms/availability?checkIn&checkOut` | optional | Same, used by admin walk-in/availability pages |
| GET | `/bookings/create?preview=1&type&checkIn&checkOut` | none | Price preview only, creates nothing |
| POST | `/bookings/create` | optional | Creates a reservation — body: `{ type, checkIn, checkOut, guestName, phone, email, adults, specialRequests, source }` |

## Stay lifecycle
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/checkin` | front_desk/manager | `{ reservationId }` |
| POST | `/checkout` | front_desk/manager | `{ reservationId, allowCreditBalance? }` — rejects with 402 if balance > 0 unless overridden |

## Payments
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/payments/create` | optional | `{ reservationId, amount, provider: "mtn_momo"\|"orange_money", phone }` |
| POST | `/payments/verify` | required | Manually re-checks a pending payment's provider status |
| POST | `/payments/refund` | accountant/manager | `{ paymentId, amount, reason }` |
| POST | `/webhooks/payment` | none (provider callback) | `{ externalId, status }` |

## Rooms & reservations
| Method | Path | Auth |
|---|---|---|
| POST | `/rooms/create` | manager/reservations |
| PUT | `/rooms/update` | manager/reservations |
| PUT | `/rooms/status` | front_desk/housekeeping/manager |
| PUT | `/reservations/update` | front_desk/reservations/manager |
| DELETE | `/reservations/delete` | front_desk/reservations/manager |

## Guests
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/guests/create` | optional | Also handles contact-form messages and guest service requests via `{ type: "contact_message" \| "guest_request" }` |
| PUT | `/guests/update` | required | Guest editing their own profile |

## Housekeeping & maintenance
| Method | Path | Auth |
|---|---|---|
| POST | `/housekeeping/assign` | housekeeping/manager/front_desk |
| POST | `/housekeeping/complete` | housekeeping/manager |
| POST | `/maintenance/create` | maintenance/manager/front_desk |
| PUT | `/maintenance/update` | maintenance/manager |

## Restaurant
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/restaurant/orders` | restaurant/manager | `{ items[], table, guestName, chargeToRoom }` |
| PUT | `/restaurant/orders` | restaurant/manager | Update kitchen status |
| POST/PUT | `/restaurant/menu` | restaurant/manager | |

## Inventory
| Method | Path | Auth |
|---|---|---|
| POST/PUT | `/inventory/items` | manager/accountant |
| POST/PUT | `/inventory/stock` | manager/accountant |

## Employees & payroll
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/employees/hire` | hr/manager | |
| PUT | `/employees/update` | any authenticated staff | Self-editing supported when no `id` is passed |
| POST | `/employees/applications` | rate-limited, public | Careers page submissions |
| PUT | `/employees/applications` | hr/manager | Approve/hire — auto-creates the employee record |
| POST | `/employees/attendance` | required | `{ employeeId, action: "clock_in"\|"clock_out" }` |
| POST | `/payroll/generate` | hr/accountant/manager | `{ period }` |
| PUT | `/payroll/approve` | accountant/manager | `{ id }` |

## Reports
| Method | Path | Auth |
|---|---|---|
| GET | `/reports/:key?format=csv\|pdf` | manager/accountant |
| POST | `/reports/finance` | manager/accountant — also runs night audit via `?nightAudit=1` |
| PUT | `/reports/finance` | manager/accountant/super_admin — also saves hotel settings via `{ settings }` |

## Errors

Every error response has the shape:
```json
{ "error": { "message": "Human-readable message." } }
```
Never a raw stack trace or driver error — see `server/middleware/error-handler.js`.
