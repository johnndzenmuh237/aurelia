const app = require("./app");
const env = require("./config/environment");

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Aurelia Hotel API listening on http://localhost:${env.port}`);
});
