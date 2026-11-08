/* Small UI helpers shared by the owner / manager / portal pages. */
const PortalUI = (() => {
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ic = (n, s) => (window.Icons ? window.Icons.svg(n, { size: s || 18 }) : "");

  /** Opens a dialog. Returns { el, close }. `onSubmit(form, close)` runs on submit of the inner <form>. */
  function modal({ title, body, submitText = "Save", danger = false, small = false, onSubmit, hideFooter = false }) {
    const wrap = document.createElement("div");
    wrap.className = "dlg-scrim";
    wrap.innerHTML = `<div class="dlg ${small ? "sm" : ""}" role="dialog" aria-modal="true" aria-labelledby="dlgT">
      <form novalidate>
        <div class="dlg-head"><h3 id="dlgT">${esc(title)}</h3><button type="button" class="icon-btn" data-close aria-label="Close">${ic("x")}</button></div>
        <div class="dlg-body">${body}<div class="alert alert-error hidden" data-err role="alert"></div></div>
        ${hideFooter ? "" : `<div class="dlg-foot"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn ${danger ? "btn-danger" : "btn-primary"}">${esc(submitText)}</button></div>`}
      </form></div>`;
    const close = () => { document.removeEventListener("keydown", onKey); wrap.remove(); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    wrap.addEventListener("mousedown", (e) => { if (e.target === wrap) close(); });
    wrap.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
    const form = wrap.querySelector("form");
    const errBox = wrap.querySelector("[data-err]");
    const showError = (m) => { errBox.innerHTML = ic("circle-x") + `<span>${esc(m)}</span>`; errBox.classList.remove("hidden"); };
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errBox.classList.add("hidden");
      const btn = form.querySelector("button[type=submit]");
      if (btn) { btn.disabled = true; btn.dataset.t = btn.textContent; btn.innerHTML = `${ic("loader-circle")} Working…`; }
      try { await onSubmit(form, close); }
      catch (err) { showError(err.message || "Something went wrong."); }
      finally { if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = btn.dataset.t; } }
    });
    document.body.appendChild(wrap);
    const first = form.querySelector("input,select,textarea,button[type=submit]");
    if (first) first.focus();
    return { el: wrap, close, showError };
  }

  function passwordField({ name, label, autocomplete = "new-password", meter = false, required = true, hint = "" }) {
    return `<div class="field"><label for="f_${name}">${esc(label)}${required ? '<span class="req" aria-hidden="true">*</span>' : ""}</label>
      <div class="pw-wrap"><input id="f_${name}" name="${name}" type="password" autocomplete="${autocomplete}" ${required ? "required" : ""}>
      <button type="button" class="pw-toggle" data-pw-toggle="f_${name}" aria-label="Show password">${ic("eye")}</button></div>
      ${meter ? `<div class="pw-meter" aria-hidden="true"><i data-meter="f_${name}"></i></div>` : ""}
      ${hint ? `<span class="hint">${esc(hint)}</span>` : ""}</div>`;
  }

  /** Wires show/hide toggles and strength meters inside root. */
  function wirePasswords(root) {
    root.querySelectorAll("[data-pw-toggle]").forEach((b) => b.addEventListener("click", () => {
      const i = root.querySelector("#" + b.dataset.pwToggle);
      const show = i.type === "password";
      i.type = show ? "text" : "password";
      b.innerHTML = ic(show ? "eye-off" : "eye");
      b.setAttribute("aria-label", show ? "Hide password" : "Show password");
    }));
    root.querySelectorAll("[data-meter]").forEach((m) => {
      const i = root.querySelector("#" + m.dataset.meter);
      i.addEventListener("input", () => {
        const v = i.value; let s = 0;
        if (v.length >= 10) s++; if (v.length >= 14) s++; if (/[a-z]/.test(v) && /[A-Z]/.test(v)) s++; if (/\d/.test(v)) s++; if (/[^A-Za-z0-9]/.test(v)) s++;
        m.style.width = (s / 5) * 100 + "%"; m.style.background = s <= 2 ? "var(--danger)" : s <= 3 ? "var(--warn)" : "var(--ok)";
      });
    });
  }

  function formData(form) { return Object.fromEntries(new FormData(form).entries()); }

  function loading(rows = 4) { return `<div style="padding:20px;display:grid;gap:12px">${Array.from({ length: rows }).map(() => '<div class="skeleton" style="height:16px"></div>').join("")}</div>`; }
  function empty(icon, title, text) { return `<div class="state">${ic(icon, 34)}<strong>${esc(title)}</strong><span>${esc(text || "")}</span></div>`; }
  function error(msg) { return `<div class="state">${ic("triangle-alert", 34)}<strong>Couldn't load this</strong><span>${esc(msg)}</span></div>`; }
  function initials(name) { return String(name || "?").split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase(); }

  /** Pulls a value out of a Firestore-ish timestamp or ISO string. */
  function when(v) {
    if (!v) return "—";
    const d = v._seconds !== undefined ? new Date(v._seconds * 1000) : new Date(v);
    return isNaN(d) ? "—" : d.toLocaleString([], { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  return { esc, ic, modal, passwordField, wirePasswords, formData, loading, empty, error, initials, when };
})();
