// Import a document -> a course with STRUCTURED lessons and questions, the
// way the built-in classes are built. The helper is mocked per mode (the
// sandbox has no API key); a .txt upload runs the identical pipeline after
// text extraction (pdf.js itself is unchanged and cdnjs is blocked here).
const { chromium } = require('playwright');
const fs = require('fs');
const F=[]; const ok=(n,c,x)=>F.push({n,pass:!!c,x:x===undefined?'':String(x)});

const DOC = `Networking Basics Study Guide

Chapter 1 The OSI Model
The OSI model describes seven layers of network communication. Each layer has a job and hands data to the next.
The physical layer moves raw bits over a cable or radio. The data link layer frames bits and uses MAC addresses.
Section 1.1 Upper layers
The transport layer provides end-to-end delivery. TCP is reliable and ordered; UDP is fast and connectionless.
The application layer is where HTTP, DNS and SMTP live. Students confuse the session and presentation layers.

Chapter 2 IP Addressing
An IPv4 address is 32 bits written as four octets. A subnet mask separates the network part from the host part.
Section 2.1 Subnetting
CIDR notation such as /24 gives the number of network bits. A /24 has 256 addresses, 254 usable for hosts.
To find the number of hosts, compute 2 to the power of host bits minus 2. A /26 has 64 addresses and 62 hosts.
Section 2.2 Private ranges
The private ranges are 10.0.0.0/8, 172.16.0.0/12 and 192.168.0.0/16. They are not routed on the public internet.
NAT translates private addresses to a public one at the edge router so many devices can share it.
`;

