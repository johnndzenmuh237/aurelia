/**
 * End-to-end tests of the REAL Express app + services against an in-memory
 * Firestore: owner setup/login/password, manager lifecycle & revocation,
 * department-scoped permissions, notifications and internal messaging.
 */
process.env.JWT_SECRET = "test-jwt-secret-test-jwt-secret-test-jwt-secret";
process.env.OWNER_SETUP_TOKEN = "setup-token-123";
process.env.NODE_ENV = "development";
process.env.RESTAURANT_PASSWORD = "restaurant-shared-pw";
process.env.MANAGER_PASSWORD = "legacy-manager-pw";
process.env.EMPLOYEE_PASSWORD = "employee-shared-pw";
process.env.FRONT_DESK_PASSWORD = "frontdesk-shared-pw";

jest.mock("../server/config/firebase", () => require("./helpers/fakeFirestore").create());

const request = require("supertest");
const app = require("../server/app");

const OWNER_PW = "Owner-Pass-2026";
let ownerToken, mgr, mgr2, restaurantToken, legacyMgrToken, employeeToken, frontDeskToken;
const bearer = (t) => ({ Authorization: `Bearer ${t}` });
const settle = () => new Promise((r) => setTimeout(r, 60)); // activity tracker runs after the response
const legacyLogin = async (role, password, name = "Tester") => (await request(app).post("/api/auth/login").send({ role, password, name })).body.token;

