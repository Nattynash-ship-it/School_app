// SECTION: Boot & screens
// "There are still a lot of limitations on the phone. I like to use the app on
//  the train to study but I still have no access when there is no WiFi. Also
//  the layout is really odd on the phone... the toolbar is not necessary when
//  in phone mode as it blocks the contents of the page."
//
// Three things, measured on a 390x844 phone:
//   1. offline - the download existed at the foot of the Export sheet, where it
//      was never found, and it was all 57 classes or nothing. It is now in the
//      main menu with what this device holds, and her own classes come first.
//      The proof here is the real thing: save a class, cut the network, reload,
//      and read it.
//   2. the layout - a full-width navigation drawer was mistaken for a narrow
//      left rail, so the dock started at 402px on a 390px screen and put the
//      A-/A+/pencil/Exit strip off the side of the phone entirely.
//   3. the toolbar - the floating tray sat on top of the words; on a phone it
//      goes away with everything else the pencil button controls.
const { chromium, devices } = require('playwright');
const B = 'http://127.0.0.1:' + (process.env.PORT || 8901) + '/index.html';
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d === undefined ? '' : JSON.stringify(d).slice(0, 320)))); };
const LESSON = { name: 'section', courseId: 'D286', chId: 'u1', secId: 'z1_1' };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  p.on('dialog', d => d.accept());
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await p.goto(B, { waitUntil: 'load', timeout: 240000 }); await p.waitForTimeout(12000);
  const open = () => p.evaluate(async (L) => { const w = ms => new Promise(r => setTimeout(r, ms)); go(L); await w(2600); }, LESSON);
  await open();

  // ---------- 2. nothing the app pins to the screen may sit off the screen ----------
  const placed = await p.evaluate(() => {
    const vw = innerWidth, out = { vw, phoneMode: document.body.classList.contains('phone-mode'), off: [] };
    document.querySelectorAll('body *').forEach(el => {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') return;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return;
      if (r.width > vw) return;                       // a full-screen overlay is not a control
      if (r.left < -1 || r.right > vw + 1) out.off.push({ id: (el.id || el.className || el.tagName).toString().slice(0, 36), l: Math.round(r.left), r: Math.round(r.right) });
    });
    const s = document.querySelector('.phone-ctl');
    out.strip = s ? (() => { const r = s.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), shown: getComputedStyle(s).display !== 'none' }; })() : null;
    return out;
  });
  ok('phone mode turns itself on at phone width', placed.phoneMode, placed);
  ok('no fixed control is placed off the side of the screen', placed.off.length === 0, placed.off);
  ok('so the A-/A+/pencil/Exit strip is reachable', placed.strip && placed.strip.shown && placed.strip.l >= 0 && placed.strip.r <= placed.vw, placed.strip);

  /* "the toolbar is not necessary when in phone mode as it blocks the contents
     of the page" - the strip is a 209px bar, and once it was no longer being
     pushed off the side of the phone it lay across the words on every screen.
     It now keeps one button and unfolds on a tap. */
  const fold = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const s = document.querySelector('.phone-ctl');
    const box = () => { const r = s.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };
    const handle = s.querySelector('.phone-ctl-handle');
    const out = { hasHandle: !!handle, shut: s.classList.contains('pc-fold'), shutBox: box() };
    if (handle) handle.click(); await w(260);
    out.open = !s.classList.contains('pc-fold');
    out.openBox = box();
    out.pencilSeen = (() => { const b = [...s.querySelectorAll('button')].find(b => /drawing tools/i.test(b.getAttribute('aria-label') || '')); return !!b && getComputedStyle(b).display !== 'none'; })();
    window.dispatchEvent(new Event('scroll')); await w(1100);
    out.shutAfterScroll = s.classList.contains('pc-fold');
    if (handle) handle.click(); await w(260);
    out.reopened = !s.classList.contains('pc-fold');
    return out;
  });
  ok('the strip starts as one button, not a bar across the page', fold.hasHandle && fold.shut && fold.shutBox.w <= 60 && fold.shutBox.h <= 60, fold);
  ok('one tap opens the rest of it', fold.open && fold.openBox.w > fold.shutBox.w + 60 && fold.pencilSeen, fold);
  ok('and reading folds it away again', fold.shutAfterScroll && fold.reopened, fold);

  // a full-width drawer must not be read as a left rail
  const drawer = await p.evaluate(() => {
    const d = document.createElement('div');
    d.className = 'v2-sidebar';
    d.setAttribute('style', 'position:fixed; left:0; top:0; width:100%; height:100%; z-index:1;');
    document.body.appendChild(d);
    if (window.__bottomDockLayout) window.__bottomDockLayout();
    const s = document.querySelector('.phone-ctl').getBoundingClientRect();
    d.remove(); if (window.__bottomDockLayout) window.__bottomDockLayout();
    return { l: Math.round(s.left), r: Math.round(s.right), vw: innerWidth };
  });
  ok('a full-width drawer is not mistaken for a rail', drawer.l >= 0 && drawer.r <= drawer.vw + 1, drawer);

  // ---------- 3. the toolbar is out of the reading area ----------
  const tools = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const vis = sel => { const e = document.querySelector(sel); return !!e && getComputedStyle(e).display !== 'none'; };
    const before = { tray: vis('#tool-tray'), anno: vis('.top-bar .actions .anno-toggle-btn') };
    const strip = document.querySelector('.phone-ctl');
    if (strip && strip.classList.contains('pc-fold')) { strip.querySelector('.phone-ctl-handle').click(); await w(260); }
    const pencil = [...document.querySelectorAll('.phone-ctl button')].find(b => /drawing tools/i.test(b.getAttribute('aria-label') || '') && getComputedStyle(b).display !== 'none');
    if (pencil) pencil.click(); await w(320);
    const after = { tray: vis('#tool-tray'), anno: vis('.top-bar .actions .anno-toggle-btn'), cls: document.body.classList.contains('phone-tools') };
    if (pencil) pencil.click(); await w(320);
    const back = { tray: vis('#tool-tray'), anno: vis('.top-bar .actions .anno-toggle-btn') };
    return { before, after, back, hasPencil: !!pencil };
  });
  ok('the phone strip carries the drawing-tools button', tools.hasPencil, tools);
  ok('the floating toolbar does not sit on the words by default', tools.before.tray === false && tools.before.anno === false, tools.before);
  ok('one tap brings the tools back', tools.after.tray === true && tools.after.anno === true && tools.after.cls, tools.after);
  ok('and another puts them away again', tools.back.tray === false && tools.back.anno === false, tools.back);

  // ---------- the lesson reads like a page, not a stack of chrome ----------
  const head = await p.evaluate(() => {
    const h1 = document.querySelector('.screen h1');
    const row = document.querySelector('.lesson-title-row');
    const lab = document.querySelector('.screen > p.lesson-unit-label');
    const t = document.querySelector('.top-bar .title');
    return { h1h: h1 ? Math.round(h1.getBoundingClientRect().height) : null,
             h1fs: h1 ? getComputedStyle(h1).fontSize : null,
             wrap: row ? getComputedStyle(row).flexWrap : null,
             h1full: (h1 && row) ? Math.round(h1.getBoundingClientRect().width) >= Math.round(row.getBoundingClientRect().width) - 2 : null,
             label: lab ? getComputedStyle(lab).display : 'absent',
             titleRoom: t ? Math.round(t.getBoundingClientRect().width) : null };
  });
  ok('the lesson heading gets the whole width, not a third of it', head.wrap === 'wrap' && head.h1full, head);
  ok('so it reads on one or two lines instead of three', head.h1h !== null && head.h1h <= 62, head);
  ok('the unit name is not printed twice', head.label === 'none', head);
  ok('the section title in the bar has real room', head.titleRoom >= 130, head);

  // ---------- 1. offline ----------
  /* Against a build without any of this the suite must REPORT, not throw - a
     negative control that crashes proves nothing about which checks it carries. */
  const api = await p.evaluate(() => {
    const O = window.__offline;
    if (!O || typeof O.mine !== 'function' || typeof O.urlsFor !== 'function') return { missing: true, mine: 0, few: 0, all: 0 };
    const mine = O.mine();
    const few = O.urlsFor(mine);
    return { missing: false, mine: mine.length, few: few.length, all: O.urls().length,
             manifest: few.filter(u => /content-manifest/.test(u)).length,
             onlyMine: few.every(u => /content-manifest/.test(u) || mine.some(c => u.indexOf('/content-' + c + '.json') === 0)) };
  });
  ok('the app knows which classes she is actually taking', !api.missing && api.mine > 0 && api.mine < api.all, api);
  ok('saving those asks for exactly them, plus the manifest they need', api.manifest === 1 && api.onlyMine && api.few === api.mine + 1, api);

  const menu = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    showOverflowMenu(); await w(700);
    const b = document.querySelector('[data-act="offline-save"]');
    const txt = b ? b.textContent.replace(/\s+/g, ' ').trim() : null;
    const sheet = document.querySelector('.pomo-sheet');
    if (sheet) sheet.remove();
    return { there: !!b, txt };
  });
  ok('it is in the main menu, not buried in the export sheet', menu.there, menu);
  ok('and the menu line says what this device is holding', /saved|nothing saved/i.test(menu.txt || ''), menu);

  // the real thing: save one class, cut the network, reload, read it
  const saved = await p.evaluate(async () => {
    const O = window.__offline;
    if (!O || typeof O.urlsFor !== 'function' || typeof O.status !== 'function') return { ok: 0, failed: 0, files: 0, missing: true };
    const r = await O.download(null, O.urlsFor(['D286']));
    const h = await O.status();
    return { ok: r.ok, failed: r.failed.length, files: h.files };
  });
  ok('a class downloads into the shelf the worker reads', saved.ok >= 2 && saved.failed === 0 && saved.files >= 2, saved);

  await ctx.setOffline(true);
  await p.reload({ waitUntil: 'load', timeout: 240000 }).catch(() => {});
  await p.waitForTimeout(12000);
  const offline = await p.evaluate(async (L) => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const out = { online: navigator.onLine, booted: typeof go === 'function' };
    if (!out.booted) return out;
    go(L); await w(3200);
    const h1 = document.querySelector('.screen h1');
    out.title = h1 ? h1.textContent.trim().slice(0, 40) : null;
    out.words = (document.querySelector('.lesson') || { textContent: '' }).textContent.trim().length;
    try { out.qs = (getQuestions(L.courseId, L.chId, L.secId) || []).length; } catch (e) { out.qs = -1; }
    return out;
  }, LESSON);
  ok('with the network cut the app still starts', offline.booted && offline.online === false, offline);
  ok('and the saved class opens and reads - the train test', /Programming/.test(offline.title || '') && offline.words > 400 && offline.qs > 0, offline);
  await ctx.setOffline(false);

  // ---------- the iPad is untouched ----------
  const tab = await browser.newContext({ ...devices['iPad Pro 11'], viewport: { width: 1194, height: 834 } });
  const q = await tab.newPage();
  await q.goto(B, { waitUntil: 'load', timeout: 240000 }); await q.waitForTimeout(12000);
  const pad = await q.evaluate(async (L) => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    go(L); await w(2600);
    const vis = sel => { const e = document.querySelector(sel); return !!e && getComputedStyle(e).display !== 'none'; };
    const h1 = document.querySelector('.screen h1');
    return { phoneMode: document.body.classList.contains('phone-mode'), tray: vis('#tool-tray'),
             anno: vis('.top-bar .actions .anno-toggle-btn'), label: vis('.screen > p.lesson-unit-label'),
             h1fs: h1 ? getComputedStyle(h1).fontSize : null };
  }, LESSON);
  ok('on the iPad nothing about this changes', !pad.phoneMode && pad.tray && pad.anno && pad.label && pad.h1fs === '26px', pad);
  ok('no page errors', errs.length === 0, errs.slice(0, 3));
  await browser.close();
  console.log('phoneoffline: ' + pass + '/' + (pass + fail) + ' passed');
  process.exit(fail ? 1 : 0);
})();
