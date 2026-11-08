/* Shared utilities used across every page (public site + admin + guest + employee). */

const Utils = (() => {
  function formatMoney(amount) {
    const n = Number(amount || 0);
    return n.toLocaleString(window.HOTEL_CONFIG?.locale || "en-CM") + " " + (window.HOTEL_CONFIG?.currency || "FCFA");
  }

  function formatDate(dateLike, opts = { year: "numeric", month: "short", day: "numeric" }) {
    if (!dateLike) return "—";
    const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
    if (isNaN(d)) return "—";
    return d.toLocaleDateString(window.HOTEL_CONFIG?.locale || "en-CM", opts);
  }

  function formatDateTime(dateLike) {
    if (!dateLike) return "—";
    const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
    if (isNaN(d)) return "—";
    return d.toLocaleString(window.HOTEL_CONFIG?.locale || "en-CM", {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  }

  function nightsBetween(checkIn, checkOut) {
    const a = new Date(checkIn), b = new Date(checkOut);
    return Math.max(1, Math.round((b - a) / 86400000));
  }

  /** Converts an internal room number (F3, A3, APT12) into the friendly
   * label guests and staff actually use ("Room 3 (Fan)", "Room 3 (AC)",
   * "Apartment 12"). The internal code stays unique per physical unit so
   * "Room 3 (Fan)" and "Room 3 (AC)" can never collide in reservations —
   * see database/seed.js and database/database-schema.md. */
  function formatRoomLabel(roomNumber) {
    if (!roomNumber) return "—";
    const apt = /^APT(\d+)$/i.exec(roomNumber);
    if (apt) return `Apartment ${apt[1]}`;
    const fan = /^F(\d+)$/i.exec(roomNumber);
    if (fan) return `Room ${fan[1]} (Fan)`;
    const ac = /^A(\d+)$/i.exec(roomNumber);
    if (ac) return `Room ${ac[1]} (AC)`;
    return roomNumber;
  }

  function toast(message, type = "info", ms = 4200) {
    let stack = document.querySelector(".toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.className = "toast-stack";
      document.body.appendChild(stack);
    }
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => el.remove(), ms);
  }

  function statusChip(status) {
    const key = String(status || "").toLowerCase().replace(/[\s_-]/g, "");
    const span = document.createElement("span");
    span.className = `chip chip-${key}`;
    span.textContent = status;
    return span;
  }

  function qs(name, url = window.location.href) {
    return new URL(url).searchParams.get(name);
  }

  async function getIdToken() {
    // Kept as a function (not inlined) since several older page scripts
    // still call Utils.getIdToken() directly — now reads the JWT that
    // Auth.login() stored, instead of a Firebase ID token.
    return typeof Auth !== "undefined" ? Auth.getToken() : null;
  }

  /**
   * Central API client. Every write (booking, check-in, payment, etc.)
   * goes through the server — never straight to Firestore from the
   * browser — so availability, folio math, and role checks are always
   * enforced server-side (see /server/middleware and /api routes).
   */
  async function api(path, { method = "GET", body, auth = true } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (auth) {
      const token = getIdToken();
      const resolved = token instanceof Promise ? await token : token;
      if (resolved) headers.Authorization = `Bearer ${resolved}`;
    }
    const res = await fetch(`${window.HOTEL_CONFIG.apiBaseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch (_) { /* no body */ }
    if (!res.ok) {
      const message = data?.error?.message || "Something went wrong. Please try again.";
      // A signed-in request that comes back 401 means the session ended —
      // expired, signed out elsewhere, or the owner revoked this account.
      if (res.status === 401 && auth && typeof Auth !== "undefined" && Auth.getToken()) {
        Auth.logout("expired");
      }
      if (res.status === 403 && data?.error?.details?.code === "PASSWORD_CHANGE_REQUIRED" && typeof Auth !== "undefined") {
        const s = Auth.getSession(); if (s) { s.mustChangePassword = true; Auth.replaceSession({ ...s }); }
        window.location.href = "/portal/account.html?force=1";
      }
      const err = new Error(message);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function debounce(fn, wait = 300) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  /**
   * Replaces Firestore's onSnapshot() for staff-only collections now that
   * there's no Firebase Auth to gate direct client reads with. Fetches
   * immediately, then re-fetches on an interval — the callback receives
   * a plain array of {id, ...fields} objects, matching the shape pages
   * already expect from `snap.docs.map(d => ({id: d.id, ...d.data()}))`.
   * Returns a stop() function; call it if a page tears down its polling
   * before navigating away (most pages don't bother — a page unload
   * clears the interval automatically).
   */
  function pollCollection(collectionName, callback, { intervalMs = 8000 } = {}) {
    let stopped = false;
    async function tick() {
      if (stopped) return;
      try {
        const res = await api(`/staff/data/${collectionName}`);
        callback(res.items || []);
      } catch (err) {
        console.error(`[pollCollection:${collectionName}]`, err.message);
      }
      if (!stopped) setTimeout(tick, intervalMs);
    }
    tick();
    return () => { stopped = true; };
  }

  function skeletonRows(count, cols) {
    return Array.from({ length: count })
      .map(() => `<tr>${Array.from({ length: cols }).map(() => `<td><div class="skeleton" style="height:14px;width:80%"></div></td>`).join("")}</tr>`)
      .join("");
  }

  /** Escapes text for safe use inside innerHTML. */
  function esc(v) {
    return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /** "5 min ago", "Yesterday 14:05" … for notification and message times. */
  function timeAgo(iso) {
    if (!iso) return "";
    const d = new Date(iso); if (isNaN(d)) return "";
    const s = Math.round((Date.now() - d.getTime()) / 1000);
    if (s < 45) return "just now";
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return d.toLocaleString(window.HOTEL_CONFIG?.locale || "en-CM", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  /** Normalises Firestore timestamps ({_seconds}) and strings to a Date. */
  function toDate(v) {
    if (!v) return null;
    if (v._seconds !== undefined) return new Date(v._seconds * 1000);
    const d = new Date(v);
    return isNaN(d) ? null : d;
  }

  /** Accessible confirm dialog (replaces window.confirm). Resolves true/false. */
  function confirmDialog({ title = "Are you sure?", message = "", confirmText = "Confirm", danger = false } = {}) {
    return new Promise((resolve) => {
      const wrap = document.createElement("div");
      wrap.className = "dlg-scrim";
      wrap.innerHTML = `<div class="dlg sm" role="alertdialog" aria-modal="true" aria-labelledby="cdT"><div class="dlg-head"><h3 id="cdT">${esc(title)}</h3></div><div class="dlg-body"><p style="margin:0">${esc(message)}</p></div><div class="dlg-foot"><button class="btn btn-ghost" data-r="0">Cancel</button><button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-r="1">${esc(confirmText)}</button></div></div>`;
      const done = (v) => { document.removeEventListener("keydown", onKey); wrap.remove(); resolve(v); };
      const onKey = (e) => { if (e.key === "Escape") done(false); };
      wrap.addEventListener("click", (e) => { if (e.target === wrap) done(false); const b = e.target.closest("[data-r]"); if (b) done(b.dataset.r === "1"); });
      document.addEventListener("keydown", onKey);
      document.body.appendChild(wrap);
      wrap.querySelector("[data-r='1']").focus();
    });
  }

  return { esc, timeAgo, toDate, confirmDialog, formatMoney, formatDate, formatDateTime, nightsBetween, formatRoomLabel, toast, statusChip, qs, api, pollCollection, debounce, skeletonRows, getIdToken };
})();

window.Utils = Utils;
