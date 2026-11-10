const svc = require("../services/restaurantStockService");
exports.receive = (req, res, next) => svc.receive(req.body || {}, req.user).then((r) => res.status(201).json(r)).catch(next);
exports.move = (req, res, next) => svc.adjust(req.body || {}, req.user).then((r) => res.json(r)).catch(next);
exports.summary = (req, res, next) => svc.summary().then((r) => res.json(r)).catch(next);