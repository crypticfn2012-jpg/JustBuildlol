# Build Battle: Driftwood Royale

A browser build-and-shoot game in the style of Fortnite. It has two modes:

- **Driftwood Royale**: a 16-player battle royale (you + 15 bots) on Driftwood Isle. You drop in from the drop ship, loot chests, drive cars, build and survive the storm.
- **1v1 Build Fights**: the 1v1.LOL build-fight map (a 100 m checkered grass slab under open sky) against a rival bot. You get full mats and a gold loadout, the first to 5 rounds wins, and builds reset every round.

## What's in this folder

| Folder | What it is |
| --- | --- |
| `web/` | **The finished game, ready to put on any website.** Plain static files (HTML, JS, CSS, models and fonts), with no server code and no outside services. All paths are relative, so it works from a sub-folder too. |
| `crazygames/` | The same game built for CrazyGames, with their SDK hooks for ads and gameplay events. Zip the *contents* of this folder and upload it as an HTML5 game. |
| `run-locally/` | Double-click launchers that play the `web/` build on your own computer. |
| `source/` | The full source code, for when you want to change and rebuild the game. |
| `screenshots/` | The current lobby, mode select, HUD (desktop and mobile) and pause screen. |

## Play it on your computer

The game needs to be opened through a local web server. Opening `web/index.html` directly with a double-click won't work, because browsers block game modules on `file://`.

- **Windows:** double-click `run-locally/Play on Windows.bat`. It starts a tiny server (PowerShell, nothing to install) and opens http://localhost:8080. Close the black window to stop it.
- **Mac / Linux:** run `sh run-locally/play-mac-linux.sh` (it uses the Python 3 that comes with the system), then open http://localhost:8080.

## Put it on the web later

Upload **everything inside `web/`** (not the folder itself) to any static host:

- **Netlify Drop:** go to app.netlify.com/drop and drag the `web` folder onto the page. You get a live link straight away.
- **GitHub Pages:** put the contents of `web/` in a repository (or its `docs/` folder), then turn on Pages in Settings → Pages.
- **itch.io:** zip the contents of `web/` (with `index.html` at the top level of the zip). Create a new project, set *Kind of project* to **HTML**, upload the zip and tick *This file will be played in the browser*. A good embed size is 1280 × 720 with fullscreen enabled.
- **Your own site:** copy `web/` into any folder on the server, for example `yoursite.com/driftwood/`.
- **CrazyGames:** zip the contents of `crazygames/` and upload it in the CrazyGames developer portal.

Saves (skins, gold, battle pass progress and settings) are kept in each player's browser (localStorage). No account or backend is needed.

## Change and rebuild the game

You need Node.js 20 or newer.

```bash
cd source
npm install
npm run build:web          # builds to source/dist-web  → copy it over web/
npm run build:crazygames   # builds the CrazyGames version
npm run dev:web            # live dev server at http://localhost:8080
```

### Where things are in the source

```
source/src/
  game/
    core/       engine.ts (match loop, combat, building, storm, bots), content.ts (modes, weapons, cosmetics), save.ts, audio.ts
    world/      island.ts (Driftwood Isle), arena.ts (1v1 arena), scenery.ts, ferry.ts (drop ship), assets.ts
    player/     character.ts (rig, two-handed holds, pickaxe swings), glider.ts, preview.ts, thumbs.ts
    building/   edits.ts (wall / floor / stair / cone edits), lolBuilds.ts + lolData.ts (the 1v1.LOL build pieces)
    vehicles/   vehicles.ts
    models/     guns.glb, trees.glb, cars.glb, worker.glb, lol-builds.png
  components/game/   GameApp.tsx (lobby, mode select, HUD, settings), Cosmetics.tsx (shop, locker, battle pass)
  web/main.tsx       entry for the plain web build
  crazygames/        entry for the CrazyGames build
  fonts.css          self-hosted fonts (Barlow Condensed, Lilita One, Nunito; SIL Open Font License)
web/                 index.html, manifest and icon for the web build
crazygames/          index.html for the CrazyGames build
```

Credits for the 3D models are in `source/CREDITS.md`.

## Controls (default)

| Action | Key |
| --- | --- |
| Move / jump / sprint / crouch | WASD / Space / Shift / Z |
| Backpack (rearrange weapon slots) | I |
| Shoot / aim down sights (scoped guns zoom in) | Left mouse / Right mouse |
| Weapons | 1 to 6 |
| Wall / floor / stairs / cone | R / F / E / C |
| Change material | V (or right mouse while building) |
| Edit a build | Q, then click tiles, then release to confirm |
| Reset an edited build | Look at it and scroll down (change it under Settings → Controls → Reset edit, or in Keys) |
| Rotate the held build | Scroll up (or middle mouse) |
| Emote wheel | B (moving, jumping or shooting stops an emote). Emotes are bought in the Item Shop; the lobby Emotes button and the Locker preview them on your skin |
| Use / open chests and ammo boxes / enter car | X |
| Reload | Tab |
| Map (battle royale) | M |

On phones and tablets the game shows a joystick and touch buttons, and you tap the hotbar to switch weapons. You can rebind every key in Settings.
