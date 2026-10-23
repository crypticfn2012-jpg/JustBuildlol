import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import treesUrl from "../models/trees.glb?url";
import carsUrl from "../models/cars.glb?url";

/**
 * World models loaded once before a match:
 * - trees.glb: Quaternius "Stylized Nature MegaKit" trees and bushes (CC0), re-baked with small
 *   textures. Each node (oak1, pine2, bush1...) has a `<name>_bark` and/or `<name>_leaves` mesh;
 *   leaves are white so instances can be tinted.
 * - cars.glb: Quaternius "Cars Bundle" cars (CC0), real size, facing +Z. Each node `<name>` has
 *   `<name>_body`, `<name>_wheel_fl`, `<name>_wheel_fr` and `<name>_wheels_back` (the rear axle);
 *   node userData.paint names the body-paint material.
 */
let trees: GLTF | null = null;
let cars: GLTF | null = null;

const load = (url: string) =>
  new Promise<GLTF>((resolve, reject) => {
    new GLTFLoader().load(url, resolve, undefined, reject);
  });

const ready = Promise.all([
  load(treesUrl)
    .then((g) => {
      trees = g;
    })
    .catch(() => undefined),
  load(carsUrl)
    .then((g) => {
      cars = g;
    })
    .catch(() => undefined),
]).then(() => undefined);

export function whenAssetsReady() {
  return ready;
}

export type TreeModel = {
  name: string;
  kind: "oak" | "pine" | "birch" | "bush";
  height: number;
  radius: number;
  bark: { geo: THREE.BufferGeometry; map: THREE.Texture | null } | null;
  leaves: { geo: THREE.BufferGeometry; map: THREE.Texture | null } | null;
};

const treeCache = new Map<string, TreeModel | null>();
/** A tree/bush model by node name (oak1..3, pine1..2, birch1, bush1..2), or null if trees.glb failed to load. */
export function treeModel(name: string): TreeModel | null {
  if (treeCache.has(name)) return treeCache.get(name)!;
  const node = trees?.scene.getObjectByName(name);
  if (!node) {
    treeCache.set(name, null);
    return null;
  }
  const part = (suffix: string) => {
    const m = node.getObjectByName(`${name}_${suffix}`) as THREE.Mesh | undefined;
    if (!m) return null;
    const mat = m.material as THREE.MeshStandardMaterial;
    return { geo: m.geometry, map: mat.map ?? null };
  };
  const u = node.userData as { kind?: TreeModel["kind"]; height?: number; radius?: number };
  const t: TreeModel = { name, kind: u.kind ?? "oak", height: u.height ?? 7, radius: u.radius ?? 2, bark: part("bark"), leaves: part("leaves") };
  treeCache.set(name, t);
  return t;
}

/** Quaternius "Cars Bundle" (CC0) cars baked into cars.glb, facing +Z, wheels as separate pivots. */
export const CAR_MODELS = ["sedan", "hatch", "sports", "coupe", "suv", "taxi", "police"] as const;
export type CarModelName = (typeof CAR_MODELS)[number];

export function hasCars() {
  return !!cars?.scene.getObjectByName("sedan");
}

/** A fresh clone of a car (body + wheels), or null if cars.glb failed to load. */
export function carModel(name: string): THREE.Object3D | null {
  const node = cars?.scene.getObjectByName(name);
  if (!node) return null;
  const c = node.clone(true);
  c.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return c;
}
