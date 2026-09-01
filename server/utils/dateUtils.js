function toDateOnly(d) {
  const date = d instanceof Date ? d : new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
}

function nightsBetween(checkIn, checkOut) {
  const a = toDateOnly(checkIn), b = toDateOnly(checkOut);
  const diff = Math.round((b - a) / 86400000);
  return Math.max(1, diff);
}

/** True if [aStart, aEnd) overlaps [bStart, bEnd) — half-open date ranges,
 * so a checkout on day X does not conflict with a check-in on day X. */
function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return toDateOnly(aStart) < toDateOnly(bEnd) && toDateOnly(bStart) < toDateOnly(aEnd);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = { toDateOnly, nightsBetween, rangesOverlap, todayStr };
