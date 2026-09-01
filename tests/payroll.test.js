describe("payroll run status flow (spec §40)", () => {
  const VALID = { Draft: ["Approved"], Approved: ["Paid"], Paid: [] };

  function canTransition(from, to) {
    return (VALID[from] || []).includes(to);
  }

  test("a new payroll run starts as Draft", () => {
    const run = { status: "Draft" };
    expect(run.status).toBe("Draft");
  });

  test("Draft can move to Approved", () => {
    expect(canTransition("Draft", "Approved")).toBe(true);
  });

  test("Approved can move to Paid", () => {
    expect(canTransition("Approved", "Paid")).toBe(true);
  });

  test("Draft cannot jump straight to Paid", () => {
    expect(canTransition("Draft", "Paid")).toBe(false);
  });

  test("Paid is a terminal state", () => {
    expect(canTransition("Paid", "Draft")).toBe(false);
  });
});
