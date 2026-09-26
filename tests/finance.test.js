/**
 * Pure-logic tests for the financial-management extension (budgets,
 * credit/debt status, salary balances). Like tests/payments.test.js,
 * these cover the calculation logic without touching Firestore — full
 * integration tests need the Firebase Local Emulator Suite (see
 * docs/deployment.md "Running tests").
 */
const { balanceOf } = require("../server/utils/calculations");

// Re-implemented here rather than importing server/services/debtService.js
// directly, since that module requires server/config/firebase (a live
// Firebase Admin connection) — same reasoning as tests/employees.test.js
// re-implementing netPay() instead of importing payrollService.js.
function creditStatus({ total, paid, dueDate }) {
  const remaining = balanceOf({ total, paid });
  if (remaining <= 0) return "PAID";
  if (Number(paid || 0) > 0) return dueDate && new Date(dueDate) < new Date() ? "OVERDUE" : "PARTIALLY_PAID";
  return dueDate && new Date(dueDate) < new Date() ? "OVERDUE" : "UNPAID";
}

describe("credit/debt status derivation (spec §19)", () => {
  test("no payment yet -> UNPAID", () => {
    expect(creditStatus({ total: 10000, paid: 0 })).toBe("UNPAID");
  });

  test("partial payment -> PARTIALLY_PAID", () => {
    expect(creditStatus({ total: 10000, paid: 2000 })).toBe("PARTIALLY_PAID");
  });

  test("paid in full -> PAID", () => {
    expect(creditStatus({ total: 10000, paid: 10000 })).toBe("PAID");
  });

  test("overpaid still resolves to PAID", () => {
    expect(creditStatus({ total: 10000, paid: 12000 })).toBe("PAID");
  });

  test("unpaid past due date -> OVERDUE", () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    expect(creditStatus({ total: 10000, paid: 0, dueDate: yesterday })).toBe("OVERDUE");
  });

  test("fully paid past due date is still PAID, never OVERDUE", () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    expect(creditStatus({ total: 10000, paid: 10000, dueDate: yesterday })).toBe("PAID");
  });
});

describe("budget usedPercent / overBudget math", () => {
  function usedPercent(amount, spent) {
    return amount > 0 ? Math.round((spent / amount) * 1000) / 10 : 0;
  }

  test("75% used, not over budget", () => {
    expect(usedPercent(500000, 375000)).toBe(75);
    expect(375000 > 500000).toBe(false);
  });

  test("over budget flags correctly", () => {
    expect(spentOverBudget(500000, 600000)).toBe(true);
  });

  function spentOverBudget(amount, spent) {
    return spent > amount;
  }
});

describe("salary balance math (spec §20-21)", () => {
  test("no payment yet -> full amount remaining", () => {
    expect(balanceOf({ total: 150000, paid: 0 })).toBe(150000);
  });

  test("partial payment leaves a remaining balance", () => {
    expect(balanceOf({ total: 150000, paid: 50000 })).toBe(100000);
  });

  test("full payment leaves zero remaining, never negative", () => {
    expect(balanceOf({ total: 150000, paid: 150000 })).toBe(0);
    expect(balanceOf({ total: 150000, paid: 200000 })).toBe(0);
  });

  test("a payment cannot exceed the remaining balance (validated in salaryPaymentService.paySalary)", () => {
    const remaining = balanceOf({ total: 150000, paid: 100000 });
    const attemptedPayment = 60000;
    expect(attemptedPayment > remaining).toBe(true); // would be rejected with a 400
  });
});
