const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  // iPad-ish viewport
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1024, height: 768 } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 150)));
  await page.goto('http://localhost:8901/index.html', { waitUntil: 'commit', timeout: 60000 });
  await page.waitForFunction(() => typeof go === 'function' && window.__packMeta, null, { timeout: 90000 });
  await page.waitForTimeout(2500);

  let fails = 0;
  for (const size of ['md', 'lg', 'xl', 'xxl']) {
    for (const route of [{ name: 'home' }, { name: 'today' },
                         { name: 'class', courseId: 'C959' },
                         { name: 'section', courseId: 'C959', chId: 'ch1', secId: 's1' }]) {
      const r = await page.evaluate(async (arg) => {
        store.lessonTextScale = arg.size === 'md' ? undefined : arg.size;
        applyLessonTextSize();
        go(arg.route);
        await new Promise(res => setTimeout(res, 500));
        const out = { probs: [] };
        // 1. page body must not scroll horizontally
        const de = document.documentElement;
        if (de.scrollWidth > de.clientWidth + 8) out.probs.push('horizontal overflow: ' + de.scrollWidth + '>' + de.clientWidth);
        // 2. floating FABs must not overlap each other or the bottom tab bar
        const fabs = ['.aih-fab', '#eli5-fab', '#pod-fab', '#mm-fab']
          .map(s => document.querySelector(s)).filter(el => el && getComputedStyle(el).display !== 'none')
          .map(el => el.getBoundingClientRect());
        for (let i = 0; i < fabs.length; i++) for (let j = i + 1; j < fabs.length; j++) {
          const a = fabs[i], b = fabs[j];
          const ov = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) *
                     Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
          if (ov > 40) out.probs.push('FABs overlap ' + Math.round(ov) + 'px²');
        }
        const tabs = document.querySelector('.tabs');
        if (tabs && fabs.length) {
          const tr = tabs.getBoundingClientRect();
          for (const f of fabs) {
            const ov = Math.max(0, Math.min(f.bottom, tr.bottom) - Math.max(f.top, tr.top)) *
                       Math.max(0, Math.min(f.right, tr.right) - Math.max(f.left, tr.left));
            if (ov > 100) out.probs.push('FAB overlaps tab bar ' + Math.round(ov) + 'px²');
          }
        }
        // 3. FABs on-screen
        for (const f of fabs) {
          if (f.top < 0 || f.bottom > window.innerHeight + 2 || f.left < 0 || f.right > window.innerWidth + 2)
            out.probs.push('FAB off-screen at ' + Math.round(f.top) + ',' + Math.round(f.left));
        }
        // 4. back pill visible & inside the top bar
        const back = document.querySelector('.top-bar .back');
        if (back) {
          const br = back.getBoundingClientRect(), bar = document.querySelector('.top-bar').getBoundingClientRect();
          if (br.height < 20 || br.top < bar.top - 4 || br.bottom > bar.bottom + 4) out.probs.push('back pill misfits bar');
        }
        return out;
      }, { size, route });
      if (r.probs.length) { fails++; console.log('FAIL', size, JSON.stringify(route), r.probs); }
    }
  }
  await page.evaluate(() => { store.lessonTextScale = undefined; applyLessonTextSize(); });
  console.log('');
  console.log('ZOOM-LAYOUT SWEEP:', fails === 0 ? 'ALL PASS (4 sizes x 4 screens)' : fails + ' FAILURES');
  console.log('pageerrors:', errs.length, errs.slice(0, 3));
  await browser.close();
  process.exit(fails === 0 && errs.length === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e && e.message); process.exit(1); });
