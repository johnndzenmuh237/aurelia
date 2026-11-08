const crypto = require("crypto");

/**
 * Password hashing with scrypt (Node built-in — no new dependency).
 * Stored format:  scrypt$<N>$<r>$<p>$<saltBase64>$<hashBase64>
 * The parameters are stored with the hash so they can be raised later
 * without invalidating existing passwords.
 */
const N = 16384, R = 8, P = 1, KEYLEN = 64;

function scrypt(password, salt, n, r, p) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEYLEN, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

async function verifyPassword(password, stored) {
  try {
    const [scheme, n, r, p, saltB64, hashB64] = String(stored || "").split("$");
    if (scheme !== "scrypt") return false;
    const expected = Buffer.from(hashB64, "base64");
    const actual = await scrypt(String(password), Buffer.from(saltB64, "base64"), Number(n), Number(r), Number(p));
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/** Returns an error message, or null when the password is acceptable. */
function passwordProblem(password) {
  const pw = String(password || "");
  if (pw.length < 10) return "Password must be at least 10 characters long.";
  if (pw.length > 128) return "Password is too long (max 128 characters).";
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/[0-9]/.test(pw)) {
    return "Password must include an uppercase letter, a lowercase letter and a number.";
  }
  return null;
}

/** Cryptographically random numeric code (for password-reset verification). */
function randomCode(digits = 6) {
  return String(crypto.randomInt(0, 10 ** digits)).padStart(digits, "0");
}

/** Constant-time comparison of two strings of any length. */
function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

module.exports = { hashPassword, verifyPassword, passwordProblem, randomCode, safeEqual, sha256 };
