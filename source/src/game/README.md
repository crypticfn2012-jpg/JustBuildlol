# src/game — engine code, one folder per area

| Folder | What lives here |
| --- | --- |
| `core/` | `engine.ts` (match loop, combat, building, storm, bots, HUD state), `content.ts` (modes, weapons, cosmetics, key binds), `save.ts` (local save), `audio.ts` |
| `world/` | `island.ts` (Driftwood Isle: terrain, roads, towns, loot spots), `arena.ts` (1v1 skybox arena), `scenery.ts`, `ferry.ts` (drop ship), `assets.ts` (GLB loading) |
| `player/` | `character.ts` (rig, animation, two-handed weapon holds, pickaxe swings), `glider.ts`, `preview.ts` (lobby character), `thumbs.ts` |
| `building/` | `edits.ts` (wall / floor / stair / cone edit shapes) |
| `vehicles/` | `vehicles.ts` (drivable cars) |
| `models/` | `guns.glb`, `trees.glb`, `cars.glb`, `worker.glb` (credits in `/CREDITS.md`) |

The React UI (lobby, shop, locker, battle pass, HUD) is in `src/components/game/`.
Entry points: `src/web/main.tsx` (plain web build) and `src/crazygames/` (CrazyGames build).
