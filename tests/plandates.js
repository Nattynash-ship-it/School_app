// SECTION: Boot & screens
// "In the plan section please remove the due dates and the dates I would have
// liked to meet for my courses." The class roadmap keeps its order and its
// Passed ticks; per-class dates, date pickers, countdowns and target nags go.
const { chromium } = require('playwright');
const B = 'http://127.0.0.1:' + (process.env.PORT || 8901) + '/index.html';
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d === undefined ? '' : JSON.stringify(d)))); };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await browser.newPage({ viewport: { width: 1194, height: 834 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await p.goto(B, { waitUntil: 'load', timeout: 240000 });
  await p.waitForTimeout(12000);
  const R = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    // make the first class overdue so any surviving nag would show
    if (store.classPlan && store.classPlan.length) { store.classPlan[0].target = '2020-01-01'; store.classPlan[0].done = false; saveStore(); }
    go({ name: 'plan' }); await w(1200);
    const app = document.getElementById('app'); const txt = app.innerText;
    const rows = app.querySelectorAll('[data-plan-row], [data-class-done]');
    return {
      rows: app.querySelectorAll('[data-class-done]').length,
      classDateInputs: app.querySelectorAll('[data-class-target]').length,
      arrows: (txt.match(/→/g) || []).length,
      dLeft: /\d+d (left|overdue)/.test(txt), overdue: /overdue|past its target|until its target/i.test(txt),
      finishLine: /FINISH LINE/.test(txt) && !!app.querySelector('#plan-grad-date'),
      passedTick: /Passed|up next|study time/.test(txt),
      tip: /set the exam date/i.test(txt),
      examCard: !!app.querySelector('#pl-exam') || /Exam target/i.test(txt) || !!app.querySelector('#ep-date'),
      timeBlocks: /TIME BLOCKS/i.test(txt),
      sample: txt.slice(0, 300)
    };
  });
  ok('the roadmap still lists the classes with their tick boxes', R.rows > 0, R.rows);
  ok('no per-class date pickers', R.classDateInputs === 0, R.classDateInputs);
  ok('no start → target date ranges on the rows', R.arrows === 0, R.arrows);
  ok('no "days left" or "overdue" countdowns, no target-date nags', !R.dLeft && !R.overdue, R.sample);
  ok('the one finish line stays, with its own date', R.finishLine);
  ok('rows say Passed / NOW / up next instead', R.passedTick);
  ok('the "Exam target & prep" card with its per-class target date is gone from Plan', !R.examCard, R.examCard);
  ok('the time blocks card stays', R.timeBlocks, R.timeBlocks);
  // the home banner: an overdue class target must not produce a banner
  const H = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    go({ name: 'home' }); await w(1500);
    const b = document.getElementById('deadline-banner');
    return { shown: !!(b && getComputedStyle(b).display !== 'none'), text: b ? b.innerText.slice(0, 120) : '' };
  });
  ok('the home screen shows no class-target deadline banner', !H.shown || !/target/i.test(H.text), H);
  ok('no page errors', errs.length === 0, errs.slice(0, 3));
  await p.evaluate(() => { try { if (store.classPlan && store.classPlan[0]) store.classPlan[0].target = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10); saveStore(); } catch (e) {} });
  await browser.close();
  console.log(`plandates: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS', e); process.exit(2); });
