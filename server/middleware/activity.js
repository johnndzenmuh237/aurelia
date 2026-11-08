const { ACTIVITY_RULES, DEPARTMENTS } = require("../config/access");
const { notify } = require("../services/notificationHub");
const { logAction } = require("../utils/audit");

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const NO_AUTO_AUDIT = /^\/api\/(owner|messages|notifications|account|auth)\b/;

/**
 * Turns every successful business action into (a) a notification for the
 * people responsible for that department and (b) — for individual
 * owner/manager accounts — an audit-trail entry naming the person.
 *
 * It listens for the response to finish rather than editing each
 * controller, so existing handlers stay untouched and nothing is reported
 * unless the action actually succeeded.
 */
function activityTracker(req, res, next) {
  if (!MUTATING.has(req.method)) return next();
  const path = req.originalUrl.split("?")[0];
  const rule = ACTIVITY_RULES.find(([m, re]) => m === req.method && re.test(path));

  let payload;
  const json = res.json.bind(res);
  res.json = (body) => { payload = body; return json(body); };

  res.on("finish", () => {
    if (res.statusCode >= 400) return;
    setImmediate(async () => {
      try {
        const id = payload?.id || payload?.reservationId || payload?.orderId || payload?.data?.id || req.body?.id || null;
        const actor = req.user || { name: "Website visitor", role: null, key: null };
        if (rule) {
          const meta = rule[2];
          const who = req.user ? `${actor.name}${actor.role ? ` (${DEPARTMENTS[actor.role] || actor.role})` : ""}` : "A website visitor";
          await notify({
            title: meta.title,
            message: `${who}: ${meta.title.toLowerCase()}${id ? ` — ref ${id}` : ""}.`,
            type: "activity", dept: meta.dept, actor, link: meta.link, entity: meta.entity, entityId: id,
          });
        }
        if (req.user?.accountId && !NO_AUTO_AUDIT.test(path)) {
          await logAction({ user: req.user, action: rule ? rule[2].title : `${req.method} ${path}`, entity: rule?.[2].entity || path, entityId: id, newValue: { source: "auto", request: `${req.method} ${path}` } });
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[activityTracker]", err.message);
      }
    });
  });
  next();
}

module.exports = { activityTracker };
