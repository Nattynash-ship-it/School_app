// SECTION: Quizzes & content
// Every single-answer question in the D286 chapters she can open explains why
// each wrong option is wrong - the explanation she sees after a miss. 5,756
// shipped over earlier builds; 18.634 finished the last 145 (Chapter 6, the
// Challenge set and the Cheat Sheet quizzes). Select-all items have several
// right answers and are explained as a whole, so they are not counted here.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d === undefined ? '' : JSON.stringify(d).slice(0, 400)))); };
const Q = JSON.parse(JSON.parse(fs.readFileSync(path.join(ROOT, 'content-D286.json'), 'utf8')).q);
const HIDDEN = new Set(['ch2', 'ch7']);                 // not in the course's chapter list
const SIMS = /^(oa_sim|pa_sim|pa_fresh|final|fresh_sim)$/;
let n = 0; const miss = [], letters = [];
for (const [k, v] of Object.entries(Q)) {
  const ch = k.split('/')[1]; if (HIDDEN.has(ch) || SIMS.test(ch)) continue;
  for (const q of v) {
    if (!Array.isArray(q.options) || q.options.length !== 4 || typeof q.correct !== 'number') continue;
    n++; const d = q.distractors || {}; const want = [0, 1, 2, 3].filter(i => i !== q.correct).map(String);
    if (!(want.every(i => String(d[i] || '').trim().length >= 15) && Object.keys(d).length === 3)) miss.push(k + ' ' + q.id);
    if (Object.values(d).some(t => /\b(option|answer|choice)\s+[A-D]\b/i.test(String(t)))) letters.push(q.id);
  }
}
ok('every single-answer D286 question she can open explains each wrong option (' + n + ' questions)', n > 5800 && miss.length === 0, miss.slice(0, 8));
ok('no explanation names an option by letter (options are shuffled)', letters.length === 0, letters.slice(0, 8));
console.log(`d286rat: ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
