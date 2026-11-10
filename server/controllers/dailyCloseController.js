const svc = require("../services/dailyCloseService");

/* POST /api/daily-close/:dept   body: { date?, ...counts } */
const submit = (req, res, next) =>
  svc.submit({ dept: req.params.dept, date: (req.body || {}).date, body: req.body || {}, user: req.user }).then((r) => res.status(201).json(r)).catch(next);
/* GET /api/daily-close/status?date= */
const status = (req, res, next) => svc.status(req.query.date).then((r) => res.json(r)).catch(next);
/* GET /api/daily-close/lists */
const lists = (req, res, next) => svc.formLists().then((r) => res.json(r)).catch(next);
/* GET /api/daily-close/report?date= */
const report = (req, res, next) => svc.report(req.query.date).then((r) => res.json(r)).catch(next);

module.exports = { submit, status, lists, report };