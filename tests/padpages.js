// Notebook skins, and pages she can insert and delete.
//   skins: eight in the picker, chosen per class, painted as variables on the
//          dock (the rules and paper change colour), a dark skin shows a black
//          pen light, and not one stroke moves
//   pages: delete page 2 of 3 -> its ink is gone, page 3's ink is now on page 2,
//          the erase record knows, Undo puts it all back; insert a blank page
//          before page 2 -> pages 2 and 3 move down, Undo takes it out
const { chromium } = require('playwright');
const B = 'http://127.0.0.1:' + (process.env.PORT || 8901) + '/index.html';
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d === undefined ? '' : JSON.stringify(d)))); };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await browser.newPage({ viewport: { width: 1194, height: 834 } });
  p.on('dialog', d => d.accept());
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await p.goto(B, { waitUntil: 'load', timeout: 240000 });
  await p.waitForTimeout(12000);
  const R = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const out = {}, NP = window.__notesPanel;
    const K = 'C959/ch4/s1', PK = 'pad_C959/ch4/s1', PH = NP.limits().pageH;
    const t0 = Date.now() - 3600000;
    const mk = (n, y0, ts, color) => Array.from({ length: n }, (_, i) => ({ type: 'pen', color, width: 3, ts: ts + i * 1000, _ts: ts + i * 1000, points: [{ x: 100 + i * 5, y: y0 + i * 40 }, { x: 700, y: y0 + i * 40 + 3 }] }));
    // three pages: black on 1, blue on 2, orange on 3
    const p1 = mk(3, 150, t0, '#111827'), p2 = mk(4, PH + 160, t0 + 5000, '#1d4ed8'), p3 = mk(2, 2 * PH + 170, t0 + 9000, '#ea580c');
    gannoSaveStrokes(PK, p1.concat(p2, p3)); await w(50);
    localStorage.removeItem('sh_erased_v1');
    go({ name: 'section', courseId: 'C959', chId: 'ch4', secId: 's1' }); await w(2000);
    NP.open(); await w(1200); NP.tab('write'); await w(300);
    if (NP.reloadInk) NP.reloadInk();
    const pageOf = s => Math.floor(s.points[0].y / PH) + 1;
    const layout = () => { const L = {}; (gannoGetStrokes(PK) || []).forEach(s => { const k = s.color + '@' + pageOf(s); L[k] = (L[k] || 0) + 1; }); return L; };
    out.start = { pages: NP.ink(K).pages, layout: layout(), count: NP.page().count };

    /* ---- skins ---- */
    out.skins = NP.skins();
    const dock = document.getElementById('mn-dock');
    const cs = () => getComputedStyle(document.querySelector('#mn-ink .mn-rule') || document.querySelector('#mn-ink .mn-grid') || dock);
    const paper = () => getComputedStyle(document.getElementById('mn-ink')).backgroundColor;
    out.classicPaper = paper(); out.classicRule = cs().stroke;
    NP.setSkin('legal'); await w(200);
    out.legal = { id: NP.skin(), attr: dock.getAttribute('data-skin'), paper: paper(), rule: cs().stroke, byClass: (store.padPrefs.skinBy || {}).C959 };
    // the picker lists them with the current one marked
    document.querySelector('#mn-tools .mn-tool[data-t="paper"]').click(); await w(250);
    const pop = document.querySelector('.mn-pop[data-kind="paper"]');
    out.picker = { rows: pop ? pop.querySelectorAll('[data-skin]').length : 0, on: pop ? (pop.querySelector('[data-skin].on') || {}).getAttribute?.('data-skin') : null, labels: pop ? [...pop.querySelectorAll('.mn-pop-label')].map(x => x.textContent) : [] };
    if (pop) pop.remove();
    const before = JSON.stringify((gannoGetStrokes(PK) || []).map(s => s.points));
    NP.setSkin('blueprint'); await w(200);
    const blackPath = [...document.querySelectorAll('#mn-ink path')].find(n => n.getAttribute('fill') && n.getAttribute('fill') !== 'none' && n.getAttribute('fill') !== '#111827' && n.getAttribute('fill') !== '#1d4ed8' && n.getAttribute('fill') !== '#ea580c');
    out.dark = { id: NP.skin(), paper: paper(), shownBlack: NP.inkShown('#111827'), shownOrange: NP.inkShown('#ea580c'), anyLifted: !!blackPath, storedBlack: (gannoGetStrokes(PK) || []).filter(s => s.color === '#111827').length, moved: before !== JSON.stringify((gannoGetStrokes(PK) || []).map(s => s.points)) };
    // another class keeps classic
    NP.close(); await w(300);
    go({ name: 'section', courseId: 'D286', chId: COURSES.D286.chapters[0].id, secId: COURSES.D286.chapters[0].sections[0].id }); await w(1800);
    NP.open(); await w(1000);
    out.otherClass = { id: NP.skin(), attr: dock.getAttribute('data-skin') };
    NP.setSkin('mint'); await w(150);                       // D286 gets its own
    out.otherClassOwn = { id: NP.skin(), byClass: (store.padPrefs.skinBy || {}).D286 };
    NP.close(); await w(300);
    go({ name: 'section', courseId: 'C959', chId: 'ch4', secId: 's1' }); await w(1800);
    NP.open(); await w(1000); NP.tab('write'); await w(200);
    out.backAgain = { id: NP.skin(), attr: dock.getAttribute('data-skin') };
    NP.setSkin('classic'); await w(100);
    out.classicBack = { attr: dock.getAttribute('data-skin'), paper: paper() };

    /* ---- delete page 2 ---- */
    const E = window.__erase;
    const deadBefore = Object.keys((E.deadMap && E.deadMap(PK)) || {}).length;
    NP.deletePage(2); await w(300);
    out.afterDelete = { pages: NP.ink(K).pages, layout: layout(), n: (gannoGetStrokes(PK) || []).length, dead: Object.keys((E.deadMap && E.deadMap(PK)) || {}).length - deadBefore, count: NP.page().count };
    NP.undo(); await w(300);
    out.afterUndo = { pages: NP.ink(K).pages, layout: layout(), n: (gannoGetStrokes(PK) || []).length };
    /* ---- insert before page 2 ---- */
    NP.insertPage(2); await w(300);
    out.afterInsert = { pages: NP.ink(K).pages, layout: layout(), n: (gannoGetStrokes(PK) || []).length, count: NP.page().count };
    NP.undo(); await w(300);
    out.afterUndo2 = { pages: NP.ink(K).pages, layout: layout(), n: (gannoGetStrokes(PK) || []).length };
    // the page popover offers the actions
    document.querySelector('#mn-tools .mn-tool[data-t="pages"]').click(); await w(250);
    const pp = document.querySelector('.mn-pop[data-kind="pages"]');
    out.pagePop = pp ? [...pp.querySelectorAll('[data-page-act]')].map(x => x.getAttribute('data-page-act')) : [];
    if (pp) pp.remove();
    return out;
  });
  ok('three pages of ink to start: black 1, blue 2, orange 3', R.start.pages === 3 && R.start.layout['#111827@1'] === 3 && R.start.layout['#1d4ed8@2'] === 4 && R.start.layout['#ea580c@3'] === 2, R.start);
  ok('eight skins are offered', R.skins.length === 8 && R.skins[0] === 'classic' && R.skins.includes('legal') && R.skins.includes('blueprint'), R.skins);
  ok('Legal pad paints the paper canary and the rules blue, remembered for this class', R.legal.id === 'legal' && R.legal.attr === 'legal' && R.legal.paper !== R.classicPaper && R.legal.rule !== R.classicRule && R.legal.byClass === 'legal', R.legal);
  ok('the paper picker lists the skins under a "Notebook skin" label with the current one marked', R.picker.rows === 8 && R.picker.on === 'legal' && R.picker.labels.includes('Notebook skin'), R.picker);
  ok('Blueprint shows a black pen light, keeps orange, stores black, moves nothing', R.dark.id === 'blueprint' && R.dark.shownBlack !== '#111827' && R.dark.shownOrange === '#ea580c' && R.dark.anyLifted && R.dark.storedBlack === 3 && !R.dark.moved, R.dark);
  ok('a class not yet set opens on the last skin chosen (as the ruling does)', R.otherClass.id === 'blueprint' && R.otherClass.attr === 'blueprint', R.otherClass);
  ok('that class can take its own skin', R.otherClassOwn.id === 'mint' && R.otherClassOwn.byClass === 'mint', R.otherClassOwn);
  ok('coming back, this class is still Blueprint - each class keeps its own', R.backAgain.id === 'blueprint' && R.backAgain.attr === 'blueprint', R.backAgain);
  ok('Classic clears the skin variables', !R.classicBack.attr && R.classicBack.paper === R.classicPaper, R.classicBack);
  ok('delete page 2: blue ink gone, orange now on page 2, the erase record has the removed strokes', R.afterDelete.layout['#1d4ed8@2'] === undefined && R.afterDelete.layout['#ea580c@2'] === 2 && R.afterDelete.layout['#111827@1'] === 3 && R.afterDelete.n === 5 && R.afterDelete.dead >= 4, R.afterDelete);
  ok('Undo puts page 2 back exactly', R.afterUndo.layout['#1d4ed8@2'] === 4 && R.afterUndo.layout['#ea580c@3'] === 2 && R.afterUndo.n === 9 && R.afterUndo.pages === 3, R.afterUndo);
  ok('insert a blank page before page 2: blue on 3, orange on 4, page count grew', R.afterInsert.layout['#1d4ed8@3'] === 4 && R.afterInsert.layout['#ea580c@4'] === 2 && R.afterInsert.layout['#111827@1'] === 3 && R.afterInsert.pages === 4 && R.afterInsert.count > R.start.count, R.afterInsert);
  ok('Undo takes the inserted page out', R.afterUndo2.layout['#1d4ed8@2'] === 4 && R.afterUndo2.layout['#ea580c@3'] === 2 && R.afterUndo2.pages === 3, R.afterUndo2);
  ok('the page popover offers add, add 5, insert and delete', ['add', 'add5', 'insert', 'delete'].every(a => R.pagePop.includes(a)), R.pagePop);
  ok('no page errors', errs.length === 0, errs.slice(0, 3));
  await p.evaluate(() => { try { window.__notesPanel.setSkin('classic'); } catch (e) {} });
  await browser.close();
  console.log(`padpages: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS', e); process.exit(2); });
