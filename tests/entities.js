// A question must never show an escape code as text.
//
// "What are these characters" - a question read "WHILE (i &lt; 7)", five
// characters where a "<" belonged. The content held the entity and the quiz
// escapes what it renders, so the "&" was escaped a second time and the
// entity itself arrived on screen.
//
// This checks the rendered page, not the file, because whether an entity is
// wrong depends entirely on which renderer sees it: qTextHtml returns a
// question that carries real markup RAW - where "&gt;" is the correct way to
// write a ">" - and escapes everything else.
const { chromium } = require('playwright');
const B = 'http://127.0.0.1:8901/index.html';
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d || ''))); };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await browser.newPage({ viewport: { width: 1194, height: 834 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  await p.goto(B, { waitUntil: 'load', timeout: 240000 });
  await p.waitForTimeout(13000);

  const R = await p.evaluate(async () => {
    const ENT = /&(lt|gt|amp|quot|nbsp|#39|apos);/;
    const bad = [];
    let checked = 0, withText = 0;
    // every question the app can actually put on screen, through the same
    // function the quiz uses
    const host = document.createElement('div');
    for (const cid of Object.keys(COURSES)) {
      const ch = COURSES[cid] && COURSES[cid].chapters;
      if (!ch) continue;
      for (const c of ch) {
        for (const sec of (c.sections || [])) {
          let qs = [];
          try { qs = getQuestions(cid, c.id, sec.id) || []; } catch (e) { continue; }
          for (const q of qs) {
            checked++;
            if (!q || !q.text) continue;
            withText++;
            // what the reader sees, once the browser has parsed it
            host.innerHTML = qTextHtml(q);
            const shown = host.textContent || '';
            if (ENT.test(shown)) bad.push({ cid, id: q.id, where: 'text', shown: shown.slice(0, 90) });
            for (const o of (q.options || [])) {
              const t = String(o == null ? '' : o);
              if (ENT.test(t)) bad.push({ cid, id: q.id, where: 'option', shown: t.slice(0, 90) });
            }
            if (q.explain && ENT.test(String(q.explain)))
              bad.push({ cid, id: q.id, where: 'explain', shown: String(q.explain).slice(0, 90) });
            for (const k in (q.distractors || {}))
              if (ENT.test(String(q.distractors[k])))
                bad.push({ cid, id: q.id, where: 'why' + k, shown: String(q.distractors[k]).slice(0, 90) });
          }
        }
      }
    }
    // and a question that DOES carry markup must still come out as markup
    const markupSample = qTextHtml({ text: '<p>Trace it</p><pre><code>if (x &gt; 3) {}</code></pre>' });
    host.innerHTML = markupSample;
    return { checked, withText, bad: bad.slice(0, 12), total: bad.length,
             markupKept: !!host.querySelector('pre code'),
             markupShows: (host.textContent || '').indexOf('>') >= 0 &&
                          !ENT.test(host.textContent || '') };
  });

  ok('the sweep really looked at the question banks', R.withText > 4000,
     R.withText + ' questions with text, of ' + R.checked + ' seen');
  ok('no question shows an escape code as text', R.total === 0,
     R.total + ' found, first few: ' + JSON.stringify(R.bad));
  ok('a question that carries real markup is still rendered as markup',
     R.markupKept === true, 'the <pre><code> survived: ' + R.markupKept);
  ok('and its entities become real characters, not text',
     R.markupShows === true, 'a ">" reached the reader');
  ok('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(`entities: ${pass}/${pass + fail} passed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
