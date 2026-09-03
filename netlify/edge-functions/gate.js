// THE GATE - a password wall in front of the whole site.
//
// This runs at Netlify's edge before anything is served: the app shell, the
// course files, the AI helper, the sync function - everything. A visitor
// without a valid cookie gets the sign-in page and nothing else. The password
// is never in this repository: it lives in the site's environment variables
// (GATE_PASSWORD, optional GATE_SECRET). Without GATE_PASSWORD set the gate
// fails CLOSED and says so, rather than quietly opening the site.
//
// The cookie is <expiry>.<HMAC-SHA256(secret, expiry)>: unforgeable without
// the secret, HttpOnly, Secure, valid for 180 days on that device. Signing in
// once on the iPad is enough; the service worker's fetches carry it too.
//
// /sw.js is the ONE path served without a cookie. It holds no content, only
// cache logic, and it must reach devices that cached the site BEFORE the gate
// existed: the new worker wipes their old copy and sends them here.

const COOKIE = "nsh_gate";
const MAX_AGE = 180 * 24 * 60 * 60;          // seconds
const PUBLIC = new Set(["/sw.js", "/favicon.ico", "/robots.txt"]);

<<<<<<< HEAD
// The built-in password, as a SHA-256 hash - the passphrase itself is not in
// this repository (which is public). GATE_PASSWORD or GATE_PASSWORD_SHA256 in
// the site's environment variables override it without a code change.
const DEFAULT_PASSWORD_SHA256 = "570052f5b42248adaa457f6ef19d4d86a56c09813aa1a90fc1c53b2d099ac902";

