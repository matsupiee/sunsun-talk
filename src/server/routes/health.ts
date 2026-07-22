import type { ServerApp } from "../types";

export function registerHealthRoute(app: ServerApp) {
  app.get("/api/health", (c) => {
    return c.json({
      ok: true,
      service: "sunsun-talk",
    });
  });
}
