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

// Podcast mode: a two-host study episode about the lesson on screen, written
// to be SPOKEN by the device's text-to-speech voices - so the words carry all
// the naturalness, and nothing in the text can trip a speech engine.
const PODCAST_SYSTEM = [
  "You write a short two-host study podcast episode about the WGU lesson",
  "provided below. The hosts: MAYA leads - warm, clear, explains ideas with",
  "concrete examples; SAM is the curious co-host - asks exactly the",
  "questions a confused student would ask, pushes back when something seems",
  "to contradict, and restates ideas in his own words to check them.",
  "Ground EVERYTHING in the provided lesson: its terms, its examples, its",
  "numbers. Do not invent facts the lesson does not support; if the lesson",
  "leaves something out, the hosts may say it's beyond today's episode.",
  "STYLE: genuinely conversational - contractions, short turns of one to",
  "four sentences, occasional 'right', 'okay so', natural handoffs. Open",
  "with two or three lines hooking why this topic matters on the exam.",
  "End with SAM recapping the three takeaways in his own words and MAYA",
  "giving one exam tip. 24 to 40 turns, roughly 1000 to 1400 words.",
  "FORMAT - this text is fed straight to text-to-speech: every line starts",
  "with exactly 'MAYA:' or 'SAM:' and nothing else. No markdown, no LaTeX,",
  "no stage directions, no sound effects, no asterisks, no headings. Write",
  "math in spoken words or plain Unicode (say 'n squared', '2 to the n').",
].join(" ");

// Mind-map mode: the lesson's ideas as a strict JSON tree the app lays out
// visually. JSON only - the client parses the response directly.
const MINDMAP_SYSTEM = [
  "You turn the WGU lesson provided below into a mind map. Output STRICT",
  "JSON and nothing else - no prose, no markdown fences. Schema:",
  '{"t":"central topic, 2-5 words","b":[{"t":"branch, 2-6 words",',
  '"c":[{"t":"leaf, 2-7 words","n":"one plain sentence explaining it,',
  'grounded in the lesson"}]}]}',
  "Rules: 4 to 7 branches covering the WHOLE lesson; 2 to 5 leaves per",
  "branch; every t is short enough to read at a glance; every leaf has an",
  "n sentence; use the lesson's own terminology; do not invent content the",
  "lesson does not support. Plain Unicode for any math (n squared as n²).",
].join(" ");

// Questions mode: real exam-style multiple-choice questions generated from a
// section of the user's own uploaded material. STRICT JSON, parsed directly
// by the client's PDF-course builder.
const QUESTIONS_SYSTEM = [
  "You write exam-style multiple-choice questions from study material the",
  "student uploaded. Output STRICT JSON and nothing else - no prose, no",
  "markdown fences. Schema:",
  '{"questions":[{"topic":"2-4 word concept","text":"the question",',
  '"options":["A","B","C","D"],"correct":0,"explain":"why the right answer',
  'is right, in 1-3 sentences grounded in the source","distractors":{"1":"why',
  'this specific option is wrong","2":"...","3":"..."},"difficulty":"easy|medium|hard"}]}',
  "Rules: every question tests UNDERSTANDING (application, comparison,",
  "why/when, working a small example) - never trivia about the wording of the",
  "source. Exactly 4 options per question; exactly one correct; distractors",
  "must be plausible misconceptions a real student would hold, never jokes or",
  "obvious throwaways; spread the correct index evenly across positions; give",
  "a distractors entry for every wrong option, keyed by its option index as a",
  "string. Ground everything in the provided source - if the source doesn't",
  "support a fact, don't test it. Plain Unicode for math (× ² ≤ →), no LaTeX.",
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

  const podcast = body.mode === "podcast";
  const mindmap = body.mode === "mindmap";
  const questions = body.mode === "questions";
  const generated = podcast || mindmap || questions;

  // Bound everything the client can send: last 12 turns, 8KB per turn,
  // 16KB of lesson context. Keeps a single question to a few cents.
  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .slice(-12)
    .map((m) => ({
      role: m && m.role === "assistant" ? "assistant" : "user",
      content: String((m && m.content) || "").slice(0, 8000),
    }))
    .filter((m) => m.content.length > 0);
  if (!generated && (!messages.length || messages[messages.length - 1].role !== "user")) {
    return json(400, { error: "no_user_message" });
  }

  const ctx = body.context || {};
  const lesson = String(ctx.lesson || "").slice(0, 16000);
  const title = String(ctx.title || "").slice(0, 200);

  if (generated && !lesson) return json(400, { error: "no_lesson" });

  const system = [
    { type: "text", text: podcast ? PODCAST_SYSTEM : (mindmap ? MINDMAP_SYSTEM : (questions ? QUESTIONS_SYSTEM : TUTOR_SYSTEM)), cache_control: { type: "ephemeral" } },
  ];
  if (lesson) {
    system.push({
      type: "text",
      text: (questions ? "The source material" : (generated ? "The lesson" : "The student is currently reading this lesson")) +
        (title ? ` ("${title}")` : "") + ":\n\n" + lesson,
    });
  }

  // How many questions to write - bounded so one section stays a few cents.
  const qCount = Math.max(4, Math.min(10, parseInt(body.count, 10) || 10));

  const client = new Anthropic({ apiKey: key });

  // Streaming keeps time-to-first-byte low (Netlify functions have tight
  // response limits) and lets the app show the answer as it is written.
  // effort "medium" trades a little depth for the latency a chat needs;
  // max_tokens 2048 caps the cost of any single answer.
  const stream = client.beta.messages.stream({
    model: "claude-opus-5",
    max_tokens: podcast ? 3500 : (mindmap ? 2000 : (questions ? 6400 : 2048)),
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium" },
    system,
    messages: podcast
      ? [{ role: "user", content: "Write today's episode about the lesson." }]
      : (mindmap
        ? [{ role: "user", content: "Produce the mind map JSON for the lesson." }]
        : (questions
          ? [{ role: "user", content: "Write exactly " + qCount + " questions from the source material as JSON." }]
          : messages)),
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
        // questions mode is machine-parsed JSON: appending prose to a
        // truncated or refused response would only corrupt the parse -
        // let bad JSON fail clean so the client falls back.
        if (final.stop_reason === "refusal") {
          if (!questions) controller.enqueue(enc.encode("\n\nI can't help with that particular request."));
        } else if (final.stop_reason === "max_tokens") {
          if (!questions) controller.enqueue(enc.encode("\n\n[Answer trimmed - ask me to continue if you need more.]"));
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