const enc = new TextEncoder();
async function sha256hex(s) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
=======
const enc = new TextEncoder();
>>>>>>> origin/main

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function same(a, b) {               // constant-time string compare
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
function env(name) {
  try { if (typeof Netlify !== "undefined" && Netlify.env) return Netlify.env.get(name) || ""; } catch (e) {}
  try { if (typeof Deno !== "undefined" && Deno.env) return Deno.env.get(name) || ""; } catch (e) {}
  try { if (typeof process !== "undefined" && process.env) return process.env[name] || ""; } catch (e) {}
  return "";
}
function readCookie(req) {
  const raw = req.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE) return v.join("=");
  }
  return "";
}
export async function cookieValid(value, secret) {
  if (!value || !secret) return false;
  const dot = value.indexOf(".");
  if (dot < 1) return false;
  const exp = value.slice(0, dot), sig = value.slice(dot + 1);
  if (!/^\d{9,13}$/.test(exp) || Number(exp) * 1000 < Date.now()) return false;
  return same(sig, await hmac(secret, exp));
}
async function makeCookie(secret) {
  const exp = String(Math.floor(Date.now() / 1000) + MAX_AGE);
  const sig = await hmac(secret, exp);
  return `${COOKIE}=${exp}.${sig}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
}
const clearCookie = `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

function page(body, status = 401, extra = {}) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex", ...extra },
  });
}
function loginPage(opts = {}) {
  const err = opts.error ? `<p class="err">${opts.error}</p>` : "";
  const next = (opts.next || "/").replace(/[^\w\-./?=&%]/g, "");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><title>Sign in</title>
<style>
:root{color-scheme:light dark;--bg:#f6f4fb;--card:#fff;--text:#1a1730;--muted:#6b6880;--accent:#7c3aed;--err:#dc2626;--border:#e6e2f0}
@media(prefers-color-scheme:dark){:root{--bg:#141224;--card:#1d1a30;--text:#f2f0fa;--muted:#a9a5c0;--border:#312d48}}
*{box-sizing:border-box}html,body{height:100%;margin:0}
body{background:var(--bg);color:var(--text);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;display:flex;align-items:center;justify-content:center;padding:24px}
.card{width:100%;max-width:380px;background:var(--card);border:1px solid var(--border);border-radius:18px;padding:28px 26px 24px;box-shadow:0 12px 40px rgba(0,0,0,.12)}
h1{font-size:20px;margin:0 0 4px}p{margin:0 0 18px;color:var(--muted);font-size:14px}
label{display:block;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}
input{width:100%;font:inherit;font-size:17px;padding:12px 14px;border-radius:12px;border:1px solid var(--border);background:var(--bg);color:var(--text);outline:none}
input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(124,58,237,.18)}
button{margin-top:14px;width:100%;font:inherit;font-size:16px;font-weight:700;padding:13px;border:0;border-radius:12px;background:var(--accent);color:#fff;cursor:pointer}
.err{color:var(--err);font-weight:600;margin:0 0 12px}
.foot{margin:16px 0 0;font-size:12px;color:var(--muted)}
</style></head><body><main class="card">
<h1>This is a private study site</h1><p>Enter the password to continue on this device. You will stay signed in for 180 days.</p>${err}
<form method="post" action="/__gate"><input type="hidden" name="next" value="${next}">
<label for="pw">Password</label><input id="pw" name="password" type="password" autocomplete="current-password" autofocus required>
<button type="submit">Sign in</button></form>
<p class="foot">Nothing on this site is shared, indexed or public.</p></main></body></html>`;
}

<<<<<<< HEAD
// Which password is in force, and the secret that signs cookies.
//  - GATE_PASSWORD (plaintext, env) wins; else GATE_PASSWORD_SHA256 (env);
//    else the built-in hash above.
//  - GATE_SECRET (env) signs cookies if set. Otherwise the key is derived from
//    the password hash AND the site's own id, which is not in the repository -
//    so knowing the public hash alone does not let anyone forge a cookie.
export async function gateConfig(envGet) {
  const plain = envGet("GATE_PASSWORD");
  const hash = plain ? await sha256hex(plain) : (envGet("GATE_PASSWORD_SHA256") || DEFAULT_PASSWORD_SHA256).toLowerCase();
  const secret = envGet("GATE_SECRET") || await hmac(hash, "nsh-gate:" + (envGet("SITE_ID") || envGet("NETLIFY_SITE_ID") || "site"));
  return { hash, secret };
}
export async function passwordMatches(given, hash) {
  if (!given) return false;
  return same(await sha256hex(given), hash);
}

export default async function gate(request, context) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (PUBLIC.has(path)) return context.next();
  const { hash, secret } = await gateConfig(env);
=======
export default async function gate(request, context) {
  const url = new URL(request.url);
  const path = url.pathname;
  const password = env("GATE_PASSWORD");
  const secret = env("GATE_SECRET") || (password ? "s:" + password : "");

  if (PUBLIC.has(path)) return context.next();

  if (!password) {
    return page(`<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Locked</title>
<body style="font-family:-apple-system,system-ui,sans-serif;padding:40px;max-width:520px;margin:auto;line-height:1.5">
<h1 style="font-size:20px">Site locked - password not configured yet</h1>
<p>Set <code>GATE_PASSWORD</code> in Netlify (Site configuration → Environment variables), then trigger a redeploy. Until then nothing is served.</p></body>`, 503);
  }
>>>>>>> origin/main

  if (path === "/__gate") {
    if (request.method === "POST") {
      let given = "", next = "/";
      try {
        const form = await request.formData();
        given = String(form.get("password") || "");
        next = String(form.get("next") || "/");
      } catch (e) {}
      if (!/^\/(?!\/)/.test(next)) next = "/";
<<<<<<< HEAD
      if (await passwordMatches(given, hash)) {
=======
      if (given && same(given, password)) {
>>>>>>> origin/main
        return new Response(null, { status: 303, headers: { location: next, "set-cookie": await makeCookie(secret), "cache-control": "no-store" } });
      }
      return page(loginPage({ error: "That password is not right.", next }), 401);
    }
    if (url.searchParams.get("logout") === "1") {
      return new Response(null, { status: 303, headers: { location: "/__gate", "set-cookie": clearCookie, "cache-control": "no-store" } });
    }
    const ok = await cookieValid(readCookie(request), secret);
    if (ok) return new Response(null, { status: 303, headers: { location: url.searchParams.get("next") || "/", "cache-control": "no-store" } });
    return page(loginPage({ next: url.searchParams.get("next") || "/" }), 401);
  }

  if (await cookieValid(readCookie(request), secret)) return context.next();

  // Not signed in. A page gets the sign-in form; anything the app fetches
  // (JSON, functions) gets a bare 401 so the app can show its own prompt.
  const accept = request.headers.get("accept") || "";
  const wantsPage = request.method === "GET" && (accept.includes("text/html") || path === "/" || path.endsWith(".html"));
  if (wantsPage) return page(loginPage({ next: path + (url.search || "") }), 401);
  return new Response(JSON.stringify({ error: "sign_in_required" }), {
    status: 401, headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const config = { path: "/*" };
