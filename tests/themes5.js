// SECTION: Lesson annotation & themes
// Five new themes (18.599): Chalkboard, Sumi Ink (dark); Riso Print, Concrete,
// Terrazzo (light). Each must be in the picker with a swatch, apply its own
// palette to the page, keep reading contrast, carry its texture, survive a
// reload, and render a lesson without errors.
const { chromium } = require('playwright');
const scratch = require('./scratch');   // every file this suite writes goes to the scratch space
const PORT = process.env.PORT || 8901;
const F=[]; const ok=(n,c,x)=>F.push({n,pass:!!c,x:x===undefined?'':String(x)});
const IDS = ['chalkboard','sumi','riso','concrete','terrazzo','studio','studionight'];
const DARK = { chalkboard:true, sumi:true, riso:false, concrete:false, terrazzo:false, studio:false, studionight:true };
const hexOf = s => { const m = String(s).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/); return m ? [+m[1],+m[2],+m[3]] : null; };
const lum = ([r,g,b]) => { const f=c=>{c/=255; return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);}; return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b); };
const cr = (a,b) => { const la=lum(a), lb=lum(b); return (Math.max(la,lb)+0.05)/(Math.min(la,lb)+0.05); };
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport:{width:1194,height:834} });
  const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  p.on('dialog', d => d.accept());
  await p.goto(`http://127.0.0.1:${PORT}/index.html`,{waitUntil:'load',timeout:240000});
  await p.waitForTimeout(12000);
  const listed = await p.evaluate((IDS) => IDS.map(id => { const t = (typeof THEMES !== 'undefined' ? THEMES : []).find(x => x.id === id); return t ? { id, name: t.name, desc: t.desc } : null; }), IDS);
  ok('all five themes are registered in THEMES with a name and a description', listed.every(t => t && t.name && t.desc), JSON.stringify(listed));
  // the picker sheet shows a card and a painted swatch for each
  const picker = await p.evaluate(async (IDS) => {
    const w=ms=>new Promise(r=>setTimeout(r,ms));
    if (document.querySelector('.theme-sheet')) document.querySelector('.theme-sheet').remove();
    renderThemePicker(); await w(300);
    const out = IDS.map(id => { const c = document.querySelector(`.theme-card[data-theme="${id}"]`); const sw = c && c.querySelector('.theme-preview'); return { id, card: !!c, name: c ? c.querySelector('.theme-name').textContent : '', bg: sw ? getComputedStyle(sw).backgroundImage : '' }; });
    const sheet = document.querySelector('.theme-sheet'); if (sheet) sheet.remove();
    return out;
  }, IDS);
  for (const c of picker) ok(`picker shows ${c.id} with a gradient swatch`, c.card && /linear-gradient/.test(c.bg), JSON.stringify(c).slice(0,160));
  // the default body texture, for the "this theme has its own" comparison
  const baseBodyBg = await p.evaluate(() => getComputedStyle(document.body).backgroundImage);
  const shots = {};
  for (const id of IDS) {
    const R = await p.evaluate(async (id) => {
      const w=ms=>new Promise(r=>setTimeout(r,ms));
      store.theme = id; saveStore(); go({name:'home'}); render(); await w(700);
      const homeText = document.getElementById('app').innerText.length;
      // cards and titles live on a lesson page; C959 is always active in the store
      const ch = COURSES.C959.chapters.find(c => c.sections && c.sections.length);
      go({name:'section', courseId:'C959', chId:ch.id, secId:ch.sections[0].id}); await w(1500);
      const cs = getComputedStyle(document.documentElement);
      const v = k => cs.getPropertyValue('--' + k).trim();
      const bodyCs = getComputedStyle(document.body);
      const h1 = document.querySelector('.lesson h1') || document.querySelector('#app h1');
      // resolve a CSS colour through the engine so hex and rgba both come back as rgb()
      const probe = document.createElement('div'); document.body.appendChild(probe);
      const resolve = c => { probe.style.color = c; return getComputedStyle(probe).color; };
      const lessonText = (document.querySelector('.lesson')||{innerText:''}).innerText.length;
      const h1Font = h1 ? getComputedStyle(h1).fontFamily : '', h1Transform = h1 ? getComputedStyle(h1).textTransform : '';
      // the class page is where the card-like rows live (.chapter-item, 20px corners by a fixed rule)
      go({name:'class', courseId:'C959'}); await w(1200);
      const card = document.querySelector('#app .chapter-item');
      const o = { attr: document.documentElement.getAttribute('data-theme'),
        bg: v('bg'), text: v('text'), accent: v('accent'), accentText: v('accent-text'), text3: v('text-3'), surface: v('surface'), radius: v('radius'),
        bgR: resolve(v('bg')), textR: resolve(v('text')), accentR: resolve(v('accent')), accentTextR: resolve(v('accent-text')), text3R: resolve(v('text-3')), surfaceR: resolve(v('surface')),
        bodyColor: bodyCs.backgroundColor, bodyImg: bodyCs.backgroundImage, cardRadius: card ? getComputedStyle(card).borderRadius : '', h1Font, h1Transform,
        homeText, lessonText, cardCount: document.querySelectorAll('#app .chapter-item').length };
      probe.remove();
      return o;
    }, id);
    ok(`${id}: data-theme applied and the palette resolves`, R.attr === id && R.bg && R.text && R.accent, JSON.stringify({attr:R.attr,bg:R.bg,text:R.text,accent:R.accent}));
    ok(`${id}: the body paints the theme background`, R.bodyColor === R.bgR, `${R.bodyColor} vs ${R.bgR}`);
    const L = lum(hexOf(R.bgR)||[0,0,0]);
    ok(`${id}: is a ${DARK[id]?'dark':'light'} theme by background luminance`, DARK[id] ? L < 0.1 : L > 0.7, L.toFixed(3));
    const c1 = cr(hexOf(R.textR), hexOf(R.bgR)), c2 = cr(hexOf(R.accentTextR), hexOf(R.accentR)), c3 = cr(hexOf(R.text3R), hexOf(R.surfaceR));
    ok(`${id}: reading contrast holds (text/bg>=7, button text>=4.5, muted text>=4.5)`, c1 >= 7 && c2 >= 4.5 && c3 >= 4.5, `text/bg ${c1.toFixed(2)} accent ${c2.toFixed(2)} muted ${c3.toFixed(2)}`);
    if (id === 'concrete') {
      ok('concrete: no background gradients, square corners, uppercase titles', R.bodyImg === 'none' && R.cardRadius === '0px' && R.h1Transform === 'uppercase', JSON.stringify({img:R.bodyImg.slice(0,40), r:R.cardRadius, t:R.h1Transform}));
    } else if (id === 'studio' || id === 'studionight') {
      ok(`${id}: no glow at all - a flat professional ground`, R.bodyImg === 'none', R.bodyImg.slice(0, 60));
    } else {
      ok(`${id}: carries its own texture (body background differs from the default)`, R.bodyImg !== baseBodyBg && R.bodyImg !== 'none', R.bodyImg.slice(0,90));
    }
    if (id === 'riso') ok('riso: print-sharp 2px corners', R.cardRadius === '2px', R.cardRadius);
    if (id === 'terrazzo') ok('terrazzo: keeps the rounded rows', parseFloat(R.cardRadius) >= 18, R.cardRadius);
    if (id === 'sumi') ok('sumi: serif headings', /serif/.test(R.h1Font) && !/sans-serif$/.test(R.h1Font.trim()), R.h1Font);
    if (id === 'chalkboard') ok('chalkboard: chalk headings', /Chalkboard SE/.test(R.h1Font), R.h1Font);
    await p.screenshot({ path: scratch(`theme-${id}-class.png`) });
    await p.evaluate(async () => { const w=ms=>new Promise(r=>setTimeout(r,ms)); const ch = COURSES.C959.chapters.find(c => c.sections && c.sections.length); go({name:'section', courseId:'C959', chId:ch.id, secId:ch.sections[0].id}); await w(1200); });
    await p.screenshot({ path: scratch(`theme-${id}-lesson.png`) });
    await p.evaluate(async () => { const w=ms=>new Promise(r=>setTimeout(r,ms)); go({name:'home'}); await w(700); });
    await p.screenshot({ path: scratch(`theme-${id}-home.png`) });
    ok(`${id}: home, a C959 lesson and the C959 class page all render under the theme`, R.homeText > 500 && R.lessonText > 500 && R.cardCount > 0, JSON.stringify({home:R.homeText, lesson:R.lessonText, rows:R.cardCount}));
  }
  // persistence: the last choice survives a reload
  await p.reload({ waitUntil:'load', timeout:240000 }); await p.waitForTimeout(9000);
  const after = await p.evaluate(() => ({ attr: document.documentElement.getAttribute('data-theme'), stored: store.theme }));
  const LAST = IDS[IDS.length - 1];
  ok('the chosen theme survives a reload', after.attr === LAST && after.stored === LAST, JSON.stringify(after));
  // the More menu names the theme
  const label = await p.evaluate(() => (THEMES.find(t => t.id === store.theme) || {}).name || '');
  ok('the Theme button label resolves to the new name', label && label !== LAST && label.length > 3, label);
  // put the default back so later suites are unaffected
  await p.evaluate(() => { delete store.theme; store.theme = 'glass'; saveStore(); });
  ok('no page errors', errs.length===0, errs.join('|').slice(0,300));
  await b.close();
  const bad=F.filter(f=>!f.pass);
  for (const f of F) console.log((f.pass?'PASS':'FAIL')+' '+f.n+(f.pass?'':' -> '+f.x));
  console.log(`themes5: ${F.length-bad.length}/${F.length} passed`);
  process.exit(bad.length?1:0);
})().catch(e=>{ console.error('HARNESS', e); process.exit(2); });
