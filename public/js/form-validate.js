/* Client-side validation for public forms. Mirrors the server rules (the
 * server validates again — this is only for fast, friendly feedback).
 * Usage: FormValidate.attach(form, async (data) => { ...submit... }) */
const FormValidate = (() => {
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function rule(input) {
    const v = input.value.trim(), label = (input.closest(".field")?.querySelector("label")?.firstChild?.textContent || input.name).trim();
    if (input.required && !v) return `${label} is required.`;
    if (!v) return "";
    if (input.type === "email" && !EMAIL.test(v)) return "Enter a valid email address, e.g. name@example.com.";
    if (input.type === "tel") { const d = v.replace(/\D/g, ""); if (!/^[+\d][\d\s().-]*$/.test(v) || d.length < 7 || d.length > 15) return "Enter a valid phone number (7–15 digits)."; }
    if (input.minLength > 0 && v.length < input.minLength) return `${label} must be at least ${input.minLength} characters.`;
    if (input.type === "number" && input.min !== "" && Number(v) < Number(input.min)) return `${label} must be at least ${input.min}.`;
    return "";
  }
  function show(input, msg) {
    const f = input.closest(".field"); if (!f) return;
    let e = f.querySelector(".err");
    if (!e) { e = document.createElement("span"); e.className = "err"; e.setAttribute("role", "alert"); f.appendChild(e); }
    e.textContent = msg; input.classList.toggle("invalid", Boolean(msg)); input.setAttribute("aria-invalid", msg ? "true" : "false");
  }
  function attach(form, onValid, { successBox, errorBox } = {}) {
    form.noValidate = true;
    form.querySelectorAll("input,select,textarea").forEach((i) => { i.addEventListener("blur", () => show(i, rule(i))); i.addEventListener("input", () => { if (i.classList.contains("invalid")) show(i, rule(i)); }); });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      let first = null;
      form.querySelectorAll("input,select,textarea").forEach((i) => { const m = rule(i); show(i, m); if (m && !first) first = i; });
      if (errorBox) errorBox.classList.add("hidden");
      if (first) { first.focus(); return; }
      const btn = form.querySelector("button[type=submit]"); const label = btn.textContent;
      btn.disabled = true; btn.textContent = "Sending…";
      try { await onValid(Object.fromEntries(new FormData(form).entries())); }
      catch (err) { if (errorBox) { errorBox.textContent = err.message; errorBox.classList.remove("hidden"); } else if (window.Utils) Utils.toast(err.message, "error"); }
      finally { btn.disabled = false; btn.textContent = label; }
    });
  }
  return { attach, rule };
})();
