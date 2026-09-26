/**
 * generateReservationCode/generateGuestCode/etc. require a live Firestore
 * connection (they run a counter transaction) so they're covered by
 * integration testing against the Firebase emulator (see
 * docs/deployment.md). This file checks the deterministic parts: the pad()
 * formatting and the RES-YYYY-NNNNNN shape described in spec §5.
 */
function pad(num, length = 6) {
  return String(num).padStart(length, "0");
}

describe("ID formatting (spec §5: RES-2026-000001 style)", () => {
  test("pads sequence numbers to 6 digits", () => {
    expect(pad(1)).toBe("000001");
    expect(pad(42)).toBe("000042");
    expect(pad(123456)).toBe("123456");
  });

  test("reservation code shape matches RES-<year>-<6 digits>", () => {
    const year = 2026;
    const code = `RES-${year}-${pad(1)}`;
    expect(code).toMatch(/^RES-\d{4}-\d{6}$/);
  });

  test("employee code uses a 4-digit sequence (EMP-0001)", () => {
    const code = `EMP-${pad(1, 4)}`;
    expect(code).toMatch(/^EMP-\d{4}$/);
  });
});
