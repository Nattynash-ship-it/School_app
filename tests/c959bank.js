// New C959 OA/PA questions: shape, hydration, stratified/random draws.
const { chromium } = require('playwright');
const F=[]; const ok=(n,c,x)=>F.push({n,pass:!!c,x:x===undefined?'':String(x)});
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport:{width:1194,height:834} });
  const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto('http://127.0.0.1:8901/index.html',{waitUntil:'load',timeout:240000});
  await p.waitForTimeout(16000);

  const R = await p.evaluate(async () => {
    const w=ms=>new Promise(r=>setTimeout(r,ms));
    const o={};
    if (typeof window.__hydrateCourse === 'function') window.__hydrateCourse('C959');
    await w(400);
    const oa = SAMPLE_QUESTIONS['C959/oa_sim/sim'] || [];
    const pa = SAMPLE_QUESTIONS['C959/pa_sim/sim'] || [];
    // Banks GROW as practice packs land, so pin a floor, not an exact size,
    // and require the OA-practice items to have reached both sims.
    o.oaGrew = oa.length >= 452;
    o.paGrew = pa.length >= 65;
    o.pracInSims = oa.some(q => /^oa\d_/.test(String(q.id||''))) && pa.some(q => /^oa\d_/.test(String(q.id||'')));
    const nx = oa.concat(pa).filter(q => String(q.id||'').startsWith('nx_'));
    o.nxCount = nx.length === 82;
    o.shapes = nx.every(q =>
      Array.isArray(q.options) && q.options.length === 4 &&
      typeof q.correct === 'number' && q.correct >= 0 && q.correct <= 3 &&
      typeof q.explain === 'string' && q.explain.length > 10 &&
      q.distractors && Object.keys(q.distractors).length === 3 &&
      Object.keys(q.distractors).every(k => +k !== q.correct) &&
      /^(easy|medium|hard)$/.test(q.difficulty || '') &&
      typeof q.topic === 'string' && q.topic.length > 1);
    o.oaDoms = oa.filter(q => String(q.id||'').startsWith('nx_')).every(q => /^(logic|sets_fn|bool|matrix|series|relations|graphs)$/.test(q._dom));
    o.paNoDom = pa.filter(q => String(q.id||'').startsWith('nx_')).every(q => !q._dom);

    // stratified OA draw still deals exactly 50, and new items can appear
    let sawNx = false, sizesOk = true;
    for (let i = 0; i < 12; i++) {
      const draw = getQuestions('C959','oa_sim','sim');
      if (draw.length !== ((window.SIM_SIZE && window.SIM_SIZE.C959) || 50)) { sizesOk = false; break; }
      if (draw.some(q => String(q.id||'').startsWith('nx_'))) sawNx = true;
    }
    o.oaDraw50 = sizesOk;
    o.oaDrawIncludesNew = sawNx;
    // blueprint quotas hold on a draw
    const draw = getQuestions('C959','oa_sim','sim');
    const bp = window.C959_BLUEPRINT || {};
    const byDom = {};
    draw.forEach(q => { byDom[q._dom] = (byDom[q._dom]||0)+1; });
    o.blueprintHolds = Object.keys(bp).every(k => (byDom[k]||0) >= Math.min(bp[k], 1));
    // PA sim now deals a fresh random 50 out of 65
    const p1 = getQuestions('C959','pa_sim','sim');
    const p2 = getQuestions('C959','pa_sim','sim');
    o.paDraw50 = p1.length === ((window.SIM_SIZE && window.SIM_SIZE.C959) || 50) && p2.length === ((window.SIM_SIZE && window.SIM_SIZE.C959) || 50);
    o.paShuffles = JSON.stringify(p1.map(q=>q.id)) !== JSON.stringify(p2.map(q=>q.id));

    // spot-check two facts so a data regression can't slip through silently
    const k5 = oa.find(q => q.id && /nx_/.test(q.id) && /K₅/.test(q.text||''));
    o.k5Right = !!k5 && k5.options[k5.correct] === '10';
    const gauss = oa.find(q => /nx_/.test(q.id||'') && /100\?$/.test(q.text||'') && /⋯/.test(q.text||''));
    o.gaussRight = !!gauss && gauss.options[gauss.correct] === '5050';
    return o;
  });

  for (const [k,v] of Object.entries(R)) ok(k, v===true, JSON.stringify(v));
  ok('no page errors', errs.length===0, errs.join(' | ').slice(0,300));
  await b.close();
  const bad=F.filter(f=>!f.pass);
  for (const f of F) console.log((f.pass?'PASS':'FAIL')+' '+f.n+(f.pass?'':' -> '+f.x));
  console.log(`c959bank: ${F.length-bad.length}/${F.length} passed`);
  process.exit(bad.length?1:0);
})().catch(e=>{ console.error('HARNESS', e); process.exit(2); });
