const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
  const reqs = []; page.on('request', r => { const u = new URL(r.url()); if (u.pathname.startsWith('/content-')) reqs.push(u.pathname + u.search); });
  const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0,120)));
  await page.goto('http://localhost:8901/index.html', { waitUntil: 'commit', timeout: 60000 });
  await page.waitForFunction(() => window.__packMeta && typeof go === 'function', null, { timeout: 90000 });
  await page.waitForTimeout(2500);
  const out = await page.evaluate(async () => {
    const b = (document.querySelector('meta[name="app-build"]')||{}).content;
    go({ name: 'section', courseId: 'D286', chId: 'u1', secId: 'z1_1' });
    await new Promise(r => setTimeout(r, 2200));
    return { build: b, missed: !!window.__packMissed, hydrated: window.__hydratedCourses(),
             qs: (getQuestions('D286','u1','z1_1')||[]).length, dom: (document.body.innerText||'').length };
  });
  console.log(JSON.stringify(out), 'reqs:', JSON.stringify(reqs), 'errs:', errs.length);
  await browser.close();
})().catch(e => { console.log('FATAL', String(e).slice(0,200)); process.exit(1); });
