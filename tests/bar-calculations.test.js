const { computeDrinkFigures } = require("../server/utils/calculations");

describe("universal bar inventory engine (bar spec §9) — Booster worked example", () => {
  const booster = { unitsPerContainer: 12, costPerContainer: 7000, sellingPricePerUnit: 800, quantity: 144, minStockContainers: 2, containerName: "crate" };

  test("matches the spec's own numbers", () => {
    const f = computeDrinkFigures(booster);
    expect(f.totalCost).toBe(84000);
    expect(f.expectedRevenue).toBe(115200);
    expect(f.expectedProfit).toBe(31200);
  });

  test("after selling 2 bottles, figures recompute live from new stock", () => {
    const f = computeDrinkFigures({ ...booster, quantity: 142 });
    expect(f.expectedRevenue).toBe(113600);
    expect(f.fullContainers).toBe(11);
    expect(f.looseUnits).toBe(10);
  });
});

describe("backward compatibility — original simple bar items (no container data)", () => {
  test("falls back gracefully: unit cost 0, 1-unit containers, no crash", () => {
    const simple = { unitPrice: 1500, quantity: 20 };
    const f = computeDrinkFigures(simple);
    expect(f.unitCost).toBe(0);
    expect(f.expectedRevenue).toBe(30000);
    expect(f.status).toBe("Available");
  });
});

describe("stock status thresholds (bar spec §18)", () => {
  const base = { unitsPerContainer: 12, costPerContainer: 1000, sellingPricePerUnit: 100, minStockContainers: 2 };
  test("above minimum -> Available", () => expect(computeDrinkFigures({ ...base, quantity: 100 }).status).toBe("Available"));
  test("at or below minimum -> Low Stock", () => expect(computeDrinkFigures({ ...base, quantity: 24 }).status).toBe("Low Stock"));
  test("zero -> Out of Stock", () => expect(computeDrinkFigures({ ...base, quantity: 0 }).status).toBe("Out of Stock"));
});

describe("container + loose-unit stock display never silently rounds down (bar spec §10)", () => {
  test("58 bottles at 12/crate is 4 crates + 10 units", () => {
    const f = computeDrinkFigures({ unitsPerContainer: 12, costPerContainer: 0, sellingPricePerUnit: 0, quantity: 58, minStockContainers: 1 });
    expect(f.fullContainers).toBe(4);
    expect(f.looseUnits).toBe(10);
  });
});
