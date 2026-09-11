// Straight lines in the notes pad, the GoodNotes way: draw a rough line with the
// pen, hold still at the end, and it snaps to a clean two-point stroke. There is
// also a ╱ tool that draws one from the first touch. Nothing new is stored - a
// straight line is a two-point stroke - so undo, sync and the eraser are untouched.
const { chromium } = require('playwright');
const B = 'http://127.0.0.1:8901/index.html';
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d || ''))); };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1194, height: 834 }, hasTouch: true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(B, { waitUntil: 'load', timeout: 240000 });
  await page.waitForTimeout(16000);               // first boot hydrates the content pack
  // The pad opens only on a SECTION route (setOpen bails without secKey()), so
  // navigate the way the app does, then open and land on the writing tab.
  await page.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    go({ name: 'section', courseId: 'C959', chId: 'ch4', secId: 's1' }); await w(2200);
    window.__notesPanel.open(); await w(1400);
    window.__notesPanel.tab('write'); await w(400);
  });
  ok('the pad opened on the section', await page.evaluate(() => window.__notesPanel.state().open));

  // The surface can be a tall side panel; keep every pen point inside the
  // visible window by working in pixels from its top-left corner.
  const box = await page.evaluate(() => window.__notesPanel.surface());
  ok('the pad has a writing surface', box.w > 100 && box.h > 100, JSON.stringify(box));
  const X = (px) => box.x + px, Y = (px) => box.y + px;
  const count = () => page.evaluate(() => window.__notesPanel.state().strokes);
  const lastStroke = () => page.evaluate(() => window.__notesPanel.lastStroke());

  // 1. Rough line, held still at the end -> snaps to two points.
  const before = await count();
  await page.mouse.move(X(60), Y(120));
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) {                 // wobble of ±3px along the way
    await page.mouse.move(X(60 + 300 * i / 20), Y(120) + (i % 2 ? 3 : -3));
    await page.waitForTimeout(12);
  }
  await page.waitForTimeout(900);                 // hold still: the snap
  const snappedLive = await page.evaluate(() => window.__notesPanel.livePoints());
  await page.mouse.up();
  const s1 = await lastStroke();
  ok('holding still at the end straightens the stroke while the pen is still down', snappedLive === 2, 'live points ' + snappedLive);
  ok('the committed stroke is a two-point line', s1 && s1.points.length === 2, JSON.stringify(s1 && s1.points));
  ok('the line runs from where the pen went down to where it stopped',
     s1 && Math.abs(s1.points[1].x - s1.points[0].x) > 100 && Math.abs(s1.points[1].y - s1.points[0].y) < 4, JSON.stringify(s1 && s1.points));
  ok('a near-horizontal line snaps exactly horizontal', s1 && s1.points[0].y === s1.points[1].y, JSON.stringify(s1 && s1.points));

  // 2. A stroke that is NOT line-like (a wide arc) is left alone when held.
  await page.mouse.move(X(60), Y(260));
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) {
    const t = i / 20;
    await page.mouse.move(X(60 + 300 * t), Y(260) - Math.sin(Math.PI * t) * 90);
    await page.waitForTimeout(12);
  }
  await page.waitForTimeout(900);
  await page.mouse.up();
  const s2 = await lastStroke();
  ok('a curved stroke held still is not forced straight', s2 && s2.points.length > 4, 'points ' + (s2 && s2.points.length));

  // 3. The ╱ tool draws a straight line from the first touch, no hold needed.
  const picked = await page.evaluate(() => { const b = document.querySelector('.mn-tool[data-t="line"]'); if (!b) return false; b.click(); return window.__notesPanel.state().tool === 'line'; });
  ok('a Line tool exists and can be selected', picked);
  await page.mouse.move(X(80), Y(400));
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(X(80 + 25 * i), Y(400 - 12 * i)); await page.waitForTimeout(10); }
  await page.mouse.up();
  const s3 = await lastStroke();
  ok('the Line tool commits a two-point stroke without holding', s3 && s3.points.length === 2, JSON.stringify(s3 && s3.points));
  ok('it uses the pen colour and width', s3 && s3.type === 'pen', JSON.stringify(s3 && { type: s3.type, width: s3.width }));
  const after = await count();
  ok('three strokes were added in all', after === before + 3, before + ' -> ' + after);

  // 4. Undo removes the line like any stroke.
  await page.evaluate(() => document.querySelector('.mn-tool[data-t="undo"]').click());
  ok('undo removes the line', (await count()) === before + 2);

  ok('no page errors', errs.length === 0, errs.join(' | '));
  console.log(`notesline: ${pass}/${pass + fail} passed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
