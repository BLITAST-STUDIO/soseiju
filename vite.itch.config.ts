import { cpSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const root = resolve(import.meta.dirname);
const outDir = resolve(root, "dist-itch");

function copyPlayAssets(): Plugin {
  return {
    name: "soseiju-itch-assets",
    closeBundle() {
      cpSync(resolve(root, "public/bgm"), resolve(outDir, "bgm"), { recursive: true });
      cpSync(resolve(root, "public/world"), resolve(outDir, "world"), { recursive: true });
      cpSync(resolve(root, "public/favicon.svg"), resolve(outDir, "favicon.svg"));
    },
  };
}

export default defineConfig({
  base: "./",
  root: resolve(root, "itch"),
  publicDir: false,
  plugins: [react(), tailwindcss(), copyPlayAssets()],
  resolve: {
    alias: { "@": resolve(root, "src") },
  },
  build: {
    outDir,
    emptyOutDir: true,
    assetsDir: "assets",
  },
});
