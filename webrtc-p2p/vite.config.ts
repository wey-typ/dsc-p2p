import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

// Alias the shared engine to its TS source so Vite transpiles it (same trick as the LAN client).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@dsc/shared": path.resolve(dir, "../shared/src/index.ts") },
  },
  server: { fs: { allow: [path.resolve(dir, "..")] } },
  build: { outDir: "dist", emptyOutDir: true },
});
