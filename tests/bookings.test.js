const { quoteRoom } = require("../server/utils/calculations");
const { rangesOverlap } = require("../server/utils/dateUtils");

describe("booking quote matches the spec §86 acceptance scenario", () => {
  test("Deluxe Room, 3 nights, 10% tax -> 495,000 total", () => {
    // spec §86: room 450,000 + tax 45,000 = 495,000 total, on a 10% tax rate.
    const q = quoteRoom({ nightlyRate: 150000, checkIn: "2026-08-28", checkOut: "2026-08-31" });
    expect(q.roomTotal).toBe(450000);
    expect(q.tax).toBe(45000);
    expect(q.total).toBe(495000);
  });
});

describe("overbooking guard (spec §12)", () => {
  const existingReservations = [
    { room: "101", checkIn: "2026-08-20", checkOut: "2026-08-23" },
  ];

  function isRoomFree(room, checkIn, checkOut) {
    return !existingReservations.some(
      (r) => r.room === room && rangesOverlap(checkIn, checkOut, r.checkIn, r.checkOut)
    );
  }

  test("rejects a second booking that overlaps an existing one", () => {
    expect(isRoomFree("101", "2026-08-21", "2026-08-24")).toBe(false);
  });

  test("allows a booking for a different room on the same dates", () => {
    expect(isRoomFree("102", "2026-08-21", "2026-08-24")).toBe(true);
  });

  test("allows a booking that starts the day the existing one checks out", () => {
    expect(isRoomFree("101", "2026-08-23", "2026-08-25")).toBe(true);
  });
});
