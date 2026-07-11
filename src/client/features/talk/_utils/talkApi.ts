import type { TalkHistoryMessage, TalkRequest, TalkResponse } from "../../../../api-contracts/talk";
import { replyFor } from "./localFallback";

export async function remoteTalkFor(
  text: string,
  history: TalkHistoryMessage[] = [],
): Promise<TalkResponse> {
  try {
    const body: TalkRequest = { text, history };
    const response = await fetch("/api/talk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error("Talk API unavailable");

    const data = (await response.json()) as Partial<TalkResponse>;
    if (typeof data.reply === "string") {
      return {
        input: typeof data.input === "string" ? data.input : text,
        reply: data.reply,
        audioUrl: typeof data.audioUrl === "string" ? data.audioUrl : null,
        audioContentType:
          typeof data.audioContentType === "string" ? data.audioContentType : null,
        mode: data.mode === "openai" ? "openai" : "fallback",
      };
    }
  } catch {
    // The Vite-only dev server has no Worker API, so keep local prototyping instant.
  }

  return {
    reply: replyFor(text),
    audioUrl: null,
    mode: "fallback",
  };
}
