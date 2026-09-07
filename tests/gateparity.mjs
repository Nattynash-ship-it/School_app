// The sync function must derive exactly the secret the edge gate derives.
import { gateConfig } from '../netlify/edge-functions/gate.js';
import fs from 'fs';
const src = fs.readFileSync(new URL('../netlify/functions/sync.mjs', import.meta.url), 'utf8');
// lift the helper trio out of sync.mjs without importing @netlify/blobs
const part = src.slice(src.indexOf('const enc = new TextEncoder();'), src.indexOf('async function signedIn'));
const mod = await import('data:text/javascript,' + encodeURIComponent(part.replace(/process\.env\[k\]/g, '(globalThis.__env[k])') + '\nexport { gateSecret };'));
for (const env of [{ SITE_ID: 'abc' }, { SITE_ID: 'abc', GATE_PASSWORD: 'x y z' }, { SITE_ID: 'abc', GATE_SECRET: 'S' }, { SITE_ID: 'q', GATE_PASSWORD_SHA256: 'ab'.repeat(32) }]) {
  globalThis.__env = env;
  const a = (await gateConfig((k) => env[k] || '')).secret, b = await mod.gateSecret();
  console.log(a === b ? 'PASS' : 'FAIL', JSON.stringify(env), a === b ? '' : a + ' vs ' + b);
}
