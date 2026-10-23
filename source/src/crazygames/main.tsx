/**
 * Entry for the CrazyGames build (`npm run build:crazygames`): a static, client-only
 * bundle of the game without the server, auth or PWA layers of the main app.
 */
import { createRoot } from "react-dom/client";
import { GameApp } from "@/components/game/GameApp";
import { crazy, initCrazyGames } from "@/lib/crazygames";
import "../styles.css";

void initCrazyGames().then(() => crazy.loadingStart());

const root = document.getElementById("root");
if (root) createRoot(root).render(<GameApp />);
