const CACHE_NAME = "ps-clean-static-v1";
const STATIC_ASSETS = ["/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

// Deliberately narrow: only ever serve cached responses for this app's own
// static icon/manifest assets. Every page and every API route always goes
// to the network — this is a live booking system with per-user, auth-gated,
// real-time-availability pages, so caching any of that risks showing a
// customer a stale or wrong screen. "Offline-first" isn't a goal here; the
// service worker exists to make the app installable, not to work offline.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || !STATIC_ASSETS.includes(url.pathname)) {
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
