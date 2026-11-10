/**
 * Manager-created team accounts: create -> listed -> sign in -> scoped access,
 * and every limit that stops a team member (or a manager) from going too far.
 */
process.env.JWT_SECRET = "test-jwt-secret-test-jwt-secret-test-jwt-secret";
process.env.OWNER_SETUP_TOKEN = "setup-token-123";
process.env.NODE_ENV = "development";

jest.mock("../server/config/firebase", () => require("./helpers/fakeFirestore").create());

const request = require("supertest");
const app = require("../server/app");

const bearer = (t) => ({ Authorization: `Bearer ${t}` });
const P = (n, over = {}) => ({
  phone: "+237 680 000 00" + n, dateOfBirth: "1992-03-09", gender: "Male", nationality: "Cameroonian",
  addressLine: "8 Rue du Marche", city: "Douala", region: "Littoral", country: "Cameroon",
  idType: "National ID card", idNumber: "5550" + n, position: "Staff", employmentType: "Full-time", startDate: "2026-03-01",
  ...over,
});
const PW = "Temp-Pass-2026a", NEWPW = "Personal-Pass-2026b";
let owner, mgr, mgrNoTeam, rec, recToken;

const signIn = async (identifier, password) => (await request(app).post("/api/auth/manager-login").send({ identifier, password }));

beforeAll(async () => {
  await request(app).post("/api/owner/setup").send({ setupToken: "setup-token-123", fullName: "Olivia Owner", email: "owner@x.com", password: "Owner-Pass-2026", confirmPassword: "Owner-Pass-2026" });
  owner = (await request(app).post("/api/owner/login").send({ identifier: "owner@x.com", password: "Owner-Pass-2026" })).body.token;
  const mk = async (name, email, n, extra = {}) => {
    const r = await request(app).post("/api/owner/managers").set(bearer(owner)).send({ fullName: name, email, password: PW, mustChangePassword: false, departments: ["front_desk", "reservations", "accountant"], permissions: ["view", "create", "edit", "delete"], ...P(n), ...extra });
    expect(r.status).toBe(201);
    return { id: r.body.item.id, token: (await signIn(email, PW)).body.token };
  };
  mgr = await mk("Grace Manager", "grace@x.com", 1);
  mgrNoTeam = await mk("Noah NoTeam", "noah@x.com", 2, { canManageTeam: false });
});

describe("a manager creates a team member", () => {
  test("creates a receptionist inside her own departments", async () => {
    const r = await request(app).post("/api/team").set(bearer(mgr.token)).send({ fullName: "Rita Receptionist", email: "rita@x.com", password: PW, staffRole: "Receptionist", departments: ["front_desk", "reservations"], permissions: ["view", "create", "edit"], ...P(11) });
    expect(r.status).toBe(201);
    rec = r.body.item;
    expect(rec).toMatchObject({ tier: "staff", staffRole: "Receptionist", createdByAccount: mgr.id, status: "active", mustChangePassword: false });
    expect(rec.passwordHash).toBeUndefined();
  });
  test("she appears in the manager's team list and the owner's, and not in the owner's Managers list", async () => {
    expect((await request(app).get("/api/team").set(bearer(mgr.token))).body.items.map((a) => a.email)).toContain("rita@x.com");
    expect((await request(app).get("/api/team").set(bearer(owner))).body.items.map((a) => a.email)).toContain("rita@x.com");
    expect((await request(app).get("/api/owner/managers").set(bearer(owner))).body.items.map((a) => a.email)).not.toContain("rita@x.com");
  });
  test("a different manager does not see or touch her", async () => {
    const other = await mkOther();
    expect((await request(app).get("/api/team").set(bearer(other))).body.items).toHaveLength(0);
    expect((await request(app).get(`/api/team/${rec.id}`).set(bearer(other))).status).toBe(404);
    expect((await request(app).post(`/api/team/${rec.id}/status`).set(bearer(other)).send({ active: false })).status).toBe(404);
  });
  test("she signs in with the Personal account login and uses the password she was given", async () => {
    const r = await signIn("rita@x.com", PW);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ role: "manager", tier: "staff", staffRole: "Receptionist", mustChangePassword: false, canManageTeam: false });
    recToken = r.body.token;
    expect((await request(app).get("/api/staff/data/reservations").set(bearer(recToken))).status).toBe(200);   // works straight away
    const c = await request(app).post("/api/account/change-password").set(bearer(recToken)).send({ currentPassword: PW, newPassword: NEWPW, confirmPassword: NEWPW });
    expect(c.status).toBe(403);                                                                                 // she cannot change it
  });
  test("she reaches her own departments and is blocked everywhere else", async () => {
    expect((await request(app).get("/api/staff/data/reservations").set(bearer(recToken))).status).toBe(200);
    expect((await request(app).get("/api/staff/data/orders").set(bearer(recToken))).status).toBe(200);      // front desk may read restaurant orders (existing rule)
    expect((await request(app).get("/api/staff/data/payroll").set(bearer(recToken))).status).toBe(403);
    expect((await request(app).get("/api/staff/data/staffAccounts").set(bearer(recToken))).status).toBe(403);
    expect((await request(app).post("/api/payroll/generate").set(bearer(recToken)).send({})).status).toBe(403);
  });
  test("she can never create accounts, and cannot delete records", async () => {
    expect((await request(app).post("/api/team").set(bearer(recToken)).send({ fullName: "X Y", email: "x@x.com", password: PW, staffRole: "Other", ...P(19) })).status).toBe(403);
    expect((await request(app).get("/api/team").set(bearer(recToken))).status).toBe(403);
    expect((await request(app).delete("/api/reservations/delete").set(bearer(recToken)).send({ id: "nope" })).status).toBe(403);
  });
});

