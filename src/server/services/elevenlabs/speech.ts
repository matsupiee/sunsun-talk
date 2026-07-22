import type { Env } from "../../types";

const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";
const DEFAULT_MODEL_ID = "eleven_multilingual_v2";
const DEFAULT_OUTPUT_FORMAT = "mp3_44100_128";

export interface GeneratedSpeech {
  contentType: string;
  dataUrl: string;
}

function audioContentTypeFor(outputFormat: string) {
  if (outputFormat.startsWith("mp3_")) return "audio/mpeg";
  if (outputFormat.startsWith("opus_")) return "audio/ogg";
  if (outputFormat.startsWith("pcm_")) return "audio/pcm";
  if (outputFormat.startsWith("ulaw_")) return "audio/basic";
  if (outputFormat.startsWith("alaw_")) return "audio/x-alaw";
  return "audio/mpeg";
}

function dataUrlForAudio(audio: ArrayBuffer, contentType: string) {
  const bytes = new Uint8Array(audio);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }

  return `data:${contentType};base64,${btoa(binary)}`;
}

async function errorPreviewFor(response: Response) {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  const maxBytes = 512;
  let totalBytes = 0;

  try {
    while (totalBytes < maxBytes) {
      const { done, value } = await reader.read();
      if (done || !value) break;

      const remainingBytes = maxBytes - totalBytes;
      const chunk = value.byteLength > remainingBytes ? value.slice(0, remainingBytes) : value;
      chunks.push(chunk);
      totalBytes += chunk.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(bytes).slice(0, 240);
}

export async function generateSpeech(
  env: Env,
  text: string,
): Promise<GeneratedSpeech | null> {
  if (!env.ELEVENLABS_API_KEY && !env.ELEVENLABS_VOICE_ID) return null;
  if (!env.ELEVENLABS_API_KEY || !env.ELEVENLABS_VOICE_ID) {
    throw new Error("ElevenLabs speech requires ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID.");
  }

  const voiceId = encodeURIComponent(env.ELEVENLABS_VOICE_ID);
  const outputFormat = env.ELEVENLABS_OUTPUT_FORMAT || DEFAULT_OUTPUT_FORMAT;
  const response = await fetch(
    `${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}?output_format=${encodeURIComponent(outputFormat)}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "xi-api-key": env.ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text,
        model_id: env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL_ID,
      }),
    },
  );

  if (!response.ok) {
    const detail = await errorPreviewFor(response).catch(() => "");
    throw new Error(`ElevenLabs speech failed: ${response.status} ${detail.slice(0, 240)}`);
  }

  const audio = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") || audioContentTypeFor(outputFormat);
  return {
    contentType,
    dataUrl: dataUrlForAudio(audio, contentType),
  };
}