describe("owner setup & authentication", () => {
  test("setup is required on a fresh system", async () => {
    const r = await request(app).get("/api/owner/status");
    expect(r.body).toEqual({ setupRequired: true, setupEnabled: true });
  });
  test("wrong setup token is rejected", async () => {
    const r = await request(app).post("/api/owner/setup").send({ setupToken: "nope", fullName: "Olivia Owner", email: "owner@x.com", password: OWNER_PW, confirmPassword: OWNER_PW });
    expect(r.status).toBe(403);
  });
  test("weak password is rejected", async () => {
    const r = await request(app).post("/api/owner/setup").send({ setupToken: "setup-token-123", fullName: "Olivia Owner", email: "owner@x.com", password: "short", confirmPassword: "short" });
    expect(r.status).toBe(400);
  });
  test("owner is created once; the password is stored hashed", async () => {
    const r = await request(app).post("/api/owner/setup").send({ setupToken: "setup-token-123", fullName: "Olivia Owner", email: "owner@x.com", password: OWNER_PW, confirmPassword: OWNER_PW });
    expect(r.status).toBe(201);
    expect(r.body.role).toBe("owner");
    const stored = (await require("../server/config/firebase").db.collection("staffAccounts").doc("owner").get()).data();
    expect(stored.passwordHash.startsWith("scrypt$")).toBe(true);
    expect(JSON.stringify(stored)).not.toContain(OWNER_PW);
    const again = await request(app).post("/api/owner/setup").send({ setupToken: "setup-token-123", fullName: "Evil", email: "evil@x.com", password: OWNER_PW, confirmPassword: OWNER_PW });
    expect(again.status).toBe(409);
    expect((await request(app).get("/api/owner/status")).body.setupRequired).toBe(false);
  });
  test("owner login: wrong password fails, right password works", async () => {
    expect((await request(app).post("/api/owner/login").send({ identifier: "owner@x.com", password: "Wrong-Pass-1234" })).status).toBe(401);
    const r = await request(app).post("/api/owner/login").send({ identifier: "owner@x.com", password: OWNER_PW });
    expect(r.status).toBe(200);
    ownerToken = r.body.token;
  });
  test("a shared role password can never produce an owner session", async () => {
    const r = await request(app).post("/api/auth/login").send({ role: "owner", password: "x", name: "x" });
    expect(r.status).toBe(400);
  });
  test("account locks after repeated failures", async () => {
    for (let i = 0; i < 5; i++) await request(app).post("/api/owner/login").send({ identifier: "owner@x.com", password: "Bad-Guess-0000" });
    const r = await request(app).post("/api/owner/login").send({ identifier: "owner@x.com", password: OWNER_PW });
    expect(r.status).toBe(429);
    await require("../server/config/firebase").db.collection("staffAccounts").doc("owner").update({ lockedUntil: null }); // simulate lock expiry
  });
  test("owner changes password; old sessions stop working", async () => {
    const login = await request(app).post("/api/owner/login").send({ identifier: "owner@x.com", password: OWNER_PW });
    const old = login.body.token;
    const bad = await request(app).post("/api/account/change-password").set(bearer(old)).send({ currentPassword: "nope-nope-1A", newPassword: "New-Owner-Pass-1", confirmPassword: "New-Owner-Pass-1" });
    expect(bad.status).toBe(400);
    const ok = await request(app).post("/api/account/change-password").set(bearer(old)).send({ currentPassword: OWNER_PW, newPassword: "New-Owner-Pass-1", confirmPassword: "New-Owner-Pass-1" });
    expect(ok.status).toBe(200);
    expect((await request(app).get("/api/account/me").set(bearer(old))).status).toBe(401);
    ownerToken = ok.body.token;
    expect((await request(app).get("/api/account/me").set(bearer(ownerToken))).status).toBe(200);
  });
  test("password reset through an emailed verification code", async () => {
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    const r = await request(app).post("/api/account/forgot-password").send({ email: "owner@x.com" });
    expect(r.status).toBe(200);
    const unknown = await request(app).post("/api/account/forgot-password").send({ email: "nobody@x.com" });
    expect(unknown.body).toEqual(r.body); // no account discovery
    const code = /code for owner@x.com: (\d{6})/.exec(spy.mock.calls.map((c) => c[0]).join("\n"))[1];
    spy.mockRestore();
    const wrong = await request(app).post("/api/account/reset-password").send({ email: "owner@x.com", code: code === "000000" ? "111111" : "000000", newPassword: "Reset-Pass-2026", confirmPassword: "Reset-Pass-2026" });
    expect(wrong.status).toBe(400);
    const done = await request(app).post("/api/account/reset-password").send({ email: "owner@x.com", code, newPassword: "Reset-Pass-2026", confirmPassword: "Reset-Pass-2026" });
    expect(done.status).toBe(200);
    const reuse = await request(app).post("/api/account/reset-password").send({ email: "owner@x.com", code, newPassword: "Another-Pass-2026", confirmPassword: "Another-Pass-2026" });
    expect(reuse.status).toBe(400); // single use
    const login = await request(app).post("/api/owner/login").send({ identifier: "owner@x.com", password: "Reset-Pass-2026" });
    expect(login.status).toBe(200);
    ownerToken = login.body.token;
  });
});

