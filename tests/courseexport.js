// SECTION: Store, sync & reset
// Exporting a whole class must actually carry the class.
//
// "export the entire course with my notes and the solving of the problems and
// practice test should also be added" - so the file has to hold the lessons
// with their tables and diagrams intact, her handwriting and typed notes under
// the section she wrote them in, every question with its worked solution, and
// the practice test at the back as a paper with its answers after it.
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

  // put real notes into one section first, both kinds
  await p.evaluate(() => go({ name: 'section', courseId: 'C959', chId: 'ch4', secId: 's1' }));
  await p.waitForTimeout(2300);
  await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const key = 'C959/ch4/s1';
    const mk = i => ({ type:'pen', color:'#1b1b1b', width:2, _ts:i,
      points: Array.from({length:40}, (_,j) => ({ x:120+j*9, y:260+i*70, p:.5 })) });
    gannoSaveStrokes('pad_' + key.replace(/[^a-zA-Z0-9_/-]/g,'_'), [mk(0), mk(1), mk(2), mk(3)]);
    store.notes = store.notes || {};
    store.notes[key] = [{ id:'n1', text:'De Morgan is the one I keep slipping on.', createdAt: 1700000000000 }];
    saveStore(); if (saveStore.flushNow) saveStore.flushNow();
    await w(400);
  });

  const R = await p.evaluate(async () => {
    const t0 = performance.now();
    const steps = [];
    const out = await window.__exportCourse.build('C959',
      { lessons:1, notes:1, questions:1, exam:1 },
      (i, n, title) => { if (steps.length < 3) steps.push(i + '/' + n); });
    const ms = performance.now() - t0;
    const html = await out.blob.text();
    return {
      ms: Math.round(ms), bytes: out.bytes, name: out.name, counts: out.counts, steps,
      hasTitle: html.indexOf('<title>C959') > 0,
      hasToc: html.indexOf('class="toc"') > 0,
      // the lesson HTML survives rather than being flattened to text
      tables: (html.match(/<table/g) || []).length,
      svgs: (html.match(/<svg/g) || []).length,
      // her own work
      inkImgs: (html.match(/<img alt="Handwritten page/g) || []).length,
      typedNote: html.indexOf('De Morgan is the one I keep slipping on.') > 0,
      // the solving
      solutions: (html.match(/<b>Solution\.<\/b>/g) || []).length,
      corrects: (html.match(/class="tick"/g) || []).length,
      // the practice test, as a paper then a key
      examPaper: (html.match(/class="exam"/g) || []).length,
      examKey: (html.match(/class="key"/g) || []).length,
      // it must be a whole document that stands on its own
      selfContained: html.indexOf('<!doctype html>') === 0 && html.indexOf('</html>') > 0,
      noExternal: !/<script|src="http|@import|href="http/i.test(html)
    };
  });

  ok('the export builds and is a whole document', R.selfContained === true && R.hasTitle,
     R.name + ', ' + Math.round(R.bytes / 1024) + ' KB');
  ok('it pulls nothing off the network', R.noExternal === true,
     'a file with no signal must still open');
  ok('the lessons keep their tables and diagrams', R.tables > 5 && R.svgs > 0,
     R.tables + ' tables, ' + R.svgs + ' diagrams');
  ok('her handwriting is in it', R.inkImgs >= 1, R.inkImgs + ' pages');
  ok('her typed note is in it', R.typedNote === true);
  ok('every question shows its worked solution', R.solutions > 50 && R.corrects > 50,
     R.solutions + ' solutions, ' + R.corrects + ' answers marked');
  ok('the practice test is a paper with its answers after it',
     R.examPaper >= 1 && R.examKey >= 1 && R.examKey === R.examPaper,
     R.examPaper + ' papers, ' + R.examKey + ' answer keys');
  ok('the counts add up', R.counts.lessons > 20 && R.counts.questions > 50 && R.counts.exam > 100,
     JSON.stringify(R.counts));
  ok('it has a contents list', R.hasToc === true);
  ok('building it does not take all day', R.ms < 90000, R.ms + 'ms');
  ok('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(`courseexport: ${pass}/${pass + fail} passed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
