// "So many issues with the study helper" - a photo of the panel where every
// piece of code in the answer was a solid black blob.
//
// Four defects, all measured: inline <code> took --code-bg but never
// --code-text, so code rendered dark-on-dark at a 1.04:1 contrast ratio; the
// input box never grew, clipping a three-line prompt mid-sentence; the one-tap
// chips stayed live while an answer streamed, so tapping one silently dropped
// the ask and stranded its text in the box; and the calculator's floating
// button (z-index 10054) sat on top of the Send button, tappable straight
// through the modal backdrop.
const { chromium } = require('playwright');
const F=[]; const ok=(n,c,x)=>F.push({n,pass:!!c,x:x===undefined?'':String(x)});
const ANSWER = `**In exam words:**

A Boolean value has exactly two values: \`true\` and \`false\`.

- **A.** \`10 > 3\` — the greater-than **relational operator**, always a Boolean.
- **D.** \`x = 5\` — the single \`=\` is **assignment**. Compare \`==\`, the equality operator.

Key takeaway: relational operators (\`<\`, \`>\`, \`<=\`, \`>=\`, \`==\`, \`!=\`) give a Boolean.`;
// every theme the app ships, so no palette can leave code unreadable again
const THEMES = ['arcade','architect','aurora','boldstudy','brightblocks','butterfly','candy','cartoon',
 'cartoonpop','cosmic','crt','dark','deepfocus','deepfocusdark','deepocean','diner','editorial','field',
 'fireflies','gilded','glass','id','light','matcha','meadow','nebula','notebook','ocean','owl','phoenix',
 'plain','quest','questdark','rainfall','sakura','stickerbook','warmcalm','winter'];
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const errs=[];
  const ctx = await b.newContext({ viewport:{width:1194,height:834}, hasTouch:true });
  const p = await ctx.newPage();
  p.on('pageerror',e=>errs.push(String(e)));
  await p.goto('http://127.0.0.1:8901/index.html',{waitUntil:'load',timeout:240000});
  await p.waitForTimeout(16000);
  const R = await p.evaluate(async (o0) => {
    const { ANSWER, THEMES } = o0;
    const w=ms=>new Promise(r=>setTimeout(r,ms)); const o={};
    go({name:'section',courseId:'C959',chId:'ch4',secId:'s1'}); await w(2200);
    document.querySelector('.aih-fab').click(); await w(700);
    const sheet = document.querySelector('.aih-sheet');
    const log = sheet.querySelector('.aih-log');
    const ta = sheet.querySelector('textarea');
    const sendBtn = sheet.querySelector('.aih-row button');
    const chips = () => [...sheet.querySelectorAll('[data-chip]')];

    const bubble = document.createElement('div');
    bubble.className = 'aih-msg a';
    bubble.innerHTML = window.__aihFormat(ANSWER);
    log.appendChild(bubble); await w(200);

    // ---- markdown actually became elements
    o.codeCount   = bubble.querySelectorAll('code').length;
    o.strongCount = bubble.querySelectorAll('strong').length;
    o.rawMarks    = /[`*]/.test(bubble.textContent);
    o.bulletCount = (bubble.textContent.match(/•/g) || []).length;

    // ---- contrast of inline code, in EVERY theme
    const lum = c => { const m=/rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c); if(!m) return null;
      const f=v=>{v=v/255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4);};
      return 0.2126*f(+m[1])+0.7152*f(+m[2])+0.0722*f(+m[3]); };
    const ratio = (a,bb) => { const L1=lum(a), L2=lum(bb);
      return Math.round(((Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05))*100)/100; };
    const code = bubble.querySelector('code');
    const was = document.documentElement.getAttribute('data-theme');
    o.themes = [];
    for (const t of THEMES) {
      document.documentElement.setAttribute('data-theme', t);
      await w(20);
      const cs = getComputedStyle(code);
      o.themes.push({ t, r: ratio(cs.color, cs.backgroundColor),
                      fg: cs.color, bg: cs.backgroundColor });
    }
    if (was) document.documentElement.setAttribute('data-theme', was); else document.documentElement.removeAttribute('data-theme');
    await w(60);
    o.worst = o.themes.reduce((m,x)=> x.r < m.r ? x : m, o.themes[0]);
    o.transparentBg = o.themes.filter(x => /rgba\(0, 0, 0, 0\)/.test(x.bg)).length;

    // ---- the input box grows to fit a long prompt
    ta.value = window.__aihPrompts.exam;
    ta.dispatchEvent(new Event('input', {bubbles:true}));
    await w(150);
    o.taH = Math.round(ta.getBoundingClientRect().height);
    o.taClipped = ta.scrollHeight > ta.clientHeight + 2;
    ta.value = ''; ta.dispatchEvent(new Event('input', {bubbles:true})); await w(120);
    o.taShrinks = Math.round(ta.getBoundingClientRect().height) <= 44;

    // ---- a slow stream, so busy behaviour can be watched
    const CHUNKS = ['line one of the answer\n\n', 'line two\n\n', 'line three\n\n', 'line four, the end.'];
    window.fetch = function(){
      return Promise.resolve({ ok:true, status:200, body:{ getReader(){ let i=0; return {
        read(){ return new Promise(r=>setTimeout(()=>{
          if (i >= CHUNKS.length) return r({done:true});
          r({ done:false, value: new TextEncoder().encode(CHUNKS[i++]) });
        }, 260)); } }; } } });
    };
    chips()[0].click();          // "Explain like I'm in 5th grade"
    await w(200);
    o.chipsOffWhileBusy = chips().every(c => c.disabled);
    o.sendOffWhileBusy = sendBtn.disabled;
    // tapping another chip mid-answer must not strand its text in the box
    chips()[2].click(); await w(100);
    o.boxStayedEmpty = ta.value === '';

    // ---- scrolled up to re-read: the stream must not drag her back
    log.scrollTop = 0;
    await w(700);
    o.stayedWhereSheLooked = log.scrollTop < 40;
    o.scrollWhileUp = Math.round(log.scrollTop);
    // back at the foot: it should follow again
    log.scrollTop = log.scrollHeight;
    const foot0 = log.scrollHeight;
    await w(700);
    o.followsAtFoot = (log.scrollHeight - log.scrollTop - log.clientHeight) < 60;
    o.grew = log.scrollHeight > foot0;
    await w(1400);
    o.chipsBackOn = chips().every(c => !c.disabled);
    o.sendBackOn = !sendBtn.disabled;
    return o;
  }, { ANSWER, THEMES });

  // nothing may be painted over the sheet, at any size
  const over = {};
  for (const vp of [{n:'landscape',width:1194,height:834},{n:'portrait',width:834,height:1194},{n:'phone',width:430,height:932}]) {
    const c2 = await b.newContext({ viewport:{width:vp.width,height:vp.height}, hasTouch:true });
    const p2 = await c2.newPage();
    p2.on('pageerror',e=>errs.push(String(e)));
    await p2.goto('http://127.0.0.1:8901/index.html',{waitUntil:'load',timeout:240000});
    await p2.waitForTimeout(16000);
    over[vp.n] = await p2.evaluate(async () => {
      const w=ms=>new Promise(r=>setTimeout(r,ms));
      go({name:'section',courseId:'C959',chId:'ch4',secId:'s1'}); await w(2200);
      document.querySelector('.aih-fab').click(); await w(800);
      const sheet = document.querySelector('.aih-sheet');
      const sr = sheet.getBoundingClientRect();
      const bad = [];
      for (const el of document.querySelectorAll('body > *')) {
        if (el === sheet || el.classList.contains('aih-back')) continue;
        const cs = getComputedStyle(el);
        if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') continue;
        if (cs.pointerEvents === 'none') continue;         // decoration, cannot be hit
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue;
        if (r.right <= sr.left || r.left >= sr.right || r.bottom <= sr.top || r.top >= sr.bottom) continue;
        if ((parseInt(cs.zIndex,10) || 0) > 9601) bad.push((el.id ? '#'+el.id : '.'+[...el.classList].join('.')) + ' z' + cs.zIndex);
      }
      // and the Send button is genuinely the topmost thing at its own centre
      const sb = sheet.querySelector('.aih-row button').getBoundingClientRect();
      const top = document.elementFromPoint(sb.left + sb.width/2, sb.top + sb.height/2);
      // closing puts the floating buttons back
      document.querySelector('.aih-x').click(); await w(400);
      const back = !!document.getElementById('calc-fab') &&
                   getComputedStyle(document.getElementById('calc-fab')).display !== 'none';
      return { bad, topAtSend: top ? (top.tagName + (top.id ? '#'+top.id : '')) : null, fabsBack: back };
    });
    await c2.close();
  }

  ok('the answer became real markup, not raw markdown', R.codeCount>=8 && R.strongCount>=3 && !R.rawMarks,
     R.codeCount+' code, '+R.strongCount+' bold, '+R.bulletCount+' bullets');
  ok('inline code sets a background AND a colour in every theme', R.transparentBg===0,
     R.transparentBg+' themes left it transparent');
  ok('inline code is readable in all 38 themes', R.worst.r >= 4.5,
     'worst is "'+R.worst.t+'" at '+R.worst.r+':1 ('+R.worst.fg+' on '+R.worst.bg+')');
  ok('the input box grows to fit a three-line prompt', R.taH>=100 && !R.taClipped, R.taH+'px, clipped='+R.taClipped);
  ok('and shrinks back when it is emptied', R.taShrinks);
  ok('the one-tap chips grey out while an answer streams', R.chipsOffWhileBusy);
  ok('so does Send', R.sendOffWhileBusy);
  ok('a chip tapped mid-answer never strands its text in the box', R.boxStayedEmpty);
  ok('scrolled up to re-read, the stream does not drag her back', R.stayedWhereSheLooked, 'scrollTop '+R.scrollWhileUp);
  ok('at the foot, it still follows the answer down', R.followsAtFoot && R.grew);
  ok('the chips and Send come back when the answer is done', R.chipsBackOn && R.sendBackOn);
  for (const n of ['landscape','portrait','phone']) {
    ok('['+n+'] nothing tappable is painted over the sheet', over[n].bad.length===0, over[n].bad.join(', '));
    ok('['+n+'] Send is the topmost thing at its own centre', over[n].topAtSend==='BUTTON', over[n].topAtSend);
    ok('['+n+'] the floating buttons come back when it closes', over[n].fabsBack);
  }
  ok('no page errors', errs.length===0, errs.slice(0,2).join('|'));
  for (const f of F) console.log((f.pass?'PASS ':'FAIL ')+f.n+(f.x?'  '+f.x:''));
  console.log('helperui: '+F.filter(f=>f.pass).length+'/'+F.length+' passed');
  await b.close();
})().catch(e=>{ console.log('HARNESS '+e); process.exit(2); });
