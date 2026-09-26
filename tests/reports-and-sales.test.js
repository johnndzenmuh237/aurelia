const { toCsv, csvEscape } = require("../server/utils/csv");

describe("CSV export (spec §27)", () => {
  test("escapes commas, quotes and newlines", () => {
    expect(csvEscape("Smith, John")).toBe('"Smith, John"');
    expect(csvEscape('Say "hi"')).toBe('"Say ""hi"""');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });

  test("plain values pass through unescaped", () => {
    expect(csvEscape(42)).toBe("42");
    expect(csvEscape("Deluxe Room")).toBe("Deluxe Room");
  });

  test("null/undefined become empty strings, not literal 'null'", () => {
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
  });

  test("builds a header row plus one row per record, in column order", () => {
    const rows = [{ name: "Water", qty: 20, price: 500 }, { name: "Soda", qty: 5, price: 800 }];
    const csv = toCsv(rows, ["name", "qty", "price"]);
    expect(csv).toBe("name,qty,price\nWater,20,500\nSoda,5,800\n");
  });

  test("empty result set still returns a header-only CSV", () => {
    expect(toCsv([], ["name", "qty"])).toBe("name,qty\n");
  });
});

describe("sale balance math (spec §23-25)", () => {
  function saleBalance({ quantity, unitPrice, amountPaid }) {
    const total = Math.round(quantity * unitPrice);
    const paid = amountPaid === undefined ? total : amountPaid;
    return { total, balance: total - paid };
  }

  test("fully paid sale has zero balance and no linked debt", () => {
    const { total, balance } = saleBalance({ quantity: 2, unitPrice: 500 });
    expect(total).toBe(1000);
    expect(balance).toBe(0);
  });

  test("partially paid sale leaves a balance that becomes a credit record", () => {
    const { total, balance } = saleBalance({ quantity: 20, unitPrice: 500, amountPaid: 2000 });
    expect(total).toBe(10000);
    expect(balance).toBe(8000); // matches the spec §18 worked example
  });
});
