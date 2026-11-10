/** Restaurant stock: register purchases, calculated totals, movements, alerts, access. */
process.env.JWT_SECRET = "test-jwt-secret-test-jwt-secret-test-jwt-secret";
process.env.OWNER_SETUP_TOKEN = "setup-token-123";
process.env.NODE_ENV = "development";
jest.mock("../server/config/firebase", () => require("./helpers/fakeFirestore").create());
const request = require("supertest");
const app = require("../server/app");
const { db, FieldValue } = require("../server/config/firebase");

const bearer = (t) => ({ Authorization: `Bearer ${t}` });
const P = (n) => ({ phone: "+237 680 000 00" + n, dateOfBirth: "1992-03-09", gender: "Male", nationality: "Cameroonian", addressLine: "8 Rue", city: "Douala", region: "Littoral", country: "Cameroon", idType: "National ID card", idNumber: "8880" + n, position: "Staff", employmentType: "Full-time", startDate: "2026-03-01" });
const PW = "Temp-Pass-2026a", TODAY = new Date().toISOString().slice(0, 10);
let owner, rest, frontDesk;

beforeAll(async () => {
  await request(app).post("/api/owner/setup").send({ setupToken: "setup-token-123", fullName: "Olivia Owner", email: "owner@x.com", password: "Owner-Pass-2026", confirmPassword: "Owner-Pass-2026" });
  owner = (await request(app).post("/api/owner/login").send({ identifier: "owner@x.com", password: "Owner-Pass-2026" })).body.token;
  let k = 0;
  const mk = async (n, email, departments) => {
    await request(app).post("/api/owner/managers").set(bearer(owner)).send({ fullName: n, email, password: PW, departments, permissions: ["view", "create", "edit"], ...P(++k) });
    return (await request(app).post("/api/auth/manager-login").send({ identifier: email, password: PW })).body.token;
  };
  rest = await mk("Rosa Restaurant", "rosa@x.com", ["restaurant"]);
  frontDesk = await mk("Rita Front", "rita@x.com", ["front_desk"]);
});
const rice = (over = {}) => ({ name: "Rice", category: "Grains & staples", quantity: 2, unit: "bag", unitCost: 15000, purchaseDate: TODAY, supplier: "Mile 4 Market", expectedRevenue: 60000, minStock: 1, ...over });

test("a restaurant manager registers two bags of rice; totals are calculated, not typed", async () => {
  expect((await request(app).post("/api/restaurant/stock/receive").set(bearer(rest)).send(rice({ totalCost: 99 }))).status).toBe(400); // typed total must match
  const r = await request(app).post("/api/restaurant/stock/receive").set(bearer(rest)).send(rice());
  expect(r.status).toBe(201); expect(r.body.cost).toBe(30000);
  const s = (await request(app).get("/api/restaurant/stock").set(bearer(owner))).body;     // the owner sees it
  expect(s.items[0]).toMatchObject({ name: "Rice", quantity: 2, spent: 30000, valueRemaining: 30000 });
  expect(s.totals).toMatchObject({ totalSpent: 30000, expectedRevenue: 60000, expectedProfit: 30000 });
});

test("buying the same item again adds to it with an average cost", async () => {
  await request(app).post("/api/restaurant/stock/receive").set(bearer(rest)).send(rice({ quantity: 2, unitCost: 17000 }));
  const it = (await request(app).get("/api/restaurant/stock").set(bearer(rest))).body.items;
  expect(it).toHaveLength(1);
  expect(it[0]).toMatchObject({ quantity: 4, purchased: 4, spent: 64000, unitCost: 16000 });
});

test("movements: issue, waste, return, never below zero, reasons required, all recorded", async () => {
  const id = (await request(app).get("/api/restaurant/stock").set(bearer(rest))).body.items[0].id;
  const mv = (b) => request(app).post("/api/restaurant/stock/move").set(bearer(rest)).send({ itemId: id, ...b });
  expect((await mv({ type: "consumed", quantity: 1 })).body.quantity).toBe(3);
  expect((await mv({ type: "wasted", quantity: 1 })).status).toBe(400);                          // reason needed
  expect((await mv({ type: "wasted", quantity: 1, reason: "Spoiled" })).body.quantity).toBe(2);
  expect((await mv({ type: "returned", quantity: 1 })).body.quantity).toBe(3);
  expect((await mv({ type: "consumed", quantity: 50 })).status).toBe(400);                       // no negative stock
  const s = (await request(app).get("/api/restaurant/stock").set(bearer(owner))).body;
  expect(s.items[0]).toMatchObject({ consumed: 1, wasted: 1, quantity: 3 });
  expect(s.movements.map((m) => m.type)).toEqual(expect.arrayContaining(["received", "consumed", "wasted", "returned"]));
  expect(s.movements.every((m) => m.byName)).toBe(true);
});

test("alerts: low stock, out of stock, expiring", async () => {
  await request(app).post("/api/restaurant/stock/receive").set(bearer(rest)).send({ name: "Chicken", quantity: 1, unit: "kg", unitCost: 3000, purchaseDate: TODAY, expiryDate: TODAY, minStock: 2 });
  const s = (await request(app).get("/api/restaurant/stock").set(bearer(rest))).body;
  expect(s.alerts.some((a) => /Chicken is low/.test(a.text))).toBe(true);
  expect(s.alerts.some((a) => /Chicken expires/.test(a.text))).toBe(true);
  const id = s.items.find((i) => i.name === "Chicken").id;
  await request(app).post("/api/restaurant/stock/move").set(bearer(rest)).send({ itemId: id, type: "consumed", quantity: 1 });
  expect((await request(app).get("/api/restaurant/stock").set(bearer(rest))).body.alerts.some((a) => /Chicken is out of stock/.test(a.text))).toBe(true);
});

test("a sale's automatic ingredient deduction shows in the restaurant stock", async () => {
  const { decrementInventoryForOrder } = require("../server/services/inventoryService");
  await decrementInventoryForOrder([{ name: "Rice", quantity: 1 }]);
  const it = (await request(app).get("/api/restaurant/stock").set(bearer(rest))).body.items.find((i) => i.name === "Rice");
  expect(it).toMatchObject({ quantity: 2, consumed: 2 });
});

test("access and validation", async () => {
  expect((await request(app).post("/api/restaurant/stock/receive").set(bearer(frontDesk)).send(rice())).status).toBe(403);
  expect((await request(app).get("/api/restaurant/stock").set(bearer(frontDesk))).status).toBe(403);
  expect((await request(app).post("/api/restaurant/stock/receive").set(bearer(rest)).send(rice({ quantity: 0 }))).status).toBe(400);
  expect((await request(app).post("/api/restaurant/stock/receive").set(bearer(rest)).send(rice({ purchaseDate: "2999-01-01" }))).status).toBe(400);
  expect((await request(app).post("/api/restaurant/stock/receive").set(bearer(rest)).send(rice({ expiryDate: "2000-01-01" }))).status).toBe(400);
});