// Study Hub service worker — v210
// GOAL: an installed iOS PWA (Add to Home Screen) must ALWAYS pick up new deploys.
//
// Two subtle traps this version fixes:
//  1) fetch(req) obeys the browser's HTTP cache, so a "network-first" worker could
//     still hand back a STALE index.html that Safari had cached. We now fetch the
//     app shell with {cache:'no-store'} to force a true trip to the server.
//  2) The browser can cache sw.js itself for up to 24h. The page now registers with
//     {updateViaCache:'none'} so the worker script is always revalidated.

const CACHE = 'study-hub-v789';

// HER LIBRARY MUST SURVIVE A DEPLOY.
//
// There was one cache, named after the build, and activate deleted every cache
// that was not it. So shipping anything at all emptied her offline copy down
// to whatever install had just precached - four courses out of fifty-eight -
// and everything else she had read went with it. Four builds went out in two
// days; each one did that again. "Unable to view anything" on a train is
// exactly what that looks like.
//
// The course files are now in their own cache that no deploy touches. Their
// URLs already carry the build (?v=18.xxx), so a new build is a new key and an
// old one is superseded rather than served - versioning by URL, which is what
// the query was for, instead of by throwing the library away. The shell stays
// versioned and disposable, because that is the file that must never go stale.
const CONTENT = 'study-hub-content';

self.addEventListener('install', (event) => {
  // The shell, and only the shell. Precaching a handful of courses here was
  // what made the library look like it was being kept when it was not.
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all([
        cache.add(new Request('/', { cache: 'reload' })).catch(() => null),
        cache.add(new Request('/index.html', { cache: 'reload' })).catch(() => null),
      ])
    ).then(() => caches.open(CONTENT).then((c) =>
      c.add(new Request('/content-manifest.json', { cache: 'reload' })).catch(() => null)
    ))
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
    const keep = (k) => k === CACHE || k === GATE_MARK || k === CONTENT;
    const hadOld = keys.some((k) => !keep(k));
    await Promise.all(keys.filter((k) => !keep(k)).map((k) => caches.delete(k)));
    await self.clients.claim();
    if (!keys.includes(GATE_MARK)) {
      try { await caches.open(GATE_MARK); } catch (e) {}
      // The switch takes the library too: it exists to remove the whole site
      // from a device that should not still be holding it.
      try { await caches.delete(CONTENT); } catch (e) {}
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

// One course, one copy. Each build asks for ?v=<build>, so without this every
// deploy would leave another 60MB of superseded courses behind for ever.
async function trim(shelf, pathname, keepUrl) {
  try {
    const rs = await shelf.keys();
    for (const r of rs) {
      if (r.url === keepUrl) continue;
      let u; try { u = new URL(r.url); } catch (e) { continue; }
      if (u.pathname === pathname) await shelf.delete(r);
    }
  } catch (e) {}
}

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
    event.respondWith((async () => {
      const shelf = await caches.open(CONTENT);
      const exact = await shelf.match(req);
      if (exact) return exact;
      try {
        const resp = await fetch(req);
        if (resp && resp.ok) {
          shelf.put(req, resp.clone()).then(() => trim(shelf, url.pathname, req.url)).catch(() => {});
        }
        return resp;
      } catch (e) {
        // no signal: any version of this course beats nothing at all
        const any = await shelf.match(req, { ignoreSearch: true });
        return any || new Response('Offline', { status: 503 });
      }
    })());
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
