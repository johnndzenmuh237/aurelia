/** End-of-day close: department submissions, blind counts, differences, corrections and the owner's consolidated report. */
process.env.JWT_SECRET = "test-jwt-secret-test-jwt-secret-test-jwt-secret";
process.env.OWNER_SETUP_TOKEN = "setup-token-123";
process.env.NODE_ENV = "development";
jest.mock("../server/config/firebase", () => require("./helpers/fakeFirestore").create());

const request = require("supertest");
const app = require("../server/app");
const { db, FieldValue } = require("../server/config/firebase");

const bearer = (t) => ({ Authorization: `Bearer ${t}` });
const P = (n) => ({ phone: "+237 680 000 00" + n, dateOfBirth: "1992-03-09", gender: "Male", nationality: "Cameroonian", addressLine: "8 Rue", city: "Douala", region: "Littoral", country: "Cameroon", idType: "National ID card", idNumber: "7770" + n, position: "Staff", employmentType: "Full-time", startDate: "2026-03-01" });
const PW = "Temp-Pass-2026a";
const TODAY = new Date().toISOString().slice(0, 10);
let owner, cashier, rest, recep, barItem;

beforeAll(async () => {
  await request(app).post("/api/owner/setup").send({ setupToken: "setup-token-123", fullName: "Olivia Owner", email: "owner@x.com", password: "Owner-Pass-2026", confirmPassword: "Owner-Pass-2026" });
  owner = (await request(app).post("/api/owner/login").send({ identifier: "owner@x.com", password: "Owner-Pass-2026" })).body.token;
  const mk = async (name, email, n, departments) => {
    const r = await request(app).post("/api/owner/managers").set(bearer(owner)).send({ fullName: name, email, password: PW, departments, permissions: ["view", "create", "edit"], ...P(n) });
    expect(r.status).toBe(201);
    return (await request(app).post("/api/auth/manager-login").send({ identifier: email, password: PW })).body.token;
  };
  cashier = await mk("Carl Cashier", "carl@x.com", 1, ["accountant"]);
  rest = await mk("Rosa Restaurant", "rosa@x.com", 2, ["restaurant"]);
  recep = await mk("Rita Reception", "rita@x.com", 3, ["front_desk"]);

  // today's recorded activity
  await db.collection("orders").add({ items: [{ name: "Rice", quantity: 2 }, { name: "Fish" }], total: 10000, status: "paid", createdAt: FieldValue.serverTimestamp() });
  await db.collection("inventoryItems").add({ name: "Rice", quantity: 20, unit: "kg" });
  barItem = (await db.collection("barInventory").add({ brand: "Castel", unit: "bottle", quantity: 40, unitPrice: 500 })).id;
  await db.collection("barSales").add({ itemId: barItem, quantitySold: 10, total: 5000, paymentMethod: "cash", createdAt: FieldValue.serverTimestamp() });
  await db.collection("salaryPayments").add({ amount: 80000, createdAt: FieldValue.serverTimestamp() });
});

test("restaurant: a matching count balances, and the submitter never sees system figures", async () => {
  const r = await request(app).post("/api/daily-close/restaurant").set(bearer(rest)).send({ salesReported: 10000, platesSold: 3, stock: [{ name: "Rice", counted: 20 }] });
  expect(r.status).toBe(201);
  expect(JSON.stringify(r.body)).not.toMatch(/system|expected/);
  const rep = await request(app).get("/api/daily-close/report").set(bearer(owner));
  expect(rep.body.departments.find((d) => d.department === "restaurant").status).toBe("balanced");
});

test("restaurant: missing stock and unrecorded sales are flagged; resubmitting keeps the earlier version", async () => {
  const r = await request(app).post("/api/daily-close/restaurant").set(bearer(rest)).send({ salesReported: 14000, platesSold: 3, stock: [{ name: "Rice", counted: 17 }] });
  expect(r.body.corrected).toBe(true);
  const rep = (await request(app).get("/api/daily-close/report").set(bearer(owner))).body;
  const d = rep.departments.find((x) => x.department === "restaurant");
  expect(d.status).toBe("flagged");
  expect(d.corrections).toBe(1);
  expect(rep.issues.some((i) => i.type === "unrecorded_sale")).toBe(true);
  expect(rep.issues.some((i) => i.type === "missing_stock" && /Rice/.test(i.text))).toBe(true);
});

test("bar: drinks counted against sales and remaining stock", async () => {
  const r = await request(app).post("/api/daily-close/bar").set(bearer(rest)).send({ salesReported: 5000, drinks: [{ itemId: barItem, sold: 10, remaining: 37 }] });
  expect(r.status).toBe(201);
  const rep = (await request(app).get("/api/daily-close/report").set(bearer(owner))).body;
  expect(rep.issues.some((i) => i.department === "Bar" && i.type === "missing_stock")).toBe(true);   // 3 bottles gone with no sale
});

test("cashier: cash short is flagged; payroll stays out of the cash figures", async () => {
  await request(app).post("/api/daily-close/cashier").set(bearer(cashier)).send({ received: { cash: 14000 } });
  const rep = (await request(app).get("/api/daily-close/report").set(bearer(owner))).body;
  const c = rep.departments.find((d) => d.department === "cashier");
  expect(c.system.total).toBe(15000);                       // 10,000 restaurant + 5,000 bar; the 80,000 salary is not in it
  expect(rep.issues.some((i) => i.type === "cash_short")).toBe(true);
  expect(rep.totals.cashShortOrOver).toBe(-1000);
  expect(rep.payroll.paid).toBe(80000);
});

test("reception: check-ins, check-outs and occupancy", async () => {
  const r = await request(app).post("/api/daily-close/reception").set(bearer(recep)).send({ occupied: 0, checkIns: 0, checkOuts: 0 });
  expect(r.status).toBe(201);
  expect((await request(app).get("/api/daily-close/status").set(bearer(owner))).body.departments.every((d) => d.submitted)).toBe(true);
  const rep = (await request(app).get("/api/daily-close/report").set(bearer(owner))).body;
  expect(rep.complete).toBe(true);
});

test("access rules and validation", async () => {
  expect((await request(app).post("/api/daily-close/cashier").set(bearer(rest)).send({ received: { cash: 1 } })).status).toBe(403);   // restaurant cannot close the till
  expect((await request(app).get("/api/daily-close/report").set(bearer(cashier))).status).toBe(403);                                     // staff cannot read the report
  expect((await request(app).post("/api/daily-close/restaurant").set(bearer(rest)).send({ salesReported: -5 })).status).toBe(400);
  expect((await request(app).post("/api/daily-close/restaurant").set(bearer(rest)).send({ date: "2999-01-01", salesReported: 1 })).status).toBe(400);
  expect((await request(app).post("/api/daily-close/restaurant").set(bearer(rest)).send({ date: "2020-01-01", salesReported: 1 })).status).toBe(400);
  expect((await request(app).post("/api/daily-close/kitchen").set(bearer(owner)).send({})).status).toBe(400);
  const n = await db.collection("notifications").get();
  expect(n.docs.some((d) => d.data().type === "daily_report")).toBe(true);
});