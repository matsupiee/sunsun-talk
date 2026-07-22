import type { Hono } from "hono";

export interface Env {
  OPENAI_API_KEY?: string;
  OPENAI_TEXT_MODEL?: string;
  ELEVENLABS_API_KEY?: string;
  ELEVENLABS_VOICE_ID?: string;
  ELEVENLABS_MODEL_ID?: string;
  ELEVENLABS_OUTPUT_FORMAT?: string;
}

export type ServerApp = Hono<{ Bindings: Env }>;
