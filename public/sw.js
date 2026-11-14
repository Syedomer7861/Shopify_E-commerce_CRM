// CodeCrest service worker. Two jobs, both deliberately small:
//
// 1. Web Push: show an OS notification and open the right tab on click.
// 2. Offline fallback: when a page navigation fails because there is no
//    network, show /offline.html instead of the browser error page.
//
// It does NOT cache pages or API responses. This is a multi-tenant app
// showing live, per-user data: serving any of that from a cache risks stale
// orders or one account's page reaching another. The only cached files are
// the offline page and the content-hashed build files (see STATIC_CACHE).

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

// Build files under /_next/static/ have the content hash in their name, are
// identical for every user and never change, so serving them from here is
// safe. On a phone the browser's own cache evicts them often, and every app
// open re-downloaded ~1 MB of JS from the server.
const STATIC_CACHE = "codecrest-static-v1";
const STATIC_MAX_ENTRIES = 400; // old builds' files pile up; trim oldest beyond this

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("codecrest-offline-") && k !== OFFLINE_CACHE).map((k) => caches.delete(k))))
      // Navigation preload: the page request starts while this worker boots,
      // instead of waiting for it. Removes the worker's startup delay from
      // every page open.
      .then(() => self.registration.navigationPreload && self.registration.navigationPreload.enable())
      .then(() => self.clients.claim())
  );
});

async function trimStatic(cache) {
  const keys = await cache.keys();
  if (keys.length > STATIC_MAX_ENTRIES) {
    await Promise.all(keys.slice(0, keys.length - STATIC_MAX_ENTRIES).map((k) => cache.delete(k)));
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;

  if (req.method === "GET" && new URL(req.url).pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) {
          event.waitUntil(cache.put(req, res.clone()).then(() => trimStatic(cache)));
        }
        return res;
      })
    );
    return;
  }

  // Page navigations: always the network (live, per-user data), offline page
  // only when there is no network. API calls and everything else are left to
  // the browser untouched.
  if (req.mode !== "navigate") return;
  event.respondWith(
    (async () => {
      try {
        return (await event.preloadResponse) || (await fetch(req));
      } catch {
        const cached = await caches.match(OFFLINE_URL);
        return cached || Response.error();
      }
    })()
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
