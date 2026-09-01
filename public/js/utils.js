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
    if (window.firebaseAuth?.currentUser) {
      return window.firebaseAuth.currentUser.getIdToken();
    }
    return null;
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
      const token = await getIdToken();
      if (token) headers.Authorization = `Bearer ${token}`;
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
      throw new Error(message);
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

  function skeletonRows(count, cols) {
    return Array.from({ length: count })
      .map(() => `<tr>${Array.from({ length: cols }).map(() => `<td><div class="skeleton" style="height:14px;width:80%"></div></td>`).join("")}</tr>`)
      .join("");
  }

  return { formatMoney, formatDate, formatDateTime, nightsBetween, toast, statusChip, qs, api, debounce, skeletonRows, getIdToken };
})();
