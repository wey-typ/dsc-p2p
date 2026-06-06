import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

// Alias the shared engine to its TS source so Vite transpiles it as project code
// (avoids a separate build step for the shared workspace).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@dsc/shared": path.resolve(dir, "../shared/src/index.ts"),
    },
  },
  server: {
    fs: { allow: [path.resolve(dir, "..")] },
    proxy: {
      // In dev, forward Socket.IO to the game server on :3000.
      "/socket.io": { target: "http://localhost:3000", ws: true },
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
