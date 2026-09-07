// Spoken audio for the study podcast - the only part of this app that does not
// come out of the iPad's own speech engine.
//
// WHY THIS EXISTS. iPadOS decides which of its voices a web page may use, and
// it keeps the good ones - the Enhanced and Premium recordings downloaded in
// Settings - for its own reading. A web page gets the small built-in voices,
// which is why the podcast sounded robotic no matter which of them was chosen.
// The only way past that ceiling is to generate the audio somewhere else and
// play it back, which is what this does.
//
// It is INERT until OPENAI_API_KEY is set on the site. With no key it answers
// 503 and the app keeps using the device voices exactly as before, so nothing
// here starts costing money until someone decides it should.
//
// Cost, so it is never a surprise: gpt-4o-mini-tts bills per character of
// input. A five-minute episode is roughly 4,500 characters, about 7 cents at
// the current rate. The app caches every clip it fetches, so replaying an
// episode is free - only the first listen of a new episode costs anything.

const json = (status, obj) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

// The two hosts. Deliberately a fixed, small set: these are voices, not free
// text, and the client may not pass anything else through to the provider.
const VOICES = {
  maya: "nova",
  sam: "onyx",
  // spare choices, selectable from the app's voice picker
  alloy: "alloy", echo: "echo", fable: "fable", onyx: "onyx",
  nova: "nova", shimmer: "shimmer", sage: "sage", coral: "coral",
};

const MAX_CHARS = 4000;      // one host turn; the app splits longer ones
const MODEL = "gpt-4o-mini-tts";


// THE GATE, a second time. The edge function in front of the site already
// refuses requests without the sign-in cookie; this repeats the check here so
// this endpoint - which spends the owner's API credit - stays closed even if
// the edge configuration is ever removed or bypassed. Same cookie, same
// secret, same rule as sync.mjs: no cookie, no answer.
const _enc = new TextEncoder();
const DEFAULT_PASSWORD_SHA256 = "570052f5b42248adaa457f6ef19d4d86a56c09813aa1a90fc1c53b2d099ac902";
async function sha256hex(s) {
  const d = await crypto.subtle.digest("SHA-256", _enc.encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey("raw", _enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, _enc.encode(msg));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function same(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
async function gateSecret() {
  const env = (k) => process.env[k] || "";
  const plain = env("GATE_PASSWORD");
  const hash = plain ? await sha256hex(plain) : (env("GATE_PASSWORD_SHA256") || DEFAULT_PASSWORD_SHA256).toLowerCase();
  return env("GATE_SECRET") || await hmacHex(hash, "nsh-gate:" + (env("SITE_ID") || env("NETLIFY_SITE_ID") || "site"));
}
async function signedIn(req) {
  const secret = await gateSecret();
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
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!(await signedIn(req))) return json(401, { error: "sign_in_required" });

  // Same-site guard, same reasoning as the helper: this endpoint spends the
  // owner's credit, so refuse browsers sending a foreign Origin.
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) return json(403, { error: "forbidden" });
    } catch { return json(403, { error: "forbidden" }); }
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) return json(503, { error: "not_configured" });

  let body;
  try { body = await req.json(); } catch { return json(400, { error: "bad_json" }); }

  const text = String((body && body.text) || "").slice(0, MAX_CHARS).trim();
  if (!text) return json(400, { error: "no_text" });

  const voice = VOICES[String((body && body.voice) || "maya")] || VOICES.maya;
  // The model reads whatever language the text is in; this only nudges tone.
  const instructions = String((body && body.instructions) || "").slice(0, 400);

  try {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "authorization": "Bearer " + key,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        voice,
        input: text,
        response_format: "mp3",
        ...(instructions ? { instructions } : {}),
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return json(res.status === 401 ? 401 : 502, {
        error: res.status === 401 ? "bad_key" : "provider_error",
        status: res.status,
        detail: detail.slice(0, 300),
      });
    }

    const audio = await res.arrayBuffer();
    return new Response(audio, {
      status: 200,
      headers: {
        "content-type": "audio/mpeg",
        // The clip is a pure function of (text, voice); the app caches it too.
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch (e) {
    return json(502, { error: "provider_unreachable", detail: String((e && e.message) || e).slice(0, 200) });
  }
};
