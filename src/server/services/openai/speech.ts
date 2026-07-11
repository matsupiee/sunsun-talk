import { VOICE_INSTRUCTIONS } from "../../domain/character";
import type { Env } from "../../types";

const OPENAI_BASE_URL = "https://api.openai.com/v1";

export interface GeneratedSpeech {
  contentType: string;
  dataUrl: string;
}

export async function generateSpeech(env: Env, text: string): Promise<GeneratedSpeech | null> {
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
      instructions: VOICE_INSTRUCTIONS,
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
