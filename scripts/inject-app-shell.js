/**
 * Adds the shared app layer to every HTML page (idempotent — safe to re-run):
 *   <head>  app.css, web manifest, theme colour, icons
 *   <head>  icons.js (so inline page scripts can use Icons)
 *   <body>  app-core.js (notification bell, PWA, idle logout)
 * Run after adding a new page:  node scripts/inject-app-shell.js
 */
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..", "public");
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const SKIP = new Set(["offline.html", "launch.html"]);

const HEAD = [
  ['/css/app.css', '<link rel="stylesheet" href="/css/app.css">'],
  ['manifest.webmanifest', '<link rel="manifest" href="/manifest.webmanifest">'],
  ['name="theme-color"', '<meta name="theme-color" content="#163A30">'],
  ['/js/icons.js', '<script src="/js/icons.js"></script>'],
  ['/favicon.svg', '<link rel="icon" href="/favicon.svg" type="image/svg+xml">'],
  ['apple-touch-icon', '<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">'],
];
const BODY = [['/js/app-core.js', '<script src="/js/app-core.js"></script>']];

let changed = 0, total = 0;
for (const f of walk(root).filter((x) => x.endsWith(".html"))) {
  if (SKIP.has(path.basename(f))) continue;
  total++;
  let s = fs.readFileSync(f, "utf8"); const before = s;
  const h = HEAD.filter(([k]) => !s.includes(k)).map(([, tag]) => tag).join("\n");
  if (h) s = s.replace(/<\/head>/i, h + "\n</head>");
  const b = BODY.filter(([k]) => !s.includes(k)).map(([, tag]) => tag).join("\n");
  if (b) s = s.replace(/<\/body>/i, b + "\n</body>");
  if (s !== before) { fs.writeFileSync(f, s); changed++; }
}
console.log(`pages: ${total}, updated: ${changed}`);
