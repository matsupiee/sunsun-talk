export type TalkRole = "user" | "assistant";
export type TalkMode = "openai" | "fallback";

export interface TalkHistoryMessage {
  role: TalkRole;
  content: string;
}

export interface TalkRequest {
  text: string;
  history?: TalkHistoryMessage[];
}

export interface TalkResponse {
  input?: string;
  reply: string;
  audioUrl: string | null;
  audioContentType?: string | null;
  mode: TalkMode;
  warning?: string;
}

export interface ReplyResponse {
  input: string;
  reply: string;
}
