/* Shared registration form for owner-created managers and manager-created team
 * members: the same fields, the same rules, the same profile card. The server
 * enforces every rule again; this only gives instant, clear feedback. */
(function () {
  const esc = PortalUI.esc, ic = PortalUI.ic;
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  const ID_TYPES = ["National ID card", "Passport", "Driver's licence", "Residence permit"];
  const GENDERS = ["Female", "Male", "Other", "Prefer not to say"];
  const EMP_TYPES = ["Full-time", "Part-time", "Contract"];
  const COUNTRIES = ["Cameroon", "Nigeria", "Ghana", "Gabon", "Chad", "Central African Republic", "Congo", "DR Congo", "Equatorial Guinea", "Senegal", "Côte d'Ivoire", "Benin", "Togo", "Niger", "Mali", "Burkina Faso", "Kenya", "Uganda", "Tanzania", "Rwanda", "Ethiopia", "South Africa", "Morocco", "Egypt", "France", "United Kingdom", "United States", "Canada", "Germany", "Belgium", "Italy", "Spain", "China", "India", "United Arab Emirates"];
  const PROFILE_KEYS = ["dateOfBirth", "gender", "nationality", "phone", "addressLine", "city", "region", "country", "idType", "idNumber", "position", "employmentType", "startDate", "emergencyName", "emergencyRelation", "emergencyPhone"];
  const opts = (list, sel, blank) => (blank ? `<option value="">${blank}</option>` : "") + list.map(o => `<option ${o === sel ? "selected" : ""}>${esc(o)}</option>`).join("");
  const maxDob = () => { const d = new Date(); d.setFullYear(d.getFullYear() - 18); return d.toISOString().slice(0, 10); };
  const pick = (d) => Object.fromEntries(PROFILE_KEYS.map(k => [k, (d[k] || "").trim()]));

  function fields(m = {}, withPw = true) {
    const p = Object.assign({}, m.profile || {}, { phone: m.phone || "" });
    const f = (name, label, o = {}) => `<div class="field"><label>${label}${o.req ? '<span class="req">*</span>' : ""}</label>${o.html || `<input name="${name}" type="${o.type || "text"}" value="${esc(o.value !== undefined ? o.value : (p[name] || ""))}" ${o.req ? "required" : ""} ${o.attrs || ""}>`}${o.hint ? `<span class="hint">${o.hint}</span>` : ""}</div>`;
    const legacy = m.id && !m.profile ? `<div class="alert alert-info">${ic("info")}<span>This account was created before registration details were collected. Complete the required fields below to save changes.</span></div>` : "";
    return legacy +
      `<div class="form-section">Personal details</div>` +
      f("fullName", "Full name", { req: true, value: m.fullName || "", attrs: 'autocomplete="off" placeholder="As shown on the ID document"' }) +
      `<div class="field-row">` + f("dateOfBirth", "Date of birth", { req: true, type: "date", attrs: `max="${maxDob()}"`, hint: "Must be 18 or older." }) +
      f("gender", "Gender", { html: `<select name="gender">${opts(GENDERS, p.gender, "Select…")}</select>` }) + `</div>` +
      f("nationality", "Nationality", { attrs: 'placeholder="e.g. Cameroonian"' }) +
      `<div class="form-section">Contact and location</div>` +
      `<div class="field-row">` + f("email", "Email address", { req: true, type: "email", value: m.email || "", hint: "Used to sign in and for password reset codes.", attrs: 'autocomplete="off"' }) +
      f("phone", "Phone number", { req: true, type: "tel", attrs: 'placeholder="+237 6XX XXX XXX" inputmode="tel"' }) + `</div>` +
      f("addressLine", "Home address", { req: true, attrs: 'placeholder="Street, quarter / neighbourhood"' }) +
      `<div class="field-row">` + f("city", "City / town", { req: true }) + f("region", "Region / state") + `</div>` +
      f("country", "Country", { req: true, attrs: 'list="countryList"' }) + `<datalist id="countryList">${COUNTRIES.map(c => `<option value="${esc(c)}">`).join("")}</datalist>` +
      `<div class="form-section">Identification</div>` +
      `<div class="field-row">` + f("idType", "ID document", { req: true, html: `<select name="idType" required>${opts(ID_TYPES, p.idType, "Select…")}</select>` }) +
      f("idNumber", "ID document number", { req: true, attrs: 'autocomplete="off"', hint: "One person, one ID: duplicates are refused." }) + `</div>` +
      `<div class="form-section">Employment</div>` +
      f("position", "Job title", { req: true, attrs: 'placeholder="e.g. Front office manager"' }) +
      `<div class="field-row">` + f("employmentType", "Employment type", { html: `<select name="employmentType">${opts(EMP_TYPES, p.employmentType || "Full-time")}</select>` }) +
      f("startDate", "Start date", { type: "date" }) + `</div>` +
      `<div class="form-section">Emergency contact <span class="muted" style="text-transform:none;letter-spacing:0">(optional)</span></div>` +
      f("emergencyName", "Contact name") +
      `<div class="field-row">` + f("emergencyRelation", "Relationship", { attrs: 'placeholder="e.g. Spouse, Brother"' }) + f("emergencyPhone", "Contact phone", { type: "tel", attrs: 'inputmode="tel"' }) + `</div>` +
      (withPw ? `<div class="form-section">Sign-in</div><div class="field"><label>Username <span class="muted">(optional)</span></label><input name="username" autocomplete="off" placeholder="defaults to the email"></div>
      ${PortalUI.passwordField({ name: "password", label: "Initial password", meter: true, hint: "They must choose their own password at first sign-in." })}` : "");
  }

  function validate(d, needPw) {
    const bad = (m) => { throw new Error(m); };
    if (d.fullName.trim().length < 2) bad("Enter the person's full name.");
    if (!d.dateOfBirth) bad("Enter the date of birth.");
    const dob = new Date(d.dateOfBirth); if (isNaN(dob) || dob > new Date(maxDob() + "T23:59:59")) bad("The person must be at least 18 years old.");
    if (!EMAIL.test(d.email.trim())) bad("Enter a valid email address.");
    const digits = (d.phone || "").replace(/\D/g, ""); if (digits.length < 7 || digits.length > 15 || !/^[+\d][\d\s().-]*$/.test(d.phone.trim())) bad("Enter a valid phone number (7–15 digits).");
    if (!d.addressLine.trim()) bad("Enter the home address.");
    if (!d.city.trim()) bad("Enter the city or town.");
    if (!d.country.trim()) bad("Enter the country.");
    if (!d.idType) bad("Choose the ID document type.");
    if (!/^[A-Za-z0-9][A-Za-z0-9 /.-]{3,29}$/.test(d.idNumber.trim())) bad("Enter the ID document number (4–30 letters or digits).");
    if (!d.position.trim()) bad("Enter the job title.");
    const ep = (d.emergencyPhone || "").trim(), en = (d.emergencyName || "").trim();
    if ((ep || en) && !(ep && en)) bad("Give both the emergency contact's name and phone, or leave both empty.");
    if (ep) { const x = ep.replace(/\D/g, ""); if (x.length < 7 || x.length > 15) bad("The emergency contact phone is not a valid number."); }
    if (needPw && d.password.length < 10) bad("The initial password must be at least 10 characters.");
  }


  const fmtDate = (v) => { if (!v) return ""; const d = new Date(v + (String(v).length === 10 ? "T00:00:00" : "")); return isNaN(d) ? esc(v) : d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }); };
  const row = (label, value) => `<div class="pf-row"><dt>${label}</dt><dd>${value ? esc(value) : '<span class="muted">Not provided</span>'}</dd></div>`;
  const sect = (title, icon, rows) => `<section class="pf-sect"><h4>${ic(icon, 16)} ${title}</h4><dl>${rows}</dl></section>`;

  /** A read-only, responsive profile for an account. `depts` maps keys to labels. */
  function card(a, depts) {
    const p = a.profile || {}; depts = depts || {};
    const incomplete = !a.profile ? `<div class="alert alert-info">${ic("info")}<span>This account was created before registration details were collected, so some details are missing. Use Edit to complete them.</span></div>` : "";
    const status = a.status === "active" ? '<span class="badge">Active</span>' : '<span class="badge off">Deactivated</span>';
    const roleLabel = a.tier === "staff" ? (a.staffRole || "Team member") : (a.role === "owner" ? "Business owner" : "Manager");
    return `<div class="pf">
      <header class="pf-head"><span class="pf-avatar" aria-hidden="true">${esc(PortalUI.initials ? PortalUI.initials(a.fullName) : (a.fullName || "?").slice(0, 1))}</span>
        <div><h3>${esc(a.fullName)}</h3><p class="muted">${esc(roleLabel)}${p.position && p.position !== roleLabel ? " · " + esc(p.position) : ""}</p><div class="tags">${status}${a.mustChangePassword ? ' <span class="badge warn">Password change pending</span>' : ""}</div></div></header>
      ${incomplete}
      <div class="pf-grid">
        ${sect("Contact", "phone", row("Email", a.email) + row("Phone", a.phone || p.phone) + row("Username", a.username))}
        ${sect("Location", "map-pin", row("Address", p.addressLine) + row("City / town", p.city) + row("Region / state", p.region) + row("Country", p.country))}
        ${sect("Personal", "user", row("Date of birth", fmtDate(p.dateOfBirth)) + row("Gender", p.gender) + row("Nationality", p.nationality))}
        ${sect("Identification", "id-card", row("Document", p.idType) + row("Number", p.idNumber))}
        ${sect("Employment", "briefcase", row("Job title", p.position) + row("Type", p.employmentType) + row("Start date", fmtDate(p.startDate)))}
        ${sect("Emergency contact", "heart-pulse", row("Name", p.emergencyName) + row("Relationship", p.emergencyRelation) + row("Phone", p.emergencyPhone))}
        ${sect("Access", "shield-check", row("Departments", (a.departments || []).map((d) => depts[d] || d).join(", ")) + row("Rights", (a.permissions || []).join(", ")) + row("Created", a.createdAt ? new Date(a.createdAt).toLocaleDateString() : "") + (a.createdByName ? row("Created by", a.createdByName) : "") + row("Last sign-in", a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleString() : "Never"))}
      </div></div>`;
  }

  window.ProfileForm = { fields, validate, pick, card, EMAIL, KEYS: PROFILE_KEYS };
})();