import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative asset paths: the app is served from projects.tanmoybh.com/archboard-3d/.
  base: "./",
  server: { port: 5173, host: "127.0.0.1" },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 900,
    // Two pages: the editor, and the read-only viewer that is embedded elsewhere.
    rollupOptions: { input: { main: resolve(__dirname, "index.html"), view: resolve(__dirname, "view/index.html") } },
  },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
