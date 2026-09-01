const { rangesOverlap, nightsBetween } = require("../server/utils/dateUtils");
const { quoteRoom, balanceOf } = require("../server/utils/calculations");

describe("dateUtils.rangesOverlap", () => {
  test("detects a genuine overlap", () => {
    expect(rangesOverlap("2026-08-20", "2026-08-23", "2026-08-22", "2026-08-25")).toBe(true);
  });

  test("does NOT flag back-to-back stays as a conflict (checkout day == next check-in day)", () => {
    // spec §12 half-open range: a checkout on day X frees the room for a
    // new check-in on day X — this must never be reported as a conflict.
    expect(rangesOverlap("2026-08-20", "2026-08-23", "2026-08-23", "2026-08-26")).toBe(false);
  });

  test("detects no overlap for clearly separate ranges", () => {
    expect(rangesOverlap("2026-08-01", "2026-08-05", "2026-08-10", "2026-08-15")).toBe(false);
  });
});

describe("dateUtils.nightsBetween", () => {
  test("computes whole nights", () => {
    expect(nightsBetween("2026-08-20", "2026-08-23")).toBe(3);
  });
  test("never returns less than 1 night", () => {
    expect(nightsBetween("2026-08-20", "2026-08-20")).toBe(1);
  });
});

describe("calculations.quoteRoom", () => {
  test("matches the acceptance-test numbers from spec §86 shape (rate x nights + tax)", () => {
    const q = quoteRoom({ nightlyRate: 150000, checkIn: "2026-08-28", checkOut: "2026-08-31" });
    expect(q.nights).toBe(3);
    expect(q.roomTotal).toBe(450000);
    // tax rate is read from env (default 10%) — assert it's proportionally applied
    expect(q.tax).toBe(Math.round(450000 * 0.1));
    expect(q.total).toBe(q.roomTotal + q.tax);
  });

  test("applies the weekly discount automatically once a stay reaches 7 nights", () => {
    const short = quoteRoom({ nightlyRate: 50000, checkIn: "2026-09-01", checkOut: "2026-09-04", weeklyDiscountPercent: 10 });
    const week = quoteRoom({ nightlyRate: 50000, checkIn: "2026-09-01", checkOut: "2026-09-08", weeklyDiscountPercent: 10 });
    expect(short.appliedDiscountPercent).toBe(0); // 3 nights, below the 7-night threshold
    expect(week.appliedDiscountPercent).toBe(10);
    expect(week.roomTotal).toBe(Math.round(50000 * 7 * 0.9));
  });

  test("applies the monthly discount instead of the weekly one once a stay reaches 28 nights", () => {
    const month = quoteRoom({ nightlyRate: 50000, checkIn: "2026-09-01", checkOut: "2026-09-29", weeklyDiscountPercent: 10, monthlyDiscountPercent: 25 });
    expect(month.appliedDiscountPercent).toBe(25);
  });
});

describe("calculations.balanceOf", () => {
  test("never returns a negative balance", () => {
    expect(balanceOf({ total: 100000, paid: 150000 })).toBe(0);
  });
  test("computes a straightforward positive balance", () => {
    expect(balanceOf({ total: 560000, paid: 200000 })).toBe(360000);
  });
});
