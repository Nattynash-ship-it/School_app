// SECTION: Quizzes & content
// "Also please add visual representations to the courses." Most lessons in the
// exam courses carried only an automatic word-map of their key terms. Each is
// replaced by a drawn concept figure - a process, a structure, a comparison,
// a worked example - taken from the lesson's own content and placed under the
// heading it explains. What must hold, in every pack:
//   - a lesson has a drawn figure or a word-map, never both
//   - a figure draws only with the app's theme colours, so dark mode works
//   - nothing in a figure can run code or load anything
// and in the app: the figure renders under its heading and fits the column.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 8901;
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d === undefined ? '' : JSON.stringify(d).slice(0, 400)))); };
const VARS = new Set(['text','text-2','text-3','border','surface','surface-2','surface-3','accent','accent-2','accent-bg','success','success-bg','warning','warning-bg','danger','danger-bg','secondary','secondary-bg','bg','bg-2','code-bg','highlight']);
const figs = [], both = [], badColour = [], unsafe = [], badBox = [], perCourse = {};
for (const f of fs.readdirSync(ROOT).filter(f => /^content-[A-Z0-9-]+\.json$/.test(f) && !/manifest/.test(f))) {
  const cid = f.slice(8, -5); let L;
  try { L = JSON.parse(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')).l); } catch (e) { continue; }
  for (const [k, v] of Object.entries(L)) {
    const b = (v && v.body) || v; if (typeof b !== 'string' || b.indexOf('data-figure="hand"') < 0) continue;
    if (b.indexOf('data-figure="auto"') >= 0) both.push(k);
    const re = /<div class="vl" data-figure="hand"[\s\S]*?<svg([\s\S]*?)<\/svg>/g; let m;
    while ((m = re.exec(b))) {
      figs.push(k); perCourse[cid] = (perCourse[cid] || 0) + 1;
      const s = m[1];
      if (/<(script|foreignObject|image|iframe|a)\b|\bon[a-z]+=|href=/i.test(s)) unsafe.push(k);
      for (const c of s.matchAll(/\b(fill|stroke)="([^"]*)"/g)) { const v2 = c[2].trim(); if (!(v2 === 'none' || v2 === 'currentColor' || (/^var\(--([a-z0-9-]+)\)$/.test(v2) && VARS.has(v2.slice(6, -1))))) { badColour.push(k + ' ' + c[0]); break; } }
      const vb = /viewBox="0 0 640 (\d+(?:\.\d+)?)"/.exec(s); if (!vb || +vb[1] < 140 || +vb[1] > 520) badBox.push(k);
    }
  }
}
ok('drawn figures are in the packs (' + figs.length + ' across ' + Object.keys(perCourse).length + ' courses)', figs.length >= 200 && Object.keys(perCourse).length >= 10, perCourse);
ok('no lesson carries both a drawn figure and a word-map', both.length === 0, both.slice(0, 6));
ok('every figure draws only with the app\'s theme colours, so dark mode works', badColour.length === 0, badColour.slice(0, 6));
ok('nothing in a figure can run code or load anything', unsafe.length === 0, unsafe.slice(0, 6));
ok('every figure has the standard 640-wide drawing box', badBox.length === 0, badBox.slice(0, 6));
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await (await b.newContext({ viewport: { width: 1194, height: 834 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load', timeout: 240000 }); await p.waitForTimeout(9000);
  // one lesson from each of three courses, rendered the way the app renders a section
  const pick = []; const seen = new Set();
  for (const k of figs) { const c = k.split('/')[0]; if (!seen.has(c)) { seen.add(c); pick.push(k); } if (pick.length === 3) break; }
  const R = await p.evaluate(async (keys) => {
    const w = ms => new Promise(r => setTimeout(r, ms)); const out = [];
    for (const k of keys) {
      const [cid, ch, sec] = k.split('/');
      try { gannoEnsureCourseChapters(cid); } catch (e) {}
      view = { name: 'section', courseId: cid, chId: ch, secId: sec }; render(); await w(2500);
      const f = document.querySelector('.vl[data-figure="hand"]'); const svg = f && f.querySelector('svg');
      const col = f && f.parentElement ? f.parentElement.getBoundingClientRect().width : 0; const sw = svg ? svg.getBoundingClientRect().width : 0;
      let head = null; if (f) { let n = f; while ((n = n.previousElementSibling)) { if (/^H[2-4]$/.test(n.tagName) || (n.querySelector && n.querySelector('h2,h3,h4'))) { head = true; break; } if (n.tagName === 'P') { head = head || false; } } }
      out.push({ k, found: !!f, sw: Math.round(sw), col: Math.round(col), auto: document.querySelectorAll('.vl[data-figure="auto"]').length, caption: !!(f && f.lastElementChild && f.lastElementChild.textContent.length > 15) });
    }
    return out;
  }, pick);
  ok('the figures render in the lesson, three courses', R.length === 3 && R.every(x => x.found), R);
  ok('each fits its column and keeps its reading caption', R.every(x => x.sw > 200 && x.sw <= x.col + 1 && x.caption), R);
  ok('and the word-map it replaced is gone', R.every(x => x.auto === 0), R);
  ok('no page errors', errs.length === 0, errs.slice(0, 3));
  await b.close();
  console.log(`handfigs: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS', e); process.exit(2); });
