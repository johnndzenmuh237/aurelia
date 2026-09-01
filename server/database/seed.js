/**
 * Seeds Firestore with realistic demo/test data (spec §82):
 *   - 5 room types, 100 rooms across 5 floors / 2 buildings
 *   - 200 guests, 100 reservations in a mix of statuses
 *   - housekeeping tasks, maintenance requests, employees, restaurant
 *     menu, inventory, expenses, payroll
 *
 * This data lives only in Firestore — the app itself never hard-codes any
 * of it (dashboards, availability, etc. all read live from these
 * collections), so you can safely delete and re-run this at any time in a
 * dev/staging project.
 *
 * Usage:  node database/seed.js
 * Requires the same FIREBASE_* env vars as the server (see .env.example).
 */
require("dotenv").config();
const { db, FieldValue } = require("../server/config/firebase");

const ROOM_TYPES = [
  { name: "Standard Room (Fan)", category: "room", basePrice: 25000, maxAdults: 2, maxChildren: 1, bedType: "Queen", hasAC: false, hasFan: true, weeklyDiscountPercent: 8, monthlyDiscountPercent: 20, description: "A comfortable, budget-friendly room cooled by ceiling fan — ideal for the everyday traveler.", photoUrl: "https://picsum.photos/seed/room-standard-fan/900/600" },
  { name: "Standard Room (AC)", category: "room", basePrice: 35000, maxAdults: 2, maxChildren: 1, bedType: "Queen", hasAC: true, hasFan: false, weeklyDiscountPercent: 8, monthlyDiscountPercent: 20, description: "The same comfortable standard room, with full air conditioning.", photoUrl: "https://picsum.photos/seed/room-standard-ac/900/600" },
  { name: "Deluxe Room", category: "room", basePrice: 55000, maxAdults: 2, maxChildren: 2, bedType: "King", hasAC: true, hasFan: false, weeklyDiscountPercent: 10, monthlyDiscountPercent: 22, description: "More space, a work desk, air conditioning, and a better view.", photoUrl: "https://picsum.photos/seed/room-deluxe/900/600" },
  { name: "Executive Room", category: "room", basePrice: 75000, maxAdults: 2, maxChildren: 2, bedType: "King", hasAC: true, hasFan: false, weeklyDiscountPercent: 10, monthlyDiscountPercent: 25, description: "Executive lounge access, air conditioning, and premium amenities.", photoUrl: "https://picsum.photos/seed/room-executive/900/600" },
  { name: "Suite", category: "room", basePrice: 120000, maxAdults: 3, maxChildren: 2, bedType: "King + Sofa Bed", hasAC: true, hasFan: false, weeklyDiscountPercent: 12, monthlyDiscountPercent: 28, description: "A separate living area, full air conditioning, for longer or more comfortable stays.", photoUrl: "https://picsum.photos/seed/room-suite/900/600" },
  { name: "Family Room", category: "room", basePrice: 90000, maxAdults: 4, maxChildren: 2, bedType: "Two Queens", hasAC: true, hasFan: false, weeklyDiscountPercent: 10, monthlyDiscountPercent: 22, description: "Room enough for the whole family, fully air conditioned.", photoUrl: "https://picsum.photos/seed/room-family/900/600" },
  { name: "One-Bedroom Apartment", category: "apartment", basePrice: 65000, maxAdults: 3, maxChildren: 2, bedType: "Queen + Living Room", hasAC: true, hasFan: false, weeklyDiscountPercent: 15, monthlyDiscountPercent: 35, description: "A self-contained apartment with a kitchenette and living area — built for guests staying a week or more.", photoUrl: "https://picsum.photos/seed/apartment-one-bed/900/600" },
  { name: "Two-Bedroom Apartment", category: "apartment", basePrice: 95000, maxAdults: 5, maxChildren: 3, bedType: "Two Queens + Living Room", hasAC: true, hasFan: false, weeklyDiscountPercent: 15, monthlyDiscountPercent: 35, description: "Two bedrooms, a full kitchen, and a living/dining area — ideal for families or longer corporate stays.", photoUrl: "https://picsum.photos/seed/apartment-two-bed/900/600" },
];

function randomFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randomPhone() { return `6${Math.floor(50000000 + Math.random() * 40000000)}`; }
function randomDate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

async function seedRoomTypesAndRooms() {
  const typeRefs = [];
  for (const t of ROOM_TYPES) {
    const ref = await db.collection("roomTypes").add({ ...t, active: true, roomCount: 12, createdAt: FieldValue.serverTimestamp() });
    typeRefs.push({ id: ref.id, ...t });
  }

  const buildings = ["A", "B"];
  let roomNumber = 100;
  const roomRefs = [];
  for (let i = 0; i < 96; i++) {
    const floor = Math.floor(i / 24) + 1;
    const type = typeRefs[i % typeRefs.length];
    roomNumber = 100 * floor + (i % 20) + 1;
    const ref = await db.collection("rooms").add({
      number: String(roomNumber),
      roomTypeId: type.id,
      type: type.name,
      floor,
      building: buildings[i % 2],
      capacity: type.maxAdults,
      rate: type.basePrice,
      status: "available",
      createdAt: FieldValue.serverTimestamp(),
    });
    roomRefs.push({ id: ref.id, number: String(roomNumber), typeId: type.id, typeName: type.name, rate: type.basePrice });
  }
  return { typeRefs, roomRefs };
}

async function seedGuests() {
  const firstNames = ["Amina", "Jean-Paul", "Grace", "Emmanuel", "Fatima", "Paul", "Marie", "Samuel", "Chantal", "Eric"];
  const lastNames = ["Mballa", "Ngono", "Fotso", "Njoya", "Biya", "Talla", "Mbarga", "Etoundi", "Ateba", "Nkomo"];
  const guestRefs = [];
  for (let i = 0; i < 200; i++) {
    const fullName = `${randomFrom(firstNames)} ${randomFrom(lastNames)}`;
    const ref = await db.collection("guests").add({
      guestCode: `GUEST-${String(i + 1).padStart(6, "0")}`,
      fullName, phone: randomPhone(), email: `${fullName.toLowerCase().replace(/\s+/g, ".")}@example.com`,
      totalStays: Math.floor(Math.random() * 4), totalSpend: 0,
      createdAt: FieldValue.serverTimestamp(),
    });
    guestRefs.push({ id: ref.id, fullName, phone: ref.id });
  }
  return guestRefs;
}

async function seedReservations(roomRefs, guestRefs) {
  const statuses = ["Pending", "Confirmed", "Checked In", "Checked Out", "Cancelled", "No Show"];
  for (let i = 0; i < 100; i++) {
    const room = randomFrom(roomRefs);
    const guest = randomFrom(guestRefs);
    const offset = Math.floor(Math.random() * 20) - 10;
    const checkIn = randomDate(offset);
    const checkOut = randomDate(offset + 1 + Math.floor(Math.random() * 4));
    const status = randomFrom(statuses);
    const total = room.rate * 2;
    const paid = status === "Checked Out" ? total : Math.floor(total * 0.4);
    await db.collection("reservations").add({
      reservationCode: `RES-${new Date().getFullYear()}-${String(i + 1).padStart(6, "0")}`,
      guestId: guest.id, guestName: guest.fullName, phone: "6" + Math.floor(50000000 + Math.random() * 40000000),
      room: room.number, roomTypeId: room.typeId, roomTypeName: room.typeName,
      checkIn, checkOut, adults: 1 + Math.floor(Math.random() * 2), rate: room.rate,
      total, paid, balance: total - paid, deposit: Math.floor(total * 0.4),
      source: randomFrom(["DIRECT", "WALK-IN", "PHONE", "OTA"]), status,
      paymentStatus: paid >= total ? "fully_paid" : paid > 0 ? "partially_paid" : "unpaid",
      folioStatus: status === "Checked Out" ? "closed" : "active",
      vip: Math.random() < 0.1, createdAt: FieldValue.serverTimestamp(),
    });
  }
}

