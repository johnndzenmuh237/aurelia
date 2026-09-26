/**
 * Minimal CSV writer — no extra dependency needed for a feature this
 * small. Handles the two things that actually break naive CSV output:
 * commas/quotes/newlines inside a value, and Firestore Timestamp objects
 * (converted to ISO strings) or nested objects (JSON-stringified) rather
 * than printing "[object Object]".
 */
function csvEscape(value) {
  if (value === null || value === undefined) return "";
  let v = value;
  if (v && typeof v === "object" && typeof v.toDate === "function") v = v.toDate().toISOString();
  else if (v instanceof Date) v = v.toISOString();
  else if (typeof v === "object") v = JSON.stringify(v);
  const str = String(v);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

/** rows: array of flat objects. columns: optional explicit column order
 * (defaults to the keys of the first row). */
function toCsv(rows, columns) {
  if (!rows || !rows.length) return (columns || []).join(",") + "\n";
  const cols = columns || Object.keys(rows[0]);
  const header = cols.join(",");
  const lines = rows.map((row) => cols.map((c) => csvEscape(row[c])).join(","));
  return [header, ...lines].join("\n") + "\n";
}

module.exports = { toCsv, csvEscape };
