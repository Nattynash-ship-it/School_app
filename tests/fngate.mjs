// helper.mjs and tts.mjs must refuse a request without the gate cookie (401) and
// let a validly signed cookie through to the next check (503: no API key set).
import { gateConfig } from '../netlify/edge-functions/gate.js';
process.env.SITE_ID = 'parity-test'; delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY;
const enc = new TextEncoder();
async function hmac(secret, msg) { const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg)); return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join(''); }
const { secret } = await gateConfig(k => process.env[k] || '');
const exp = String(Math.floor(Date.now() / 1000) + 3600);
const good = `nsh_gate=${exp}.${await hmac(secret, exp)}`;
const bad = `nsh_gate=${exp}.${'0'.repeat(64)}`;
let fails = 0;
for (const name of ['helper', 'tts']) {
  const mod = await import('../netlify/functions/' + name + '.mjs');
  const call = async (cookie) => { const h = { 'content-type': 'application/json', host: 'x.netlify.app' }; if (cookie) h.cookie = cookie; const r = await mod.default(new Request('https://x.netlify.app/.netlify/functions/' + name, { method: 'POST', headers: h, body: '{}' })); return r.status; };
  const s1 = await call(null), s2 = await call(bad), s3 = await call(good);
  const ok = s1 === 401 && s2 === 401 && s3 === 503;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: no cookie ${s1}, forged cookie ${s2}, valid cookie ${s3} (expected 401/401/503)`);
}
process.exit(fails ? 1 : 0);
