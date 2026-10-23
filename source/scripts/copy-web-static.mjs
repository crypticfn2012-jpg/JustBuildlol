// Copies the static extras of the web build (icon, manifest, share image) next to index.html in dist-web/.
import { copyFileSync } from "node:fs";
for (const f of ["favicon.svg", "manifest.webmanifest", "og-image.jpg"]) copyFileSync(new URL(`../web/${f}`, import.meta.url), new URL(`../dist-web/${f}`, import.meta.url));
console.log("web extras copied");
