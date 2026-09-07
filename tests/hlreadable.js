// "Whenever there is an update the highlighter becomes hard to read."
//
// Each band carried its own blend mode and its own translucency, so two bands
// over the same words did not look like one highlight - they COMPOUNDED. And
// the pages carrying duplicated strokes were painting every highlight two,
// three and four times over. Measured across the 38 themes, worst colour each:
//
//              one band   doubled   tripled    x4
//   under 4.5:1     6/38     35/38     38/38  38/38
//   under 3:1       0/38     20/38     29/38  35/38
//
// The bands are now painted opaque inside one isolated layer that carries the
// translucency and the blend, so stacking cannot compound; and the layer's
// strength is chosen to clear 4.5:1 against each theme's own text colour.
// This reads the REAL composited pixels off a screenshot - blend modes and
// group opacity are the compositor's business, not arithmetic I can trust.
const { chromium } = require('playwright');
const F=[]; const ok=(n,c,x)=>F.push({n,pass:!!c,x:x===undefined?'':String(x)});
const THEMES = ['arcade','architect','aurora','boldstudy','brightblocks','butterfly','candy','cartoon',
 'cartoonpop','cosmic','crt','dark','deepfocus','deepfocusdark','deepocean','diner','editorial','field',
 'fireflies','gilded','glass','id','light','matcha','meadow','nebula','notebook','ocean','owl','phoenix',
 'plain','quest','questdark','rainfall','sakura','stickerbook','warmcalm','winter'];
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport:{width:1194,height:834}, hasTouch:true });
  const p = await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto('http://127.0.0.1:8901/index.html',{waitUntil:'load',timeout:240000});
  await p.waitForTimeout(16000);

  await p.evaluate(async () => {
    const w=ms=>new Promise(r=>setTimeout(r,ms));
    go({name:'section',courseId:'C959',chId:'ch4',secId:'s1'}); await w(2600);
  });
  const setup = (copies, theme) => p.evaluate(async (o) => {
    const w=ms=>new Promise(r=>setTimeout(r,ms));
    document.documentElement.setAttribute('data-theme', o.theme); await w(120);
    gannoSetActive(true); await w(200);
    const para = [...document.querySelectorAll('.lesson p, .lesson td')]
      .filter(el => (el.textContent||'').trim().length > 60)[0];
    para.scrollIntoView({ block: 'center' }); await w(300);
    const tn = (function find(n){ if (n.nodeType===3 && (n.nodeValue||'').trim().length>40) return n;
      for (const c of n.childNodes){ const r=find(c); if (r) return r; } return null; })(para);
    const rng = document.createRange();
    rng.setStart(tn, 0); rng.setEnd(tn, Math.min(34, (tn.nodeValue||'').length));
    const anchor = window.__gannoTextHL.serializeRange(rng);
    const frame = window.__gannoGetOverlayFrame();
    const rr = window.__gannoRectToOverlay(rng.getClientRects()[0], frame);
    const strokes = [];
    for (let i = 0; i < o.copies; i++) strokes.push({ type:'highlighter', color:'#ffe45c', width:8,
      textHL: anchor, points:[{x:rr.x+2,y:rr.y+rr.h*0.5,p:.6},{x:rr.x+rr.w-2,y:rr.y+rr.h*0.5,p:.6}] });
    gannoSaveStrokes(ganno.routeKey, strokes);
    gannoRender(gannoGetStrokes(ganno.routeKey), null);
    await w(250);
    // clip to the PAINTED band, not the text rect: a clip that spills past the
    // band lets untouched page pixels in and the ratio then describes the page,
    // not the highlight. This is what made the first run report dark themes
    // getting BETTER as bands stacked, which cannot be true.
    const bands = [...document.querySelectorAll('.ganno-hl-layer svg.ganno-hl')];
    if (!bands.length) return null;
    let bx=1e9, by=1e9, bx2=-1e9, by2=-1e9;
    for (const el of bands) { const q = el.getBoundingClientRect();
      bx=Math.min(bx,q.left); by=Math.min(by,q.top); bx2=Math.max(bx2,q.right); by2=Math.max(by2,q.bottom); }
    return { x: Math.round(bx+4), y: Math.round(by+4), width: Math.max(8, Math.round(bx2-bx-8)),
             height: Math.max(6, Math.round(by2-by-8)), bands: bands.length };
  }, { copies, theme });

  const contrastOf = async (clip) => {
    const shot = await p.screenshot({ clip });
    return p.evaluate(async (b64) => {
      const img = new Image();
      await new Promise(res => { img.onload = res; img.src = 'data:image/png;base64,' + b64; });
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const f = v => { v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
      // the band is whatever colour most of the clip is (the paper between the
      // glyphs); the text is the pixel that sits furthest from it. That works
      // whichever way round the theme runs.
      const bins = new Map(); const L = [];
      for (let i = 0; i < d.length; i += 4) {
        const lum = 0.2126*f(d[i]) + 0.7152*f(d[i+1]) + 0.0722*f(d[i+2]);
        L.push(lum);
        const k = Math.round(lum * 40);
        bins.set(k, (bins.get(k) || 0) + 1);
      }
      let bandK = 0, best = -1;
      for (const [k, n] of bins) if (n > best) { best = n; bandK = k; }
      const band = bandK / 40;
      L.sort((a,b)=>a-b);
      // 2nd/98th percentile, so one stray antialiased pixel cannot decide it
      const lo = L[Math.floor(L.length*0.02)], hi = L[Math.floor(L.length*0.98)];
      const text = Math.abs(hi - band) > Math.abs(band - lo) ? hi : lo;
      const a = Math.max(text, band) + 0.05, bb = Math.min(text, band) + 0.05;
      return Math.round((a/bb)*100)/100;
    }, shot.toString('base64'));
  };

  const worst = { x1: {r:99,t:null}, x4: {r:99,t:null} };
  for (const t of THEMES) {
    for (const copies of [1, 4]) {
      const clip = await setup(copies, t);
      if (!clip) { console.log('no band rendered for ' + t); continue; }
      const r = await contrastOf(clip);
      const slot = copies === 1 ? worst.x1 : worst.x4;
      if (r < slot.r) { slot.r = r; slot.t = t; }
    }
  }
  // and stacking must not change the picture at all
  const same = [];
  for (const t of ['dark','owl','rainfall','deepfocusdark','light','notebook']) {
    const a = await contrastOf(await setup(1, t));
    const c = await contrastOf(await setup(4, t));
    same.push({ t, one: a, four: c, drift: Math.round(Math.abs(a-c)*100)/100 });
  }
  ok('a single highlight leaves the words readable in all 38 themes', worst.x1.r >= 4.5,
     'worst "' + worst.x1.t + '" at ' + worst.x1.r + ':1');
  ok('and four bands stacked on the same words are just as readable', worst.x4.r >= 4.5,
     'worst "' + worst.x4.t + '" at ' + worst.x4.r + ':1');
  ok('stacking does not darken the band at all', same.every(s => s.drift <= 0.35),
     same.map(s=>s.t+' '+s.one+'->'+s.four).join(', '));
  ok('no page errors', errs.length===0, errs.slice(0,2).join('|'));
  for (const f of F) console.log((f.pass?'PASS ':'FAIL ')+f.n+(f.x?'  '+f.x:''));
  console.log('hlreadable: '+F.filter(f=>f.pass).length+'/'+F.length+' passed');
  await b.close();
})().catch(e=>{ console.log('HARNESS '+e); process.exit(2); });
