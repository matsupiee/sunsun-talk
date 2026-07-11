import type { ReplyResponse } from "../../api-contracts/talk";
import { replyFor } from "../domain/fallbackReplies";
import type { ServerApp } from "../types";

export function registerReplyRoute(app: ServerApp) {
  app.post("/api/reply", async (c) => {
    const body = (await c.req.json<{ text?: unknown }>().catch(() => ({}))) as { text?: unknown };
    const text = typeof body.text === "string" ? body.text : "";
    const response: ReplyResponse = {
      input: text,
      reply: replyFor(text),
    };

    return c.json(response);
  });
}
