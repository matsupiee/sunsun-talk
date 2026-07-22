import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The Cloudflare Worker (src/server/index.ts) serves ./dist as SPA assets and handles
// /api/*. Keep Vite's hashed bundle out of /assets so it never collides with the
// media copied from public/assets.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
    assetsDir: "bundle",
  },
});
