/* Regenerates public/js/admin-page-roles.js from the data-roles attribute on each admin page. */
const fs = require("fs"), p = require("path");
const root = p.join(__dirname, "..", "public");
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(p.join(d, e.name)) : [p.join(d, e.name)]));
const map = {};
for (const f of walk(p.join(root, "admin")).filter((x) => x.endsWith(".html"))) {
  const m = fs.readFileSync(f, "utf8").match(/data-roles="([^"]+)"/);
  if (m) map["/" + p.relative(root, f).split(p.sep).join("/")] = m[1].split(",");
}
fs.writeFileSync(p.join(root, "js", "admin-page-roles.js"),
  "/* Which roles each admin page allows — generated from the data-roles attribute on every admin page, so the sidebar can hide\n   links a person cannot open. The server remains the real gatekeeper. Regenerate with: node scripts/build-page-roles.js */\nwindow.ADMIN_PAGE_ROLES = " + JSON.stringify(map, null, 1) + ";\n");
console.log(Object.keys(map).length + " pages mapped");
