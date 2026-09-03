// Device sync - keeps the study data on every device she uses in step.
//
// Storage is Netlify Blobs, which this site gets for free with no account,
// no database and nothing to configure. One record per sync code:
//   { data: <LZ-compressed base64 snapshot>, updatedAt, device, n }
//
// The sync code never leaves the device. The app sends only its SHA-256
// hash, and that hash is the record key - so this function never sees, and
// never stores, anything that could be typed back into the app.
//
// This endpoint holds one opaque blob per hash and nothing else: no listing,
// no enumeration, no other routes. A wrong or guessed hash reads someone
// else's blob, which is why the app requires a long code and warns that it
// is the only thing protecting the data.
import { getStore } from "@netlify/blobs";

const json = (status, obj) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const KEY_RE = /^[a-f0-9]{64}$/;          // SHA-256 hex, nothing else accepted
const MAX_CHARS = 4_500_000;              // keep clear of the function body limit

function store() {
  // Strong consistency matters here: push on the iPad, then pull on the
  // laptop a second later, must return the new record and not a stale one.
  try { return getStore({ name: "study-sync", consistency: "strong" }); }
  catch (e) { return getStore("study-sync"); }
}

// THE GATE, a second time. The edge function in front of the site already
// refuses requests without the sign-in cookie; this repeats the check here so
// the blob store is safe even if the edge configuration is ever removed or
// bypassed. Same cookie, same secret, same rule: no cookie, no data.
const enc = new TextEncoder();
async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function same(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
async function signedIn(req) {
  const password = process.env.GATE_PASSWORD || "";
  const secret = process.env.GATE_SECRET || (password ? "s:" + password : "");
  if (!secret) return false;                       // no gate configured: fail closed
  const raw = req.headers.get("cookie") || "";
  let value = "";
  for (const part of raw.split(";")) { const [k, ...v] = part.trim().split("="); if (k === "nsh_gate") value = v.join("="); }
  const dot = value.indexOf(".");
  if (dot < 1) return false;
  const exp = value.slice(0, dot), sig = value.slice(dot + 1);
  if (!/^\d{9,13}$/.test(exp) || Number(exp) * 1000 < Date.now()) return false;
  return same(sig, await hmacHex(secret, exp));
}

export default async (req) => {
  if (!(await signedIn(req))) return json(401, { error: "sign_in_required" });
  let url;
  try { url = new URL(req.url); } catch (e) { return json(400, { error: "bad request" }); }
  const key = String(url.searchParams.get("k") || "").toLowerCase();
  if (!KEY_RE.test(key)) return json(400, { error: "bad sync key" });

  try {
    if (req.method === "GET") {
      const rec = await store().get(key, { type: "json" });
      if (!rec || typeof rec.data !== "string") return json(200, { empty: true });
      return json(200, { data: rec.data, updatedAt: rec.updatedAt || 0, device: rec.device || "" });
    }

    if (req.method === "POST") {
      let body;
      try { body = await req.json(); } catch (e) { return json(400, { error: "bad body" }); }
      if (!body || typeof body.data !== "string" || !body.data) return json(400, { error: "no data" });
      if (body.data.length > MAX_CHARS) {
        return json(413, { error: "snapshot too large", chars: body.data.length, max: MAX_CHARS });
      }
      const rec = {
        data: body.data,
        updatedAt: Date.now(),
        device: String(body.device || "").slice(0, 40),
        n: body.data.length,
      };
      await store().setJSON(key, rec);
      return json(200, { ok: true, updatedAt: rec.updatedAt });
    }

    return json(405, { error: "method not allowed" });
  } catch (e) {
    const msg = e && e.message ? String(e.message).slice(0, 200) : "unknown error";
    return json(500, { error: msg });
  }
};
