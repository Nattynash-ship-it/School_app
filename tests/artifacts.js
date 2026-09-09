#!/usr/bin/env node
// Finds options pasted in from an unrelated question.
//
// Signal: within one question set, an option string is the KEYED answer to question A and
// a DISTRACTOR in question B, and the two stems share almost no vocabulary. A distractor
// borrowed from a sibling question is correct and good when the stems are parallel ("is
// this a partition?" asked six ways); it is a defect when the stems are unrelated, because
// the option cannot answer B's stem at all and B is really a three-option question.
//
// The Jaccard floor is what separates the two cases. This prints CANDIDATES, not defects -
// every hit must be read before it is repaired. On banks built from a shared pool of
// definitions most hits are legitimate cross-definition distractors; on hand-written
// short-stem banks precision is high.
//
// Usage: node tests/artifacts.js [CID ...]        (no args = every course)
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MIN_LEN = 20, MAX_J = 0.30;

const toks = s => new Set((s.toLowerCase().match(/[a-z0-9']+/g) || []));
const stem = q => String(q.text || '').replace(/<[^>]+>/g, ' ').split(/\s+/).join(' ').trim();

function courses(argv) {
  if (argv.length) return argv;
  return fs.readdirSync(ROOT).filter(f => /^content-.+\.json$/.test(f))
           .map(f => f.slice(8, -5)).sort();
}

function load(cid) {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, `content-${cid}.json`), 'utf8'));
  return typeof d.q === 'string' ? JSON.parse(d.q) : d.q;
}

let total = 0;
for (const cid of courses(process.argv.slice(2))) {
  let q; try { q = load(cid); } catch (e) { continue; }
  const hits = [];
  for (const [key, arr] of Object.entries(q)) {
    const byOpt = new Map();
    for (const item of arr) {
      const st = stem(item);
      (item.options || []).forEach((o, i) => {
        o = String(o).split(/\s+/).join(' ');
        if (o.length < MIN_LEN) return;
        if (!byOpt.has(o)) byOpt.set(o, { c: [], w: [] });
        byOpt.get(o)[i === item.correct ? 'c' : 'w'].push({ id: item.id, st, i });
      });
    }
    for (const [opt, r] of byOpt) for (const c of r.c) for (const w of r.w) {
      if (w.id === c.id) continue;
      const a = toks(c.st), b = toks(w.st);
      if (!a.size || !b.size) continue;
      let inter = 0; for (const t of a) if (b.has(t)) inter++;
      const j = inter / (a.size + b.size - inter);
      if (j < MAX_J) hits.push(`${key}::${w.id} opt ${w.i}  ${JSON.stringify(opt.slice(0, 70))}`);
    }
  }
  const uniq = [...new Set(hits)];
  if (uniq.length) { console.log(`${cid}: ${uniq.length} candidate(s)`); uniq.forEach(h => console.log('   ' + h)); }
  total += uniq.length;
}
console.log(`${total} candidate(s) - READ each one before repairing; sibling-question distractors are legitimate`);
