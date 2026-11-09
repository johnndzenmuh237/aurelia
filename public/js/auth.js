/* Session handling for every signed-in person.
 *
 * Two kinds of sign-in exist and both are kept:
 *  • personal accounts (business owner, managers) — individual username/
 *    email + hashed password, issued by the owner;
 *  • the original shared role passwords (front desk, housekeeping, …).
 *
 * Either way a successful login stores a JWT + role + name in localStorage
 * and every API call sends it as a Bearer token (see Utils.api). Real
 * authorisation happens on the server on every request; the checks here
 * only decide which pages and links to show. */

const Auth = (() => {
  const STORAGE_KEY = "aurelia_session";
  const readyCallbacks = [];
  let session = loadSession();

  const DEPARTMENTS = {
    front_desk: "Front Desk", reservations: "Reservations", housekeeping: "Housekeeping", maintenance: "Maintenance",
    restaurant: "Restaurant & Bar", hr: "Human Resources", accountant: "Finance & Accounts",
  };
  const ROLE_LABELS = { owner: "Business Owner", super_admin: "Super Admin", manager: "Manager", employee: "Employee", ...DEPARTMENTS };

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
    try {
      if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* storage blocked — session lives for this page only */ }
  }

  const profileOf = (s) => (s ? { role: s.role, fullName: s.name, name: s.name, email: s.email, accountId: s.accountId || null, departments: s.departments || [], permissions: s.permissions || [] } : null);

  /** Fires callbacks immediately (no async init to wait for) — kept as
   * onReady(cb) so older page scripts keep working unchanged. */
  function onReady(cb) {
    readyCallbacks.push(cb);
    cb(session ? { uid: session.accountId ? `acct:${session.accountId}` : `role:${session.role}` } : null, profileOf(session));
  }

  async function post(path, body) {
    const res = await fetch(`${window.HOTEL_CONFIG.apiBaseUrl}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || "Sign-in failed.");
    return data;
  }

  function store(data) {
    saveSession({
      token: data.token, role: data.role, name: data.name, email: data.email || null, accountId: data.accountId || null,
      departments: data.departments || [], permissions: data.permissions || [],
      tier: data.tier || null, staffRole: data.staffRole || null, canManageTeam: Boolean(data.canManageTeam),
      mustChangePassword: Boolean(data.mustChangePassword), idleTimeoutMinutes: data.idleTimeoutMinutes || null,
      startedAt: Date.now(),
    });
    return data;
  }

  /** Original shared-role sign-in. */
  async function login(role, password, name) {
    return store(await post("/auth/login", { role, password, name }));
  }
  /** Personal account sign-in: kind = "owner" | "manager". */
  async function loginAccount(kind, identifier, password) {
    return store(await post(kind === "owner" ? "/owner/login" : "/auth/manager-login", { identifier, password }));
  }
  /** Replaces the stored session after a password change (old tokens die). */
  function replaceSession(data) { return store(data); }

  function logout(reason) {
    const wasOwner = session?.role === "owner";
    saveSession(null);
    const q = reason ? `?reason=${encodeURIComponent(reason)}` : "";
    window.location.href = wasOwner ? `/owner/login.html${q}` : `/login.html${q}`;
  }

  /** Mirrors server-side requireRole(): owner/super_admin pass; an individual
   * manager passes when one of her departments is listed (or, on manager-only
   * pages, when she holds the "approve" permission). */
  function can(allowedRoles) {
    if (!session) return false;
    if (!allowedRoles || !allowedRoles.length) return true;
    if (session.role === "owner" || session.role === "super_admin") return true;
    if (session.role === "manager" && session.accountId) {
      const dept = allowedRoles.filter((r) => DEPARTMENTS[r]);
      if (dept.some((d) => (session.departments || []).includes(d))) return true;
      return dept.length === 0 && allowedRoles.includes("manager") && (session.permissions || []).includes("approve");
    }
    return allowedRoles.includes(session.role);
  }

  function homeFor(s = session) {
    if (!s) return "/login.html";
    if (s.role === "owner") return "/owner/dashboard.html";
    if (s.accountId && s.role === "manager") return "/manager/dashboard.html";
    return ({
      super_admin: "/admin/dashboard.html", manager: "/admin/dashboard.html", front_desk: "/admin/dashboard.html",
      reservations: "/admin/reservations.html", housekeeping: "/admin/housekeeping.html", maintenance: "/admin/maintenance.html",
      restaurant: "/admin/restaurant/pos.html", hr: "/admin/employees.html", accountant: "/admin/finance.html", employee: "/employee/dashboard.html",
    })[s.role] || "/index.html";
  }

  /** Redirects to the right login page if not signed in, or to the user's
   * own home page if their role isn't allowed here. */
  function guard(allowedRoles, redirectTo) {
    const login = redirectTo || "/login.html";
    if (!session) {
      window.location.href = `${login}?next=${encodeURIComponent(window.location.pathname)}`;
      return false;
    }
    if (session.mustChangePassword && !/^\/portal\/account\.html/.test(window.location.pathname)) {
      window.location.href = "/portal/account.html?force=1";
      return false;
    }
    if (!can(allowedRoles)) {
      const home = homeFor();
      // Never bounce someone to the page they are already on (redirect loop).
      if (window.location.pathname !== home) window.location.href = home;
      return false;
    }
    return true;
  }

  function getToken() { return session?.token || null; }
  function getUser() { return session ? { uid: session.accountId ? `acct:${session.accountId}` : `role:${session.role}` } : null; }
  function getProfile() { return profileOf(session); }
  function getSession() { return session; }
  function roleLabel(r = session?.role) { return ROLE_LABELS[r] || r; }

  return { onReady, login, loginAccount, replaceSession, logout, guard, can, homeFor, getToken, getUser, getProfile, getSession, roleLabel, DEPARTMENTS, ROLE_LABELS };
})();

// `const` at script top level is not a window property; expose it so `window.Auth` checks (and other scripts) work.
window.Auth = Auth;