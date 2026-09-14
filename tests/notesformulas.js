// A maths class carries its formulas inside the notebook.
//
// "in the notes in the math classes have them accessible as formulas to refer
// to" - so the sheet is a tab beside Write and Type, it only exists where there
// is a sheet behind it, and it is searchable.
const { chromium } = require('playwright');
const B = 'http://127.0.0.1:8901/index.html';
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d || ''))); };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await browser.newPage({ viewport: { width: 1194, height: 834 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(B, { waitUntil: 'load', timeout: 240000 });
  await p.waitForTimeout(12000);

  const open = async (courseId, chId, secId) => {
    await p.evaluate(v => go(v), { name: 'section', courseId, chId, secId });
    await p.waitForTimeout(2300);
    await p.evaluate(() => window.__notesPanel.open());
    await p.waitForTimeout(1000);
  };

  // a maths class
  await open('C959', 'ch4', 's1');
  const M = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const dock = document.getElementById('mn-dock');
    const btn = dock.querySelector('#mn-tabs button[data-tab="form"]');
    const visible = btn ? getComputedStyle(btn).display !== 'none' : false;
    btn.click(); await w(500);
    const rows = dock.querySelectorAll('#mn-form-body .mn-fr').length;
    const groups = dock.querySelectorAll('#mn-form-body .mn-fg').length;
    const firstName = (dock.querySelector('#mn-form-body .mn-fr-n') || {}).textContent;
    // search narrows it
    const q = dock.querySelector('#mn-form-q');
    q.value = 'de morgan'; q.dispatchEvent(new Event('input')); await w(350);
    const found = [...dock.querySelectorAll('#mn-form-body .mn-fr-n')].map(e => e.textContent);
    q.value = 'zzzznothing'; q.dispatchEvent(new Event('input')); await w(350);
    const none = !!dock.querySelector('#mn-form-none');
    q.value = ''; q.dispatchEvent(new Event('input')); await w(300);
    // the writing surface is hidden while the sheet is up, and comes back
    const padHidden = getComputedStyle(document.getElementById('mn-pages')).display === 'none';
    window.__notesPanel.tab('write'); await w(400);
    const padBack = getComputedStyle(document.getElementById('mn-pages')).display !== 'none';
    return { visible, rows, groups, firstName, found, none, padHidden, padBack,
             sheets: window.__notesPanel.formulas().sheets };
  });

  ok('a maths class shows the Formulas tab', M.visible === true);
  ok('the sheet has its groups and its rows', M.rows > 40 && M.groups >= 6,
     M.rows + ' rows in ' + M.groups + ' groups');
  ok('searching narrows it to the match', M.found.length >= 1 && M.found.join(' ').toLowerCase().includes('de morgan'),
     JSON.stringify(M.found));
  ok('a search with no match says so plainly', M.none === true);
  ok('the writing surface steps aside, and comes back', M.padHidden && M.padBack,
     'hidden ' + M.padHidden + ', back ' + M.padBack);
  ok('every maths and physics class has a sheet', M.sheets === 15, M.sheets + ' sheets');

  // a class with no formulas has no tab at all
  await open('D684', 'g1', 'x3_1');
  const N = await p.evaluate(() => {
    const dock = document.getElementById('mn-dock');
    const btn = dock.querySelector('#mn-tabs button[data-tab="form"]');
    return { shown: btn ? getComputedStyle(btn).display !== 'none' : false,
             cls: dock.className.indexOf('has-form') >= 0 };
  });
  ok('a class with no sheet never shows the tab', N.shown === false && N.cls === false,
     'shown ' + N.shown + ', class ' + N.cls);

  // asking for the tab anyway lands on Write rather than an empty panel
  const F = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    window.__notesPanel.tab('form'); await w(300);
    return window.__notesPanel.state().tab;
  });
  ok('and asking for it anyway falls back to writing', F === 'write', 'landed on ' + F);
  ok('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(`notesformulas: ${pass}/${pass + fail} passed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
