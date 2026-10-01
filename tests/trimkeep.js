// SECTION: Lessons
// The WGU lessons were trimmed of repeated text (a definitions-at-a-glance table,
// then the prose, then a definition box saying it again; three common-mistake
// boxes making one point). Trimming deleted blocks - it never reworded what it
// kept - so her highlights on kept text still match. Ink pinned to a paragraph
// that was deleted as a repeat must not fall back to its old height (where other
// text now sits): the course file names, for each removed paragraph, the one that
// says the same thing, and the ink follows it there.
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const B = 'http://127.0.0.1:' + (process.env.PORT || 8901) + '/index.html';
const WGU = 'C191 C949 C950 C952 C959 C960 D197 D286 D287 D288 D333 D387 D459 D480 D681 D682 D683 D684 D685 D686 D687'.split(' ');
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d || ''))); };

const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'content-manifest.json'), 'utf8'));
const packs = {};
for (const c of WGU) packs[c] = JSON.parse(fs.readFileSync(path.join(ROOT, 'content-' + c + '.json'), 'utf8'));

// ---- the course files ----
let banner = [], empty = [], badKey = [], trimmed = 0, aliasLessons = 0;
for (const c of WGU) {
  const L = JSON.parse(packs[c].l);
  for (const k in L) {
    if (/\/(cheat|aistote|userdocs|pa_sim|oa_sim|pa_fresh|weak_drill|review_missed|hard_drill)\//.test(k)) continue;   // left as they were
    const b = (L[k] && L[k].body) || '';
    if (/nothing removed/.test(b)) banner.push(k);
    if (b.replace(/<[^>]+>/g, '').trim().length < 40) empty.push(k);
  }
  if (packs[c].ia) {
    const ia = JSON.parse(packs[c].ia);
    for (const k in ia) { aliasLessons++; if (!L[k]) badKey.push(k); }
    trimmed++;
  }
}
ok('every WGU course was trimmed and carries its ink moved-to map', trimmed === WGU.length, trimmed + '/' + WGU.length);
ok('no lesson still says "full lesson below, nothing removed"', banner.length === 0, banner.slice(0, 5).join(', '));
ok('no lesson was emptied', empty.length === 0, empty.slice(0, 5).join(', '));
ok('every moved-to entry names a real lesson', badKey.length === 0 && aliasLessons > 300, aliasLessons + ' lessons; bad: ' + badKey.slice(0, 3));
ok('each trimmed course file is stamped through the manifest', WGU.every(c => packs[c].build === man.fv[c]),
   WGU.filter(c => packs[c].build !== man.fv[c]).join(','));

// A lesson with a removed paragraph whose replacement is a plain paragraph.
let pick = null;
{
  const ia = JSON.parse(packs.C959.ia), L = JSON.parse(packs.C959.l);
  for (const k of Object.keys(ia).sort()) {
    const m = /^C959\/(ch\d+)\/(s\d+)$/.exec(k); if (!m) continue;
    for (const old in ia[k]) {
      const nu = ia[k][old];
      if (/^P\|/.test(old) && /^P\|/.test(nu) && nu.length > 30) { pick = { key: k, ch: m[1], sec: m[2], old, nu }; break; }
    }
    if (pick) break;
  }
}
ok('found a C959 lesson with a removed paragraph to test', !!pick, '');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(B, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  if (pick) {
    const r = await page.evaluate(async (P) => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      try { gannoSetActive(true); } catch (e) {}
      go({ name: 'class', courseId: 'C959' }); await w(1200);
      go({ name: 'section', courseId: 'C959', chId: P.ch, secId: P.sec }); await w(3500);
      const norm = el => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
      const target = [...document.querySelectorAll('#app p')].find(e => 'P|' + norm(e) === P.nu);
      const gone = [...document.querySelectorAll('#app p')].some(e => 'P|' + norm(e) === P.old);
      if (!target) return { err: 'replacement paragraph not on the page', alias: !!(window.__inkAlias && window.__inkAlias[P.key]) };
      const tb = target.getBoundingClientRect();
      // ink drawn on the removed paragraph, saved far away from where the replacement sits now
      const s = { type: 'pen', color: '#e11', width: 3, points: [{ x: 40, y: 20, p: .5 }, { x: 160, y: 20, p: .5 }],
                  anchor: gannoGetAnchor(), orient: gannoOrient(), _ts: 1, tanchor: { sig: P.old, n: 0, dx: 12, dy: 6 } };
      gannoTaInvalidate();
      const t = gannoTextReanchor(s);
      // the older block-text pin follows the same map
      const oldText = P.old.slice(2, 66), newText = P.nu.slice(2, 66);
      const bs = { type: 'pen', color: '#e11', width: 3, points: [{ x: 40, y: 20, p: .5 }, { x: 160, y: 20, p: .5 }],
                   anchor: gannoGetAnchor(), orient: gannoOrient(), _ts: 2, blockText: oldText, blockIdx: 0, blockOffX: 5, blockOffY: 4 };
      gannoRender(gannoGetStrokes(ganno.routeKey), null);
      const bt = gannoReanchor(bs, gannoGetAnchor());
      const blk = window.__gannoFindBlockByText(newText, 0, window.__gannoBlockIndex || []);
      const idx = gannoTaIndex(); const box = idx && gannoTaBoxCached(idx, target);
      return { gone, moved: !!t, box, pt: t && t.points[0], bpt: bt && bt.points[0], blk: blk && { top: blk.top, left: blk.left } };
    }, pick);
    ok('the removed paragraph is no longer on the page', r && r.gone === false, JSON.stringify(r));
    ok('ink pinned to it follows to the paragraph that replaced it', r && r.moved && r.box &&
       Math.abs(r.pt.y - (r.box.y + 6)) < 2 && Math.abs(r.pt.x - (r.box.x + 12)) < 2, JSON.stringify(r));
    ok('block-text ink follows the same map', r && r.blk && r.bpt && Math.abs(r.bpt.y - (r.blk.top + 4)) < 2, JSON.stringify(r));
  }
  ok('no page errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  console.log('trimkeep: ' + pass + '/' + (pass + fail) + ' passed');
  process.exit(fail ? 1 : 0);
})();
