import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

// Version string baked into the bundle at build time (shown in the app footer so
// players can tell which build their installed PWA is running).
function buildInfo(): string {
  const version = JSON.parse(readFileSync(path.resolve(dir, "package.json"), "utf8")).version;
  let sha = "dev";
  try {
    sha = execSync("git rev-parse --short HEAD", { cwd: dir }).toString().trim();
  } catch {
    /* not a git checkout */
  }
  const date = new Date().toISOString().slice(0, 10);
  return `v${version} · ${sha} · ${date}`;
}

// Standalone Vite app. Aliases the shared engine to its TS source, and is an installable,
// offline-capable PWA (so an iPhone can "Add to Home Screen" and host server-less games).
export default defineConfig({
  // GitHub Pages project sites serve under /<repo>/. The deploy workflow sets BASE_PATH;
  // local builds default to "/" (works for Netlify / local preview).
  base: process.env.BASE_PATH || "/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.png", "apple-touch-icon.png"],
      manifest: {
        name: "Deep Sea Crew (P2P)",
        short_name: "Deep Sea Crew",
        description: "Server-less peer-to-peer co-op trick-taking.",
        theme_color: "#04141f",
        background_color: "#04141f",
        display: "standalone",
        orientation: "portrait",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
    }),
  ],
  define: { __BUILD_INFO__: JSON.stringify(buildInfo()) },
  resolve: {
    alias: { "@dsc/shared": path.resolve(dir, "../shared/src/index.ts") },
  },
  server: { fs: { allow: [path.resolve(dir, "..")] } },
  build: { outDir: "dist", emptyOutDir: true },
});
