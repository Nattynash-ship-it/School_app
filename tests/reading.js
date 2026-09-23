// SECTION: Reading & typography
// Reading comfort: fonts, spacing, and the length of the line.
// "there is something about the font that makes it so hard to read, same as on
// the phone. I've changed many fonts and they are all the same, my eyes
// struggle when reading."
//
// Two claims to hold. First that changing the font CHANGES something: the
// picker must say which of its choices resolve to a font this device does not
// have, and Atkinson Hyperlegible - the one face here drawn for low vision -
// must be carried by the app rather than hoped for. Second that the things a
// font swap cannot fix are adjustable: line spacing, letter spacing, word
// spacing, and how far the eye travels before it turns back.
const { chromium } = require('playwright');
const PORT = process.env.PORT || 8901;
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d === undefined ? '' : JSON.stringify(d).slice(0, 400)))); };

const boot = async (ctx) => {
  const p = await ctx.newPage(); p.on('dialog', d => d.accept());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load', timeout: 240000 });
  await p.waitForTimeout(11000);
  return p;
};

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 1512, height: 950 } });
  const p = await boot(ctx);
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 140)));

  // ---------- 1. the app carries Hyperlegible itself ----------
  const hl = await p.evaluate(async () => {
    /* A @font-face is not downloaded until something asks for it, so check()
       is false on a page that has not used the face yet - including a data:
       URI one. Ask for it, then look. */
    await document.fonts.ready;
    try { await document.fonts.load('40px "Atkinson Hyperlegible"'); } catch (e) {}
    try { await document.fonts.load('bold 40px "Atkinson Hyperlegible"'); } catch (e) {}
    /* check() is TRUE when the family is unknown and a fallback renders the
       text - system faces count as loaded - so on its own it passes for a page
       that ships no font at all. Ask the registry whether the face exists. */
    const faces = [...document.fonts].filter(f => f.family.replace(/["']/g, '') === 'Atkinson Hyperlegible');
    const loaded = faces.length >= 2 && faces.every(f => f.status === 'loaded')
                   && faces.some(f => String(f.weight) === '400') && faces.some(f => String(f.weight) === '700');
    const probe = document.createElement('span');
    probe.textContent = 'Handgloves Illegible 0123';
    probe.setAttribute('style', 'position:fixed;left:-9999px;font-size:40px;white-space:pre;');
    document.body.appendChild(probe);
    const wOf = f => { probe.style.fontFamily = f; return Math.round(probe.getBoundingClientRect().width * 100) / 100; };
    const out = { loaded, hyper: wOf('"Atkinson Hyperlegible"'), verdana: wOf('Verdana'), sans: wOf('sans-serif') };
    probe.remove();
    return out;
  });
  ok('Atkinson Hyperlegible is carried by the app, not hoped for', hl.loaded === true, hl);
  ok('so "Hyperlegible" is a real face here, not a Verdana in a hat', hl.hyper !== hl.verdana && hl.hyper !== hl.sans, hl);

  // ---------- 2. the picker knows which choices are the same font here ----------
  const G = await p.evaluate(() => {
    const g = window.__readingFontGroups && window.__readingFontGroups();
    if (!g) return { missing: true };
    const dup = Object.values(g.groups).filter(v => v.length > 1);
    return { distinct: g.distinct, total: g.total, biggest: dup.sort((a, b) => b.length - a.length)[0] || [],
             leaderInGroup: Object.keys(g.groups).every(k => g.groups[k].indexOf(g.leader[k]) === 0),
             everyIdHasSig: Object.keys(g.sig).length === g.total };
  });
  ok('the app can tell which font choices actually render differently here', !G.missing && G.total > 20 && G.distinct >= 3, G);
  ok('and on a machine without the Apple faces, many of them collapse together', !G.missing && G.distinct < G.total, G);
  ok('every choice is accounted for, and each group names one leader', !G.missing && G.everyIdHasSig && G.leaderInGroup, G);

  // ---------- 3. the picker says so, out loud ----------
  const panel = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    renderThemePicker(); await w(500);
    const sheet = document.querySelector('.pomo-sheet.theme-sheet');
    if (!sheet) return { missing: true };
    const marked = sheet.querySelectorAll('.read-font-btn.same-here');
    const dials = [...sheet.querySelectorAll('[data-dial]')].map(i => i.getAttribute('data-dial'));
    const out = { marked: marked.length, firstTitle: marked[0] ? marked[0].title : null,
                  tag: marked[0] ? (marked[0].querySelector('i') || {}).textContent : null,
                  dials, sample: !!sheet.querySelector('[data-read-sample]'), reset: !!sheet.querySelector('[data-read-reset]'),
                  note: [...sheet.querySelectorAll('div')].some(d => /look different on this device/.test(d.textContent || '')) };
    return out;
  });
  ok('the duplicates are marked in the picker, each naming the button it matches',
     !panel.missing && panel.marked > 0 && /Same as .+ on this device/.test(panel.firstTitle || '') && /^= ./.test(panel.tag || ''), panel);
  ok('and the panel says how many of them are really different', panel.note === true, panel);
  ok('the four dials are there, with a live sample and a reset',
     ['readLh', 'readLs', 'readWs', 'readMeasure'].every(k => (panel.dials || []).includes(k)) && panel.sample && panel.reset, panel);

  // ---------- 4. each dial changes the page ----------
  const moved = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const sheet = document.querySelector('.pomo-sheet.theme-sheet');
    const close = () => { const c = sheet.querySelector('[data-close]'); if (c) c.click(); };
    close(); await w(200);
    go({ name: 'section', courseId: 'C959', chId: 'ch4', secId: 's1' }); await w(2200);
    const prose = () => [...document.querySelectorAll('.lesson p')].filter(e => (e.innerText || '').trim().length > 120)[0];
    let el = prose();
    if (!el) return { noProse: true };
    /* MEASURE THE DEFAULT FIRST. "shorter than 620px" was true of the default
       too, so that assertion passed while nothing had moved. The shorter line
       has to be shorter than the line it replaced. */
    const before = Math.round(el.getBoundingClientRect().width);
    renderThemePicker(); await w(500);
    const sheet2 = document.querySelector('.pomo-sheet.theme-sheet');
    const set2 = async (k, v) => { const i = sheet2.querySelector('[data-dial="' + k + '"]'); i.value = String(v); i.dispatchEvent(new Event('input', { bubbles: true })); await w(120); };
    await set2('readLh', 2.1); await set2('readLs', 0.06); await set2('readWs', 0.3); await set2('readMeasure', 52);
    const c2 = sheet2.querySelector('[data-close]'); if (c2) c2.click();
    await w(300);
    el = prose();
    const cs = getComputedStyle(el), fs = parseFloat(cs.fontSize);
    return { lh: Math.round(parseFloat(cs.lineHeight) / fs * 100) / 100, ls: cs.letterSpacing, ws: cs.wordSpacing,
             maxW: cs.maxWidth, before, w: Math.round(el.getBoundingClientRect().width),
             stored: { lh: store.readLh, ls: store.readLs, ws: store.readWs, me: store.readMeasure } };
  });
  ok('line spacing reaches the lesson prose', !moved.noProse && Math.abs(moved.lh - 2.1) < 0.03, moved);
  ok('letter spacing reaches the lesson prose', /^0\.9[0-9]*px|^0\.93px/.test(moved.ls) || parseFloat(moved.ls) > 0.5, moved);
  ok('word spacing reaches the lesson prose', parseFloat(moved.ws) > 2, moved);
  ok('and the line gets shorter than it was when she asks for a shorter line',
     !moved.noProse && moved.maxW !== 'none' && moved.w < moved.before - 60, moved);

  // ---------- 5. the comfortable band, by default, on a desktop ----------
  const ctx2 = await b.newContext({ viewport: { width: 1512, height: 950 } });
  const p2 = await boot(ctx2);
  const cpl = await p2.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    go({ name: 'section', courseId: 'C959', chId: 'ch4', secId: 's1' }); await w(2200);
    const el = [...document.querySelectorAll('.lesson p')].filter(e => (e.innerText || '').trim().length > 120)[0];
    if (!el) return { noProse: true };
    const cs = getComputedStyle(el);
    const sp = document.createElement('span'); sp.textContent = 'x'.repeat(100);
    sp.setAttribute('style', 'position:absolute;left:-9999px;white-space:pre;font:' + cs.font);
    document.body.appendChild(sp); const cw = sp.getBoundingClientRect().width / 100; sp.remove();
    return { cpl: Math.round(el.getBoundingClientRect().width / cw), fs: cs.fontSize };
  });
  ok('a fresh desktop lands in the comfortable 60-75 characters, not 88', !cpl.noProse && cpl.cpl >= 55 && cpl.cpl <= 78, cpl);
  await ctx2.close();

  // ---------- 6. the settings survive a reload, and cannot escape their range ----------
  const kept = await p.evaluate(() => ({ lh: store.readLh, ls: store.readLs, ws: store.readWs, me: store.readMeasure }));
  await p.reload({ waitUntil: 'load', timeout: 240000 }); await p.waitForTimeout(9000);
  const after = await p.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return { lh: cs.getPropertyValue('--read-lh').trim(), me: cs.getPropertyValue('--read-measure').trim(),
             stored: { lh: store.readLh, ls: store.readLs, ws: store.readWs, me: store.readMeasure } };
  });
  ok('the spacing she set is still set after a reload', Math.abs(parseFloat(after.lh) - kept.lh) < 0.03 && after.me === '52ch', { kept, after });

  const clamped = await p.evaluate(() => {
    store.readLh = 99; store.readLs = -5; store.readWs = 40; store.readMeasure = 'banana';
    applyReadingPrefs();
    const cs = getComputedStyle(document.documentElement);
    return { lh: cs.getPropertyValue('--read-lh').trim(), ls: cs.getPropertyValue('--read-ls').trim(),
             ws: cs.getPropertyValue('--read-ws').trim(), me: cs.getPropertyValue('--read-measure').trim() };
  });
  ok('a nonsense value cannot escape the range', parseFloat(clamped.lh) <= 2.3 && clamped.ls === 'normal' && parseFloat(clamped.ws) <= 0.5 && clamped.me === '68ch', clamped);

  // ---------- 7. reset ----------
  const reset = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    store.readLh = 2.2; store.readLs = 0.08; store.readWs = 0.4; store.readMeasure = 50; applyReadingPrefs();
    renderThemePicker(); await w(500);
    const sheet = document.querySelector('.pomo-sheet.theme-sheet');
    sheet.querySelector('[data-read-reset]').click(); await w(200);
    const cs = getComputedStyle(document.documentElement);
    const out = { lh: cs.getPropertyValue('--read-lh').trim(), ls: cs.getPropertyValue('--read-ls').trim(),
                  ws: cs.getPropertyValue('--read-ws').trim(), me: cs.getPropertyValue('--read-measure').trim() };
    const c = sheet.querySelector('[data-close]'); if (c) c.click();
    return out;
  });
  ok('reset puts every dial back where it started', reset.lh === '1.68' && reset.ls === 'normal' && reset.ws === 'normal' && reset.me === '68ch', reset);

  // ---------- 7b. one tap does the whole thing ----------
  const easy = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    renderThemePicker(); await w(500);
    const sheet = document.querySelector('.pomo-sheet.theme-sheet');
    const btn = sheet.querySelector('[data-read-easy]');
    if (!btn) return { missing: true };
    btn.click(); await w(300);
    const cs = getComputedStyle(document.documentElement);
    const activeFont = (sheet.querySelector('.read-font-btn.active') || {}).getAttribute
      ? sheet.querySelector('.read-font-btn.active').getAttribute('data-font') : null;
    const c = sheet.querySelector('[data-close]'); if (c) c.click(); await w(200);
    go({ name: 'section', courseId: 'C959', chId: 'ch4', secId: 's1' }); await w(2200);
    const el = [...document.querySelectorAll('.lesson p')].filter(e => (e.innerText || '').trim().length > 120)[0];
    const pcs = el ? getComputedStyle(el) : null;
    return { lh: cs.getPropertyValue('--read-lh').trim(), me: cs.getPropertyValue('--read-measure').trim(),
             font: store.fontChoice, activeFont, body: getComputedStyle(document.body).fontFamily,
             proseLh: pcs ? Math.round(parseFloat(pcs.lineHeight) / parseFloat(pcs.fontSize) * 100) / 100 : null,
             proseFam: pcs ? pcs.fontFamily : null };
  });
  ok('one tap sets the whole comfortable reading setup',
     !easy.missing && easy.lh === '1.9' && easy.me === '62ch' && easy.font === 'readable' && easy.activeFont === 'readable', easy);
  ok('and it actually puts Hyperlegible on the lesson text',
     /Atkinson Hyperlegible/.test(easy.proseFam || '') && easy.proseLh === 1.9, easy);

  // ---------- 8. the phone gets the same dials ----------
  const ctx3 = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const p3 = await boot(ctx3);
  const ph = await p3.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    renderThemePicker(); await w(500);
    const sheet = document.querySelector('.pomo-sheet.theme-sheet');
    if (!sheet) return { missing: true };
    const rows = [...sheet.querySelectorAll('.read-dial')].map(r => {
      const rect = r.getBoundingClientRect();
      const inp = r.querySelector('input');
      return { w: Math.round(rect.width), right: Math.round(rect.right), inpW: Math.round(inp.getBoundingClientRect().width) };
    });
    return { rows, vw: innerWidth };
  });
  ok('and the dials fit and work on the phone', !ph.missing && ph.rows.length === 4 && ph.rows.every(r => r.right <= ph.vw + 1 && r.inpW > 40), ph);
  await ctx3.close();

  ok('no page errors', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
  await b.close();
  console.log(`reading: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS', e); process.exit(2); });
