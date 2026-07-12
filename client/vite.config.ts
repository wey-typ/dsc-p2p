import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

// Version string baked in at build time (shown on the home screen footer).
function buildInfo(): string {
  const version = JSON.parse(readFileSync(path.resolve(dir, "../package.json"), "utf8")).version;
  let sha = "dev";
  try {
    sha = execSync("git rev-parse --short HEAD", { cwd: dir }).toString().trim();
  } catch {
    /* not a git checkout */
  }
  const date = new Date().toISOString().slice(0, 10);
  return `v${version} · ${sha} · ${date}`;
}

// Alias the shared engine to its TS source so Vite transpiles it as project code
// (avoids a separate build step for the shared workspace).
export default defineConfig({
  plugins: [react()],
  define: { __BUILD_INFO__: JSON.stringify(buildInfo()) },
  resolve: {
    alias: {
      "@dsc/shared": path.resolve(dir, "../shared/src/index.ts"),
    },
  },
  server: {
    fs: { allow: [path.resolve(dir, "..")] },
    proxy: {
      // In dev, forward Socket.IO + REST to the game server on :3000.
      "/socket.io": { target: "http://localhost:3000", ws: true },
      "/api": { target: "http://localhost:3000" },
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
