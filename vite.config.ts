import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative asset paths: the app is served from projects.tanmoybh.com/archboard-3d/.
  base: "./",
  server: { port: 5173, host: "127.0.0.1" },
  build: { target: "es2022", chunkSizeWarningLimit: 900 },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
