/* Service worker: offline fallback for navigations and web push display.
   Financial data is never cached; only the offline page and static assets are. */
const CACHE = "bb-static-v2";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE_URL, "/icon-192.png"])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    return;
  }
  const url = new URL(req.url);
  if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })));
  }
});

self.addEventListener("push", (event) => {
  let data = { title: "Reminder", body: "", href: "/today" };
  try { data = { ...data, ...event.data.json() }; } catch { /* non-JSON payload */ }
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: "/icon-192.png", badge: "/icon-192.png", data: { href: data.href } }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || "/today";
  event.waitUntil(self.clients.matchAll({ type: "window" }).then((wins) => {
    for (const w of wins) if ("focus" in w) { w.navigate(href); return w.focus(); }
    return self.clients.openWindow(href);
  }));
});
