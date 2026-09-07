const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1100, height: 820 } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await page.goto('http://localhost:8901/index.html', { waitUntil: 'commit', timeout: 60000 });
  await page.waitForFunction(() => typeof go === 'function' && window.__packMeta, null, { timeout: 90000 });
  await page.waitForTimeout(3000);

  const cids = await page.evaluate(() => Object.keys(window.__packMeta || {}));
  console.log('courses to sweep:', cids.length);
  let fails = 0;

  for (const cid of cids) {
    const r = await page.evaluate(async (cid) => {
      const out = { cid, sections: 0, ok: 0, emptyLessons: [], badQ: [] };
      // class page renders
      go({ name: 'class', courseId: cid });
      await new Promise(res => setTimeout(res, 250));
      out.classText = (document.getElementById('app') || {}).textContent ? document.getElementById('app').textContent.length : 0;
      const c = COURSES[cid];
      if (!c || !Array.isArray(c.chapters)) return { cid, err: 'no course/chapters' };
      // sample: first teaching chapter's first 2 sections + one mid-course section
      const SKIP = /^(oa|oa_sim|pa_sim|pa_fresh|weak_drill|review_missed|hard_drill|challenge|aistote|userdocs|final|fresh_sim|gapfill|depth_drill|trace_drill|write_drill|solving|solving2|solving_only|cheat|concepts|pretest)$/;
      const teach = c.chapters.filter(ch => ch && Array.isArray(ch.sections) && ch.sections.length && !SKIP.test(ch.id));
      const picks = [];
      if (teach[0]) picks.push([teach[0], teach[0].sections[0]]);
      if (teach[0] && teach[0].sections[1]) picks.push([teach[0], teach[0].sections[1]]);
      const mid = teach[Math.floor(teach.length / 2)];
      if (mid && mid.sections[0] && picks.every(p => p[0] !== mid || p[1] !== mid.sections[0])) picks.push([mid, mid.sections[0]]);
      for (const [ch, sec] of picks) {
        out.sections++;
        const L = getLesson(cid, ch.id, sec.id);
        const qs = getQuestions(cid, ch.id, sec.id) || [];
        const lessonLen = L && L.body ? L.body.length : 0;
        let qBad = 0;
        for (const q of qs) {
          if (!q || !q.text) { qBad++; continue; }
          if (q.kind === 'code') { if (!q.solution) qBad++; continue; }
          if (!Array.isArray(q.options) || q.options.length < 2) { qBad++; continue; }
          if (q.multi) { const cs = Array.isArray(q.correctSet) ? q.correctSet : q.correct; if (!Array.isArray(cs) || !cs.length) qBad++; }
          else if (typeof q.correct !== 'number' || q.correct < 0 || q.correct >= q.options.length) qBad++;
        }
        if (lessonLen < 100) out.emptyLessons.push(ch.id + '/' + sec.id + ':' + lessonLen);
        if (qBad) out.badQ.push(ch.id + '/' + sec.id + ':' + qBad);
        if (lessonLen >= 100 && !qBad) out.ok++;
      }
      return out;
    }, cid);
    const ok = !r.err && r.classText > 200 && r.ok === r.sections && r.sections > 0;
    if (!ok) { fails++; console.log('FAIL', JSON.stringify(r)); }
  }
  console.log('');
  console.log('ALL-COURSES SWEEP:', fails === 0 ? 'ALL ' + cids.length + ' PASS' : fails + ' FAILURES');
  console.log('pageerrors:', errs.length, errs.slice(0, 5));
  await browser.close();
  process.exit(fails === 0 && errs.length === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e && e.message); process.exit(1); });
