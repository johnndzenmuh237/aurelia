/* App core — loaded on EVERY page. Self-contained on purpose (reads the
 * stored session itself) so it works on pages that don't load auth.js.
 *
 *  1. Notification bell for any signed-in person, backed by /api/notifications
 *  2. Progressive Web App: service worker + install prompt
 *  3. Idle auto-logout for personal accounts
 *  4. Public-site header shows a workspace link when signed in
 */
(function () {
  "use strict";
  const API = (window.HOTEL_CONFIG && window.HOTEL_CONFIG.apiBaseUrl) || "/api";
  const KEY = "aurelia_session";
  const icon = (n, s) => (window.Icons ? window.Icons.svg(n, { size: s || 18 }) : "");
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function readSession() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } }

  function ago(iso) {
    if (!iso) return "";
    const d = new Date(iso); if (isNaN(d)) return "";
    const s = Math.round((Date.now() - d.getTime()) / 1000);
    if (s < 45) return "just now";
    if (s < 3600) return Math.round(s / 60) + " min ago";
    if (s < 86400) return Math.round(s / 3600) + " h ago";
    return d.toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  async function api(path, opts) {
    const s = readSession();
    const res = await fetch(API + path, {
      method: (opts && opts.method) || "GET",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + (s && s.token) },
      body: opts && opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 401) { handleExpired(); throw new Error("session ended"); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data.error && data.error.message) || "Request failed");
    return data;
  }

  let expiredHandled = false;
  function handleExpired() {
    if (expiredHandled) return; expiredHandled = true;
    const s = readSession();
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    window.location.href = (s && s.role === "owner" ? "/owner/login.html" : "/login.html") + "?reason=expired";
  }

  /* ------------------------------------------------------------------ */
  /* 1. Notification bell                                               */
  /* ------------------------------------------------------------------ */
  const TYPE_ICON = { message: "message-square", new_booking: "bed-double", payment_received: "credit-card", budget_alert: "triangle-alert", contact_message: "mail", activity: "activity" };

  function mountBell() {
    const session = readSession();
    if (!session || !session.token) return;
    if (document.getElementById("bellWrap")) return;

    const wrap = document.createElement("div");
    wrap.className = "bell-wrap"; wrap.id = "bellWrap";
    wrap.innerHTML =
      '<button class="bell-btn" id="bellBtn" type="button" aria-haspopup="dialog" aria-expanded="false" aria-label="Notifications">' + icon("bell", 20) + '<span class="bell-badge" id="bellBadge" hidden>0</span></button>' +
      '<div class="bell-panel" id="bellPanel" role="dialog" aria-label="Notifications">' +
        '<div class="bell-head"><strong>Notifications</strong><button class="bell-link" id="bellAll" type="button">Mark all read</button></div>' +
        '<div class="bell-list" id="bellList" aria-live="polite"></div>' +
        '<div class="bell-foot"><a href="/portal/notifications.html">View all notifications</a></div>' +
      '</div>';

    const host = document.getElementById("bellMount") || document.querySelector(".header-actions");
    if (host && host.id === "bellMount") host.appendChild(wrap);
    else if (host) host.insertBefore(wrap, host.firstChild);
    else { wrap.classList.add("bell-fixed"); document.body.appendChild(wrap); }

    const btn = wrap.querySelector("#bellBtn"), panel = wrap.querySelector("#bellPanel"), list = wrap.querySelector("#bellList"), badge = wrap.querySelector("#bellBadge");
    let unread = null, items = [], loaded = false;

    function setBadge(n) {
      badge.hidden = n <= 0; badge.textContent = n > 99 ? "99+" : String(n);
      btn.setAttribute("aria-label", n > 0 ? "Notifications, " + n + " unread" : "Notifications, none unread");
    }
    function render() {
      if (!loaded) { list.innerHTML = '<div class="state"><span>Loading…</span></div>'; return; }
      if (!items.length) { list.innerHTML = '<div class="state">' + icon("inbox", 34) + '<strong>You\'re all caught up</strong><span>New activity will appear here.</span></div>'; return; }
      list.innerHTML = items.map((n) =>
        '<button type="button" class="note-item ' + (n.read ? "" : "unread") + '" data-id="' + esc(n.id) + '" data-link="' + esc(n.link || "") + '">' +
          '<span class="note-dot" aria-hidden="true"></span>' +
          '<span class="note-ico">' + icon(TYPE_ICON[n.type] || "bell", 16) + '</span>' +
          '<span class="note-body"><span class="note-title">' + esc(n.title) + (n.read ? "" : '<span class="sr-only"> (unread)</span>') + '</span>' +
          '<span class="note-msg" style="display:block">' + esc(n.message) + '</span>' +
          '<span class="note-meta"><span>' + esc(n.senderName) + '</span>' + (n.department ? '<span>' + esc(n.department) + '</span>' : "") + '<span>' + esc(ago(n.createdAt)) + '</span></span></span>' +
        '</button>').join("");
    }

    async function refresh(announce) {
      try {
        const data = await api("/notifications?limit=" + (panel.classList.contains("open") ? 20 : 8));
        const grew = unread !== null && data.unreadCount > unread;
        unread = data.unreadCount; items = data.items; loaded = true;
        setBadge(unread);
        if (panel.classList.contains("open")) render();
        if (grew && announce) {
          btn.classList.remove("ring"); void btn.offsetWidth; btn.classList.add("ring");
          const newest = items.find((n) => !n.read);
          if (newest && window.Utils && Utils.toast) Utils.toast(newest.title + (newest.senderName ? " — " + newest.senderName : ""), "info", 5000);
        }
      } catch (e) { /* offline or session ended — try again next tick */ }
    }

    function toggle(open) {
      const willOpen = open === undefined ? !panel.classList.contains("open") : open;
      panel.classList.toggle("open", willOpen);
      btn.setAttribute("aria-expanded", String(willOpen));
      if (willOpen) { render(); refresh(false); }
    }
    btn.addEventListener("click", (e) => { e.stopPropagation(); toggle(); });
    document.addEventListener("click", (e) => { if (!wrap.contains(e.target)) toggle(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") toggle(false); });

    list.addEventListener("click", async (e) => {
      const el = e.target.closest(".note-item"); if (!el) return;
      const link = el.dataset.link;
      try { await api("/notifications/read", { method: "POST", body: { ids: [el.dataset.id] } }); } catch (err) { /* navigate anyway */ }
      if (link) window.location.href = link; else refresh(false);
    });
    wrap.querySelector("#bellAll").addEventListener("click", async () => {
      try { await api("/notifications/read", { method: "POST", body: { all: true } }); } catch (err) { /* ignore */ }
      refresh(false);
    });

    refresh(false);
    setInterval(() => { if (!document.hidden) refresh(true); }, 15000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(true); });
    window.addEventListener("focus", () => refresh(true));
    window.__refreshBell = () => refresh(false);
  }

  /* ------------------------------------------------------------------ */
  /* 2. PWA: service worker + install prompt                            */
  /* ------------------------------------------------------------------ */
  const INSTALL_KEY = "aurelia_install"; // { state: "installed" | "dismissed", at: ms }
  const DISMISS_DAYS = 14;
  let deferredPrompt = null;

  const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  function installState() { try { return JSON.parse(lsGet(INSTALL_KEY) || "null"); } catch (e) { return null; } }
  function setInstallState(state) { lsSet(INSTALL_KEY, JSON.stringify({ state: state, at: Date.now() })); }
  function shouldOffer() {
    if (isStandalone()) return false;
    const st = installState();
    if (!st) return true;
    if (st.state === "installed") return false;
    return Date.now() - st.at > DISMISS_DAYS * 86400000;
  }

  function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return;
    navigator.serviceWorker.register("/sw.js").catch(function () { /* PWA features simply stay off */ });
  }

  function showInstallCard(mode) {
    if (document.getElementById("installCard") || !readSession()) return;
    const ios = mode === "ios";
    const card = document.createElement("div");
    card.className = "install-card"; card.id = "installCard"; card.setAttribute("role", "dialog"); card.setAttribute("aria-label", "Install Aurelia");
    card.innerHTML =
      '<span class="ic">' + icon("smartphone", 22) + '</span>' +
      '<div class="tx"><b>Install Aurelia PMS</b><span>' + (ios ? "Tap Share, then “Add to Home Screen”." : "Open it like an app — faster, full screen, works on your home screen.") + '</span></div>' +
      (ios ? "" : '<button class="btn btn-gold btn-sm" id="installGo" type="button">Install</button>') +
      '<button class="x" id="installX" type="button" aria-label="Dismiss">' + icon("x", 16) + '</button>';
    document.body.appendChild(card);
    requestAnimationFrame(function () { card.classList.add("show"); });
    const close = function () { card.classList.remove("show"); setTimeout(function () { card.remove(); }, 300); };
    card.querySelector("#installX").addEventListener("click", function () { setInstallState("dismissed"); close(); });
    const go = card.querySelector("#installGo");
    if (go) go.addEventListener("click", function () { close(); runInstall(); });
  }

  async function runInstall() {
    if (!deferredPrompt) return false;
    const p = deferredPrompt; deferredPrompt = null;
    p.prompt();
    const choice = await p.userChoice;
    // Only the browser's own confirmation counts — see the appinstalled event.
    if (choice.outcome !== "accepted") setInstallState("dismissed");
    refreshInstallButtons();
    return choice.outcome === "accepted";
  }

  function refreshInstallButtons() {
    document.querySelectorAll("[data-install-btn]").forEach(function (b) { b.hidden = !(deferredPrompt && !isStandalone()); });
  }

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredPrompt = e;
    refreshInstallButtons();
    if (readSession() && shouldOffer()) setTimeout(function () { if (deferredPrompt) showInstallCard("native"); }, 1800);
  });
  window.addEventListener("appinstalled", function () {
    deferredPrompt = null; setInstallState("installed");
    const c = document.getElementById("installCard"); if (c) c.remove();
    refreshInstallButtons();
    if (window.Utils && Utils.toast) Utils.toast("Aurelia PMS was installed on this device.", "success");
  });
  document.addEventListener("click", function (e) {
    const b = e.target.closest && e.target.closest("[data-install-btn]");
    if (b) runInstall();
  });
  window.AureliaInstall = { run: runInstall, available: function () { return Boolean(deferredPrompt) && !isStandalone(); }, standalone: isStandalone };

  function iosHint() {
    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (ios && !isStandalone() && readSession() && shouldOffer()) setTimeout(function () { showInstallCard("ios"); }, 2500);
  }

  /* ------------------------------------------------------------------ */
  /* 3. Idle auto-logout (personal accounts)                            */
  /* ------------------------------------------------------------------ */
  function idleWatch() {
    const s = readSession();
    if (!s || !s.accountId || !s.idleTimeoutMinutes) return;
    const LIMIT = s.idleTimeoutMinutes * 60000, ACT = "aurelia_last_active";
    const touch = (function () { let t = 0; return function () { const n = Date.now(); if (n - t > 5000) { t = n; lsSet(ACT, String(n)); } }; })();
    ["pointerdown", "keydown", "scroll", "touchstart"].forEach(function (ev) { window.addEventListener(ev, touch, { passive: true }); });
    touch();
    setInterval(function () {
      const last = Number(lsGet(ACT) || Date.now());
      if (Date.now() - last > LIMIT) {
        const role = (readSession() || {}).role;
        try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
        window.location.href = (role === "owner" ? "/owner/login.html" : "/login.html") + "?reason=idle";
      }
    }, 30000);
  }

  /* ------------------------------------------------------------------ */
  /* 4. Public header: signed-in shortcut                               */
  /* ------------------------------------------------------------------ */
  function publicHeader() {
    const s = readSession(); if (!s) return;
    const home = s.role === "owner" ? "/owner/dashboard.html" : (s.accountId && s.role === "manager") ? "/manager/dashboard.html"
      : ({ employee: "/employee/dashboard.html", restaurant: "/admin/restaurant/pos.html", reservations: "/admin/reservations.html", housekeeping: "/admin/housekeeping.html", maintenance: "/admin/maintenance.html", hr: "/admin/employees.html", accountant: "/admin/finance.html" }[s.role] || "/admin/dashboard.html");
    document.querySelectorAll('a[href="/login.html"]').forEach(function (a) {
      if (a.closest(".site-header, .drawer")) { a.setAttribute("href", home); a.textContent = "My workspace"; }
    });
  }

  function boot() {
    registerSW();
    if (window.Icons && window.Icons.hydrate) window.Icons.hydrate(document);
    if (readSession()) { mountBell(); publicHeader(); idleWatch(); iosHint(); }
    refreshInstallButtons();
  }
  // Run after the page's own DOMContentLoaded handlers (the admin shell builds its topbar there).
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 0); });
  else setTimeout(boot, 0);
})();
