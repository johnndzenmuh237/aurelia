/* Aurelia service worker.
 * - Never touches /api/* or cross-origin requests (live business data is never cached).
 * - Pages: network first, falling back to the last copy, then /offline.html.
 * - Static assets: stale-while-revalidate. */
const VERSION = "aurelia-v3";
const PRECACHE = ["/offline.html", "/css/style.css", "/css/admin.css", "/css/app.css", "/js/icons.js", "/js/app-core.js", "/js/auth.js", "/js/utils.js", "/js/config.js", "/icons/icon-192.png", "/favicon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname === "/sw.js") return;

  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return res; })
      .catch(() => caches.match(req).then((m) => m || caches.match("/offline.html"))));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => {
    const net = fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; }).catch(() => hit);
    return hit || net;
  }));
});

/* ---- Phone alerts (Web Push) ---- */
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: "Aurelia", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    // The app is open and in front: its bell already shows it, so don't show a second alert.
    if (cs.some((c) => c.visibilityState === "visible" && c.focused)) { cs.forEach((c) => c.postMessage({ type: "aurelia-push" })); return; }
    return self.registration.showNotification(d.title || "Aurelia", {
      body: d.body || "", icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", tag: d.tag || "aurelia", renotify: true,
      data: { url: d.url || "/portal/notifications.html" },
    });
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/portal/notifications.html";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    for (const c of cs) { if ("focus" in c) { c.navigate(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});