describe("limits on what a manager can hand out", () => {
  const body = (n, over) => ({ fullName: "Test Person", email: `t${n}@x.com`, password: PW, staffRole: "Other", departments: ["front_desk"], permissions: ["view"], ...P(20 + n), ...over });
  const post = (t, b) => request(app).post("/api/team").set(bearer(t)).send(b);
  test("not a department she does not manage", async () => {
    expect((await post(mgr.token, body(1, { departments: ["hr"] }))).status).toBe(403);
  });
  test("never delete or approve", async () => {
    expect((await post(mgr.token, body(2, { permissions: ["view", "delete"] }))).status).toBe(400);
    expect((await post(mgr.token, body(3, { permissions: ["view", "approve"] }))).status).toBe(400);
  });
  test("not more rights than she holds herself", async () => {
    const lowMgr = await (async () => {
      const r = await request(app).post("/api/owner/managers").set(bearer(owner)).send({ fullName: "Low Rights", email: "low@x.com", password: PW, mustChangePassword: false, departments: ["front_desk"], permissions: ["view"], ...P(30) });
      return (await signIn("low@x.com", PW)).body.token;
    })();
    expect((await post(lowMgr, body(4, { permissions: ["view", "edit"] }))).status).toBe(403);
    expect((await post(lowMgr, body(5, { permissions: ["view"] }))).status).toBe(201);
  });
  test("a manager the owner has not allowed to run a team cannot", async () => {
    expect((await post(mgrNoTeam.token, body(6))).status).toBe(403);
  });
  test("registration details are enforced, and one ID belongs to one person", async () => {
    expect((await post(mgr.token, body(7, { phone: "" }))).status).toBe(400);
    expect((await post(mgr.token, body(8, { idNumber: "" }))).status).toBe(400);
    expect((await post(mgr.token, body(9, { staffRole: "Wizard" }))).status).toBe(400);
    expect((await post(mgr.token, body(10, { idNumber: "5550-11" }))).status).toBe(409);
    expect((await post(mgr.token, body(11, { email: "rita@x.com" }))).status).toBe(409);
  });
  test("editing cannot push beyond her limits", async () => {
    expect((await request(app).put(`/api/team/${rec.id}`).set(bearer(mgr.token)).send({ departments: ["hr"] })).status).toBe(403);
    const ok = await request(app).put(`/api/team/${rec.id}`).set(bearer(mgr.token)).send({ ...P(11), city: "Yaounde", staffRole: "Cashier", departments: ["accountant"] });
    expect(ok.status).toBe(200);
    expect(ok.body.item.profile.city).toBe("Yaounde");
    expect(ok.body.item.staffRole).toBe("Cashier");
    expect(ok.body.item.departments).toEqual(["accountant"]);
  });
});

describe("deactivation and password reset", () => {
  test("deactivating ends her session immediately, and nothing is deleted", async () => {
    const r = await request(app).post(`/api/team/${rec.id}/status`).set(bearer(mgr.token)).send({ active: false });
    expect(r.body.item.status).toBe("deactivated");
    expect((await request(app).get("/api/account/me").set(bearer(recToken))).status).toBe(401);
    const d = await signIn("rita@x.com", PW); expect(d.status).toBe(403); expect(d.body.error.message).toMatch(/deactivated|ended|no longer/i);
    expect((await request(app).get("/api/team").set(bearer(mgr.token))).body.items.map((a) => a.email)).toContain("rita@x.com");
  });
  test("reactivating and resetting the password (by her manager) lets her back in with the new one", async () => {
    await request(app).post(`/api/team/${rec.id}/status`).set(bearer(mgr.token)).send({ active: true });
    expect((await request(app).post(`/api/team/${rec.id}/reset-password`).set(bearer(mgr.token)).send({ newPassword: "short" })).status).toBe(400);
    expect((await request(app).post(`/api/team/${rec.id}/reset-password`).set(bearer(mgr.token)).send({ newPassword: "Reset-Pass-2026c" })).status).toBe(200);
    const r = await signIn("rita@x.com", "Reset-Pass-2026c");
    expect(r.status).toBe(200);
    expect(r.body.mustChangePassword).toBe(false);
  });
  test("the owner can create team accounts for any department", async () => {
    const r = await request(app).post("/api/team").set(bearer(owner)).send({ fullName: "Hannah HR", email: "hannah@x.com", password: PW, staffRole: "HR officer", departments: ["hr"], permissions: ["view", "create"], ...P(40) });
    expect(r.status).toBe(201);
  });
  test("the old Team-password and owner-only routes still refuse team members", async () => {
    expect((await request(app).get("/api/owner/managers").set(bearer(recToken))).status).toBe(401);
    const t = (await signIn("hannah@x.com", PW)).body.token;
    expect((await request(app).get("/api/owner/managers").set(bearer(t))).status).toBe(403);
  });
});

async function mkOther() {
  await request(app).post("/api/owner/managers").set(bearer(owner)).send({ fullName: "Other Manager", email: "other@x.com", password: PW, mustChangePassword: false, departments: ["front_desk"], permissions: ["view", "create", "edit"], ...P(50) });
  return (await signIn("other@x.com", PW)).body.token;
}