describe("manager accounts: create, scope, revoke, replace", () => {
  test("only the owner can reach manager administration", async () => {
    expect((await request(app).get("/api/owner/managers")).status).toBe(401);
    legacyMgrToken = await legacyLogin("manager", "legacy-manager-pw", "Legacy");
    expect((await request(app).get("/api/owner/managers").set(bearer(legacyMgrToken))).status).toBe(403);
  });
  test("owner creates a restaurant manager", async () => {
    const bad = await request(app).post("/api/owner/managers").set(bearer(ownerToken)).send({ fullName: "Mary Mgr", email: "mary@x.com", password: "Temp-Pass-2026a", departments: ["spaceship"] });
    expect(bad.status).toBe(400);
    const r = await request(app).post("/api/owner/managers").set(bearer(ownerToken)).send({ fullName: "Mary Mgr", email: "mary@x.com", password: "Temp-Pass-2026a", departments: ["restaurant"], permissions: ["view", "create", "edit"] });
    expect(r.status).toBe(201);
    expect(r.body.item.passwordHash).toBeUndefined();
    mgr = r.body.item;
    const dup = await request(app).post("/api/owner/managers").set(bearer(ownerToken)).send({ fullName: "Dup", email: "MARY@x.com", password: "Temp-Pass-2026a", departments: ["hr"] });
    expect(dup.status).toBe(409);
  });
  test("first sign-in forces a personal password", async () => {
    const login = await request(app).post("/api/auth/manager-login").send({ identifier: "mary@x.com", password: "Temp-Pass-2026a" });
    expect(login.status).toBe(200);
    expect(login.body.mustChangePassword).toBe(true);
    const blocked = await request(app).get("/api/staff/data/orders").set(bearer(login.body.token));
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.details.code).toBe("PASSWORD_CHANGE_REQUIRED");
    const ch = await request(app).post("/api/account/change-password").set(bearer(login.body.token)).send({ currentPassword: "Temp-Pass-2026a", newPassword: "Mary-Own-Pass-1", confirmPassword: "Mary-Own-Pass-1" });
    expect(ch.status).toBe(200);
    mgr.token = ch.body.token;
  });
  test("an owner cannot sign in on the manager endpoint and vice versa", async () => {
    expect((await request(app).post("/api/auth/manager-login").send({ identifier: "owner@x.com", password: "Reset-Pass-2026" })).status).toBe(401);
    expect((await request(app).post("/api/owner/login").send({ identifier: "mary@x.com", password: "Mary-Own-Pass-1" })).status).toBe(401);
  });
  test("manager works inside her department and is blocked outside it (server-side)", async () => {
    const ok = await request(app).post("/api/restaurant/orders").set(bearer(mgr.token)).send({ items: [{ name: "Jollof", price: 3500 }], table: "T1" });
    expect(ok.status).toBe(201);
    mgr.orderId = ok.body.id;
    expect((await request(app).post("/api/employees/hire").set(bearer(mgr.token)).send({ fullName: "X", position: "Y" })).status).toBe(403);
    expect((await request(app).get("/api/staff/data/payroll").set(bearer(mgr.token))).status).toBe(403);
    expect((await request(app).get("/api/staff/data/orders").set(bearer(mgr.token))).status).toBe(200);
    expect((await request(app).delete("/api/reservations/delete").set(bearer(mgr.token))).status).toBe(403);
  });
  test("method permissions: a view-only manager cannot create", async () => {
    const r = await request(app).post("/api/owner/managers").set(bearer(ownerToken)).send({ fullName: "Vic Viewer", email: "vic@x.com", password: "Temp-Pass-2026a", departments: ["restaurant"], permissions: ["view"], mustChangePassword: false });
    const t = (await request(app).post("/api/auth/manager-login").send({ identifier: "vic@x.com", password: "Temp-Pass-2026a" })).body;
    expect(t.mustChangePassword).toBe(false);
    expect((await request(app).get("/api/staff/data/orders").set(bearer(t.token))).status).toBe(200);
    expect((await request(app).post("/api/restaurant/orders").set(bearer(t.token)).send({ items: [{ name: "x", price: 1 }] })).status).toBe(403);
    expect(r.status).toBe(201);
  });
  test("a manager can never create an owner, manage managers or reach owner-only data", async () => {
    expect((await request(app).post("/api/owner/setup").send({ setupToken: "setup-token-123", fullName: "Evil", email: "e@x.com", password: "Evil-Pass-2026a", confirmPassword: "Evil-Pass-2026a" })).status).toBe(409);
    expect((await request(app).post("/api/owner/managers").set(bearer(mgr.token)).send({ fullName: "Evil", email: "e@x.com", password: "Evil-Pass-2026a", departments: ["hr"] })).status).toBe(403);
    expect((await request(app).post(`/api/owner/managers/${mgr.id}/status`).set(bearer(mgr.token)).send({ active: false })).status).toBe(403);
    expect((await request(app).get("/api/staff/data/staffAccounts").set(bearer(mgr.token))).status).toBe(403);
  });
  test("legacy shared roles are now scoped: employee cannot read payroll or staff accounts", async () => {
    employeeToken = await legacyLogin("employee", "employee-shared-pw");
    expect((await request(app).get("/api/staff/data/payroll").set(bearer(employeeToken))).status).toBe(403);
    expect((await request(app).get("/api/staff/data/housekeepingTasks").set(bearer(employeeToken))).status).toBe(200);
    expect((await request(app).get("/api/staff/data/schedules").set(bearer(employeeToken))).status).toBe(200);
    expect((await request(app).get("/api/staff/data/staffAccounts").set(bearer(employeeToken))).status).toBe(403);
    expect((await request(app).get("/api/staff/data/payroll").set(bearer(legacyMgrToken))).status).toBe(200); // legacy manager unchanged
  });
});

