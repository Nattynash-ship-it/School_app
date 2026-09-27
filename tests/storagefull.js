// SECTION: Notes pad
// "STORAGE FULL - your progress can no longer be saved." (her screenshot)
// and, before it, "my notes are disappearing": a handwriting page that could
// not be written was kept in memory only and lost when the app closed.
//
// A device filled the way hers can be - handwriting pages left uncompressed,
// an erase record of months of marks, the app's emergency copy of her data,
// diagnostic logs, and everything else up to the limit. What has to hold:
//   1. writing in the notebook on that device is saved, with no warning box
//   2. the space came from things that are safe to lose or to squeeze:
//      recompressed pages still read back stroke for stroke
//   3. the emergency copy moved into IndexedDB rather than being deleted
//   4. Settings -> Storage check shows what uses the space, and frees it
//   5. when nothing more can be freed, the page is kept in the recovery bin
const { chromium } = require('playwright');
const PORT = process.env.PORT || 8901, B = `http://127.0.0.1:${PORT}/index.html`;
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + ' ' + (d === undefined ? '' : JSON.stringify(d).slice(0, 500)))); };

(async () => {
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await br.newContext({ viewport: { width: 1194, height: 834 } });
  const p = await ctx.newPage();
  const dialogs = []; p.on('dialog', d => { dialogs.push(d.message().slice(0, 80)); d.accept(); });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await p.goto(B, { waitUntil: 'load', timeout: 240000 }); await p.waitForTimeout(11000);
  await p.evaluate(() => { window.exportData = function(){ window.__exported = (window.__exported || 0) + 1; }; });
  const hookToast = () => p.evaluate(() => { const t0 = window.toast; window.__toasts = []; window.toast = function(m){ window.__toasts.push(String(m)); try { return t0.apply(this, arguments); } catch (e) {} }; });
  await hookToast();

  // ---------- fill the device the way hers is ----------
  const F = await p.evaluate(() => {
    const mkStroke = (i, j) => ({ type: 'pen', color: '#1d4ed8', width: 3, ts: 1780000000000 + i * 1000 + j, _ts: 1780000000000 + i * 1000 + j, _uid: 'u' + i + '_' + j,
      points: Array.from({ length: 60 }, (_, k) => ({ x: Math.round((40 + k * 3.1 + j) * 10) / 10, y: Math.round((80 + i * 11 + Math.sin(k / 3) * 9) * 10) / 10 })) });
    const pages = {};
    for (let i = 0; i < 24; i++) { const rk = 'pad_C959/ch9/f' + i, s = Array.from({ length: 30 }, (_, j) => mkStroke(i, j)); pages[rk] = s.length; localStorage.setItem('gsk:' + rk, JSON.stringify({ g: 1, s })); }
    const old = Date.now() - 70 * 864e5, er = JSON.parse(localStorage.getItem('sh_erased_v1') || '{}'); er.strokes = er.strokes || {}; er.pages = er.pages || {}; er.courses = er.courses || {}; er.courseNotes = er.courseNotes || {};
    for (let i = 0; i < 20; i++) { const m = er.strokes['pad_C959/ch9/e' + i] = {}; for (let j = 0; j < 1500; j++) m[(1780000000000 + j) + '.' + (i * 7919 + j).toString(16).padStart(8, '0') + '.' + (900 + j)] = old + j; }
    er.strokes['pad_C959/ch9/e0']['recent.key.1'] = Date.now();
    localStorage.setItem('sh_erased_v1', JSON.stringify(er));
    localStorage.setItem('sh_store_rescue_v1', 'R'.repeat(400000));
    localStorage.setItem('diagBuf', 'd'.repeat(150000)); localStorage.setItem('diagSlow', 's'.repeat(60000)); localStorage.setItem('__reloadLog', '[]');
    // everything else up to the limit
    let n = 0; const chunk = 'x'.repeat(50000); try { for (; n < 400; n++) localStorage.setItem('__fill' + n, chunk); } catch (e) {}
    let m = 0; for (const size of [1000, 100, 10, 1]) { try { for (let q = 0; q < 2000; q++, m++) localStorage.setItem('__fs' + m, 'y'.repeat(size)); } catch (e) {} }
    const full = (() => { try { localStorage.setItem('__probe', 'z'.repeat(200)); localStorage.removeItem('__probe'); return false; } catch (e) { return true; } })();
    const t = window.__storageDoctor.report().total;
    return { pages, total: t, full, fillers: n, small: m };
  });
  ok('the test device is genuinely full', F.full === true && F.total > 2000000, { full: F.full, total: F.total, fillers: F.fillers, small: F.small });

  // ---------- 1. write in the notebook on it ----------
  const W = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms)); const NP = window.__notesPanel;
    go({ name: 'section', courseId: 'C959', chId: 'ch4', secId: 's1' }); await w(1800); NP.open(); await w(1200); NP.tab('write'); await w(200);
    const svg = document.querySelector('#mn-dock svg'); const s = NP.surface();
    const mk = (t, x, y) => new PointerEvent(t, { pointerId: 9, pointerType: 'pen', isPrimary: true, clientX: x, clientY: y, pressure: 0.5, bubbles: true, cancelable: true, buttons: t === 'pointerup' ? 0 : 1 });
    for (let st = 0; st < 25; st++) { const x0 = s.x + 30 + (st % 8) * 60, y0 = s.y + 50 + Math.floor(st / 8) * 40; svg.dispatchEvent(mk('pointerdown', x0, y0)); for (let k = 1; k <= 40; k++) svg.dispatchEvent(mk('pointermove', x0 + k * 1.3 + Math.random(), y0 + Math.sin(k / 2 + st) * 9 + Math.random())); svg.dispatchEvent(mk('pointerup', x0 + 52, y0)); await w(30); }
    await w(1500); try { saveStore(); if (saveStore.flushNow) saveStore.flushNow(); } catch (e) {}
    await w(1500);
    return { mem: NP.state().strokes, slot: (localStorage.getItem('gsk:pad_C959/ch4/s1') || '').length + (localStorage.getItem('gsl:pad_C959/ch4/s1') || '').length, doctor: window.__storageDoctorLast || null };
  });
  ok('writing on a full device is saved to the page, not just held on screen', W.mem === 25 && W.slot > 0, W);
  ok('and no STORAGE FULL box interrupted her', !dialogs.some(d => /STORAGE/i.test(d)), dialogs);
  await p.reload({ waitUntil: 'load', timeout: 240000 }); await p.waitForTimeout(11000); await hookToast();
  const R = await p.evaluate(async (pages) => {
    const out = { page: (gannoGetStrokes('pad_C959/ch4/s1') || []).length, recomp: 0, plain: 0, intact: 0 };
    for (const rk of Object.keys(pages)) { const v = localStorage.getItem('gsk:' + rk) || ''; if (v.charAt(0) === '{') out.plain++; else out.recomp++; if ((gannoGetStrokes(rk) || []).length === pages[rk]) out.intact++; }
    const er = JSON.parse(localStorage.getItem('sh_erased_v1') || '{}'); out.eraseMarks = Object.values(er.strokes || {}).reduce((a, m) => a + Object.keys(m).length, 0); out.recentKept = !!(er.strokes && er.strokes['pad_C959/ch9/e0'] && er.strokes['pad_C959/ch9/e0']['recent.key.1']);
    out.rescueLS = localStorage.getItem('sh_store_rescue_v1') === null; out.diag = localStorage.getItem('diagBuf') === null;
    const bin = await window.__inkBin.list('__store_rescue'); out.rescueIDB = bin.length > 0 && (bin[0].blob || '').length === 400000;
    return out;
  }, F.pages);
  ok('after the app is closed and reopened every stroke she wrote is there', R.page === 25, R);
  ok('the uncompressed pages were recompressed and still read back stroke for stroke', R.recomp === 24 && R.plain === 0 && R.intact === 24, R);
  ok('erase marks older than a month were dropped, recent ones kept', R.eraseMarks < 50 && R.recentKept, R);
  ok('the emergency copy moved into IndexedDB instead of being deleted, and diagnostic logs went', R.rescueLS && R.rescueIDB && R.diag, R);

  // ---------- 4. Settings -> Storage check ----------
  const S = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    window.storageCheck(); await w(400);
    const m = document.querySelector('[aria-label="Storage check"]'); const rows = m ? m.querySelectorAll('tr').length : 0; const txt = m ? m.innerText : '';
    m.querySelector('[data-sc-run]').click(); await w(600);
    const after = m.innerText; m.closest('.modal-bg').remove();
    return { rows, hasPages: /Handwriting pages/.test(txt), hasUsing: /Using about/.test(txt), freedMsg: /Freed/.test(after) };
  });
  ok('Storage check lists what uses the space and frees it on request', S.rows >= 3 && S.hasPages && S.hasUsing && S.freedMsg, S);

  // ---------- 5. nothing left to free: the page goes to the bin ----------
  const K = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms)); const NP = window.__notesPanel;
    let n = 0; for (const size of [20000, 1000, 50, 1]) { try { for (let q = 0; q < 3000; q++, n++) localStorage.setItem('__more' + n, 'q'.repeat(size)); } catch (e) {} }
    go({ name: 'section', courseId: 'C959', chId: 'ch4', secId: 's2' }); await w(1800); NP.open(); await w(1000); NP.tab('write'); await w(200);
    const svg = document.querySelector('#mn-dock svg'); const s = NP.surface();
    const mk = (t, x, y) => new PointerEvent(t, { pointerId: 9, pointerType: 'pen', isPrimary: true, clientX: x, clientY: y, pressure: 0.5, bubbles: true, cancelable: true, buttons: t === 'pointerup' ? 0 : 1 });
    for (let st = 0; st < 40; st++) { const x0 = s.x + 30 + (st % 8) * 60, y0 = s.y + 50 + Math.floor(st / 8) * 40; svg.dispatchEvent(mk('pointerdown', x0, y0)); for (let k = 1; k <= 60; k++) svg.dispatchEvent(mk('pointermove', x0 + k * 0.9 + Math.random(), y0 + Math.sin(k / 2 + st) * 9 + Math.random())); svg.dispatchEvent(mk('pointerup', x0 + 55, y0)); await w(20); }
    await w(1200); await window.__inkBin.flush(); await w(300);
    const bin = await window.__inkBin.list('pad_C959/ch4/s2');
    const stored = (() => { try { const v = localStorage.getItem('gsk:pad_C959/ch4/s2'); return v ? v.length : 0; } catch (e) { return -1; } })();
    return { mem: NP.state().strokes, stored, bin: bin.filter(r => /storage was full/.test(r.why)).map(r => r.n), toast: (window.__toasts || []).filter(m => /Storage is full/.test(m)).slice(0, 1) };
  });
  ok('when nothing more can be freed, the page is kept in the recovery bin, whole, once', K.bin.length === 1 && K.bin[0] === K.mem, K);
  ok('and she is told where it is', K.toast.length === 1 && /Recover/.test(K.toast[0]), K.toast);
  // ---------- 6. the app opens on a full device ----------
  await p.evaluate(() => {
    const junk = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^__(fill|fs|more|boot|stuck)/.test(k)) junk.push(k); } junk.forEach(k => localStorage.removeItem(k));
    const mkStroke = (i, j) => ({ type: 'pen', color: '#1d4ed8', width: 3, ts: 1780000000000 + i * 1000 + j, _uid: 'b' + i + '_' + j, points: Array.from({ length: 60 }, (_, k) => ({ x: 40 + k * 3 + j, y: 80 + i * 11 + (k % 7) })) });
    for (let i = 0; i < 10; i++) localStorage.setItem('gsk:pad_C959/ch9/b' + i, JSON.stringify({ g: 1, s: Array.from({ length: 30 }, (_, j) => mkStroke(i, j)) }));
    for (const size of [20000, 1000, 50, 1]) { try { for (let q = 0; q < 3000; q++) localStorage.setItem('__boot' + size + '_' + q, 'b'.repeat(size)); } catch (e) {} }
  });
  const d0 = dialogs.length;
  await p.reload({ waitUntil: 'load', timeout: 240000 }); await p.waitForTimeout(9000); await hookToast();
  const BT = await p.evaluate(() => ({ boot: window.__storageDoctorBoot || null, banner: !!document.getElementById('sd-banner'), pages: localStorage.getItem('gsk:pad_C959/ch9/b0').charAt(0) }));
  ok('opening the app on a full device cleans up straight away, with no warning box', !!BT.boot && BT.boot.freed > 0 && BT.pages !== '{' && dialogs.length === d0, { boot: BT.boot && BT.boot.freed, page: BT.pages, dialogs: dialogs.slice(d0) });

  // ---------- 7. still full after the clean-up: a banner, never a box ----------
  const ST = await p.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    for (const size of [20000, 1000, 50, 1]) { try { for (let q = 0; q < 4000; q++) localStorage.setItem('__stuck' + size + '_' + q, 's'.repeat(size)); } catch (e) {} }
    store.__bigNote = 'n'.repeat(300000); try { saveStore(); if (saveStore.flushNow) saveStore.flushNow(); } catch (e) {}
    await w(2500);
    const b = document.getElementById('sd-banner');
    const out = { banner: !!b, buttons: b ? [...b.querySelectorAll('[data-sd]')].map(x => x.getAttribute('data-sd')) : [] };
    if (b) { b.querySelector('[data-sd="check"]').click(); await w(400); out.check = !!document.querySelector('[aria-label="Storage check"]'); const m = document.querySelector('[aria-label="Storage check"]'); if (m) m.closest('.modal-bg').remove(); }
    delete store.__bigNote;
    return out;
  });
  ok('when storage is still full a banner offers Storage check and a backup, and no box stops the app', ST.banner && ST.buttons.includes('check') && ST.buttons.includes('backup') && ST.check && !dialogs.some(d => /STORAGE/.test(d)), { ST, dialogs });
  ok('no page errors', errs.length === 0, errs.slice(0, 3));
  await br.close();
  console.log(`storagefull: ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})();
