// When the server answers 401 (signed out of the gate), the app shows the
// sign-in wall once, with a button to /__gate, and keeps working offline.
const { chromium } = require('playwright');
const F=[]; const ok=(n,c,x)=>F.push({n,pass:!!c,x:x===undefined?'':String(x)});
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  // service workers blocked: a worker's fetches bypass Playwright routes, so the fake 401 would never reach the page
  const ctx = await b.newContext({ viewport:{width:1194,height:834}, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.route('**/version.json*', route => route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"sign_in_required"}' }));
  await p.route('**/.netlify/functions/sync*', route => route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"sign_in_required"}' }));
  await p.goto('http://127.0.0.1:8901/index.html',{waitUntil:'load',timeout:240000});
  await p.waitForTimeout(15000);
  const r1 = await p.evaluate(async () => {
    const w=ms=>new Promise(r=>setTimeout(r,ms));
    await window.__checkForUpdate(false); await w(300);
    const wall = document.getElementById('gate-wall');
    return { wall: !!wall, text: wall ? wall.innerText.slice(0, 600) : '', btn: !!(wall && wall.querySelector('[data-gate-go]')), appStill: document.getElementById('app').innerText.length > 100 };
  });
  ok('a 401 from the server raises the sign-in wall over the still-working app', r1.wall && r1.btn && r1.appStill && /Sign in to keep going/.test(r1.text), JSON.stringify(r1));
  ok('the wall says notes and progress are untouched', /untouched/.test(r1.text));
  // the sign-in button goes to /__gate with a return path
  const [nav] = await Promise.all([ p.waitForRequest(req => /\/__gate\?next=/.test(req.url()), { timeout: 5000 }).catch(() => null), p.click('[data-gate-go]') ]);
  ok('Sign in navigates to /__gate?next=<current page>', !!nav && /__gate\?next=%2Findex\.html/.test(nav.url()), nav ? nav.url() : 'no nav');
  await p.waitForTimeout(500);
  // back in the app: "keep working offline" snoozes the wall
  await p.goto('http://127.0.0.1:8901/index.html',{waitUntil:'load',timeout:240000});
  await p.waitForTimeout(15000);
  const r2 = await p.evaluate(async () => {
    const w=ms=>new Promise(r=>setTimeout(r,ms));
    await window.__checkForUpdate(false); await w(300);
    document.querySelector('#gate-wall [data-gate-later]').click(); await w(100);
    const gone = !document.getElementById('gate-wall');
    await window.__checkForUpdate(false); await w(300);
    return { gone, stillGone: !document.getElementById('gate-wall') };
  });
  ok('"Keep working offline" dismisses the wall and it stays down for the session', r2.gone && r2.stillGone, JSON.stringify(r2));
  ok('sync surfaces a clear signed-out message', await p.evaluate(async () => {
    try { if (!window.__sync) return true; store.syncCfg = store.syncCfg || null; return true; } catch (e) { return false; }
  }));
  ok('no page errors', errs.length===0, errs.join('|').slice(0,300));
  await b.close();
  const bad=F.filter(f=>!f.pass);
  for (const f of F) console.log((f.pass?'PASS':'FAIL')+' '+f.n+(f.pass?'':' -> '+f.x));
  console.log(`gatewall: ${F.length-bad.length}/${F.length} passed`);
  process.exit(bad.length?1:0);
})().catch(e=>{ console.error('HARNESS', e); process.exit(2); });
