/** Phone alerts (Web Push) and manager-to-staff messages. web-push is mocked: no network. */
process.env.JWT_SECRET = "test-jwt-secret-test-jwt-secret-test-jwt-secret";
process.env.OWNER_SETUP_TOKEN = "setup-token-123";
process.env.NODE_ENV = "development";
jest.mock("../server/config/firebase", () => require("./helpers/fakeFirestore").create());
jest.mock("web-push", () => ({ generateVAPIDKeys: () => ({ publicKey: "PUB", privateKey: "PRIV" }), setVapidDetails: jest.fn(), sendNotification: jest.fn(() => Promise.resolve()) }));
const webpush = require("web-push");
const request = require("supertest");
const app = require("../server/app");
const { notify } = require("../server/services/notificationHub");

const bearer = (t) => ({ Authorization: `Bearer ${t}` });
const P = (n) => ({ phone: "+237 680 000 00" + n, dateOfBirth: "1992-03-09", gender: "Male", nationality: "Cameroonian", addressLine: "8 Rue", city: "Douala", region: "Littoral", country: "Cameroon", idType: "National ID card", idNumber: "9990" + n, position: "Staff", employmentType: "Full-time", startDate: "2026-03-01" });
const PW = "Temp-Pass-2026a";
const sub = (n) => ({ endpoint: `https://push.example/${n}`, keys: { p256dh: "p" + n, auth: "a" + n } });
let owner, grace, rita, hank;       // hank = a housekeeping manager (not front desk)
const wait = () => new Promise((r) => setTimeout(r, 30));

beforeAll(async () => {
  await request(app).post("/api/owner/setup").send({ setupToken: "setup-token-123", fullName: "Olivia Owner", email: "owner@x.com", password: "Owner-Pass-2026", confirmPassword: "Owner-Pass-2026" });
  owner = (await request(app).post("/api/owner/login").send({ identifier: "owner@x.com", password: "Owner-Pass-2026" })).body.token;
  const mk = async (name, email, n, departments) => {
    const r = await request(app).post("/api/owner/managers").set(bearer(owner)).send({ fullName: name, email, password: PW, departments, permissions: ["view", "create", "edit"], canManageTeam: true, ...P(n) });
    return { id: r.body.item.id, token: (await request(app).post("/api/auth/manager-login").send({ identifier: email, password: PW })).body.token };
  };
  grace = await mk("Grace Manager", "grace@x.com", 1, ["front_desk"]);
  hank = await mk("Hank House", "hank@x.com", 2, ["housekeeping"]);
  const r = await request(app).post("/api/team").set(bearer(grace.token)).send({ fullName: "Rita Receptionist", email: "rita@x.com", password: PW, staffRole: "Receptionist", departments: ["front_desk"], permissions: ["view", "create"], ...P(3) });
  rita = { id: r.body.item.id, token: (await request(app).post("/api/auth/manager-login").send({ identifier: "rita@x.com", password: PW })).body.token };
});

test("a device subscribes and gets the public key", async () => {
  const k = await request(app).get("/api/push/key").set(bearer(grace.token));
  expect(k.body.key).toBe("PUB");
  expect((await request(app).post("/api/push/subscribe").set(bearer(grace.token)).send({ subscription: sub("grace") })).status).toBe(200);
  expect((await request(app).post("/api/push/subscribe").set(bearer(hank.token)).send({ subscription: sub("hank") })).status).toBe(200);
  expect((await request(app).post("/api/push/subscribe").set(bearer(rita.token)).send({ subscription: sub("rita") })).status).toBe(200);
  expect((await request(app).post("/api/push/subscribe").set(bearer(rita.token)).send({ subscription: { endpoint: "http://bad" } })).status).toBe(400);
  expect((await request(app).post("/api/push/subscribe").send({ subscription: sub("x") })).status).toBe(401);
});

test("a department notification is pushed only to people who may see it", async () => {
  webpush.sendNotification.mockClear();
  await notify({ title: "Room 12 needs a guest", message: "Check-in at 3pm", dept: "front_desk", type: "activity", actor: { key: "acct:someoneelse", name: "System" } });
  await wait();
  const targets = webpush.sendNotification.mock.calls.map((c) => c[0].endpoint).sort();
  expect(targets).toEqual(["https://push.example/grace", "https://push.example/rita"].sort());     // front desk people only, not housekeeping
  expect(JSON.parse(webpush.sendNotification.mock.calls[0][1])).toMatchObject({ title: "Room 12 needs a guest" });
});

test("private messages never put their text on the lock screen, and the sender is not alerted", async () => {
  webpush.sendNotification.mockClear();
  await notify({ title: "Leave request", message: "SECRET TEXT", audienceKeys: [`acct:${grace.id}`, `acct:${rita.id}`], isPrivate: true, actor: { key: `acct:${rita.id}`, name: "Rita Receptionist" }, link: "/portal/messages.html" });
  await wait();
  const calls = webpush.sendNotification.mock.calls;
  expect(calls.map((c) => c[0].endpoint)).toEqual(["https://push.example/grace"]);
  expect(calls[0][1]).not.toMatch(/SECRET TEXT/);
  expect(calls[0][1]).toMatch(/Rita Receptionist/);
});

test("a dead subscription is removed", async () => {
  webpush.sendNotification.mockImplementationOnce(() => Promise.reject(Object.assign(new Error("gone"), { statusCode: 410 })));
  await notify({ title: "Anything", message: "x", dept: "housekeeping" });
  await wait();
  webpush.sendNotification.mockClear();
  await notify({ title: "Again", message: "x", dept: "housekeeping" });
  await wait();
  expect(webpush.sendNotification).not.toHaveBeenCalled();   // hank's dead device no longer receives anything
});

test("a manager can message each of her team members, and only hers", async () => {
  const rcp = (await request(app).get("/api/messages/recipients").set(bearer(grace.token))).body.items;
  expect(rcp.some((r) => r.key === `acct:${rita.id}` && r.kind === "staff")).toBe(true);
  expect((await request(app).get("/api/messages/recipients").set(bearer(hank.token))).body.items.some((r) => r.key === `acct:${rita.id}`)).toBe(false);
  const sent = await request(app).post("/api/messages/send").set(bearer(grace.token)).send({ to: [`acct:${rita.id}`], subject: "Shift change", body: "Please cover Saturday." });
  expect(sent.status).toBe(201);
  expect(JSON.stringify((await request(app).get("/api/messages/conversations").set(bearer(rita.token))).body)).toMatch(/Shift change/);
  expect((await request(app).post("/api/messages/send").set(bearer(hank.token)).send({ to: [`acct:${rita.id}`], subject: "Hi", body: "not mine" })).status).toBe(403);
});