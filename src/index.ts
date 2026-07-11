import { Hono } from "hono";

const replies = new Map<string, string>([
  ["おはよう", "おはよう！"],
  ["こんにちは", "こんにちは！"],
  ["ありがとう", "どういたしまして！"],
  ["今日こんなことがあってね", "うんとえらいね！"],
]);

const app = new Hono();

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

app.notFound((c) => {
  return c.json({ error: "Not found" }, 404);
});

export default app;
