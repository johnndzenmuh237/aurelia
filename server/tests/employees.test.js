describe("payroll net pay calculation (spec §39-40)", () => {
  function netPay({ basic, allowances = 0, bonuses = 0, deductions = 0 }) {
    return basic + allowances + bonuses - deductions;
  }

  test("basic salary only", () => {
    expect(netPay({ basic: 150000 })).toBe(150000);
  });

  test("with allowances and bonuses", () => {
    expect(netPay({ basic: 150000, allowances: 20000, bonuses: 10000 })).toBe(180000);
  });

  test("with deductions applied", () => {
    expect(netPay({ basic: 150000, deductions: 15000 })).toBe(135000);
  });

  test("a full payroll run totals correctly across employees", () => {
    const lines = [
      { basic: 150000, allowances: 0, bonuses: 0, deductions: 0 },
      { basic: 100000, allowances: 10000, bonuses: 5000, deductions: 2000 },
    ];
    const total = lines.reduce((sum, l) => sum + netPay(l), 0);
    expect(total).toBe(150000 + 113000);
  });
});
