/* Staff session handling — role-password login, no Firebase Authentication,
   no accounts, no signup. A successful login stores a JWT + role + name in
   localStorage; every subsequent API call sends it as a Bearer token
   (see Utils.api in utils.js). This is intentionally simple: there is no
   password reset flow, no per-person account — the manager sets one
   shared password per role in the server's environment variables, and
   whoever is working that shift signs in with it. */

const Auth = (() => {
  const STORAGE_KEY = "aurelia_session";
  const readyCallbacks = [];
  let session = loadSession();

  function loadSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
  function saveSession(s) {
    session = s;
    if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STORAGE_KEY);
  }

  /** Fires callbacks immediately (no async Firebase init to wait for) —
   * kept as onReady(cb) so existing page scripts written against the old
   * Firebase-based Auth.onReady() API don't need to change shape. */
  function onReady(cb) {
    readyCallbacks.push(cb);
    cb(session ? { uid: `role:${session.role}` } : null, session ? { role: session.role, fullName: session.name } : null);
  }

  async function login(role, password, name) {
    const res = await fetch(`${window.HOTEL_CONFIG.apiBaseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, password, name }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || "Sign-in failed.");
    saveSession({ token: data.token, role: data.role, name: data.name });
    return data;
  }

  function logout() {
    saveSession(null);
    window.location.href = "/login.html";
  }

  /** Redirects to /login.html if not signed in, or if signed in with a
   * role that isn't in `allowedRoles`. super_admin always passes, same as
   * server-side requireRole(). */
  function guard(allowedRoles, redirectTo = "/login.html") {
    if (!session) {
      window.location.href = `${redirectTo}?next=${encodeURIComponent(window.location.pathname)}`;
      return;
    }
    if (allowedRoles && allowedRoles.length && !allowedRoles.includes(session.role) && session.role !== "super_admin") {
      window.location.href = "/index.html";
    }
  }

  function getToken() { return session?.token || null; }
  function getUser() { return session ? { uid: `role:${session.role}` } : null; }
  function getProfile() { return session ? { role: session.role, fullName: session.name } : null; }

  return { onReady, login, logout, guard, getToken, getUser, getProfile };
})();
