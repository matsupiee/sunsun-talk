import type { Hono } from "hono";

export interface Env {
  OPENAI_API_KEY?: string;
  OPENAI_TEXT_MODEL?: string;
  OPENAI_TTS_MODEL?: string;
  OPENAI_TTS_VOICE?: string;
}

export type ServerApp = Hono<{ Bindings: Env }>;
