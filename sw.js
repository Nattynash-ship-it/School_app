// Study Hub service worker — v210
// GOAL: an installed iOS PWA (Add to Home Screen) must ALWAYS pick up new deploys.
//
// Two subtle traps this version fixes:
//  1) fetch(req) obeys the browser's HTTP cache, so a "network-first" worker could
//     still hand back a STALE index.html that Safari had cached. We now fetch the
//     app shell with {cache:'no-store'} to force a true trip to the server.
//  2) The browser can cache sw.js itself for up to 24h. The page now registers with
//     {updateViaCache:'none'} so the worker script is always revalidated.

const CACHE = 'study-hub-v601';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all([
        cache.add(new Request('/', { cache: 'reload' })).catch(() => null),
        cache.add(new Request('/index.html', { cache: 'reload' })).catch(() => null),
      ])
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Let the page force a waiting worker to activate, or clear all caches on demand.
self.addEventListener('message', (event) => {
  const data = event.data;
  if (data === 'SKIP_WAITING') { self.skipWaiting(); return; }
  if (data === 'CLEAR_CACHES') {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .then(() => {
          if (event.source && event.source.postMessage) event.source.postMessage('CACHES_CLEARED');
        })
    );
  }
});

function isAppShell(req, url) {
  return req.mode === 'navigate' ||
         url.pathname === '/' ||
         url.pathname.endsWith('/index.html');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  // Cross-origin (fonts/CDNs): cache-first is fine — those URLs are versioned.
  if (url.origin !== self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((resp) => {
        if (resp && resp.status === 200 && resp.type !== 'opaque') {
          const copy = resp.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy).catch(() => {}));
        }
        return resp;
      }).catch(() => cached || new Response('Offline', { status: 503 })))
    );
    return;
  }

  // SAME-ORIGIN APP SHELL: force a real network fetch, bypassing the HTTP cache.
  // This is what guarantees the iPad sees a new deploy instead of a stale copy.
  if (isAppShell(req, url)) {
    event.respondWith(
      fetch(new Request(req.url, { cache: 'no-store', credentials: 'same-origin' }))
        .then((resp) => {
          if (resp && resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE).then((cache) => cache.put('/index.html', copy).catch(() => {}));
          }
          return resp;
        })
        .catch(() =>
          caches.match('/index.html')
            .then((c) => c || caches.match('/'))
            .then((c) => c || new Response('Offline', { status: 503 }))
        )
    );
    return;
  }

  // Other same-origin assets: network-first, fall back to cache when offline.
  event.respondWith(
    fetch(req).then((resp) => {
      if (resp && resp.ok) {
        const copy = resp.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy).catch(() => {}));
      }
      return resp;
    }).catch(() => caches.match(req).then((cached) => cached || new Response('Offline', { status: 503 })))
  );
});
