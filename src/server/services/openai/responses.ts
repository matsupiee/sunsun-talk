import type { TalkHistoryMessage } from "../../../api-contracts/talk";
import { CHARACTER_PROMPT } from "../../domain/character";
import { replyFor } from "../../domain/fallbackReplies";
import type { Env } from "../../types";

const OPENAI_BASE_URL = "https://api.openai.com/v1";

function inputMessagesFrom(history: TalkHistoryMessage[], text: string) {
  const messages = history.slice(-10).map((message) => ({
    role: message.role,
    content: message.content.trim(),
  }));

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

export async function generateText(
  env: Env,
  text: string,
  history: TalkHistoryMessage[],
): Promise<string> {
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
