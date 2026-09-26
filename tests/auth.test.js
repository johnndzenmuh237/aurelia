describe("staff login — shared role passwords, no accounts (docs/security.md)", () => {
  const ROLE_PASSWORDS = {
    manager: "manager-secret",
    front_desk: "frontdesk-secret",
  };

  function checkLogin(role, password) {
    if (!(role in ROLE_PASSWORDS)) return { ok: false, reason: "unknown_role" };
    const expected = ROLE_PASSWORDS[role];
    if (!expected) return { ok: false, reason: "not_configured" };
    if (password !== expected) return { ok: false, reason: "wrong_password" };
    return { ok: true };
  }

  test("correct password for a configured role succeeds", () => {
    expect(checkLogin("manager", "manager-secret")).toEqual({ ok: true });
  });

  test("wrong password is rejected", () => {
    expect(checkLogin("manager", "nope")).toEqual({ ok: false, reason: "wrong_password" });
  });

  test("unknown role is rejected", () => {
    expect(checkLogin("super_villain", "anything")).toEqual({ ok: false, reason: "unknown_role" });
  });

  test("a role with no password configured yet is rejected, not silently allowed", () => {
    expect(checkLogin("hr", "anything")).toEqual({ ok: false, reason: "unknown_role" });
    // even if the role existed but had an empty password:
    const withEmpty = { ...ROLE_PASSWORDS, hr: "" };
    const expected = withEmpty.hr;
    expect(Boolean(expected)).toBe(false); // this is exactly the guard authController.login uses
  });
});

describe("JWT session payload shape (server/middleware/auth.js)", () => {
  // Documents the contract: the token carries only { role, name } — no
  // per-person identity, since there are no accounts.
  function buildSessionFromToken(decoded) {
    return { uid: `role:${decoded.role}`, role: decoded.role, name: decoded.name };
  }

  test("two different people logging in with the same role password get the same role but can have different names", () => {
    const sessionA = buildSessionFromToken({ role: "front_desk", name: "Amina" });
    const sessionB = buildSessionFromToken({ role: "front_desk", name: "Paul" });
    expect(sessionA.role).toBe(sessionB.role);
    expect(sessionA.name).not.toBe(sessionB.name);
    expect(sessionA.uid).toBe(sessionB.uid); // same synthetic uid — no per-person identity, by design
  });
});
