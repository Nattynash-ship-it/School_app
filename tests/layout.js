// Layout audit as a guard: across an iPad (both ways) and a phone, on every
// main screen, nothing spills past the right edge, no text is clipped, no two
// pieces of text sit on each other, and no floating control covers text -
// except a folded tool button on a phone, which is how phones work. The
// notebook is never under a floating control. The phone is one column with
// the sidebar behind the menu button; the tool tray starts folded on a phone
// and steps aside while the notebook is open.
const { chromium } = require('playwright');
const PORT = process.env.PORT || 8901;
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d === undefined ? '' : JSON.stringify(d).slice(0, 400)))); };
const ONLY = process.env.VP; const VPS = [['ipad-land', { width: 1194, height: 834 }], ['ipad-port', { width: 834, height: 1194 }], ['phone', { width: 390, height: 844 }]];
const ROUTES = [['home', { name: 'home' }], ['today', { name: 'today' }], ['class', { name: 'class', courseId: 'C959' }], ['section', { name: 'section', courseId: 'C959', chId: 'ch4', secId: 's1' }],
  ['review', { name: 'review' }], ['flashcards', { name: 'flashcards' }], ['plan', { name: 'plan' }], ['planner', { name: 'planner' }], ['calendar', { name: 'calendar' }],
  ['projects', { name: 'projects' }], ['search', { name: 'search' }], ['notebooks', { name: 'notebooks' }], ['classnotes', { name: 'classnotes', courseId: 'C959' }]];
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const [vn, vp] of VPS.filter(v => !ONLY || v[0] === ONLY)) {
    const ctx = await b.newContext({ viewport: vp, hasTouch: true });
    const p = await ctx.newPage(); p.on('dialog', d => d.accept());
    const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 120)));
    await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load', timeout: 240000 }); await p.waitForTimeout(11000);
    const phone = vn === 'phone';
    const bad = [];
    for (const [rn, route] of ROUTES) {
      const R = await p.evaluate(async (route) => {
        const w = ms => new Promise(r => setTimeout(r, ms));
        try { go(route); } catch (e) { return { err: String(e).slice(0, 80) }; }
        await w(1400);
        try { window.scrollTo(0, 0); } catch (e) {}
        const vw = innerWidth, vh = innerHeight;
        const desc = el => (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '') + ' "' + (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 28) + '"');
        const hiddenByDetails = el => { for (let e = el.parentElement; e; e = e.parentElement) if (e.tagName === 'DETAILS' && !e.open && e.firstElementChild !== el && !e.querySelector(':scope > summary')?.contains(el)) return true; return false; };
        const vis = el => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false; const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < vh && !hiddenByDetails(el); };
        const all = [...document.body.querySelectorAll('*')].filter(el => !['SCRIPT', 'STYLE', 'SVG', 'PATH', 'G', 'LINE', 'RECT', 'CIRCLE', 'TEXT', 'DEFS', 'PATTERN', 'USE', 'TSPAN', 'CANVAS', 'BR', 'WBR'].includes(el.tagName));
        const docOverflow = document.documentElement.scrollWidth > vw + 1;
        const offRight = [];
        for (const el of all) { if (!vis(el)) continue; const r = el.getBoundingClientRect(); if (r.right > vw + 2 && r.left < vw && (el.innerText || '').trim()) { offRight.push(desc(el) + ' right=' + Math.round(r.right)); if (offRight.length > 4) break; } }
        const clipped = [];
        for (const el of all) { if (!vis(el)) continue; const cs = getComputedStyle(el); if ((cs.overflowX === 'hidden' || cs.overflow === 'hidden') && el.scrollWidth > el.clientWidth + 3 && cs.textOverflow !== 'ellipsis' && (el.innerText || '').trim() && el.children.length <= 3 && !/pre|code/i.test(el.tagName)) { clipped.push(desc(el) + ' +' + (el.scrollWidth - el.clientWidth) + 'px'); if (clipped.length > 4) break; } }
        const leaves = all.filter(el => vis(el) && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1));
        const inFlow = el => { for (let e = el; e && e !== document.body; e = e.parentElement) { if (getComputedStyle(e).position === 'fixed') return false; } return true; };
        const boxes = leaves.map(el => ({ el, r: el.getBoundingClientRect(), fixed: !inFlow(el) }));
        const pairs = [];
        for (let i = 0; i < boxes.length && pairs.length < 6; i++) for (let j = i + 1; j < boxes.length && pairs.length < 6; j++) {
          const A = boxes[i], B = boxes[j];
          if (A.fixed || B.fixed || A.el.contains(B.el) || B.el.contains(A.el)) continue;
          const ix = Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left), iy = Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top);
          if (ix <= 2 || iy <= 2) continue;
          const inter = ix * iy, small = Math.min(A.r.width * A.r.height, B.r.width * B.r.height);
          if (inter / small < 0.25 || small < 400) continue;
          pairs.push(desc(A.el) + ' x ' + desc(B.el) + ' ' + Math.round(100 * inter / small) + '%');
        }
        const fixedEls = all.filter(el => vis(el) && getComputedStyle(el).position === 'fixed' && el.getBoundingClientRect().width < vw * 0.9 && !el.classList.contains('toast') && !/toast/.test(el.className));
        const covered = [];
        for (const f of fixedEls) { if (f.id === 'tool-tray' && f.classList.contains('tt-shut') && innerWidth < 700) continue; const fr = f.getBoundingClientRect(); for (const L of boxes) { if (L.fixed || f.contains(L.el)) continue; const ix = Math.min(fr.right, L.r.right) - Math.max(fr.left, L.r.left), iy = Math.min(fr.bottom, L.r.bottom) - Math.max(fr.top, L.r.top); if (ix > 6 && iy > 6) { covered.push(desc(f) + ' over ' + desc(L.el)); break; } } if (covered.length > 4) break; }
        return { docOverflow, offRight, clipped, pairs, covered, text: (document.getElementById('app') || {}).innerText?.length || 0 };
      }, route);
      if (R.err) { bad.push(rn + ': ' + R.err); continue; }
      const probs = [];
      if (R.docOverflow) probs.push('page wider than the screen');
      if (R.offRight.length) probs.push('off the right edge: ' + R.offRight.join(' | '));
      if (R.clipped.length) probs.push('clipped: ' + R.clipped.join(' | '));
      if (R.pairs.length) probs.push('text on text: ' + R.pairs.join(' | '));
      if (R.covered.length) probs.push('covered: ' + R.covered.join(' | '));
      if (probs.length) bad.push(rn + ' -> ' + probs.join(' ;; '));
    }
    ok(vn + ': every screen lays out clean (no overflow, clipping, overlap, or floating control over text)', bad.length === 0, bad);
    // shell + tray + notebook checks
    const S = await p.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      go({ name: 'home' }); await w(1200);
      const sb = document.querySelector('.v2-sidebar'), main = document.querySelector('.v2-main');
      const out = { sidebarShown: !!(sb && getComputedStyle(sb).display !== 'none'), mainW: main ? Math.round(main.getBoundingClientRect().width) : 0, trayShut: !!document.querySelector('#tool-tray.tt-shut'), trayThere: !!document.querySelector('#tool-tray') };
      const hb = document.getElementById('nav-hamburger');
      if (hb && innerWidth <= 720) {
        hb.click(); await w(250);
        out.drawerOpen = document.body.classList.contains('phone-nav-open') && !!(sb && getComputedStyle(sb).display !== 'none') && getComputedStyle(sb).position === 'fixed';
        const item = sb && sb.querySelector('.v2-sb-item, button, a'); if (item) { item.click(); await w(300); }
        out.drawerClosedAfterPick = !document.body.classList.contains('phone-nav-open');
        document.body.classList.remove('phone-nav-open');
      }
      go({ name: 'section', courseId: 'C959', chId: 'ch4', secId: 's1' }); await w(1500);
      window.__notesPanel.open(); await w(1200);
      const tray = document.getElementById('tool-tray');
      out.trayHiddenWithNotebook = !tray || getComputedStyle(tray).display === 'none';
      const dock = document.getElementById('mn-dock'), dr = dock.getBoundingClientRect();
      const fixed = [...document.body.querySelectorAll('*')].filter(el => { const cs = getComputedStyle(el); if (cs.position !== 'fixed' || cs.display === 'none') return false; const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && !dock.contains(el) && el !== dock && r.width < innerWidth * 0.95; });
      out.overDock = fixed.filter(el => { const r = el.getBoundingClientRect(); return Math.min(dr.right, r.right) - Math.max(dr.left, r.left) > 6 && Math.min(dr.bottom, r.bottom) - Math.max(dr.top, r.top) > 6; }).map(el => el.id || el.className);
      window.__notesPanel.close(); await w(300);
      out.trayBack = !!tray && getComputedStyle(tray).display !== 'none';
      return out;
    });
    if (phone) {
      ok('phone: one column - the sidebar is a drawer behind the menu button', !S.sidebarShown && S.mainW >= 340 && S.drawerOpen === true && S.drawerClosedAfterPick === true, S);
      ok('phone: the tool tray starts folded to one button', S.trayThere && S.trayShut, S);
    } else {
      ok(vn + ': sidebar and main column both present', S.sidebarShown && S.mainW >= 500, S);
      ok(vn + ': the tool tray is unfolded', S.trayThere && !S.trayShut, S);
    }
    ok(vn + ': the tray steps aside while the notebook is open, nothing floats over the paper, and it comes back', S.trayHiddenWithNotebook && S.overDock.length === 0 && S.trayBack, S);
    ok(vn + ': no page errors', errs.length === 0, errs.slice(0, 3));
    await ctx.close();
  }
  await b.close();
  console.log(`layout: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS', e); process.exit(2); });
