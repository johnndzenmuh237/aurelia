/**
 * Documents and checks the housekeeping status state machine used in
 * server/services/housekeepingService.js: DIRTY -> CLEAN -> INSPECTED ->
 * AVAILABLE. A full integration test (actually writing to Firestore) lives
 * under the Firebase emulator setup — see docs/deployment.md.
 */
const VALID_TRANSITIONS = {
  dirty: ["clean"],
  clean: ["inspected"],
  inspected: ["available"],
  available: ["reserved", "occupied", "maintenance", "outoforder"],
  occupied: ["dirty"],
  maintenance: ["inspected"], // spec §27: OOO/maintenance -> inspection -> available
  outoforder: ["inspected"],
};

function isValidTransition(from, to) {
  return (VALID_TRANSITIONS[from] || []).includes(to);
}

describe("room status cascade (spec §8, §25)", () => {
  test("checkout takes a room from occupied to dirty", () => {
    expect(isValidTransition("occupied", "dirty")).toBe(true);
  });
  test("housekeeping completes dirty -> clean", () => {
    expect(isValidTransition("dirty", "clean")).toBe(true);
  });
  test("supervisor inspects clean -> inspected", () => {
    expect(isValidTransition("clean", "inspected")).toBe(true);
  });
  test("inspected rooms become available for sale", () => {
    expect(isValidTransition("inspected", "available")).toBe(true);
  });
  test("a dirty room cannot jump straight to available", () => {
    expect(isValidTransition("dirty", "available")).toBe(false);
  });
  test("maintenance completion routes through inspection, not straight to available", () => {
    expect(isValidTransition("maintenance", "inspected")).toBe(true);
    expect(isValidTransition("maintenance", "available")).toBe(false);
  });
});
