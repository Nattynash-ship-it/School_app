// The notes pad must always have somewhere left to write. It used to open with
// exactly ONE page and add exactly one more per pull to the foot, so a long
// session was spent pulling for paper. It now opens with three, keeps blank
// pages ahead of the writing, and stops at a fixed ceiling.
const { chromium } = require('playwright');
const B = 'http://127.0.0.1:8901/index.html';
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d || ''))); };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(B, { waitUntil: 'networkidle' });
  await page.goto(B + '#lesson/D687/ch1/s1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const open = await page.evaluate(async () => {
    window.__notesPanel.open();
    await new Promise(r => setTimeout(r, 600));
    return window.__notesPanel.limits();
  });
  ok('opens with three pages, not one', open.count >= 3, JSON.stringify(open));
  // The invariant is that there IS blank paper past the writing, not the
  // particular number of pages - that is tuned against what the iPad has to
  // composite on every stroke.
  ok('keeps blank paper ahead of the writing',
     open.headroom >= 1 && open.count > open.inkPages, JSON.stringify(open));

  const added = await page.evaluate(() => {
    const before = window.__notesPanel.limits().count;
    const after = window.__notesPanel.addPage(5);
    return { before, after };
  });
  ok('adds five pages in one go', added.after === added.before + 5, JSON.stringify(added));

  const capped = await page.evaluate(() => {
    const l = window.__notesPanel.limits();
    window.__notesPanel.addPage(l.max + 50);
    const after = window.__notesPanel.limits();
    return { max: l.max, count: after.count };
  });
  ok('stops at the page ceiling instead of growing forever',
     capped.count === capped.max, JSON.stringify(capped));

  ok('no page errors', errs.length === 0, errs.join(' | '));
  console.log(`notespages: ${pass}/${pass + fail} passed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
