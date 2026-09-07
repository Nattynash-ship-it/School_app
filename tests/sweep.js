const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  const fails = [];
  const ok = (name, cond, detail) => { console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (detail ? '  ' + detail : '')); if (!cond) fails.push(name); };

  await page.goto('http://localhost:8901/index.html', { waitUntil: 'commit', timeout: 60000 });
  await page.waitForTimeout(16000);
  console.log('build:', await page.evaluate(() => document.querySelector('meta[name=app-build]').content));

  console.log('\n-- routes render without errors --');
  const routes = [
    ['home', () => go({name:'home'})],
    ['today', () => go({name:'today'})],
    ['course', () => go({name:'course', courseId:'C959'})],
    ['chapter', () => go({name:'chapter', courseId:'C959', chId:'ch1'})],
    ['section', () => go({name:'section', courseId:'C959', chId:'ch1', secId:'s1'})],
    ['cheat', () => go({name:'section', courseId:'C959', chId:'cheat', secId:'s1'})],
    ['D286 sec', () => go({name:'section', courseId:'D286', chId:'cheat', secId:'s1'})],
    ['D197 sec', () => go({name:'section', courseId:'D197', chId:'cheat', secId:'s1'})],
    ['stats', () => go({name:'stats'})],
    ['flashcards', () => go({name:'flashcards'})],
    ['review', () => go({name:'review'})],
    ['planner', () => go({name:'planner'})],
    ['search', () => go({name:'search'})],
  ];
  for (const [name, fn] of routes) {
    const before = errs.length;
    let r;
    try {
      r = await page.evaluate(async (src) => {
        eval('(' + src + ')()');
        await new Promise(res => setTimeout(res, 900));
        const app = document.getElementById('app');
        return { html: app ? app.innerHTML.length : 0, text: app ? (app.textContent||'').trim().length : 0 };
      }, fn.toString());
    } catch (e) { r = { html: 0, text: 0, err: e.message }; }
    const emptyStateOk = (name === 'flashcards' || name === 'search' || name === 'review');
    ok(name.padEnd(11), (r.text > 80 || emptyStateOk) && errs.length === before, 'chars=' + r.text + (errs.length > before ? ' JS-ERROR' : ''));
  }

  console.log('\n-- content integrity --');
  const content = await page.evaluate(() => {
    const les = SAMPLE_LESSON['C959/cheat/s1'];
    const q1 = (getQuestions('C959','ch1','s1')||[]).length;
    const q2 = (getQuestions('D286','u1','z1_1')||[]).length;
    const trace = (getQuestions('D684','trace_drill','t1')||[]).length;
    return { cheatLen: les && les.body ? les.body.length : 0,
             expanded: !!(les && les.body && les.body.indexOf('Expanded reference') !== -1),
             c959pool: q1, d286pool: q2, tracePool: trace };
  });
  ok('C959 cheat sheet loads', content.cheatLen > 5000, content.cheatLen + ' chars');
  ok('expanded reference kept', content.expanded);
  ok('C959 question pool', content.c959pool >= 20, content.c959pool + ' questions');
  ok('D286 question pool', content.d286pool >= 5, content.d286pool + ' questions');
  ok('D684 trace pool', content.tracePool >= 30, content.tracePool + ' questions');

  console.log('\n-- unlock still in force --');
  const unlocked = await page.evaluate(() => {
    let locked = 0, total = 0;
    for (const cid of ['C959','D286','D197']) {
      if (!COURSES[cid]) continue;
      for (const ch of COURSES[cid].chapters) for (const sec of (ch.sections||[])) { total++; if (isSectionLocked(cid, ch.id, sec.id)) locked++; }
    }
    return { total, locked, gateOff: store.gateOff === true };
  });
  ok('all sections unlocked', unlocked.locked === 0, unlocked.total + ' sections, ' + unlocked.locked + ' locked');

  console.log('\n-- themes (incl. the 6 new ones) --');
  const themeRes = await page.evaluate(async () => {
    const out = [];
    for (const t of ['stickerbook','matcha','architect','crt','gilded','diner','glass','dark']) {
      store.theme = t; document.documentElement.setAttribute('data-theme', t);
      if (typeof setupParticles === 'function') setupParticles();
      await new Promise(r => setTimeout(r, 220));
      const cs = getComputedStyle(document.body);
      out.push({ t, bg: cs.backgroundColor, fg: cs.color });
    }
    return out;
  });
  themeRes.forEach(r => ok(('theme ' + r.t).padEnd(18), r.bg !== 'rgba(0, 0, 0, 0)' && r.fg !== r.bg, r.bg));

  console.log('\n-- ink: draw, persist, survive reload --');
  await page.evaluate(() => { store.theme='glass'; document.documentElement.setAttribute('data-theme','glass'); go({name:'section', courseId:'C959', chId:'cheat', secId:'s2'}); });
  await page.waitForTimeout(2000);
  const inkDraw = await page.evaluate(() => {
    const mk = (x,y) => ({ pointerId:8, pointerType:'pen', clientX:x, clientY:y, pressure:0.5, preventDefault(){}, stopPropagation(){}, target: document.body });
    const st0 = gannoGetStrokes(ganno.routeKey).length;
    ganno.tool='pen';
    gannoPointerDown(mk(250,420)); for (let k=1;k<=10;k++) gannoPointerMove(mk(250+k*18,420)); gannoPointerUp(mk(430,420));
    ganno.tool='highlighter';
    gannoPointerDown(mk(250,470)); for (let k=1;k<=10;k++) gannoPointerMove(mk(250+k*18,471)); gannoPointerUp(mk(430,471));
    return { before: st0, after: gannoGetStrokes(ganno.routeKey).length };
  });
  ok('pen + highlighter commit', inkDraw.after - inkDraw.before === 2, JSON.stringify(inkDraw));
  await page.reload({ waitUntil: 'commit', timeout: 60000 });
  await page.waitForTimeout(16000);
  const inkAfter = await page.evaluate(() => {
    go({name:'section', courseId:'C959', chId:'cheat', secId:'s2'});
    return new Promise(r => setTimeout(() => r({
      strokes: gannoGetStrokes(ganno.routeKey).length,
      minis: document.querySelectorAll('.ganno-hl').length,
      blendInBig: document.querySelector('.ganno-svg').querySelectorAll('[style*="mix-blend"]').length,
      pinned: document.querySelector('.ganno-svg').classList.contains('iw-pinned'),
      overlayH: Math.round(document.querySelector('.ganno-svg').getBoundingClientRect().height)
    }), 2200));
  });
  ok('ink survives reload', inkAfter.strokes >= 2, JSON.stringify(inkAfter));
  ok('overlay windowed + pinned', inkAfter.pinned && inkAfter.overlayH <= 900*3+5, 'h=' + inkAfter.overlayH);
  ok('no blend in big overlay', inkAfter.blendInBig === 0);

  console.log('\n-- search returns results --');
  const searchRes = await page.evaluate(async () => {
    go({ name: 'search' });
    await new Promise(r => setTimeout(r, 700));
    const input = document.querySelector('#searchInput');
    if (!input) return { rows: -1 };
    input.value = 'De Morgan';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 1600));
    const res = document.querySelector('#searchResults');
    return { rows: res ? res.children.length : 0 };
  });
  ok('search finds matches', searchRes.rows > 0, searchRes.rows + ' results');

  console.log('\n-- pomodoro + helper + export --');
  const misc = await page.evaluate(() => ({
    pomo: typeof pomoStart === 'function' || !!document.querySelector('[data-act="pomo"], .pomo-fab'),
    helperFab: !!document.querySelector('.aih-fab, [data-act="ai-helper"]') || !!document.querySelector('button[title*="helper" i]'),
    storeIntact: !!(store && store.quizHistory !== undefined),
    persisted: !!window.__storagePersisted
  }));
  ok('pomodoro present', misc.pomo);
  ok('AI helper present', misc.helperFab);
  ok('store intact', misc.storeIntact);

  console.log('\n=== ' + (fails.length ? 'FAILURES: ' + fails.join(', ') : 'ALL CHECKS PASSED') + ' ===');
  console.log('total JS errors during sweep:', errs.length, errs.slice(0,4).join(' | '));
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
