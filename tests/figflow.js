// "The diagrams need to be directly under the topic to be associated, the
//  information shouldn't be scattered everywhere, information needs to flow."
//
// The captioned figures in a lesson were appended in a bunch after the prose.
// lessonFlow() moves each one under the heading that teaches it, when the
// match is clear. Every decision it makes over C959 and D684 was reviewed by
// hand and pinned in tests/figflow.expected.json (built from what the app
// serves, which for the concept pages differs from the raw pack); this suite checks the app
// still makes exactly those decisions, and that the moved figures land where
// they should on the two lessons from her exams this week.
const { chromium } = require('playwright');
const fs = require('fs');
const B = 'http://127.0.0.1:' + (process.env.PORT || 8901) + '/index.html';
const EXPECTED = JSON.parse(fs.readFileSync(__dirname + '/figflow.expected.json', 'utf8'));
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d === undefined ? '' : JSON.stringify(d).slice(0, 400)))); };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await p.goto(B, { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);

  // ---- every decision, against the reviewed list ----
  const parity = await p.evaluate(async (EXPECTED) => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    for (const cid of ['C959', 'D684']) { go({ name: 'class', courseId: cid }); await w(1500); }
    const out = { checked: 0, missing: [], wrong: [], moves: 0 };
    for (const key of Object.keys(EXPECTED)) {
      const [cid, ch, sec] = key.split('/');
      const L = getLesson(cid, ch, sec);
      if (!L || !L.body) { out.missing.push(key); continue; }
      const d = window.__lessonFlow.decide(L.body).decisions;
      const exp = EXPECTED[key];
      if (d.length !== exp.length) { out.wrong.push(key + ': ' + d.length + ' figures, expected ' + exp.length); continue; }
      for (let i = 0; i < exp.length; i++) {
        out.checked++;
        const [title, heading, verdict] = exp[i];
        const got = d[i];
        const move = verdict === 'MOVE';
        if (got.move !== move) { out.wrong.push(key + ' #' + i + ' "' + title.slice(0, 40) + '": ' + (got.move ? 'MOVE' : 'stay') + ' expected ' + verdict); continue; }
        if (move && got.heading !== heading) { out.wrong.push(key + ' #' + i + ': under "' + got.heading + '" expected "' + heading + '"'); continue; }
        if (move) out.moves++;
      }
    }
    return out;
  }, EXPECTED);
  ok('every lesson in the reviewed list is reachable', parity.missing.length === 0, parity.missing);
  ok('the app makes exactly the reviewed decisions (' + parity.checked + ' figures)', parity.wrong.length === 0, parity.wrong.slice(0, 6));
  const EXP_MOVES = Object.values(EXPECTED).flat().filter(x => x[2] === 'MOVE').length;
  ok('it moves the reviewed ' + EXP_MOVES + ' and no others', parity.moves === EXP_MOVES, parity.moves);

  // ---- the rendered page: where does each figure sit now? ----
  const place = (L) => p.evaluate(async (L) => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    go({ name: 'class', courseId: L.courseId }); await w(800);
    go(L); await w(3500);
    const host = document.querySelector('#app .lesson');
    if (!host) return { err: 'no lesson' };
    const all = [...host.querySelectorAll('*')];
    const isFig = e => e.classList && e.classList.contains('vl') && /📊 FIGURE/.test((e.firstElementChild || e).textContent || '');
    const figs = all.filter(isFig);
    const res = figs.map(f => {
      // nearest preceding heading in document order that is not inside a block
      let h = null;
      for (const e of all) {
        if (e === f) break;
        if (/^H[234]$/.test(e.tagName) && !e.closest('.vl') && !e.closest('.coach-card')) h = e.textContent.trim();
      }
      const cap = (f.firstElementChild || f).textContent.replace(/\s+/g, ' ').trim();
      const tm = /📊 FIGURE\s*[—-]\s*(.*)$/.exec(cap);
      return { title: (tm ? tm[1] : cap).slice(0, 60), under: h, flowed: f.getAttribute('data-flowed') === '1', nested: !!(f.parentElement && f.parentElement.closest('.vl')) };
    });
    const body = getLesson(L.courseId, L.chId, L.secId).body;
    return { n: figs.length, inSource: (body.match(/📊 FIGURE/g) || []).length, res, identical: window.__lessonFlow.apply(body) === body };
  }, L);

  const ds = await place({ name: 'section', courseId: 'D684', chId: 'g2', secId: 'k_ds' });
  ok('D684 data structures: every figure is still on the page', ds.n === 3 && ds.n === ds.inSource, ds);
  const under = (r, t) => (r.res.find(x => x.title.indexOf(t) === 0) || {});
  ok('the stack/queue figure sits under the stack/queue heading', under(ds, 'stack and queue').under === 'Stacks and queues by their discipline' && under(ds, 'stack and queue').flowed, under(ds, 'stack and queue'));
  ok('the hash-table figure sits under the hash-table heading', under(ds, 'a hash table').under === 'What makes a hash table fast, and where it breaks' && under(ds, 'a hash table').flowed, under(ds, 'a hash table'));
  ok('the array/linked-list figure (no clear match) was left where it was', under(ds, 'an array').flowed === false, under(ds, 'an array'));
  ok('no figure ended up inside another block', ds.res.every(x => !x.nested), ds.res);

  const lg = await place({ name: 'section', courseId: 'C959', chId: 'ch1', secId: 's1' });
  ok('C959 logic: every figure is still on the page', lg.n === 2 && lg.n === lg.inSource, lg);
  ok('the truth-table walk sits under "Truth tables"', under(lg, 'a truth-table walk').under === 'Truth tables', under(lg, 'a truth-table walk'));
  ok('the connectives figure sits under "The six connectives at a glance"', under(lg, 'every connective').under === 'The six connectives at a glance', under(lg, 'every connective'));

  // a lesson where nothing moves renders its source untouched
  const st = await place({ name: 'section', courseId: 'C959', chId: 'ch2', secId: 's1' });
  ok('a lesson with no clear match is passed through untouched', st.identical === true && st.n === 3, { n: st.n, identical: st.identical });

  ok('no page errors', errs.length === 0, errs);
  await browser.close();
  console.log('figflow: ' + pass + '/' + (pass + fail) + ' passed');
  process.exit(fail ? 1 : 0);
})();
