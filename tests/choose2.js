// SECTION: Quizzes & content
// "Do you want 'select two' questions in the practice exams, like the real WGU
//  format?" - "yes please". Ten "Choose 2" items (five PA, five OA) in each of
// the four exam courses. What must hold: each is five options with exactly two
// right; the app says "Choose 2 answers", not "select all that apply"; and the
// items are really dealt into sittings.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'); const PORT = process.env.PORT || 8901;
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d === undefined ? '' : JSON.stringify(d).slice(0, 400)))); };
const CIDS = ['C959', 'D286', 'D684', 'D197']; const per = {}; const bad = [];
for (const cid of CIDS) {
  const Q = JSON.parse(JSON.parse(fs.readFileSync(path.join(ROOT, 'content-' + cid + '.json'), 'utf8')).q);
  for (const pool of ['oa_sim', 'pa_sim']) {
    const items = (Q[cid + '/' + pool + '/sim'] || []).filter(q => q.multi && q.pick === 2);
    per[cid + ' ' + pool] = items.length;
    items.forEach(q => { const cs = q.correctSet || []; if (q.options.length !== 5 || cs.length !== 2 || !/\(Choose 2\.?\)\s*$/.test(q.text) || (cid === 'C959' && !q._dom)) bad.push(q.id); });
  }
}
ok('five Choose-2 items in every PA and OA of the four exam courses', Object.values(per).every(n => n === 5) && Object.keys(per).length === 8, per);
ok('each is five options with exactly two right, and says so in the stem', bad.length === 0, bad);
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await (await b.newContext({ viewport: { width: 1194, height: 834 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load', timeout: 240000 }); await p.waitForTimeout(9000);
  const R = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    go({ name: 'class', courseId: 'D197' }); await w(2000);
    const pool = SAMPLE_QUESTIONS['D197/pa_sim/sim'] || []; const item = pool.find(q => q.multi && q.pick === 2);
    // dealt: across twenty sittings the Choose-2 items turn up
    let seen = 0; for (let i = 0; i < 20; i++) seen += (getQuestions('D197', 'pa_sim', 'sim') || []).filter(q => q.multi && q.pick === 2).length;
    // rendered: the hint names the number to choose, and all five options show
    SAMPLE_QUESTIONS['D197/zz_choose2/sim'] = [item];
    view = { name: 'quiz', courseId: 'D197', chId: 'zz_choose2', secId: 'sim', mode: 'practice' }; render(); await w(1500);
    const hint = (document.querySelector('.quiz-multi-hint') || {}).textContent || '';
    const opts = document.querySelectorAll('.quiz-opts .quiz-opt').length;
    delete SAMPLE_QUESTIONS['D197/zz_choose2/sim'];
    return { found: !!item, seen, hint: hint.trim(), opts };
  });
  ok('the Choose-2 items are dealt into sittings (' + R.seen + ' across twenty PAs)', R.found && R.seen >= 20, R);
  ok('the app says "Choose 2 answers", not "select all that apply"', /Choose 2 answers/i.test(R.hint) && !/all that apply/i.test(R.hint), R);
  ok('and shows all five options', R.opts === 5, R);
  ok('no page errors', errs.length === 0, errs.slice(0, 3));
  await b.close();
  console.log(`choose2: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS', e); process.exit(2); });
