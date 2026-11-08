const hub = require("../services/notificationHub");

async function list(req, res, next) {
  try {
    const { limit, unread, archived } = req.query;
    res.json(await hub.listFor(req.user, { limit, unreadOnly: unread === "1", includeArchived: archived === "1" }));
  } catch (err) { next(err); }
}

async function read(req, res, next) {
  try {
    const { ids, all } = req.body || {};
    const updated = all ? await hub.markAllRead(req.user) : await hub.mark(req.user, ids, "readBy");
    res.json({ updated });
  } catch (err) { next(err); }
}

async function archive(req, res, next) {
  try {
    const updated = await hub.mark(req.user, (req.body || {}).ids, "archivedBy");
    res.json({ updated });
  } catch (err) { next(err); }
}

module.exports = { list, read, archive };
