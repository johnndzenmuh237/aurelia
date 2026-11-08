const path = require("path");
const fs = require("fs");
const express = require("express");
const app = require("./app");
const env = require("./config/environment");

// Local / self-hosted run: serve the website from /public as well as the API.
// (On Vercel the static files are served by the platform and only ./app is used.)
const root = express();
const publicDir = path.join(__dirname, "..", "public");
if (fs.existsSync(publicDir)) {
  root.use(express.static(publicDir, {
    extensions: ["html"],
    setHeaders: (res, file) => {
      if (file.endsWith("sw.js")) res.setHeader("Cache-Control", "no-cache");
      if (file.endsWith(".webmanifest")) res.setHeader("Content-Type", "application/manifest+json");
    },
  }));
}
root.use(app);

root.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Aurelia Hotel API listening on http://localhost:${env.port}`);
});
