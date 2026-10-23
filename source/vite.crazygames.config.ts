import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Static build for CrazyGames: `npm run build:crazygames` → dist-crazygames/
 * Zip the *contents* of dist-crazygames (index.html at the zip root) and upload it
 * in the CrazyGames Developer Portal. All paths are relative, as CrazyGames requires.
 */
export default defineConfig({
  root: fileURLToPath(new URL("./crazygames", import.meta.url)),
  base: "./",
  publicDir: false,
  plugins: [viteReact(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: {
    outDir: fileURLToPath(new URL("./dist-crazygames", import.meta.url)),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
  },
});
