// The lesson tools fold away, and typed notes can be a list.
//
// Six buttons were pinned separately down the right edge of every lesson, over
// the words. They are now one tray that folds to a single button and stays as
// she left it. And the typed notes get bullets, because a list is how notes
// are actually taken and a bare textarea gives you nothing.
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
  await p.evaluate(() => go({ name: 'section', courseId: 'C959', chId: 'ch4', secId: 's1' }));
  await p.waitForTimeout(2600);

  const T = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    window.__toolTrayPaint(); await w(400);
    const tray = document.getElementById('tool-tray');
    const before = window.__toolTrayState();
    // the buttons all live in the tray, and none is loose on the body any more
    const loose = ['#calc-fab', '.aih-fab', '#eli5-fab', '#pod-fab', '#mm-fab', '#mn-fab']
      .map(s => document.querySelector(s))
      .filter(e => e && e.parentNode === document.body).length;
    // folded: nothing of them can be tapped
    const shutHit = (() => {
      const e = document.querySelector('#eli5-fab');
      if (!e) return null;
      const r = e.getBoundingClientRect();
      // folded it is scaled down onto the toggle, so check its middle lands
      // inside the toggle rather than expecting its edges to line up
      const t = document.getElementById('tt-toggle').getBoundingClientRect();
      const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
      return { pe: getComputedStyle(e).pointerEvents, op: +getComputedStyle(e).opacity,
               onToggle: cx >= t.left - 2 && cx <= t.right + 2 && cy >= t.top - 2 && cy <= t.bottom + 2 };
    })();
    // unfold
    document.getElementById('tt-toggle').click(); await w(420);
    const open = window.__toolTrayState();
    const spread = (() => {
      const items = [...document.querySelectorAll('#tool-tray > .tt-item')]
        .filter(e => getComputedStyle(e).display !== 'none')
        .map(e => Math.round(e.getBoundingClientRect().top));
      return { n: items.length, distinct: new Set(items).size };
    })();
    // and it remembers
    const remembered = localStorage.getItem('sh_tools_open_v1');
    document.getElementById('tt-toggle').click(); await w(300);
    const shutAgain = window.__toolTrayState().open;
    return { before, open, loose, shutHit, spread, remembered, shutAgain,
             display: getComputedStyle(tray).display };
  });

  ok('every tool button is inside the tray', T.loose === 0 && T.before.inTray === T.before.tools,
     T.before.inTray + ' of ' + T.before.tools + ' in the tray, ' + T.loose + ' left loose');
  ok('it starts folded away', T.before.open === false);
  ok('folded, the tools cannot be tapped and sit on the toggle',
     T.shutHit && T.shutHit.pe === 'none' && T.shutHit.op === 0 && T.shutHit.onToggle,
     JSON.stringify(T.shutHit));
  ok('unfolding stacks them, one above the other',
     T.open.open === true && T.spread.n >= 3 && T.spread.distinct === T.spread.n,
     T.spread.n + ' shown, ' + T.spread.distinct + ' distinct heights');
  ok('the tray counts what is actually on this screen', T.before.visible >= 3,
     T.before.visible + ' visible');
  ok('it remembers being open', T.remembered === '1');
  ok('and folds again', T.shutAgain === false);

  // ---- bullets in the typed notes
  const N = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    window.__notesPanel.open(); await w(900);
    window.__notesPanel.tab('type'); await w(500);
    const ta = document.getElementById('mn-ta');
    const btn = document.getElementById('mn-bullet');
    const key = e => ta.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ bubbles: true, cancelable: true }, e)));
    ta.value = ''; ta.focus();

    ta.value = 'first thing'; ta.setSelectionRange(11, 11);
    btn.click(); await w(60);
    const one = ta.value;
    // Return carries the list on
    ta.setSelectionRange(ta.value.length, ta.value.length);
    key({ key: 'Enter' }); await w(60);
    const afterEnter = ta.value;
    // typing the next item, then Return again
    ta.value += 'second thing'; ta.setSelectionRange(ta.value.length, ta.value.length);
    key({ key: 'Enter' }); await w(60);
    const twoItems = ta.value;
    // a Return on the empty bullet ends the list
    key({ key: 'Enter' }); await w(60);
    const ended = ta.value;
    // and the button takes a bullet off again
    ta.value = '• remove me'; ta.setSelectionRange(4, 4);
    btn.click(); await w(60);
    const removed = ta.value;
    // the button shows whether the caret is in a list
    ta.value = '• in a list'; ta.setSelectionRange(5, 5);
    ta.dispatchEvent(new Event('input', { bubbles: true })); await w(60);
    const litInList = btn.classList.contains('on');
    ta.value = 'plain'; ta.setSelectionRange(3, 3);
    ta.dispatchEvent(new Event('input', { bubbles: true })); await w(60);
    const litPlain = btn.classList.contains('on');
    return { one, afterEnter, twoItems, ended, removed, litInList, litPlain };
  });

  ok('the button makes the line a bullet', N.one === '• first thing', JSON.stringify(N.one));
  ok('Return carries the list on', N.afterEnter === '• first thing\n• ', JSON.stringify(N.afterEnter));
  ok('the next item keeps its bullet', N.twoItems === '• first thing\n• second thing\n• ',
     JSON.stringify(N.twoItems));
  ok('a Return on an empty bullet ends the list', N.ended === '• first thing\n• second thing\n',
     JSON.stringify(N.ended));
  ok('the button takes a bullet off again', N.removed === 'remove me', JSON.stringify(N.removed));
  ok('the button lights up inside a list and not outside one',
     N.litInList === true && N.litPlain === false, N.litInList + ' / ' + N.litPlain);
  ok('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(`toolsbullets: ${pass}/${pass + fail} passed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
