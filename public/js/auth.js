<<<<<<< HEAD
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
=======
/* Auth session handling for guest / employee / admin portals.
   Firebase Auth identifies WHO the user is; their role/department lives in
   Firestore (`users/{uid}`) and is verified again server-side on every API
   call (server/middleware/roles.js) — the client-side guard below only
   controls UI, it is not a security boundary by itself. */

const Auth = (() => {
  let currentUser = null;
  let currentProfile = null;
  const readyCallbacks = [];

  document.addEventListener("firebase-ready", () => {
    window.fb.onAuthStateChanged(window.firebaseAuth, async (user) => {
      currentUser = user;
      currentProfile = user ? await fetchProfile() : null;
      readyCallbacks.forEach((cb) => cb(currentUser, currentProfile));
    });
  });

  async function fetchProfile() {
    try {
      const res = await Utils.api("/auth/verify", { method: "GET" });
      return res?.user || null;
>>>>>>> cee3b36d42600e502dc7bbc822e817b33780b7d5
    } catch {
      return null;
    }
  }
<<<<<<< HEAD
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
=======

  function onReady(cb) {
    readyCallbacks.push(cb);
  }

  async function login(email, password) {
    const cred = await window.fb.signInWithEmailAndPassword(window.firebaseAuth, email, password);
    return cred.user;
  }

  async function register(payload) {
    // Guest self-registration: creates the Firebase Auth user, then the
    // server creates the matching Firestore guest profile with role "guest".
    const cred = await window.fb.createUserWithEmailAndPassword(window.firebaseAuth, payload.email, payload.password);
    await Utils.api("/auth/register", { method: "POST", body: { ...payload, uid: cred.user.uid } });
    return cred.user;
  }

  async function logout() {
    await window.fb.signOut(window.firebaseAuth);
    window.location.href = "/login.html";
  }

  /** Redirects away if the user is not signed in, or lacks an allowed role. */
  function guard(allowedRoles, redirectTo = "/login.html") {
    onReady((user, profile) => {
      if (!user) {
        window.location.href = `${redirectTo}?next=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      if (allowedRoles && allowedRoles.length && !allowedRoles.includes(profile?.role)) {
        window.location.href = "/index.html";
      }
    });
  }

  return { onReady, login, register, logout, guard, getUser: () => currentUser, getProfile: () => currentProfile };
>>>>>>> cee3b36d42600e502dc7bbc822e817b33780b7d5
})();
