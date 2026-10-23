import * as THREE from "three";
import { CELL } from "@/game/core/content";
import groundUrl from "../models/lol-ground.png?url";

/**
 * 1v1 Build Fights arena: the 1v1.LOL build-fight map ("NormalMap"), used with permission. It is a single
 * 100 x 100 m slab of the game's checkered "Ground08" grass floating under an open sky, its texture repeated
 * ten times each way (offset a quarter tile) so every check lines up with a 5 m build square.
 */
export const ARENA_HALF = 50; // the original 100 m floor
export const ARENA_SPAWN = CELL * 7; // spawns 35 m from the middle, 70 m apart

export function buildArena() {
  const group = new THREE.Group();
  const H = ARENA_HALF;

  const tex = new THREE.TextureLoader().load(groundUrl);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 10);
  tex.offset.set(0.25, 0.25);
  tex.anisotropy = 8;
  // the original floor is a Unity cube 100 x 1 x 100 with its top at y = 0
  const top = new THREE.MeshLambertMaterial({ map: tex, emissive: new THREE.Color(0.14, 0.14, 0.14), emissiveMap: tex });
  const sideTex = tex.clone();
  sideTex.repeat.set(10, 0.1);
  const side = new THREE.MeshLambertMaterial({ map: sideTex, color: "#cfd8c4" });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(H * 2, 1, H * 2), [side, side, top, side, side, side]);
  floor.position.y = -0.5;
  floor.receiveShadow = true;
  floor.name = "arena-floor";
  group.add(floor);

  // Unity's default sky shows its grey-brown "ground colour" below the horizon: a far disc stands in for it
  const below = new THREE.Mesh(new THREE.CircleGeometry(1400, 48), new THREE.MeshBasicMaterial({ color: "#5e5957", fog: false }));
  below.rotation.x = -Math.PI / 2;
  below.position.y = -160;
  group.add(below);

  return {
    group,
    floor,
    update(_time: number) {},
  };
}
