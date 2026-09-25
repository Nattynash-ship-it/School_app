// SECTION: Quizzes & content
// "The PAs and OAs are supposed to be identical to WGU in format and they are
// supposed to be different from the practice questions." Every simulation
// pool in every course: no question is a practice question, PA and OA do not
// share one, every question is four options with one right answer and an
// explanation, and the pool that actually deals at runtime - C959's is built
// at boot - obeys the same rule. Where a pool is smaller than a sitting the
// app must say so rather than deal a five-question "OA".
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const PORT = process.env.PORT || 8901;
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d === undefined ? '' : JSON.stringify(d).slice(0, 420)))); };
const ROOT = path.join(__dirname, '..');
const SIMP = ['oa_sim', 'pa_sim', 'pa_fresh', 'final', 'fresh_sim'];
const PRACT_SKIP = /_sim$|_prac$|_lab$|_drill$|^(review_missed|challenge|solving|solving_only|solving2|cheat|concepts|oa|worked|userdocs|aistote|playbook|exam|pa|final|pa_fresh|hard_drill|oa_prac|oa_lab)$/;
const norm = t => String(t || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;|&#\d+;/g, ' ').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean).join(' ');
const sh = (t, k = 4) => { const w = t.split(' '); const s = new Set(); for (let i = 0; i + k <= w.length; i++) s.add(w.slice(i, i + k).join(' ')); return s; };

// ---------- 1. the files: every course, every pool ----------
const courses = fs.readdirSync(ROOT).filter(f => /^content-[A-Z0-9-]+\.json$/.test(f) && !/manifest/.test(f)).map(f => f.slice(8, -5)).sort();
const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'content-manifest.json'), 'utf8'));
let copies = [], nears = [], badFmt = [], shared = [], manifestOff = [], simCourses = 0, totalSim = 0;
for (const cid of courses) {
  const Q = JSON.parse(JSON.parse(fs.readFileSync(path.join(ROOT, 'content-' + cid + '.json'), 'utf8')).q);
  const simKeys = Object.keys(Q).filter(k => SIMP.includes(k.split('/')[1]));
  if (!simKeys.length) continue;
  simCourses++;
  const practice = new Map();
  for (const [k, v] of Object.entries(Q)) { const ch = k.split('/')[1]; if (SIMP.includes(ch) || PRACT_SKIP.test(ch)) continue; for (const q of v) practice.set(norm(q.text), k); }
  const pracSh = [...practice.keys()].filter(t => t.split(' ').length >= 8).map(t => [sh(t), t]);
  const byPool = {};
  for (const k of simKeys) {
    byPool[k] = new Set();
    for (const q of Q[k]) {
      totalSim++;
      const t = norm(q.text); byPool[k].add(t);
      if (practice.has(t)) { copies.push(cid + ' ' + k.split('/')[1] + ' ' + q.id); continue; }
      const opts = q.options || [];
      if (q.multi) { const cs = q.correctSet || []; const wrong = opts.map((_, i) => i).filter(i => cs.indexOf(i) < 0).map(String); if (q.pick !== 2 || opts.length !== 5 || cs.length !== 2 || new Set(opts.map(String)).size !== 5 || !cs.every(i => i >= 0 && i < 5) || String(q.explain || '').trim().length < 8 || Object.keys(q.distractors || {}).sort().join(',') !== wrong.join(',')) badFmt.push(cid + ' ' + k.split('/')[1] + ' ' + q.id + ' (choose-2)'); }
      else if (opts.length !== 4 || typeof q.correct !== 'number' || q.correct < 0 || q.correct > 3 || new Set(opts.map(String)).size !== 4 || String(q.explain || '').trim().length < 8) badFmt.push(cid + ' ' + k.split('/')[1] + ' ' + q.id);
      if (t.split(' ').length >= 8 && nears.length < 200) { const s1 = sh(t); for (const [s2] of pracSh) { const inter = [...s1].filter(x => s2.has(x)).length; const j = inter / (s1.size + s2.size - inter); if (j >= 0.6) { nears.push(cid + ' ' + k.split('/')[1] + ' ' + q.id + ' ~' + j.toFixed(2)); break; } } }
    }
    if (man.qids && man.qids[cid] && man.qids[cid][k]) { const ids = Q[k].map(q => q.id).sort().join(','); if (ids !== man.qids[cid][k].slice().sort().join(',')) manifestOff.push(cid + ' ' + k.split('/')[1]); }
  }
  const oa = byPool[cid + '/oa_sim/sim'], pa = byPool[cid + '/pa_sim/sim'];
  if (oa && pa) for (const t of pa) if (oa.has(t)) shared.push(cid);
}
ok('every course with simulations was checked (' + simCourses + ' courses, ' + totalSim + ' questions)', simCourses >= 20 && totalSim > 2000, { simCourses, totalSim });
ok('no simulation question is a practice question, word for word', copies.length === 0, copies.slice(0, 8).concat(copies.length > 8 ? ['+' + (copies.length - 8) + ' more'] : []));
ok('no simulation question is a near-copy of a practice question', nears.length === 0, nears.slice(0, 8));
ok('every simulation question has four options, one right answer and an explanation', badFmt.length === 0, badFmt.slice(0, 8).concat(badFmt.length > 8 ? ['+' + (badFmt.length - 8) + ' more'] : []));
ok('PA and OA never share a question', shared.length === 0, [...new Set(shared)]);
ok('the manifest index matches every simulation pool', manifestOff.length === 0, manifestOff.slice(0, 8));

