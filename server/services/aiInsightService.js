const { db, FieldValue } = require("../config/firebase");

/**
 * Generates AI-style business insights entirely from real stored data —
 * spec §23 is explicit that this must never be fake. Each insight's
 * numbers are computed from actual Firestore documents for the requested
 * period vs. the prior equivalent period (this week vs last week, this
 * month vs last month, etc). The "AI" here is a rule-based analysis
 * engine — deterministic, auditable, and free of hallucination risk,
 * which is the right tradeoff for numbers a manager will act on.
 */

function periodRange(period) {
  const now = new Date();
  const start = new Date(now);
  const prevStart = new Date(now);
  const prevEnd = new Date(now);

  if (period === "today") {
    start.setHours(0, 0, 0, 0);
    prevStart.setDate(prevStart.getDate() - 1); prevStart.setHours(0, 0, 0, 0);
    prevEnd.setDate(prevEnd.getDate() - 1); prevEnd.setHours(23, 59, 59, 999);
  } else if (period === "week") {
    start.setDate(start.getDate() - 7);
    prevStart.setDate(prevStart.getDate() - 14);
    prevEnd.setDate(prevEnd.getDate() - 7);
  } else if (period === "month") {
    start.setDate(start.getDate() - 30);
    prevStart.setDate(prevStart.getDate() - 60);
    prevEnd.setDate(prevEnd.getDate() - 30);
  } else { // year
    start.setDate(start.getDate() - 365);
    prevStart.setDate(prevStart.getDate() - 730);
    prevEnd.setDate(prevEnd.getDate() - 365);
  }
  return { start, prevStart, prevEnd, now };
}

function pctChange(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function toDate(v) {
  if (!v) return null;
  return v.toDate ? v.toDate() : new Date(v);
}

async function sumInRange(collectionName, amountField, dateField, start, end) {
  const snap = await db.collection(collectionName).get();
  return snap.docs.reduce((sum, d) => {
    const data = d.data();
    const date = toDate(data[dateField]);
    if (date && date >= start && date <= end) return sum + Number(data[amountField] || 0);
    return sum;
  }, 0);
}

async function generateInsights({ period = "week", uid }) {
  const { start, prevStart, prevEnd, now } = periodRange(period);
  const insights = [];

  // --- Occupancy ---
  const roomsSnap = await db.collection("rooms").get();
  const totalRooms = roomsSnap.size || 1;
  const occupiedNow = roomsSnap.docs.filter((d) => d.data().status === "occupied").length;
  const occupancyRate = Math.round((occupiedNow / totalRooms) * 100);
  insights.push({
    level: occupancyRate >= 60 ? "good" : occupancyRate >= 30 ? "warning" : "critical",
    title: `Occupancy at ${occupancyRate}%`,
    message: `${occupiedNow} of ${totalRooms} rooms and apartments are currently occupied.` +
      (occupancyRate < 30 ? " This is low — consider running a promotion to fill unsold inventory." : occupancyRate >= 80 ? " You are close to full capacity — review pricing for peak demand." : ""),
    category: "occupancy",
  });

  // --- Restaurant revenue ---
  const restaurantNow = await sumInRange("orders", "total", "createdAt", start, now);
  const restaurantPrev = await sumInRange("orders", "total", "createdAt", prevStart, prevEnd);
  const restaurantDelta = pctChange(restaurantNow, restaurantPrev);
  insights.push({
    level: restaurantDelta >= 0 ? "good" : restaurantDelta >= -15 ? "warning" : "critical",
    title: `Restaurant revenue ${restaurantDelta >= 0 ? "up" : "down"} ${Math.abs(restaurantDelta)}%`,
    message: `Restaurant & food delivery revenue this ${period} is ${restaurantNow.toLocaleString()} FCFA, versus ${restaurantPrev.toLocaleString()} FCFA the previous ${period}.` +
      (restaurantDelta < -10 ? " Consider a promotion on your slower meal periods." : ""),
    category: "restaurant",
  });

  // --- Bar revenue ---
  const barSalesSnap = await db.collection("barSales").get();
  const barNow = barSalesSnap.docs.reduce((s, d) => { const dt = toDate(d.data().createdAt); return dt && dt >= start && dt <= now ? s + Number(d.data().total || 0) : s; }, 0);
  const barPrev = barSalesSnap.docs.reduce((s, d) => { const dt = toDate(d.data().createdAt); return dt && dt >= prevStart && dt <= prevEnd ? s + Number(d.data().total || 0) : s; }, 0);
  const barDelta = pctChange(barNow, barPrev);
  insights.push({
    level: barDelta >= 0 ? "good" : barDelta >= -15 ? "warning" : "critical",
    title: `Bar sales ${barDelta >= 0 ? "up" : "down"} ${Math.abs(barDelta)}%`,
    message: `Bar revenue this ${period} is ${barNow.toLocaleString()} FCFA, versus ${barPrev.toLocaleString()} FCFA the previous ${period}.`,
    category: "bar",
  });

  // --- Attendance ---
  const attendanceSnap = await db.collection("employeeAttendance").get();
  const inRange = attendanceSnap.docs.filter((d) => { const dt = toDate(d.data().createdAt) || new Date(d.data().date); return dt && dt >= start && dt <= now; });
  const present = inRange.filter((d) => d.data().status === "present").length;
  const attendanceRate = inRange.length ? Math.round((present / inRange.length) * 100) : null;
  if (attendanceRate !== null) {
    insights.push({
      level: attendanceRate >= 90 ? "good" : attendanceRate >= 75 ? "warning" : "critical",
      title: `Staff attendance at ${attendanceRate}%`,
      message: `${present} of ${inRange.length} recorded attendance entries this ${period} were "Present".` +
        (attendanceRate < 75 ? " Attendance is low — review staffing for recurring absences." : ""),
      category: "employees",
    });
  }

  // --- Bookings by source (repeat guest / direct booking trend) ---
  const reservationsSnap = await db.collection("reservations").get();
  const recentRes = reservationsSnap.docs.filter((d) => { const dt = toDate(d.data().createdAt); return dt && dt >= start && dt <= now; });
  const directCount = recentRes.filter((d) => d.data().source === "DIRECT").length;
  if (recentRes.length) {
    const directPct = Math.round((directCount / recentRes.length) * 100);
    insights.push({
      level: directPct >= 50 ? "good" : "warning",
      title: `${directPct}% of bookings were direct`,
      message: `${directCount} of ${recentRes.length} reservations this ${period} came straight from the website rather than a third party — direct bookings keep more revenue in-house.`,
      category: "bookings",
    });
  }

  // Persist this run so /admin/ai-insights.html can show history, and so
  // repeated views don't require recomputing unless "Refresh" is clicked.
  const batch = db.batch();
  insights.forEach((insight) => {
    const ref = db.collection("aiInsights").doc();
    batch.set(ref, { ...insight, period, generatedBy: uid || "system", createdAt: FieldValue.serverTimestamp() });
  });
  await batch.commit();

  return insights;
}

async function getLatestInsights({ period = "week" }) {
  const snap = await db.collection("aiInsights").where("period", "==", period).get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
    .slice(0, 10);
}

module.exports = { generateInsights, getLatestInsights };
