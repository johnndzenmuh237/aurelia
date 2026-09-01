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
    } catch {
      return null;
    }
  }

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
})();
