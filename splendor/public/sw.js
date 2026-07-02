/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// Cache name is stamped with the server BUILD_ID at serve time (see the
// templated /sw.js route). Every deploy => new name => the activate handler
// drops old caches automatically — no manual version bumps needed.
const CACHE_NAME = 'splendor-__BUILD_ID__';
const urlsToCache = [
  '/manifest.json',
  '/icons/splendor-icon.svg'
];

// Install Service Worker — pre-cache the offline shell, then take over
// from any older SW immediately so the user does not need to close-and-
// reopen the app to see the new build.
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
});

// Fetch:
//   * HTML / navigations → network-first. Always try the network so
//     UI updates ship without manual cache clearing. Fall back to cache
//     only when offline.
//   * Everything else (icons, manifest) → cache-first.
//   * Cross-origin → pass through.
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Cross-origin: don't touch.
  if (!req.url.startsWith(self.location.origin)) return;

  const isNavigation =
    req.mode === 'navigate' ||
    (req.method === 'GET' &&
      (req.headers.get('accept') || '').includes('text/html'));

  if (isNavigation) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Stash a copy so we still work offline.
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('/manifest.json')))
    );
    return;
  }

  // Static assets: cache-first.
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});

// Activate: drop any older caches and become the active SW immediately.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

// Allow the page to force a full cache wipe.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys()
        .then((cacheNames) => Promise.all(cacheNames.map((n) => caches.delete(n))))
        .then(() => {
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({ success: true, message: 'Cache cleared' });
          }
        })
    );
  }
});
