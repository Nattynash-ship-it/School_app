// The professional chrome, six things:
//   1. no emoji as icons in the chrome - every nav, rail, brand, top-bar, lesson
//      and tool-column button carries a line icon
//   2. on a lesson the brand row is gone; the pen toolbar shows only after the
//      pencil button is tapped, and never on Home
//   3. one button family: one corner radius across the chrome
//   4. the greeting is a small plain subtitle with no emoji
//   5. Home cards share one surface, one border, one shadow
//   6. the Study Arcade and Back up banners are off Home and in the More menu
const { chromium } = require('playwright');
const B = 'http://127.0.0.1:' + (process.env.PORT || 8901) + '/index.html';
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d === undefined ? '' : JSON.stringify(d).slice(0, 400)))); };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await browser.newPage({ viewport: { width: 1194, height: 834 } });
  p.on('dialog', d => d.accept());
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await p.goto(B, { waitUntil: 'load', timeout: 240000 }); await p.waitForTimeout(12000);
  const R = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{25A0}-\u{25FF}\u{2200}-\u{22FF}]/u;
    const out = {};
    const chrome = (sels) => { const bad = [], seen = []; sels.forEach(sel => document.querySelectorAll(sel).forEach(el => { seen.push(sel); const txt = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim(); if (EMOJI.test(txt) || !el.querySelector('svg')) bad.push(sel + ' "' + txt.slice(0, 12) + '"'); })); return { bad, n: seen.length }; };
    go({ name: 'home' }); await w(1500);
    out.homeIcons = chrome(['.brand-nav-btn .nav-ico', '.side-rail-btn .nav-ico', '.brand-icon-btn', '#nav-hamburger', '#tool-tray .tt-item', '#tt-toggle']);
    const g = document.querySelector('.brand-greeting');
    out.greeting = g ? { text: g.textContent, emoji: EMOJI.test(g.textContent), fs: parseFloat(getComputedStyle(g).fontSize), shown: getComputedStyle(g).display !== 'none' } : null;
    out.homeBanners = { arcade: (() => { const a = document.getElementById('arcade-cta'); return a ? getComputedStyle(a).display !== 'none' : false; })(), backup: (() => { const a = document.querySelector('.backup-banner'); return a ? getComputedStyle(a).display !== 'none' : false; })() };
    // cards share one surface
    const cards = [...document.querySelectorAll('.card, .dash-card, .class-card, #burst-card')].filter(e => getComputedStyle(e).display !== 'none').slice(0, 12);
    const sig = cards.map(c => { const cs = getComputedStyle(c); return cs.backgroundColor + '|' + cs.backgroundImage + '|' + cs.borderTopWidth + '|' + cs.boxShadow; });
    out.cards = { n: cards.length, distinct: [...new Set(sig)].length, sample: sig[0] };
    // pen bar on home
    out.penBarHome = !!(document.querySelector('.ganno-bar') && getComputedStyle(document.querySelector('.ganno-bar')).display !== 'none');
    // buttons: one radius
    const radii = (sels) => { const m = {}; sels.forEach(s => document.querySelectorAll(s).forEach(e => { if (getComputedStyle(e).display === 'none') return; const r = getComputedStyle(e).borderTopLeftRadius; m[r] = (m[r] || 0) + 1; })); return m; };
    out.homeRadii = radii(['.brand-nav-btn', '.brand-icon-btn', '.dash-continue', '.v2-pill']);
    // lesson
    go({ name: 'section', courseId: 'C959', chId: 'ch4', secId: 's1' }); await w(2000);
    const row = document.querySelector('.brand-row-top');
    out.lessonBrandRow = row ? getComputedStyle(row).display : 'absent';
    out.lessonIcons = chrome(['.top-bar .actions .icon-btn', '.focus-btn > span:first-child', '.audio-btn .audio-icon', '.quiz-jump-btn > span:first-child', '#tool-tray .tt-item']);
    const bar = () => { const b = document.querySelector('.ganno-bar'); return !!(b && getComputedStyle(b).display !== 'none' && !b.classList.contains('collapsed')); };
    out.penBarLessonBefore = bar();
    document.querySelector('.top-bar .actions [data-anno]').click(); await w(400);
    out.penBarAfterTap = bar();
    out.lessonRadii = radii(['.focus-btn', '.audio-btn', '.quiz-jump-btn', '.top-bar .icon-btn']);
    go({ name: 'home' }); await w(1200);
    out.penBarBackHome = bar();
    // More menu
    /* The menu is composed by several modules - each adds its own rows on its
       own schedule - so read the one she is actually looking at, once it has
       settled, not every sheet the document happens to still hold. */
    showMoreSheet(); await w(1200);
    const sheets = [...document.querySelectorAll('.pomo-sheet')].filter(x => x.isConnected && getComputedStyle(x).display !== 'none');
    const sheet = sheets[sheets.length - 1] || null;
    out.sheetCount = sheets.length;
    const rows = sheet ? [...sheet.querySelectorAll('.pomo-btn[data-act]')] : [];
    const rowText = r => [...r.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('');
    out.more = { rows: rows.length, arcade: rows.some(r => r.getAttribute('data-act') === 'arcade'), backup: rows.some(r => r.getAttribute('data-act') === 'backup'),
      iconed: rows.filter(r => r.querySelector('svg.pc-ic')).length,
      emojiRows: rows.filter(r => EMOJI.test(rowText(r))).length,
      offenders: rows.filter(r => !r.querySelector('svg.pc-ic') || EMOJI.test(rowText(r))).map(r => ({ act: r.getAttribute('data-act'), pc: r.getAttribute('data-pc'), svg: !!r.querySelector('svg.pc-ic'), txt: rowText(r).trim().slice(0, 30) })),
      radii: radii(['.pomo-sheet .pomo-btn']) };
    let opened = false;
    try { const a = sheet.querySelector('[data-act="arcade"]'); a.click(); await w(700); opened = !document.querySelector('.pomo-sheet [data-act="theme"]') && !!(document.body.innerText.match(/Blitz|Survival|Arcade/)); } catch (e) {}
    out.arcadeOpens = opened;
    document.querySelectorAll('.pomo-sheet, .arc-menu, [class*="arcade"]').forEach(x => { try { if (x.id !== 'arcade-cta') x.remove(); } catch (e) {} });
    return out;
  });
  ok('1. Home chrome: every nav, rail, brand and tool-column button carries a line icon and no emoji', R.homeIcons.n >= 14 && R.homeIcons.bad.length === 0, R.homeIcons);
  ok('1. lesson chrome: top-bar actions, Focus/Listen/Quiz and the tool column carry icons', R.lessonIcons.n >= 6 && R.lessonIcons.bad.length === 0, R.lessonIcons);
  ok('2. the brand row is gone on a lesson', R.lessonBrandRow === 'none', R.lessonBrandRow);
  ok('2. the pen toolbar is hidden on Home, hidden on a lesson until the pencil is tapped, then shown, then hidden again on Home', !R.penBarHome && !R.penBarLessonBefore && R.penBarAfterTap && !R.penBarBackHome, { home: R.penBarHome, before: R.penBarLessonBefore, after: R.penBarAfterTap, back: R.penBarBackHome });
  ok('3. one corner radius across the Home chrome buttons', Object.keys(R.homeRadii).length === 1 && R.homeRadii['10px'] > 5, R.homeRadii);
  ok('3. one corner radius across the lesson buttons (round icon buttons aside)', Object.keys(R.lessonRadii).filter(k => k !== '50%').length === 1 && R.lessonRadii['10px'] >= 3, R.lessonRadii);
  ok('3. the More menu rows share the radius', Object.keys(R.more.radii).length === 1 && R.more.radii['10px'] > 10, R.more.radii);
  ok('4. the greeting is a small plain subtitle with no emoji', R.greeting && !R.greeting.emoji && R.greeting.fs <= 12 && R.greeting.text.length > 3, R.greeting);
  ok('5. Home cards share one surface, one border, one shadow', R.cards.n >= 4 && R.cards.distinct === 1, R.cards);
  ok('6. the Study Arcade and Back up banners are off Home', !R.homeBanners.arcade && !R.homeBanners.backup, R.homeBanners);
  ok('6. the More menu has Study Arcade and Back up rows, every row iconed, none with emoji', R.more.arcade && R.more.backup && R.more.iconed === R.more.rows && R.more.emojiRows === 0, R.more);
  ok('6. the Study Arcade row opens the arcade', R.arcadeOpens, R.arcadeOpens);
  ok('no page errors', errs.length === 0, errs.slice(0, 3));
  await browser.close();
  console.log(`pro: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS', e); process.exit(2); });
