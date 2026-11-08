const { ApiError } = require("./errors");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Trims and caps a text field; returns undefined for empty input. */
function text(v, max = 200) {
  if (v === undefined || v === null) return undefined;
  const s = String(v).replace(/[\u0000-\u001F\u007F]/g, " ").trim();
  return s ? s.slice(0, max) : undefined;
}

function requireName(v, label = "Full name") {
  const s = text(v, 120);
  if (!s || s.length < 2) throw new ApiError(400, `${label} is required.`);
  return s;
}
function optionalEmail(v) {
  const s = text(v, 160);
  if (!s) return undefined;
  if (!EMAIL_RE.test(s)) throw new ApiError(400, "Enter a valid email address.");
  return s.toLowerCase();
}
function optionalPhone(v) {
  const s = text(v, 30);
  if (!s) return undefined;
  const digits = s.replace(/\D/g, "");
  if (!/^[+\d][\d\s().-]*$/.test(s) || digits.length < 7 || digits.length > 15) throw new ApiError(400, "Enter a valid phone number (7–15 digits).");
  return s;
}
function requirePhone(v) {
  const p = optionalPhone(v);
  if (!p) throw new ApiError(400, "A phone number is required.");
  return p;
}
function pick(obj, keys) {
  const out = {};
  for (const k of keys) { const v = text(obj?.[k], 600); if (v !== undefined) out[k] = v; }
  return out;
}

module.exports = { EMAIL_RE, text, requireName, optionalEmail, optionalPhone, requirePhone, pick };