function mockHelper(mode, body) {
  if (mode === 'outline') {
    // pick the real chapter/section lines out of the candidate listing
    const lines = String(body.context.lesson).split('\n');
    const find = (re) => { for (const l of lines) { const m = /^\[(\d+)\]\s+(.*)$/.exec(l); if (m && re.test(m[2])) return parseInt(m[1], 10); } return -1; };
    return { title: 'Networking Basics', chapters: [
      { title: 'The OSI Model', sections: [ { title: 'Layers of the OSI model', start: find(/^Chapter 1/) }, { title: 'Upper Layers', start: find(/^Section 1\.1/) } ] },
      { title: 'IP Addressing', sections: [ { title: 'IPv4 Addresses', start: find(/^Chapter 2/) }, { title: 'Subnetting', start: find(/^Section 2\.1/) }, { title: 'Private Ranges and NAT', start: find(/^Section 2\.2/) } ] },
    ] };
  }
  if (mode === 'lesson') {
    const t = body.context.title;
    const para = '<p>' + ('This lesson teaches ' + t + '. It explains the idea in plain language, why it matters on the exam, and where students slip. ').repeat(6) + '</p>';
    return { objectives: ['Explain ' + t.split(' — ')[0], 'Apply it to a small example', 'Spot the common mistake'],
      html: '<div class="callout callout-why"><div class="callout-label">WHY THIS MATTERS</div><p>It is tested directly.</p></div>' +
        '<h3>The idea</h3>' + para +
        '<script>alert(1)</script><style>p{display:none}</style><p onclick="evil()" style="color:red">A paragraph with junk attributes.</p><a href="http://x">link text</a>' +
        '<div class="callout callout-worked"><div class="callout-label">WORKED EXAMPLE</div><ol><li>Step one</li><li>Step two</li></ol></div>' +
        '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>' +
        '<div class="callout callout-warn"><div class="callout-label">COMMON MISTAKE</div><p>Mixing up the layers.</p></div>' +
        '<div class="callout callout-recall"><div class="callout-label">KEY TAKEAWAYS</div><ul><li>One</li><li>Two</li><li>Three</li></ul></div>' };
  }
  if (mode === 'questions') {
    const qs = []; for (let i = 0; i < 5; i++) qs.push({ topic: 'T' + i, text: 'Question ' + i + ' about ' + body.context.title + '?', options: ['a' + i, 'b' + i, 'c' + i, 'd' + i], correct: i % 4, explain: 'Because.', distractors: { [(i + 1) % 4]: 'wrong' }, difficulty: 'medium' });
    return { questions: qs };
  }
  return {};
}

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const docPath = require('path').join(__dirname, 'fixtures', 'networking-basics.txt');
  fs.writeFileSync(docPath, DOC);

  async function run(helperMode) {
    const p = await b.newPage({ viewport:{width:1194,height:834} });
    const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
    p.on('dialog', d => d.accept());
    const calls = { outline: 0, lesson: 0, questions: 0 };
    await p.route('**/.netlify/functions/helper', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      calls[body.mode] = (calls[body.mode] || 0) + 1;
      if (helperMode === 'down') return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"not_configured"}' });
      return route.fulfill({ status: 200, contentType: 'text/plain', body: JSON.stringify(mockHelper(body.mode, body)) });
    });
    await p.goto('http://127.0.0.1:8901/index.html',{waitUntil:'load',timeout:240000});
    await p.waitForTimeout(15000);
    await p.evaluate(() => { showPDFUploadSheet(); });
    await p.setInputFiles('[data-pdf-file]', docPath);
    await p.waitForTimeout(300);
    await p.click('[data-process]');
    // wait for the course to appear
    await p.waitForFunction(() => /Course created|Error/.test(document.querySelector('[data-process]')?.textContent || ''), null, { timeout: 60000 }).catch(()=>{});
    const status = await p.evaluate(() => (document.querySelector('.pdf-upload-status') || {}).textContent || '');
    await p.waitForTimeout(2000);
    const R = await p.evaluate(async () => {
      const w=ms=>new Promise(r=>setTimeout(r,ms));
      const cid = Object.keys(store.customCourses || {}).filter(k => k.startsWith('PDF-')).pop();
      if (!cid) return { cid: null };
      const c = COURSES[cid];
      const chs = c.chapters.map(ch => ({ id: ch.id, title: ch.title, secs: ch.sections.map(s => ({ id: s.id, title: s.title, obj: s.objectives || [] })) }));
      const k0 = cid + '/ch1/s1';
      const body = (store.customLessons[k0] || {}).body || '';
      const qs = store.customQuestions[k0] || [];
      go({ name: 'section', courseId: cid, chId: 'ch1', secId: 's1' }); await w(1200);
      const app = document.getElementById('app');
      const txt = app.innerText;
      return { cid, name: c.name, desc: c.desc, chs, bodyLen: body.length, body,
        hasScript: /<script/i.test(body), hasStyle: /<style/i.test(body), hasOnclick: /onclick|style=/i.test(body.split('<details')[0]), hasLink: /<a /i.test(body),
        hasWhy: /callout-why/.test(body), hasWorked: /callout-worked/.test(body), hasTable: /<table>/.test(body), hasDetails: /<details/.test(body) && /Source text/.test(body),
        rawCallout: /FROM YOUR PDF/.test(body),
        qN: qs.length, qText: qs[0] && qs[0].text,
        rendered: { prove: /PROVE YOU CAN DO/i.test(txt), objective: /Explain Layers of the OSI model/i.test(txt), why: /WHY THIS MATTERS/.test(txt), takeaways: /KEY TAKEAWAYS/.test(txt), calloutEls: app.querySelectorAll('.lesson .callout').length, tableEls: app.querySelectorAll('.lesson table').length, srcPanel: !!app.querySelector('.lesson details') },
      };
    });
    R.calls = calls; R.status = status; R.errs = errs;
    // clean up the course so the next run starts fresh
    await p.evaluate((cid) => { if (!cid) return; delete store.customCourses[cid]; delete COURSES[cid]; Object.keys(store.customLessons||{}).forEach(k=>{ if(k.startsWith(cid+'/')) delete store.customLessons[k]; }); Object.keys(store.customQuestions||{}).forEach(k=>{ if(k.startsWith(cid+'/')) delete store.customQuestions[k]; }); store.courseState && delete store.courseState[cid]; store.activeOrder = (store.activeOrder||[]).filter(x=>x!==cid); saveStore(); }, R.cid);
    await p.close();
    return R;
  }

  // ---- helper available: structured build
  const A = await run('up');
  ok('course created from the upload', !!A.cid, A.status);
  ok('helper was asked for the outline once, then a lesson and a question set per section long enough (>=200 chars)', A.calls.outline === 1 && A.calls.lesson >= 4 && A.calls.lesson === A.calls.questions, JSON.stringify(A.calls));
  ok('course named from the outline title', A.name === 'Networking Basics', A.name);
  ok('chapters and sections follow the outline (2 chapters: 2 + 3 sections, plus Assessment Prep)', A.chs.length === 3 && A.chs[0].title === 'The OSI Model' && A.chs[0].secs.length === 2 && A.chs[1].secs.length === 3 && A.chs[2].id === 'ch_assess', JSON.stringify(A.chs.map(c=>[c.title, c.secs.length])));
  ok('section titles are the cleaned outline titles', A.chs[1].secs[1].title === 'Subnetting' && A.chs[0].secs[1].title === 'Upper Layers', JSON.stringify(A.chs[1].secs.map(s=>s.title)));
  ok('objectives land on each section ("what you\'ll prove you can do")', A.chs[0].secs[0].obj.length === 3 && /^Explain/.test(A.chs[0].secs[0].obj[0]), JSON.stringify(A.chs[0].secs[0].obj));
  ok('lesson body is the written lesson, not the raw dump', A.hasWhy && A.hasWorked && A.hasTable && !A.rawCallout, `why ${A.hasWhy} worked ${A.hasWorked} table ${A.hasTable} raw ${A.rawCallout}`);
  ok('sanitizer dropped script/style, stripped attributes and links', !A.hasScript && !A.hasStyle && !A.hasOnclick && !A.hasLink, `script ${A.hasScript} style ${A.hasStyle} attrs ${A.hasOnclick} link ${A.hasLink}`);
  ok('link text survives even though the link tag is gone', /link text/.test(A.body));
  ok('the original text is kept in a collapsed Source panel', A.hasDetails);
  ok('lesson stays within the storage cap', A.bodyLen < 16000, A.bodyLen);
  ok('questions are the helper-written ones (5 per section)', A.qN === 5 && /^Question 0/.test(A.qText), `${A.qN} ${A.qText}`);
  ok('section screen renders objectives box + lesson callouts + source panel', A.rendered.prove && A.rendered.objective && A.rendered.why && A.rendered.takeaways && A.rendered.calloutEls >= 4 && A.rendered.tableEls === 1 && A.rendered.srcPanel, JSON.stringify(A.rendered));
  ok('desc says how many lessons were written', /[45] lessons written/.test(A.desc), A.desc);
  ok('no page errors (helper up)', A.errs.length === 0, A.errs.join('|').slice(0,300));

  // ---- helper down: the offline fallback still builds a usable course
  const B = await run('down');
  ok('course still builds when the helper is unreachable', !!B.cid, B.status);
  ok('fallback stops asking after three consecutive failures (3 sections may be in flight)', (B.calls.outline + B.calls.lesson + B.calls.questions) <= 7, JSON.stringify(B.calls));
  ok('fallback lesson shows the text with the FROM YOUR PDF note, no objectives', B.rawCallout && B.chs[0].secs[0].obj.length === 0, `raw ${B.rawCallout} obj ${JSON.stringify(B.chs[0].secs[0].obj)}`);
  ok('fallback questions exist (built-in generator)', B.qN >= 1, B.qN);
  ok('final status tells her the helper was unreachable', /unreachable/i.test(B.status), B.status);
  ok('no page errors (helper down)', B.errs.length === 0, B.errs.join('|').slice(0,300));

  await b.close();
  const bad=F.filter(f=>!f.pass);
  for (const f of F) console.log((f.pass?'PASS':'FAIL')+' '+f.n+(f.pass?'':' -> '+f.x));
  console.log(`pdfimport: ${F.length-bad.length}/${F.length} passed`);
  process.exit(bad.length?1:0);
})().catch(e=>{ console.error('HARNESS', e); process.exit(2); });
