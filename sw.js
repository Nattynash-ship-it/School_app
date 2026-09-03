// Study Hub service worker — v210
// GOAL: an installed iOS PWA (Add to Home Screen) must ALWAYS pick up new deploys.
//
// Two subtle traps this version fixes:
//  1) fetch(req) obeys the browser's HTTP cache, so a "network-first" worker could
//     still hand back a STALE index.html that Safari had cached. We now fetch the
//     app shell with {cache:'no-store'} to force a true trip to the server.
//  2) The browser can cache sw.js itself for up to 24h. The page now registers with
//     {updateViaCache:'none'} so the worker script is always revalidated.

const CACHE = 'study-hub-v723';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all([
        cache.add(new Request('/', { cache: 'reload' })).catch(() => null),
        cache.add(new Request('/index.html', { cache: 'reload' })).catch(() => null),
        cache.add(new Request('/content-manifest.json', { cache: 'reload' })).catch(() => null),
        cache.add(new Request('/content-C959.json', { cache: 'reload' })).catch(() => null),
        cache.add(new Request('/content-D286.json', { cache: 'reload' })).catch(() => null),
        cache.add(new Request('/content-D684.json', { cache: 'reload' })).catch(() => null),
        cache.add(new Request('/content-D197.json', { cache: 'reload' })).catch(() => null),
      ])
    )
  );
  self.skipWaiting();
});

// THE KILL SWITCH. The site is now behind a password gate, but every device
// that opened it before the gate existed still holds a complete copy in this
// worker's cache - and a cached PWA keeps working with no server at all.
// /sw.js is the one file the gate serves to everyone, precisely so this
// worker reaches those devices: on its first activation it deletes every
// cache and reloads every open page. The reload goes to the network, meets
// the gate, and shows the sign-in page. Nothing else on the device is
// touched (localStorage and IndexedDB are not caches), so a signed-in owner
// loses nothing; a stranger loses the copy. The marker cache records that
// the switch has fired, so later deploys update quietly as before.
const GATE_MARK = 'study-hub-gate-v1';
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // an older worker's cache means this device held the site before the gate
    const hadOld = keys.some((k) => k !== CACHE && k !== GATE_MARK);
    await Promise.all(keys.filter((k) => k !== CACHE && k !== GATE_MARK).map((k) => caches.delete(k)));
    await self.clients.claim();
    if (!keys.includes(GATE_MARK)) {
      try { await caches.open(GATE_MARK); } catch (e) {}
      // A brand-new device has nothing to wipe and is not reloaded.
      if (hadOld) {
        try {
          const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
          for (const c of cs) { try { await c.navigate(c.url); } catch (e) {} }
        } catch (e) {}
      }
    }
  })());
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

  // COURSE CONTENT: the manifest plus one file per course (and the legacy
  // content-pack.json). URLs carry the app build as a query (?v=18.xxx), so a
  // new deploy is a new URL - cache-first is safe and avoids re-downloading
  // megabytes on every launch. Old entries die with the old cache when CACHE
  // bumps.
  if (/^\/content-[\w-]+\.json$/.test(url.pathname)) {
    // VERSION-AWARE, and it has to be. These are requested as ?v=<build>.
    // Matching with ignoreSearch meant ANY cached copy won over the network,
    // however old: one stale copy - a precache that raced a deploy, say -
    // pinned an outdated course for the whole cache generation, and because
    // the match was cache-first it never revalidated. That is a course
    // silently "reverting to the previous version", with restarting the app
    // powerless to fix it (reproduced: a build-18.504 app served
    // build-18.480 lessons with the newest sections missing).
    //
    // Now: this build's exact copy, else the network (stored under the exact
    // versioned URL), and only if BOTH fail, any cached version - stale
    // content still beats no content when she is offline.
    event.respondWith(
      caches.match(req).then((exact) => exact || fetch(req).then((resp) => {
        if (resp && resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy).catch(() => {}));
        }
        return resp;
      }).catch(() => caches.match(req, { ignoreSearch: true })
        .then((any) => any || new Response('Offline', { status: 503 }))))
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