describe("notifications", () => {
  test("a manager's action notifies the owner and the department — not unrelated departments", async () => {
    restaurantToken = await legacyLogin("restaurant", "restaurant-shared-pw", "Chef");
    frontDeskToken = await legacyLogin("front_desk", "frontdesk-shared-pw", "Amina");
    await settle();
    const owner = await request(app).get("/api/notifications").set(bearer(ownerToken));
    const note = owner.body.items.find((n) => n.title === "Restaurant order created");
    expect(note).toBeTruthy();
    expect(note.senderName).toBe("Mary Mgr");
    expect(note.link).toBe("/admin/restaurant/orders.html");
    expect(note.read).toBe(false);
    expect(owner.body.unreadCount).toBeGreaterThan(0);

    const rest = await request(app).get("/api/notifications").set(bearer(restaurantToken));
    expect(rest.body.items.some((n) => n.title === "Restaurant order created")).toBe(true);
    const fd = await request(app).get("/api/notifications").set(bearer(frontDeskToken));
    expect(fd.body.items.some((n) => n.title === "Restaurant order created")).toBe(false);
  });
  test("a restaurant-department manager sees it; the actor does not get it as unread", async () => {
    const r = await request(app).post("/api/restaurant/orders").set(bearer(restaurantToken)).send({ items: [{ name: "Soup", price: 1000 }], table: "T2" });
    expect(r.status).toBe(201);
    await settle();
    const m = await request(app).get("/api/notifications").set(bearer(mgr.token));
    expect(m.body.items.some((n) => n.title === "Restaurant order created" && n.senderName === "Chef")).toBe(true);
    const own = await request(app).get("/api/notifications").set(bearer(restaurantToken));
    expect(own.body.items.find((n) => n.senderName === "Chef").read).toBe(true);
  });
  test("mark read / archive, and cannot touch notifications you cannot see", async () => {
    const list = (await request(app).get("/api/notifications").set(bearer(ownerToken))).body;
    const before = list.unreadCount;
    await request(app).post("/api/notifications/read").set(bearer(ownerToken)).send({ ids: [list.items[0].id] });
    expect((await request(app).get("/api/notifications").set(bearer(ownerToken))).body.unreadCount).toBe(before - 1);
    const fdRead = await request(app).post("/api/notifications/read").set(bearer(frontDeskToken)).send({ ids: [list.items[0].id] });
    expect(fdRead.body.updated).toBe(0);
    await request(app).post("/api/notifications/read").set(bearer(ownerToken)).send({ all: true });
    expect((await request(app).get("/api/notifications").set(bearer(ownerToken))).body.unreadCount).toBe(0);
    await request(app).post("/api/notifications/archive").set(bearer(ownerToken)).send({ ids: [list.items[0].id] });
    expect((await request(app).get("/api/notifications").set(bearer(ownerToken))).body.items.some((n) => n.id === list.items[0].id)).toBe(false);
  });
  test("public submissions notify the right team", async () => {
    const r = await request(app).post("/api/employees/applications").send({ fullName: "Job Seeker", phone: "670000000", email: "j@x.com", position: "Waiter" });
    expect(r.status).toBeLessThan(300);
    await settle();
    const hr = await request(app).post("/api/owner/managers").set(bearer(ownerToken)).send({ fullName: "Hana HR", email: "hana@x.com", password: "Temp-Pass-2026a", departments: ["hr"], mustChangePassword: false });
    expect(hr.status).toBe(201);
    mgr2 = (await request(app).post("/api/auth/manager-login").send({ identifier: "hana@x.com", password: "Temp-Pass-2026a" })).body;
    mgr2.id = hr.body.item.id;
    const n = await request(app).get("/api/notifications").set(bearer(mgr2.token));
    expect(n.body.items.some((x) => x.title === "New job application")).toBe(true);
    expect(n.body.items.some((x) => x.title === "Restaurant order created")).toBe(false);
  });
});

