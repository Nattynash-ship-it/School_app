// The gate, exercised the way Netlify's edge calls it: (Request, context).
import gate, { cookieValid } from '../netlify/edge-functions/gate.js';
const F=[]; const ok=(n,c,x)=>F.push({n,pass:!!c,x:x===undefined?'':String(x)});
globalThis.Netlify = { env: { get: (k) => ({ GATE_PASSWORD: 'correct horse battery', GATE_SECRET: 'unit-secret' })[k] } };
const ctx = { next: async () => new Response('SERVED', { status: 200 }) };
const req = (path, opts = {}) => new Request('https://natashastudy.netlify.app' + path, opts);
const html = { accept: 'text/html,application/xhtml+xml' };

// 1. no cookie -> sign-in page, nothing served
let r = await gate(req('/', { headers: html }), ctx);
ok('page without cookie gets 401 sign-in page', r.status === 401 && (await r.text()).includes('private study site'));
r = await gate(req('/index.html', { headers: html }), ctx);
ok('/index.html without cookie is not served', r.status === 401);
r = await gate(req('/content-C959.json?v=18.551'), ctx);
ok('content JSON without cookie gets a bare 401 json', r.status === 401 && (await r.json()).error === 'sign_in_required');
r = await gate(req('/.netlify/functions/sync?k=' + 'a'.repeat(64)), ctx);
ok('sync function without cookie is blocked', r.status === 401);
r = await gate(req('/.netlify/functions/helper', { method: 'POST', body: '{}' }), ctx);
ok('helper function without cookie is blocked', r.status === 401);
ok('sign-in page is no-store and noindex', (await gate(req('/', { headers: html }), ctx)).headers.get('cache-control') === 'no-store' && (await gate(req('/', { headers: html }), ctx)).headers.get('x-robots-tag') === 'noindex');

// 2. sw.js is public (the kill switch must reach old devices)
r = await gate(req('/sw.js'), ctx);
ok('/sw.js is served without a cookie', r.status === 200 && (await r.text()) === 'SERVED');

// 3. wrong password
const form = (pw, next='/') => req('/__gate', { method: 'POST', body: new URLSearchParams({ password: pw, next }) });
r = await gate(form('wrong'), ctx);
ok('wrong password -> 401 with the error shown, no cookie', r.status === 401 && (await r.text()).includes('not right') && !r.headers.get('set-cookie'));

// 4. right password -> cookie + redirect
r = await gate(form('correct horse battery', '/index.html'), ctx);
const sc = r.headers.get('set-cookie') || '';
ok('right password -> 303 redirect to next with an HttpOnly Secure cookie', r.status === 303 && r.headers.get('location') === '/index.html' && /nsh_gate=\d+\.[0-9a-f]{64}/.test(sc) && /HttpOnly/.test(sc) && /Secure/.test(sc) && /Max-Age=15552000/.test(sc));
const cookieVal = sc.split(';')[0].split('=')[1];
ok('cookie validates with the secret', await cookieValid(cookieVal, 'unit-secret'));
ok('cookie does NOT validate with another secret', !(await cookieValid(cookieVal, 'other')));
r = await gate(form('correct horse battery', 'https://evil.example/x'), ctx);
ok('open redirect to another site is refused (falls back to /)', r.headers.get('location') === '/');

// 5. with the cookie everything is served
const withCookie = (path, extra = {}) => req(path, { headers: { cookie: 'nsh_gate=' + cookieVal, ...extra } });
r = await gate(withCookie('/', html), ctx);
ok('page with cookie is served', r.status === 200);
r = await gate(withCookie('/content-C959.json?v=18.551'), ctx);
ok('content with cookie is served', r.status === 200);
r = await gate(withCookie('/.netlify/functions/sync?k=' + 'a'.repeat(64)), ctx);
ok('sync with cookie is served', r.status === 200);
r = await gate(withCookie('/__gate', html), ctx);
ok('visiting /__gate while signed in redirects home', r.status === 303 && r.headers.get('location') === '/');

// 6. tampered / expired cookies
const [exp, sig] = cookieVal.split('.');
r = await gate(req('/', { headers: { cookie: 'nsh_gate=' + (Number(exp) + 999999) + '.' + sig, ...html } }), ctx);
ok('cookie with an altered expiry is rejected', r.status === 401);
r = await gate(req('/', { headers: { cookie: 'nsh_gate=' + exp + '.' + sig.slice(0, 63) + (sig.endsWith('0') ? '1' : '0'), ...html } }), ctx);
ok('cookie with an altered signature is rejected', r.status === 401);
ok('an expired cookie is rejected', !(await cookieValid('1000000000.' + sig, 'unit-secret')));
r = await gate(req('/', { headers: { cookie: 'nsh_gate=garbage', ...html } }), ctx);
ok('garbage cookie is rejected', r.status === 401);

// 7. logout clears the cookie
r = await gate(withCookie('/__gate?logout=1'), ctx);
ok('logout clears the cookie and returns to sign-in', r.status === 303 && /Max-Age=0/.test(r.headers.get('set-cookie') || ''));

// 8. no env at all -> the built-in hashed passphrase is in force (hash in code, passphrase not)
globalThis.Netlify = { env: { get: (k) => ({ SITE_ID: 'site-abc' })[k] || '' } };
r = await gate(req('/', { headers: html }), ctx);
ok('with no env the site is still locked behind the built-in passphrase', r.status === 401 && (await r.text()).includes('private study site'));
r = await gate(form('ember-orchid-lantern-orchid-56', '/'), ctx);
const sc2 = r.headers.get('set-cookie') || '';
ok('the built-in passphrase signs in', r.status === 303 && /nsh_gate=\d+\.[0-9a-f]{64}/.test(sc2));
r = await gate(form('ember-orchid-lantern-orchid-57', '/'), ctx);
ok('a near-miss passphrase is refused', r.status === 401);
const cv2 = sc2.split(';')[0].split('=')[1];
r = await gate(req('/content-C959.json', { headers: { cookie: 'nsh_gate=' + cv2 } }), ctx);
ok('that cookie is accepted on later requests', r.status === 200);
// the signing key depends on the site id, not only on the (public) hash
globalThis.Netlify = { env: { get: (k) => ({ SITE_ID: 'other-site' })[k] || '' } };
r = await gate(req('/content-C959.json', { headers: { cookie: 'nsh_gate=' + cv2 } }), ctx);
ok('a cookie minted for one site id is rejected under another (hash alone cannot forge it)', r.status === 401);
// GATE_PASSWORD in the environment overrides the built-in hash
globalThis.Netlify = { env: { get: (k) => ({ SITE_ID: 'site-abc', GATE_PASSWORD: 'her new one' })[k] || '' } };
r = await gate(form('ember-orchid-lantern-orchid-56', '/'), ctx);
ok('once GATE_PASSWORD is set the built-in passphrase stops working', r.status === 401);
r = await gate(form('her new one', '/'), ctx);
ok('and the environment password signs in', r.status === 303);
r = await gate(req('/sw.js'), ctx);
ok('sw.js is served without a cookie in every mode', r.status === 200);

const bad=F.filter(f=>!f.pass);
for (const f of F) console.log((f.pass?'PASS':'FAIL')+' '+f.n+(f.pass?'':' -> '+f.x));
console.log(`gate: ${F.length-bad.length}/${F.length} passed`);
process.exit(bad.length?1:0);
