# Credits

## Gun models

`src/game/models/guns.glb` holds four guns from the **Toon Shooter Game Kit** by Quaternius
(https://quaternius.com/packs/toonshootergamekit.html), released under
**CC0 1.0** (public domain), so no attribution is required; it is given here with thanks.

| In game | Kit model |
|---|---|
| Assault Rifle | AK |
| Shotgun | Shotgun |
| SMG | SMG |
| Sniper Rifle | Sniper |

The models were re-oriented (barrel along +Z, grip at the origin), scaled to real-world
size, and re-exported as one GLB. The muzzle point of each gun is stored in its node's
`extras.muzzle`. The grey body material is recoloured in game by rarity.

## Trees and bushes

`src/game/models/trees.glb` holds trees and bushes from the **Stylized Nature MegaKit** by Quaternius
(https://quaternius.com/packs/stylizednaturemegakit.html), **CC0 1.0**. Used: CommonTree 1/3/5
(oaks), Pine 1/5, Birch 4, Bush Common and Bush Large. Meshes were merged per tree into a
bark and a leaves part, the textures shrunk (bark 256 px, leaves 512 px, made white so the
game can tint them) and canopy shading baked into the vertex colours.

## Cars

`src/game/models/cars.glb` holds the drivable cars from the **Cars Bundle** by Quaternius
(https://poly.pizza/bundle/Cars-Bundle-FE5IWe6OMk), **CC0 1.0**: Normal Car 1 and 2, Sports
Car 1 and 2, SUV, Taxi and Cop. They were turned to face +Z and their front and rear wheels
split into pivots so they can steer and spin. The body paint is recoloured per car in game.

## Everything else

The island, buildings, props, gliders, drop ship ("Driftwood Ferry"), chests and pickaxes
are generated in code in `src/game/`. They are original designs made for this
game. The character model (`src/game/models/worker.glb`) came with the project.

## Items

Ammo boxes, ammo, shield potions, med kits and bandages are modelled in code in
`src/game/core/engine.ts` (no outside models).

## Build pieces

The player build pieces (walls and their edits, floors, stairs, cones and the build door) and
their colour map come from **1v1.LOL** (Justplay), used with the permission of the project owner.
They were exported from the game's data into `src/game/building/lolData.ts` and
`src/game/models/lol-builds.png`, and scaled from 1v1.LOL's 5 m grid to this game's 4 m grid by
`src/game/building/lolBuilds.ts`. The 1v1 arena recreates 1v1.LOL's build-fight map (its "Ground08"
floor texture is `src/game/models/lol-ground.png`). The build and edit logic itself is this game's own code.