describe("internal messaging", () => {
  let convoId;
  test("owner messages a manager; manager is notified, reads and replies", async () => {
    const send = await request(app).post("/api/messages/send").set(bearer(ownerToken)).send({ to: [`acct:${mgr.id}`], subject: "Weekend menu", body: "Please prepare the weekend menu." });
    expect(send.status).toBe(201);
    convoId = send.body.conversationId;
    const inbox = await request(app).get("/api/messages/conversations").set(bearer(mgr.token));
    expect(inbox.body.unreadCount).toBe(1);
    expect(inbox.body.items[0].unread).toBe(true);
    const note = await request(app).get("/api/notifications").set(bearer(mgr.token));
    expect(note.body.items.some((n) => n.type === "message" && n.link.includes(convoId))).toBe(true);
    const open = await request(app).get(`/api/messages/conversations/${convoId}`).set(bearer(mgr.token));
    expect(open.body.messages).toHaveLength(1);
    expect((await request(app).get("/api/messages/conversations").set(bearer(mgr.token))).body.unreadCount).toBe(0);
    const reply = await request(app).post("/api/messages/send").set(bearer(mgr.token)).send({ conversationId: convoId, body: "Will do." });
    expect(reply.status).toBe(201);
    const full = await request(app).get(`/api/messages/conversations/${convoId}`).set(bearer(ownerToken));
    expect(full.body.messages.map((m) => m.body)).toEqual(["Please prepare the weekend menu.", "Will do."]);
    expect(full.body.messages[1].senderName).toBe("Mary Mgr");
  });
  test("conversations persist and a second message reuses the same thread", async () => {
    const again = await request(app).post("/api/messages/send").set(bearer(ownerToken)).send({ to: [`acct:${mgr.id}`], body: "Thanks." });
    expect(again.body.conversationId).toBe(convoId);
  });
  test("private conversations stay private; owner has oversight", async () => {
    expect((await request(app).get(`/api/messages/conversations/${convoId}`).set(bearer(mgr2.token))).status).toBe(403);
    expect((await request(app).get(`/api/messages/conversations/${convoId}`).set(bearer(restaurantToken))).status).toBe(403);
    expect((await request(app).post("/api/messages/send").set(bearer(mgr2.token)).send({ conversationId: convoId, body: "hi" })).status).toBe(403);
    const all = await request(app).get("/api/messages/conversations?scope=all").set(bearer(ownerToken));
    expect(all.body.items.some((c) => c.id === convoId)).toBe(true);
    expect((await request(app).get("/api/messages/conversations?scope=all").set(bearer(mgr.token))).body.items.some((c) => c.id === convoId)).toBe(true); // her own thread only
    // private message notifications are not visible to the legacy shared manager
    const lm = await request(app).get("/api/notifications").set(bearer(legacyMgrToken));
    expect(lm.body.items.some((n) => n.type === "message")).toBe(false);
  });
  test("manager messages a department; the department replies to its manager", async () => {
    const dirs = await request(app).get("/api/messages/recipients").set(bearer(mgr.token));
    expect(dirs.body.items.some((r) => r.key === "acct:owner")).toBe(true);
    expect(dirs.body.items.some((r) => r.key === "role:restaurant")).toBe(true);
    const s = await request(app).post("/api/messages/send").set(bearer(mgr.token)).send({ to: ["role:restaurant"], subject: "Stock", body: "Count the bar stock tonight." });
    expect(s.status).toBe(201);
    const inbox = await request(app).get("/api/messages/conversations").set(bearer(restaurantToken));
    expect(inbox.body.items).toHaveLength(1);
    expect(inbox.body.items[0].unread).toBe(true);
    expect((await request(app).get("/api/notifications").set(bearer(restaurantToken))).body.items.some((n) => n.type === "message")).toBe(true);
    const back = await request(app).post("/api/messages/send").set(bearer(restaurantToken)).send({ conversationId: s.body.conversationId, body: "Done, 12 cases." });
    expect(back.status).toBe(201);
    const m = await request(app).get(`/api/messages/conversations/${s.body.conversationId}`).set(bearer(mgr.token));
    expect(m.body.messages).toHaveLength(2);
  });
  test("departments can start a conversation with their manager but not with the owner", async () => {
    const dirs = await request(app).get("/api/messages/recipients").set(bearer(restaurantToken));
    expect(dirs.body.items.some((r) => r.key === `acct:${mgr.id}`)).toBe(true);
    expect(dirs.body.items.some((r) => r.key === "acct:owner")).toBe(false);
    const toOwner = await request(app).post("/api/messages/send").set(bearer(restaurantToken)).send({ to: ["acct:owner"], body: "hello owner" });
    expect(toOwner.status).toBe(403);
    const toMgr = await request(app).post("/api/messages/send").set(bearer(restaurantToken)).send({ to: [`acct:${mgr.id}`], body: "Need more gas for the stove." });
    expect(toMgr.status).toBe(201);
  });
  test("announcements go to departments one-way; validation works", async () => {
    expect((await request(app).post("/api/messages/announce").set(bearer(restaurantToken)).send({ departments: ["hr"], subject: "x", body: "y" })).status).toBe(403);
    const a = await request(app).post("/api/messages/announce").set(bearer(ownerToken)).send({ departments: ["all"], subject: "Staff meeting", body: "Monday 8am." });
    expect(a.status).toBe(201);
    const fd = await request(app).get("/api/messages/conversations").set(bearer(frontDeskToken));
    const convo = fd.body.items.find((c) => c.subject === "Staff meeting");
    expect(convo.replyAllowed).toBe(false);
    expect((await request(app).post("/api/messages/send").set(bearer(frontDeskToken)).send({ conversationId: a.body.conversationId, body: "ok" })).status).toBe(403);
    expect((await request(app).post("/api/messages/send").set(bearer(ownerToken)).send({ to: ["acct:owner"], body: "" })).status).toBe(400);
    expect((await request(app).post("/api/messages/send").set(bearer(ownerToken)).send({ to: ["role:nonsense"], body: "x" })).status).toBe(403);
  });
});