// ---------- 2. the app: what actually deals, and what the buttons promise ----------
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 1194, height: 834 } });
  const p = await ctx.newPage(); p.on('dialog', d => d.accept());
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load', timeout: 240000 }); await p.waitForTimeout(12000);
  const live = await p.evaluate(async (skipSrc) => {
    const w = ms => new Promise(r => setTimeout(r, ms)); const SKIP = new RegExp(skipSrc);
    const norm = t => String(t || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;|&#\d+;/g, ' ').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean).join(' ');
    const out = {};
    for (const cid of ['C959', 'D286', 'D684', 'D197']) {
      go({ name: 'class', courseId: cid }); await w(1800);
      const c = COURSES[cid]; const practice = new Set();
      for (const ch of c.chapters) { if (SKIP.test(ch.id)) continue; for (const s of ch.sections) { let qs = []; try { qs = getQuestions(cid, ch.id, s.id) || []; } catch (e) {} qs.forEach(q => practice.add(norm(q.text))); } }
      const deal = (pool) => { let qs = []; try { qs = getQuestions(cid, pool, 'sim') || []; } catch (e) {} return qs; };
      const oa = deal('oa_sim'), pa = deal('pa_sim');
      const sit = (window.SIM_SIZE && window.SIM_SIZE[cid]) || 50;
      out[cid] = { oaDealt: oa.length, paDealt: pa.length, sitting: sit,
                   oaCopies: oa.filter(q => practice.has(norm(q.text))).length, paCopies: pa.filter(q => practice.has(norm(q.text))).length,
                   oaPool: (SAMPLE_QUESTIONS[cid + '/oa_sim/sim'] || []).length, paPool: (SAMPLE_QUESTIONS[cid + '/pa_sim/sim'] || []).length,
                   domains: cid === 'C959' ? [...new Set(oa.map(q => q._dom))].length : null, fresh: oa.filter(q => q.fresh === true).length, paFresh: pa.filter(q => q.fresh === true).length };
    }
    return out;
  }, PRACT_SKIP.source);
  for (const cid of Object.keys(live)) {
    const L = live[cid];
    ok(cid + ': the OA the app actually deals contains no practice question', L.oaCopies === 0 && L.oaDealt > 0, L);
    ok(cid + ': the PA it deals contains none either', L.paCopies === 0 && L.paDealt > 0, L);
    ok(cid + ': both pools hold at least one full sitting', L.oaPool >= L.sitting && L.paPool >= L.sitting, L);
    ok(cid + ': ten of the dealt questions are freshly generated, so no two sittings repeat', L.fresh === 10 && L.paFresh === 10, L);
  }
  ok('C959\'s dealt OA still spans the seven domains of the real exam', live.C959 && live.C959.domains === 7 && live.C959.oaDealt === 72, live.C959);

  // the buttons: a pool smaller than a sitting must not promise a full one
  // the class page: an exam tile carries its pool's question count
  const tiles = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms)); const out = [];
    for (const cid of ['D286', 'D197']) {
      go({ name: 'class', courseId: cid }); await w(1800);
      const d = document.querySelector('details.cls-group[data-group="exams"]'); if (d) d.open = true;
      for (const pool of ['oa_sim', 'pa_sim']) {
        const el = document.querySelector('.chapter-item[data-chapter="' + pool + '"] .chapter-meta');
        const n = (SAMPLE_QUESTIONS[cid + '/' + pool + '/sim'] || []).filter(Boolean).length;
        out.push({ cid, pool, n, meta: el ? el.textContent.trim() : null });
      }
    }
    return out;
  });
  ok('the class page exam tiles say how many questions each pool holds', tiles.length === 4 && tiles.every(t => t.meta && t.meta.indexOf(t.n + ' question') === 0), tiles);
  const btns = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    go({ name: 'today' }); await w(1500);
    const out = [];
    document.querySelectorAll('[data-sim-launch]').forEach(el => {
      const [cid, pool] = el.getAttribute('data-sim-launch').split('|');
      const n = (SAMPLE_QUESTIONS[cid + '/' + pool + '/sim'] || []).length, sit = (window.SIM_SIZE && window.SIM_SIZE[cid]) || 50;
      out.push({ cid, pool, n, sit, disabled: el.disabled || el.getAttribute('aria-disabled') === 'true', text: el.textContent.trim() });
    });
    return out;
  });
  const lying = btns.filter(x => (x.n < 10 && !x.disabled) || (x.n >= 10 && x.n < x.sit && !/short/.test(x.text)) || (x.n >= x.sit && (x.disabled || /short/.test(x.text))));
  ok('every sim button tells the truth about its pool: full, short, or nothing to sit (' + btns.length + ' buttons)', btns.length >= 8 && lying.length === 0, lying.slice(0, 6));
  ok('a short pool is still launchable, only an empty one is disabled', btns.every(x => x.disabled === (x.n < 10)), btns.filter(x => x.disabled !== (x.n < 10)).slice(0, 6));
  ok('no page errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close(); await b.close();
  console.log(`simfresh: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS', e); process.exit(2); });
