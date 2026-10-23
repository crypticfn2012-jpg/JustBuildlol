import * as THREE from "three";
import { CELL, CELL_H } from "@/game/core/content";
import { LOL_MESH, LOL_WALL_INFO } from "@/game/building/lolData";
import lolTexUrl from "../models/lol-builds.png?url";

/**
 * The 1v1.LOL build pieces (walls and their edits, floors, stairs and cones), placed on this game's grid.
 *
 * The original pieces are 5 m wide with 3.5 m tall walls; here a build cell is CELL wide and CELL_H tall,
 * so every piece is scaled by S across and Y up. Edits pick the matching 1v1.LOL piece and turn or mirror
 * it into place. Tile conventions follow edits.ts:
 *  - walls: bit = row * 3 + col (row 0 at the bottom, col 0 at -x), set bit = tile kept
 *  - floors / stairs: bit = row * 2 + col (row 0 at -z, col 0 at -x)
 *  - cones: corner q = qz * 2 + qx, set bit = corner kept low
 */
export const S = CELL / 5;
export const Y = CELL_H / 3.5;

let tex: THREE.Texture | null = null;
/** The 1v1.LOL build colour map (one atlas for every piece). */
export function lolTexture() {
  if (!tex) {
    tex = new THREE.TextureLoader().load(lolTexUrl);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
  }
  return tex;
}

/** Atlas regions, for this game's own fallback shapes (edits 1v1.LOL has no piece for). */
export const ATLAS_WALL = { u0: 0.007, u1: 0.639, v0: 0.082, v1: 0.524 };
export const ATLAS_FLAT = { u0: 0.647, u1: 0.989, v0: 0.181, v1: 0.52 };
export function atlasUV(g: THREE.BufferGeometry, r: { u0: number; u1: number; v0: number; v1: number }) {
  const uv = g.getAttribute("uv") as THREE.BufferAttribute | undefined;
  if (!uv) return g;
  for (let i = 0; i < uv.count; i++) {
    const u = THREE.MathUtils.clamp(uv.getX(i), 0, 1);
    const v = THREE.MathUtils.clamp(uv.getY(i), 0, 1);
    uv.setXY(i, r.u0 + u * (r.u1 - r.u0), r.v0 + v * (r.v1 - r.v0));
  }
  uv.needsUpdate = true;
  return g;
}

type Xf = {
  mirror?: boolean;
  flipY?: boolean;
  /** quarter turns about +y (three.js convention: (x, z) -> (z, -x) per turn) */
  rot?: number;
  /** vertical mapping from 1v1.LOL units */
  y?: (y: number) => number;
  /** walls keep the original panel depth and centre it on z = dz */
  wall?: boolean;
  dz?: number;
};

function rotK(x: number, z: number, k: number): [number, number] {
  let a = x;
  let b = z;
  for (let i = 0; i < ((k % 4) + 4) % 4; i++) {
    const t = a;
    a = b;
    b = -t;
  }
  return [a, b];
}

/** Build a BufferGeometry in piece space from one 1v1.LOL mesh. */
export function lolGeo(name: string, xf: Xf = {}) {
  const m = LOL_MESH[name];
  if (!m) throw new Error(`missing 1v1.LOL piece ${name}`);
  const n = m.p.length / 3;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const yMap = xf.y ?? ((y: number) => y * Y);
  const dzz = xf.dz ?? 0;
  const zs = xf.wall ? 1 : S;
  const k = xf.rot ?? 0;
  const mx = xf.mirror ? -1 : 1;
  for (let i = 0; i < n; i++) {
    let x = m.p[i * 3]! * mx;
    let y = m.p[i * 3 + 1]!;
    let z = m.p[i * 3 + 2]!;
    if (xf.flipY) y = 3.5 - y;
    y = yMap(y);
    [x, z] = rotK(x * S, z * zs + dzz, k);
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
    // normals: scale by the inverse of the stretch, then turn the same way
    let nx = (m.n[i * 3]! * mx) / S;
    let ny = (m.n[i * 3 + 1]! * (xf.flipY ? -1 : 1)) / Y;
    let nz = m.n[i * 3 + 2]! / zs;
    [nx, nz] = rotK(nx, nz, k);
    const l = Math.hypot(nx, ny, nz) || 1;
    nor[i * 3] = nx / l;
    nor[i * 3 + 1] = ny / l;
    nor[i * 3 + 2] = nz / l;
  }
  // one mirror flips the triangles inside out: swap their winding back
  const flip = !!xf.mirror !== !!xf.flipY;
  const idx = m.i.slice();
  if (flip) for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2]!, idx[i + 1]!];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(m.t, 2));
  g.setIndex(idx);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/* ---------------------------------------------------------------- walls */

