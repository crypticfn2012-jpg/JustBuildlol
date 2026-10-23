import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Standalone web build: `npm run build:web` → dist-web/
 * Every path is relative, so upload the *contents* of dist-web anywhere: Netlify Drop,
 * GitHub Pages, itch.io (zip it as an HTML5 game), or a sub-folder of your own site.
 * The favicon, web manifest and share image in web/ are copied as-is.
 */
export default defineConfig({
  root: fileURLToPath(new URL("./web", import.meta.url)),
  base: "./",
  publicDir: false,
  plugins: [viteReact(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: {
    outDir: fileURLToPath(new URL("./dist-web", import.meta.url)),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
  },
});