describe("revocation, history and replacement", () => {
  test("deactivating a manager ends access immediately but keeps every record", async () => {
    const off = await request(app).post(`/api/owner/managers/${mgr.id}/status`).set(bearer(ownerToken)).send({ active: false });
    expect(off.body.item.status).toBe("deactivated");
    expect((await request(app).get("/api/staff/data/orders").set(bearer(mgr.token))).status).toBe(401);
    expect((await request(app).post("/api/auth/manager-login").send({ identifier: "mary@x.com", password: "Mary-Own-Pass-1" })).status).toBe(403);
    const orders = await request(app).get("/api/staff/data/orders").set(bearer(ownerToken));
    expect(orders.body.items.some((o) => o.id === mgr.orderId)).toBe(true);
    const created = orders.body.items.find((o) => o.id === mgr.orderId);
    expect(created.items[0].name).toBe("Jollof");
  });
  test("the audit trail names the manager and survives deactivation", async () => {
    const act = await request(app).get(`/api/owner/managers/${mgr.id}/activity`).set(bearer(ownerToken));
    expect(act.body.items.some((a) => a.action === "Restaurant order created" && a.userName === "Mary Mgr")).toBe(true);
  });
  test("owner replaces a manager; the successor inherits the department and the history", async () => {
    await request(app).post(`/api/owner/managers/${mgr.id}/status`).set(bearer(ownerToken)).send({ active: true });
    const rep = await request(app).post(`/api/owner/managers/${mgr.id}/replace`).set(bearer(ownerToken)).send({ fullName: "Nick New", email: "nick@x.com", password: "Temp-Pass-2026a" });
    expect(rep.status).toBe(201);
    expect(rep.body.previous.status).toBe("deactivated");
    expect(rep.body.previous.replacedBy).toBe(rep.body.item.id);
    expect(rep.body.item.departments).toEqual(["restaurant"]);
    const login = (await request(app).post("/api/auth/manager-login").send({ identifier: "nick@x.com", password: "Temp-Pass-2026a" })).body;
    const chg = await request(app).post("/api/account/change-password").set(bearer(login.token)).send({ currentPassword: "Temp-Pass-2026a", newPassword: "Nick-Own-Pass-1", confirmPassword: "Nick-Own-Pass-1" });
    const orders = await request(app).get("/api/staff/data/orders").set(bearer(chg.body.token));
    expect(orders.status).toBe(200);
    expect(orders.body.items.some((o) => o.id === mgr.orderId)).toBe(true);
    const upd = await request(app).post("/api/restaurant/orders").set(bearer(chg.body.token)).send({ items: [{ name: "Rice", price: 500 }] });
    expect(upd.status).toBe(201);
  });
  test("owner edits scope and resets a password; changes apply on the next request", async () => {
    const e = await request(app).put(`/api/owner/managers/${mgr2.id}`).set(bearer(ownerToken)).send({ departments: ["accountant"], phone: "670111222" });
    expect(e.body.item.departments).toEqual(["accountant"]);
    expect((await request(app).get("/api/staff/data/employeeApplications").set(bearer(mgr2.token))).status).toBe(403);
    const rp = await request(app).post(`/api/owner/managers/${mgr2.id}/reset-password`).set(bearer(ownerToken)).send({ newPassword: "Owner-Set-Pass-9" });
    expect(rp.status).toBe(200);
    expect((await request(app).get("/api/staff/data/expenses").set(bearer(mgr2.token))).status).toBe(401); // old session ended
    const login = await request(app).post("/api/auth/manager-login").send({ identifier: "hana@x.com", password: "Owner-Set-Pass-9" });
    expect(login.body.mustChangePassword).toBe(true);
  });
  test("owner overview and full record access", async () => {
    const ov = await request(app).get("/api/owner/overview").set(bearer(ownerToken));
    expect(ov.status).toBe(200);
    expect(ov.body.counts.managersTotal).toBeGreaterThanOrEqual(3);
    expect(ov.body.counts.managersActive).toBeGreaterThanOrEqual(2);
    expect(ov.body.recentActivity.length).toBeGreaterThan(0);
    const accts = await request(app).get("/api/staff/data/staffAccounts").set(bearer(ownerToken));
    expect(accts.status).toBe(200);
    expect(JSON.stringify(accts.body)).not.toContain("passwordHash");
    expect((await request(app).get("/api/staff/data/auditLogs").set(bearer(ownerToken))).status).toBe(200);
    expect((await request(app).get("/api/staff/data/messages").set(bearer(ownerToken))).status).toBe(200);
  });
});