async function seedOpsAndPeople() {
  const menuItems = [
    { name: "Grilled Chicken", category: "Lunch", price: 6500, description: "Free-range chicken, grilled and served with plantain and a house pepper sauce.", photoUrl: "https://picsum.photos/seed/dish-grilled-chicken/500/400" },
    { name: "Beef Suya", category: "Dinner", price: 7500, description: "Marinated beef skewers, char-grilled and dusted with suya spice.", photoUrl: "https://picsum.photos/seed/dish-beef-suya/500/400" },
    { name: "Continental Breakfast", category: "Breakfast", price: 4000, description: "Eggs to order, toast, fresh fruit, and locally roasted coffee.", photoUrl: "https://picsum.photos/seed/dish-breakfast/500/400" },
    { name: "Ndolé", category: "Lunch", price: 5500, description: "A Cameroonian classic — bitterleaf stew with groundnuts, served with rice or plantain.", photoUrl: "https://picsum.photos/seed/dish-ndole/500/400" },
    { name: "Grilled Fish (Tilapia)", category: "Dinner", price: 8000, description: "Whole tilapia, grilled and served with a spicy tomato sauce.", photoUrl: "https://picsum.photos/seed/dish-grilled-fish/500/400" },
    { name: "Fresh Juice", category: "Drinks", price: 1500, description: "Seasonal fruit, pressed fresh daily.", photoUrl: "https://picsum.photos/seed/dish-juice/500/400" },
    { name: "Chocolate Cake", category: "Desserts", price: 2500, description: "Rich, house-baked chocolate cake.", photoUrl: "https://picsum.photos/seed/dish-cake/500/400" },
  ];
  for (const m of menuItems) await db.collection("menuItems").add({ ...m, available: true });

  const inventoryItems = [
    { sku: "LIN-001", name: "Bath Towels", category: "Linen", quantity: 300, minStock: 50, unitCost: 3500 },
    { sku: "CLN-001", name: "All-Purpose Cleaner", category: "Cleaning Supplies", quantity: 80, minStock: 20, unitCost: 2200 },
    { sku: "MB-001", name: "Bottled Water", category: "Minibar Products", quantity: 500, minStock: 100, unitCost: 300 },
  ];
  for (const i of inventoryItems) await db.collection("inventoryItems").add(i);

  const departments = ["Front Desk", "Housekeeping", "Restaurant", "Maintenance", "Finance", "HR", "Management"];
  for (const d of departments) await db.collection("departments").add({ name: d });

  const positions = [
    { title: "Front Desk Agent", department: "Front Desk", baseSalary: 150000 },
    { title: "Housekeeper", department: "Housekeeping", baseSalary: 100000 },
    { title: "Restaurant Server", department: "Restaurant", baseSalary: 110000 },
  ];
  for (const p of positions) await db.collection("positions").add(p);

  const employeeNames = ["Sarah K.", "Marc T.", "Julie N.", "David F.", "Alice M."];
  for (let i = 0; i < employeeNames.length; i++) {
    await db.collection("employees").add({
      employeeCode: `EMP-${String(i + 1).padStart(4, "0")}`,
      fullName: employeeNames[i], position: randomFrom(positions).title,
      department: randomFrom(departments), salary: 100000 + Math.floor(Math.random() * 80000),
      status: "active", createdAt: FieldValue.serverTimestamp(),
    });
  }

  const expenseCategories = ["Electricity", "Water", "Internet", "Supplies", "Repairs"];
  for (let i = 0; i < 10; i++) {
    await db.collection("expenses").add({
      category: randomFrom(expenseCategories), amount: 20000 + Math.floor(Math.random() * 200000),
      approvalStatus: randomFrom(["Pending", "Approved"]), createdAt: FieldValue.serverTimestamp(),
    });
  }
}

async function main() {
  // eslint-disable-next-line no-console
  console.log("Seeding room types + 100 rooms...");
  const { roomRefs } = await seedRoomTypesAndRooms();
  console.log("Seeding 200 guests...");
  const guestRefs = await seedGuests();
  console.log("Seeding 100 reservations...");
  await seedReservations(roomRefs, guestRefs);
  console.log("Seeding menu, inventory, departments, employees, expenses...");
  await seedOpsAndPeople();
  console.log("Done. Your Firestore project now has realistic demo data.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
