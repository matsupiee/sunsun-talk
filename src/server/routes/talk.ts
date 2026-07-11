import type { TalkHistoryMessage, TalkResponse } from "../../api-contracts/talk";
import { replyFor } from "../domain/fallbackReplies";
import { generateSpeech } from "../services/openai/speech";
import { generateText } from "../services/openai/responses";
import type { ServerApp } from "../types";

function parseHistory(value: unknown): TalkHistoryMessage[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((message) => {
      if (!message || typeof message !== "object") return null;
      const role = (message as { role?: unknown }).role;
      const content = (message as { content?: unknown }).content;
      if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null;
      const trimmed = content.trim();
      if (!trimmed) return null;
      return { role, content: trimmed };
    })
    .filter((message): message is TalkHistoryMessage => Boolean(message));
}

export function registerTalkRoute(app: ServerApp) {
  app.post("/api/talk", async (c) => {
    const body = (await c.req.json<{ text?: unknown; history?: unknown }>().catch(() => ({}))) as {
      text?: unknown;
      history?: unknown;
    };
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const history = parseHistory(body.history);

    if (!text) {
      return c.json({ error: "text is required" }, 400);
    }

    let reply: string;
    try {
      reply = await generateText(c.env, text, history);
    } catch (error) {
      console.error(error);

      const response: TalkResponse = {
        input: text,
        reply: replyFor(text),
        audioUrl: null,
        audioContentType: null,
        mode: "fallback",
        warning: "OpenAI text generation failed; returned local fallback reply.",
      };

      return c.json(response, 200);
    }

    try {
      const speech = await generateSpeech(c.env, reply);
      const response: TalkResponse = {
        input: text,
        reply,
        audioUrl: speech?.dataUrl ?? null,
        audioContentType: speech?.contentType ?? null,
        mode: c.env.OPENAI_API_KEY ? "openai" : "fallback",
      };

      return c.json(response);
    } catch (error) {
      console.error(error);

      const response: TalkResponse = {
        input: text,
        reply,
        audioUrl: null,
        audioContentType: null,
        mode: c.env.OPENAI_API_KEY ? "openai" : "fallback",
        warning: "OpenAI speech generation failed; returned text reply without audio.",
      };

      return c.json(response, 200);
    }
  });
}
