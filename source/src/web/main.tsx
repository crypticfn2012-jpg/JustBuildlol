/**
 * Entry for the standalone web build (`npm run build:web` → dist-web/): the game as a plain static
 * site with relative paths, so the folder can be uploaded to any web host (Netlify, GitHub Pages,
 * itch.io, your own server) or a sub-folder of an existing site.
 */
import { createRoot } from "react-dom/client";
import { GameApp } from "@/components/game/GameApp";
import "../styles.css";

const root = document.getElementById("root");
if (root) createRoot(root).render(<GameApp />);
