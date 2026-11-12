// CodeCrest service worker. Two jobs, both deliberately small:
//
// 1. Web Push: show an OS notification and open the right tab on click.
// 2. Offline fallback: when a page navigation fails because there is no
//    network, show /offline.html instead of the browser error page.
//
// It does NOT cache pages, API responses or build assets. This is a
// multi-tenant app showing live, per-user data: serving any of that from a
// cache risks stale orders or one account's page reaching another. Every
// request still goes to the network; the only cached file is the offline page.

const OFFLINE_CACHE = "codecrest-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(OFFLINE_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      // Never let a failed precache block install: push must keep working.
      .catch((err) => console.error("Offline page precache failed:", err))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("codecrest-offline-") && k !== OFFLINE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  // Page navigations only. Everything else (API, assets, images) is left to
  // the browser untouched.
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(async () => {
      const cached = await caches.match(OFFLINE_URL);
      return cached || Response.error();
    })
  );
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "CodeCrest CRM", body: event.data.text() };
  }

  const title = payload.title || "CodeCrest CRM";
  const options = {
    body: payload.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { link: payload.link || "/dashboard" },
    tag: payload.link || undefined, // collapses repeat notifications for the same task/link
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link || "/dashboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(link);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(link);
      }
    })
  );
});
