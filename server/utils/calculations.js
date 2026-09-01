const env = require("../config/environment");
const { nightsBetween } = require("./dateUtils");

/**
 * Duration-based pricing tiers (spec request: different rates for a night,
 * a week, a month, like a real hotel's rate card). A roomType can define
 * `weeklyDiscountPercent` and `monthlyDiscountPercent` — e.g. 10% off the
 * nightly rate once a stay reaches 7 nights, 25% off once it reaches 28.
 * Falls back to 0 (no discount) if the room type doesn't define them, so
 * older/simpler room types keep working unchanged.
 */
function tierDiscountForNights(nights, { weeklyDiscountPercent = 0, monthlyDiscountPercent = 0 } = {}) {
  if (nights >= 28 && monthlyDiscountPercent) return monthlyDiscountPercent;
  if (nights >= 7 && weeklyDiscountPercent) return weeklyDiscountPercent;
  return 0;
}

/**
 * All pricing math lives here so the server (never the client) is the
 * single source of truth for totals — spec §84 explicitly forbids
 * frontend-computed prices.
 */
function quoteRoom({ nightlyRate, checkIn, checkOut, discountPercent = 0, weeklyDiscountPercent = 0, monthlyDiscountPercent = 0 }) {
  const nights = nightsBetween(checkIn, checkOut);
  const tierDiscount = tierDiscountForNights(nights, { weeklyDiscountPercent, monthlyDiscountPercent });
  const effectiveDiscount = Math.max(discountPercent, tierDiscount);
  const roomTotal = Math.round(nightlyRate * nights * (1 - effectiveDiscount / 100));
  const tax = Math.round(roomTotal * (env.taxRatePercent / 100));
  const total = roomTotal + tax;
  const deposit = Math.round(total * (env.defaultDepositPercent / 100));
  return { nights, roomTotal, tax, total, deposit, appliedDiscountPercent: effectiveDiscount };
}

/** Returns the full rate card (nightly / weekly / monthly effective
 * per-night price) for display on the room details page — so a guest can
 * see the savings before picking dates. */
function buildRateCard({ nightlyRate, weeklyDiscountPercent = 0, monthlyDiscountPercent = 0 }) {
  const weeklyPerNight = weeklyDiscountPercent ? Math.round(nightlyRate * (1 - weeklyDiscountPercent / 100)) : null;
  const monthlyPerNight = monthlyDiscountPercent ? Math.round(nightlyRate * (1 - monthlyDiscountPercent / 100)) : null;
  return {
    nightly: nightlyRate,
    weekly: weeklyPerNight ? { perNight: weeklyPerNight, total: weeklyPerNight * 7, savePercent: weeklyDiscountPercent } : null,
    monthly: monthlyPerNight ? { perNight: monthlyPerNight, total: monthlyPerNight * 28, savePercent: monthlyDiscountPercent } : null,
  };
}

function recalcFolio(items) {
  const total = items.reduce((sum, it) => sum + Number(it.amount || 0), 0);
  return Math.round(total);
}

function balanceOf({ total, paid }) {
  return Math.max(0, Math.round(Number(total || 0) - Number(paid || 0)));
}

module.exports = { quoteRoom, buildRateCard, recalcFolio, balanceOf };
