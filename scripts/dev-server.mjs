// Live-reload dev server: serve this repo to the iPad over Wi-Fi and refresh it
// automatically whenever a file changes.
//
//   npm run dev            (then open the printed http://<ip>:8080 URL on the iPad)
//
// Why this works cleanly: index.html only registers its service worker on https
// or localhost, so over a plain-http LAN address there is NO service worker and
// NO cache - every reload is the real current file, with no Install banner and
// no waiting on a deploy.
//
// The live-reload snippet is injected into the HTML as it is SERVED. Nothing
// dev-related is ever written into index.html, so none of this can reach the
// published app.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.ttf': 'font/ttf', '.map': 'application/json; charset=utf-8',
};

const SNIPPET = `
<script>
/* dev live-reload - injected by scripts/dev-server.mjs, never part of the app file */
(function(){
  if (window.__devReload) return; window.__devReload = true;
  var badge = null;
  function flash(text){
    try {
      if (!badge) {
        badge = document.createElement('div');
        badge.style.cssText = 'position:fixed;left:10px;bottom:calc(10px + env(safe-area-inset-bottom));z-index:2147483647;'
          + 'background:#111;color:#fff;font:600 12px/1 ui-sans-serif,system-ui;padding:8px 11px;border-radius:999px;'
          + 'opacity:.92;pointer-events:none;box-shadow:0 4px 14px rgba(0,0,0,.3);';
        document.body.appendChild(badge);
      }
      badge.textContent = text;
      badge.style.display = 'block';
    } catch (e) {}
  }
  function connect(){
    var es = new EventSource('/__dev/reload');
    es.addEventListener('reload', function(){ flash('updating…'); setTimeout(function(){ location.reload(); }, 60); });
    es.addEventListener('hello', function(){ flash('live'); setTimeout(function(){ if (badge) badge.style.display = 'none'; }, 1400); });
    es.onerror = function(){ try { es.close(); } catch (e) {} flash('dev server offline'); setTimeout(connect, 2000); };
  }
  if (document.body) connect(); else addEventListener('DOMContentLoaded', connect);
})();
</script>
`;

const clients = new Set();
function broadcast(event, data = '1') {
  for (const res of clients) {
    try { res.write(`event: ${event}\ndata: ${data}\n\n`); } catch (e) { clients.delete(res); }
  }
}

// Watch the files that make up the app. Editors write in bursts, so debounce.
const WATCHED = ['index.html', 'sw.js', 'version.json', 'classes.json',
  'content-manifest.json', 'content-C959.json', 'content-D286.json',
  'content-D684.json', 'content-D197.json'];
let timer = null, pending = new Set();
function changed(name) {
  pending.add(name);
  clearTimeout(timer);
  timer = setTimeout(() => {
    const names = [...pending].join(', ');
    pending.clear();
    console.log(`  changed: ${names} -> reloading ${clients.size} device(s)`);
    broadcast('reload');
  }, 250);
}
for (const f of WATCHED) {
  try { watch(join(ROOT, f), () => changed(f)); } catch (e) { /* file may not exist yet */ }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/__dev/reload') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache',
                         'Connection': 'keep-alive', 'Access-Control-Allow-Origin': '*' });
    res.write('retry: 1000\n\n');
    res.write('event: hello\ndata: 1\n\n');
    clients.add(res);
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) {} }, 25000);
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
    return;
  }

  let p = decodeURIComponent(url.pathname);
  if (p === '/' || p.endsWith('/')) p += 'index.html';
  const file = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('Forbidden'); return; }

  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not a file');
    const type = TYPES[extname(file).toLowerCase()] || 'application/octet-stream';
    // Never let the browser cache anything in dev - that is the whole point.
    const headers = { 'Content-Type': type, 'Cache-Control': 'no-store, must-revalidate' };

    if (type.startsWith('text/html')) {
      let html = await readFile(file, 'utf8');
      const at = html.lastIndexOf('</body>');
      html = at >= 0 ? html.slice(0, at) + SNIPPET + html.slice(at) : html + SNIPPET;
      const body = Buffer.from(html, 'utf8');
      res.writeHead(200, { ...headers, 'Content-Length': body.length }).end(body);
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, { ...headers, 'Content-Length': body.length }).end(body);
  } catch (e) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found: ' + p);
  }
});

function lanAddresses() {
  const out = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

server.listen(PORT, '0.0.0.0', () => {
  const ips = lanAddresses();
  console.log('\n  Study Hub dev server - live reload on save\n');
  console.log('    on this computer :  http://localhost:' + PORT);
  if (ips.length) {
    console.log('\n    ON THE IPAD, open Safari and type one of these:');
    for (const ip of ips) console.log('      http://' + ip + ':' + PORT);
  } else {
    console.log('\n    (no Wi-Fi address found - connect this computer to the same network as the iPad)');
  }
  console.log('\n  The iPad reloads itself whenever you save a file here. Ctrl+C to stop.\n');
});