export type LolWall = { name: string; mirror?: boolean; flipY?: boolean; door?: number };
const W = (name: string, mirror = false, flipY = false, door?: number): LolWall => ({ name, mirror, flipY, door });
/** Wall edit (kept-tile mask) -> 1v1.LOL wall piece. */
export const LOL_WALLS: Record<number, LolWall> = {
  511: W("Wall_New"),
  493: W("Door_New", false, false, 1),
  475: W("Door_Side_New", false, false, 2),
  502: W("Door_Side_New", true, false, 0),
  495: W("Window_New"),
  479: W("Window_Side_New"),
  503: W("Window_Side_New", true),
  471: W("Double_Window_New"),
  448: W("Arch_New"),
  484: W("Half_Arch_New"),
  457: W("Half_Arch_New", true),
  95: W("Triangle_New"),
  311: W("Triangle_New", true),
  473: W("Triangle_New", false, true),
  500: W("Triangle_New", true, true),
  7: W("Low_Wall_New"),
  63: W("Half_Wall_New"),
  292: W("Side_Wall_New"),
  73: W("Side_Wall_New", true),
  3: W("Small_Low_Wall_New"),
  6: W("Small_Low_Wall_New", true),
  9: W("Small_Side_Wall_New"),
  36: W("Small_Side_Wall_New", true),
  45: W("Half_Wall_Door_New", false, false, 1),
  27: W("Half_Wall_Door_Side_New", false, false, 2),
  54: W("Half_Wall_Door_Side_New", true, false, 0),
  467: W("Door_Window", false, false, 2),
  470: W("Door_Window", true, false, 0),
};

/** The wall panel's centre plane sits at z = lz in piece space. */
export function lolWallGeo(w: LolWall, lz: number) {
  return lolGeo(w.name, { mirror: w.mirror, flipY: w.flipY, wall: true, dz: lz - 0.0495 });
}

/** Collision rectangles in wall space (x across -CELL/2..CELL/2, y up 0..CELL). */
export function lolWallRects(w: LolWall) {
  const info = LOL_WALL_INFO[w.name]!;
  return info.rects.map(([a, b, c, d]) => {
    let x0 = a! * S;
    let x1 = b! * S;
    if (w.mirror) [x0, x1] = [-x1, -x0];
    let y0 = c! * Y;
    let y1 = d! * Y;
    if (w.flipY) [y0, y1] = [CELL_H - y1, CELL_H - y0];
    return { x0, x1, y0, y1 };
  });
}

/** The door opening of a 1v1.LOL door wall, in wall space. */
export function lolDoorRect(w: LolWall) {
  const d = LOL_WALL_INFO[w.name]?.door;
  if (!d) return null;
  let x0 = d[0]! * S;
  let x1 = d[1]! * S;
  if (w.mirror) [x0, x1] = [-x1, -x0];
  return { x0, x1, y0: 0, y1: d[2]! * Y };
}

/** The door leaf, hinged at its left edge (origin at the bottom of the hinge), sized to `width`. */
export function lolDoorLeafGeo(width: number) {
  const g = lolGeo("Door_Only");
  g.computeBoundingBox();
  const b = g.boundingBox!;
  g.translate(-b.min.x, -b.min.y, -(b.min.z + b.max.z) / 2);
  g.scale(width / (b.max.x - b.min.x), 1, 1);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/* ---------------------------------------------------------------- floors */

const tileOf = (x: number, z: number) => (z < 0 ? 0 : 2) + (x < 0 ? 0 : 1);
const TILE_C: [number, number][] = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];
function rotTiles(tiles: number[], k: number, mirror = false) {
  return tiles.map((t) => {
    const [cx, cz] = TILE_C[t]!;
    const [x, z] = rotK(mirror ? -cx : cx, cz, k);
    return tileOf(x, z);
  });
}
const maskOf = (tiles: number[]) => tiles.reduce((m, t) => m | (1 << t), 0);

const FLOOR_BASE: [string, number[]][] = [
  ["Floor_New", [0, 1, 2, 3]],
  ["Floor_Half_New", [0, 2]],
  ["Floor_3_4_New", [0, 1, 2]],
  ["Floor_Corner_New", [3]],
  ["Floor_Bridge_New", [0, 3]],
];
/** Floor edit (kept-tile mask) -> 1v1.LOL floor piece and its turn. */
export function lolFloorFor(mask: number): { name: string; rot: number } | null {
  for (const [name, tiles] of FLOOR_BASE)
    for (let k = 0; k < 4; k++) if (maskOf(rotTiles(tiles, k)) === mask) return { name, rot: k };
  return null;
}

/** Floor slab from 0 to th (the walking height); lips and rails keep their height above it. */
export function lolFloorGeo(f: { name: string; rot: number }, th: number) {
  const T = 0.0991;
  return lolGeo(f.name, { rot: f.rot, y: (y) => (y <= T + 1e-3 ? (Math.max(0, y) / T) * th : th + (y - T) * Y) });
}

/* ---------------------------------------------------------------- stairs */

