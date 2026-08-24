// Generates classes.json at the repo root in the shape Vela imports:
//   { "classes": [ { "code", "name", "color", "assignments": [{ "name", "dueDate", "dueTime"? }], "exams": [{ "name", "date", "time"? }] } ] }
// - code/name come from the app's course catalog in index.html (single source of truth)
// - which courses count as "my classes", plus exam/assignment dates, come from
//   classes-data.json (dates live on the study device, not in this repo, so they
//   are maintained there)
// Dates are YYYY-MM-DD, times HH:MM (24h). Vela ignores extra fields and skips
// assignments without dueDate / exams without date.
// Run: npm run export:classes
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');

const marker = 'const COURSES = {';
const start = html.indexOf(marker);
if (start < 0) throw new Error('COURSES literal not found in index.html');
const open = html.indexOf('{', start);
let depth = 0, end = -1;
for (let i = open; i < html.length; i++) {
  const c = html[i];
  if (c === '{') depth++;
  else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
}
if (end < 0) throw new Error('COURSES literal not closed');
const COURSES = new Function('return ' + html.slice(open, end + 1) + ';')();

const data = JSON.parse(readFileSync(join(root, 'classes-data.json'), 'utf8'));

const classes = data.classes.map((cid) => {
  const c = COURSES[cid];
  if (!c) throw new Error('Unknown course id in classes-data.json: ' + cid);
  return {
    code: c.code || cid,
    name: c.name || cid,
    color: c.color || null,
    assignments: (data.assignments && data.assignments[cid]) || [],
    exams: (data.exams && data.exams[cid]) || [],
  };
});

const out = { generated: new Date().toISOString().slice(0, 10), classes };
writeFileSync(join(root, 'classes.json'), JSON.stringify(out, null, 2) + '\n');
console.log('classes.json written:', classes.map((c) => c.code).join(', '));
