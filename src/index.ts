import { Hono } from "hono";

interface Env {
  OPENAI_API_KEY?: string;
  OPENAI_TEXT_MODEL?: string;
  OPENAI_TTS_MODEL?: string;
  OPENAI_TTS_VOICE?: string;
}

interface ChatMessage {
  role?: unknown;
  content?: unknown;
}

const replies = new Map<string, string>([
  ["おはよう", "おはよう！"],
  ["こんにちは", "こんにちは！"],
  ["ありがとう", "どういたしまして！"],
  ["今日こんなことがあってね", "うんとえらいね！"],
]);

const app = new Hono<{ Bindings: Env }>();
const OPENAI_BASE_URL = "https://api.openai.com/v1";
const CHARACTER_PROMPT = [
  "あなたは「さんさん」という会話キャラクターです。",
  "明るく、やさしく、少し天然で、ユーザーの気持ちをふわっと受け止めます。",
  "話し方は短めで親しみやすい日本語。1〜2文で返します。",
  "必要以上に説明せず、音声で聞きやすい自然な文にしてください。",
  "医療・法律・金融など高リスクな相談では、専門家への相談をやさしく促してください。",
].join("\n");

function normalize(text: string) {
  return text.trim().replace(/\s+/g, "");
}

function replyFor(text: string) {
  const exact = replies.get(text.trim());
  if (exact) return exact;

  const compact = normalize(text);
  for (const [key, value] of replies.entries()) {
    if (normalize(key) === compact) return value;
  }

  return "うんうん。";
}

function inputMessagesFrom(history: ChatMessage[], text: string) {
  const messages = history
    .slice(-10)
    .map((message) => {
      const role = message.role === "assistant" ? "assistant" : message.role === "user" ? "user" : null;
      const content = typeof message.content === "string" ? message.content.trim() : "";
      if (!role || !content) return null;
      return { role, content };
    })
    .filter((message): message is { role: "user" | "assistant"; content: string } => Boolean(message));

  return [
    { role: "developer", content: CHARACTER_PROMPT },
    ...messages,
    { role: "user", content: text },
  ];
}

function extractResponseText(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const outputText = (data as { output_text?: unknown }).output_text;
  if (typeof outputText === "string" && outputText.trim()) return outputText.trim();

  const output = (data as { output?: unknown }).output;
  if (!Array.isArray(output)) return "";

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string" && text.trim()) return text.trim();
    }
  }

  return "";
}

async function generateText(env: Env, text: string, history: ChatMessage[]): Promise<string> {
  if (!env.OPENAI_API_KEY) return replyFor(text);

  const response = await fetch(`${OPENAI_BASE_URL}/responses`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_TEXT_MODEL || "gpt-4.1-mini",
      input: inputMessagesFrom(history, text),
      max_output_tokens: 120,
      store: false,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`OpenAI response failed: ${response.status} ${detail.slice(0, 240)}`);
  }

  const data = await response.json();
  return extractResponseText(data) || replyFor(text);
}

async function generateSpeech(env: Env, text: string) {
  if (!env.OPENAI_API_KEY) return null;

  const response = await fetch(`${OPENAI_BASE_URL}/audio/speech`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
      voice: env.OPENAI_TTS_VOICE || "alloy",
      input: text,
      response_format: "mp3",
      instructions: "明るく、やさしく、少し天然な雰囲気。日本語を自然なテンポで話す。",
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`OpenAI speech failed: ${response.status} ${detail.slice(0, 240)}`);
  }

  const audio = await response.arrayBuffer();
  const bytes = new Uint8Array(audio);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }

  const contentType = response.headers.get("content-type") || "audio/mpeg";
  return {
    contentType,
    dataUrl: `data:${contentType};base64,${btoa(binary)}`,
  };
}

app.get("/api/health", (c) => {
  return c.json({
    ok: true,
    service: "sunsun-talk",
  });
});

app.post("/api/reply", async (c) => {
  const body = (await c.req.json<{ text?: unknown }>().catch(() => ({}))) as { text?: unknown };
  const text = typeof body.text === "string" ? body.text : "";

  return c.json({
    input: text,
    reply: replyFor(text),
  });
});

app.post("/api/talk", async (c) => {
  const body = (await c.req.json<{ text?: unknown; history?: unknown }>().catch(() => ({}))) as {
    text?: unknown;
    history?: unknown;
  };
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const history = Array.isArray(body.history) ? (body.history as ChatMessage[]) : [];

  if (!text) {
    return c.json({ error: "text is required" }, 400);
  }

  try {
    const reply = await generateText(c.env, text, history);
    const speech = await generateSpeech(c.env, reply);

    return c.json({
      input: text,
      reply,
      audioUrl: speech?.dataUrl ?? null,
      audioContentType: speech?.contentType ?? null,
      mode: c.env.OPENAI_API_KEY ? "openai" : "fallback",
    });
  } catch (error) {
    console.error(error);
    return c.json(
      {
        input: text,
        reply: replyFor(text),
        audioUrl: null,
        audioContentType: null,
        mode: "fallback",
        warning: "OpenAI generation failed; returned local fallback reply.",
      },
      200,
    );
  }
});

app.notFound((c) => {
  return c.json({ error: "Not found" }, 404);
});

export default app;
