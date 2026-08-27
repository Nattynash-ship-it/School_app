// AI study helper - the only server-side code in this app.
// The Anthropic API key lives in a Netlify environment variable
// (ANTHROPIC_API_KEY), never in the app itself. Until that variable is set,
// this returns 503 and the app shows setup instructions instead of a chat.
import Anthropic from "@anthropic-ai/sdk";

const TUTOR_SYSTEM = [
  "You are the built-in study helper of a WGU exam-prep app. The student is",
  "preparing for WGU computer science objective assessments (C959 Discrete",
  "Math I, D286 Java, D684 Intro to Computer Science, D197 Version Control).",
  "Answer like a patient tutor working toward an exam: be correct first,",
  "concise second. Work problems step by step, showing every step the way a",
  "textbook worked example would. When the student's current lesson text is",
  "provided, ground your answer in it and match its terminology. If asked",
  "something outside the courses, answer briefly and steer back to the",
  "material. Never invent facts about WGU exam contents or policies - if you",
  "do not know, say so plainly.",
  "FORMAT - your answer renders in a simple chat bubble, not a math engine:",
  "never use LaTeX (no $ delimiters, no \\begin, \\frac, \\times), no markdown",
  "tables, no # headings. You may use **bold**, `code`, and hyphen bullets.",
  "Write math in plain Unicode characters (× · ÷ ² ³ ≤ ≥ ≠ → √ Σ π), write",
  "subscripts like a[i][j] or aᵢⱼ, and show a matrix as bracketed rows, one",
  "row per line, like:",
  "[ 3  -1 ]",
  "[ 5   0 ]",
].join(" ");

const json = (status, obj) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  // Same-site guard: this endpoint spends the owner's API credit, so refuse
  // browsers sending a foreign Origin. (Not bulletproof - the real protection
  // is that the URL is unlisted and per-request cost is capped.)
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) return json(403, { error: "forbidden" });
    } catch { return json(403, { error: "forbidden" }); }
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return json(503, { error: "not_configured" });

  let body;
  try { body = await req.json(); } catch { return json(400, { error: "bad_json" }); }

  // Bound everything the client can send: last 12 turns, 8KB per turn,
  // 16KB of lesson context. Keeps a single question to a few cents.
  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .slice(-12)
    .map((m) => ({
      role: m && m.role === "assistant" ? "assistant" : "user",
      content: String((m && m.content) || "").slice(0, 8000),
    }))
    .filter((m) => m.content.length > 0);
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return json(400, { error: "no_user_message" });
  }

  const ctx = body.context || {};
  const lesson = String(ctx.lesson || "").slice(0, 16000);
  const title = String(ctx.title || "").slice(0, 200);

  const system = [
    { type: "text", text: TUTOR_SYSTEM, cache_control: { type: "ephemeral" } },
  ];
  if (lesson) {
    system.push({
      type: "text",
      text: "The student is currently reading this lesson" +
        (title ? ` ("${title}")` : "") + ":\n\n" + lesson,
    });
  }

  const client = new Anthropic({ apiKey: key });

  // Streaming keeps time-to-first-byte low (Netlify functions have tight
  // response limits) and lets the app show the answer as it is written.
  // effort "medium" trades a little depth for the latency a chat needs;
  // max_tokens 2048 caps the cost of any single answer.
  const stream = client.beta.messages.stream({
    model: "claude-opus-5",
    max_tokens: 2048,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium" },
    system,
    messages,
  });

  const enc = new TextEncoder();
  const rs = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(enc.encode(event.delta.text));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") {
          controller.enqueue(enc.encode("\n\nI can't help with that particular request."));
        } else if (final.stop_reason === "max_tokens") {
          controller.enqueue(enc.encode("\n\n[Answer trimmed - ask me to continue if you need more.]"));
        }
      } catch (e) {
        const msg = e && e.message ? String(e.message).slice(0, 300) : "unknown error";
        controller.enqueue(enc.encode("\n\n[Helper error: " + msg + "]"));
      }
      controller.close();
    },
  });

  return new Response(rs, {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
};
