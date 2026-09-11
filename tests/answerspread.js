#!/usr/bin/env node
// A practice section whose keyed answer sits in the same position almost every
// time can be passed without reading it. Seven PORTFOLIO sections had the
// answer at B in 66 of 70 questions, and 23 Korean sections were 10 out of 10
// at A - four whole sections answerable by reflex.
//
// Flags any section of MIN_N or more four-option questions where one position
// holds SKEW or more of the answers. Reads the content files directly, so it
// runs with nothing outside the repository.
//
// Usage: node tests/answerspread.js [CID ...]      (no args = every course)
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const SKEW = 0.80, MIN_N = 8;

const courses = process.argv.slice(2).length ? process.argv.slice(2)
  : fs.readdirSync(ROOT).filter(f => /^content-.+\.json$/.test(f)).map(f => f.slice(8, -5)).sort();

let flagged = 0, sections = 0;
for (const cid of courses) {
  let q;
  try {
    const d = JSON.parse(fs.readFileSync(path.join(ROOT, `content-${cid}.json`), 'utf8'));
    q = typeof d.q === 'string' ? JSON.parse(d.q) : d.q;
  } catch (e) { continue; }
  if (!q || typeof q !== 'object') continue;   // content-manifest and friends carry no questions
  for (const [key, arr] of Object.entries(q)) {
    const four = arr.filter(x => (x.options || []).length === 4 && Number.isInteger(x.correct));
    if (four.length < MIN_N) continue;
    sections++;
    const pos = [0, 0, 0, 0];
    four.forEach(x => pos[x.correct]++);
    const top = Math.max(...pos), at = pos.indexOf(top);
    if (top / four.length >= SKEW) {
      flagged++;
      console.log(`  ${cid} ${key}: answer at [${at}] in ${top} of ${four.length}`);
    }
  }
}
console.log(flagged
  ? `answerspread: ${flagged} guessable section(s) of ${sections} checked`
  : `answerspread: all ${sections} sections spread their answers`);
process.exit(flagged ? 1 : 0);
