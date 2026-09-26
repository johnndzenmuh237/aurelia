// Thin CLI wrapper — kept separate from database/seed.js so `npm run seed`
// has a stable entry point even if the seeding implementation moves.
require("../database/seed.js");
