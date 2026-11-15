// PALSY service worker: installability only, on purpose.
//
// It caches NOTHING. Every request goes straight to the network, so the
// app can never serve a stale build, and Supabase, auth and realtime
// traffic are never intercepted at all. If offline support is ever
// wanted, it belongs in a separate, carefully-tested worker — not here.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass-through: the network handles everything, exactly as if no
  // service worker were installed.
  event.respondWith(fetch(event.request));
});
