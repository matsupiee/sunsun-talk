import { Hono } from "hono";
import { registerHealthRoute } from "./routes/health";
import { registerReplyRoute } from "./routes/reply";
import { registerTalkRoute } from "./routes/talk";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

registerHealthRoute(app);
registerReplyRoute(app);
registerTalkRoute(app);

app.notFound((c) => {
  return c.json({ error: "Not found" }, 404);
});

export default app;