const STAIR_BASE: [string, number[]][] = [
  ["Ramp_Half_New", [3, 1]],
  ["Ramp_L_shaped_New", [3, 1, 0]],
  ["Ramp_U_shaped_New", [3, 1, 0, 2]],
];
/** A dragged stair path (tiles in climbing order) -> 1v1.LOL stair piece, turn and mirror. */
export function lolStairFor(path: number[]): { name: string; rot: number; mirror: boolean } | null {
  for (const [name, tiles] of STAIR_BASE) {
    if (tiles.length !== path.length) continue;
    for (const mirror of [false, true])
      for (let k = 0; k < 4; k++) {
        const t = rotTiles(tiles, k, mirror);
        if (t.every((v, i) => v === path[i])) return { name, rot: k, mirror };
      }
  }
  return null;
}
/** Plain stairs climb toward +z here; the 1v1.LOL ramp climbs toward -z, so it is turned round. */
export const LOL_RAMP = { name: "Ramp_New", rot: 2, mirror: false };
export function lolStairGeo(s: { name: string; rot: number; mirror: boolean }) {
  return lolGeo(s.name, { rot: s.rot, mirror: s.mirror, y: (y) => y * Y - 0.06 });
}

/* ---------------------------------------------------------------- cones */

const CORNER_C: [number, number][] = TILE_C;
const CONE_BASE: [string, number][] = [
  ["Pyramid_New", 0b1111],
  ["Pyramid_025_New", 0b1101],
  ["Pyramid_075_New", 0b1000],
  ["Pyramid_Half_New", 0b0110],
  ["Pyramid_Ramp_New", 0b1010],
];
/** Cone edit (low-corner mask) -> 1v1.LOL cone piece and its turn. */
export function lolConeFor(mask: number): { name: string; rot: number } | null {
  for (const [name, base] of CONE_BASE) {
    const low = [0, 1, 2, 3].filter((q) => base & (1 << q));
    for (let k = 0; k < 4; k++) {
      const m = low.reduce((acc, q) => {
        const [x, z] = rotK(CORNER_C[q]![0], CORNER_C[q]![1], k);
        return acc | (1 << tileOf(x, z));
      }, 0);
      if (m === mask) return { name, rot: k };
    }
  }
  return null;
}
export function lolConeGeo(c: { name: string; rot: number }) {
  return lolGeo(c.name, { rot: c.rot, y: (y) => Math.max(0, y * Y - 0.08) });
}

/* ---------------------------------------------------------------- rails and lips */

export type Box = { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };

/**
 * Collision for the raised edges of 1v1.LOL floors and stairs (the lips and side rails): sample the
 * upright faces, bin the points into small columns, and keep columns taller than a plain slab edge.
 */
export function railBoxes(g: THREE.BufferGeometry): Box[] {
  const cached = g.userData.rails as Box[] | undefined;
  if (cached) return cached;
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const nor = g.getAttribute("normal") as THREE.BufferAttribute;
  const idx = g.getIndex()!;
  const C = 0.25;
  const cols = new Map<string, { lo: number; hi: number; ix: number; iz: number }>();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let t = 0; t < idx.count; t += 3) {
    const i0 = idx.getX(t);
    const i1 = idx.getX(t + 1);
    const i2 = idx.getX(t + 2);
    if (Math.abs(nor.getY(i0)) > 0.35) continue;
    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1);
    c.fromBufferAttribute(pos, i2);
    const span = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
    const N = Math.max(2, Math.ceil(span / 0.1));
    for (let u = 0; u <= N; u++)
      for (let v = 0; v <= N - u; v++) {
        const wu = u / N;
        const wv = v / N;
        const ww = 1 - wu - wv;
        const x = a.x * wu + b.x * wv + c.x * ww;
        const y = a.y * wu + b.y * wv + c.y * ww;
        const z = a.z * wu + b.z * wv + c.z * ww;
        const ix = Math.floor(x / C);
        const iz = Math.floor(z / C);
        const key = `${ix},${iz}`;
        const col = cols.get(key);
        if (col) {
          col.lo = Math.min(col.lo, y);
          col.hi = Math.max(col.hi, y);
        } else cols.set(key, { lo: y, hi: y, ix, iz });
      }
  }
  const boxes: Box[] = [];
  for (const col of cols.values()) {
    if (col.hi - col.lo < 0.8) continue;
    boxes.push({ x0: col.ix * C, x1: (col.ix + 1) * C, y0: col.lo, y1: col.hi, z0: col.iz * C, z1: (col.iz + 1) * C });
  }
  g.userData.rails = boxes;
  return boxes;
}

/** Walkable shape of edited 1v1.LOL floors: the corner piece is a quarter disc, the bridge a diagonal. */
export function lolFloorSolid(mask: number, lx: number, lz: number) {
  const H = CELL / 2;
  if (Math.abs(lx) > H || Math.abs(lz) > H) return false;
  const bit = tileOf(lx, lz);
  if (mask === 0b1001) return Math.abs(lx - lz) < H;
  if (mask === 0b0110) return Math.abs(lx + lz) < H;
  if (!(mask & (1 << bit))) return false;
  if (mask === 1 || mask === 2 || mask === 4 || mask === 8) {
    const [cx, cz] = TILE_C[bit]!;
    return Math.hypot(lx - cx * H, lz - cz * H) < H;
  }
  return true;
}
