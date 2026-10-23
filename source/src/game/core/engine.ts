import * as THREE from "three";
import { createAudio, type AudioBus } from "@/game/core/audio";
import { buildFerry } from "@/game/world/ferry";
import { buildGlider, type GliderRig } from "@/game/player/glider";
const _gripA = new THREE.Vector3();
const _skyE = new THREE.Euler();
const _skyQ = new THREE.Quaternion();
const _skyV = new THREE.Vector3();
const _gripB = new THREE.Vector3();
import { ARENA_HALF, ARENA_SPAWN, buildArena } from "@/game/world/arena";
import { SPAWN_BEACH_R, SPAWN_ISLE, SPAWN_WALK_R, buildSpawnIsland, spawnColliders, spawnHeight, spawnPoints } from "@/game/world/spawnIsland";
import { ATLAS_FLAT, ATLAS_WALL, LOL_RAMP, LOL_WALLS, atlasUV, lolConeFor, lolConeGeo, lolDoorLeafGeo, lolFloorFor, lolFloorGeo, lolFloorSolid, lolStairFor, lolStairGeo, lolTexture, lolWallGeo, railBoxes } from "@/game/building/lolBuilds";
import { doorRect, roofGeo, roofHeight, stairFromPath, stairGeo, stairHeight, stairKey, stairTileHeight, wallGeo, wallShape, type StairSeg } from "@/game/building/edits";
import { doorPos, driveVehicle, idleVehicle, rayVehicle, seatPos, spawnVehicle, vehicleRoof, vehicleTouches, type Vehicle, type VehicleEnv } from "@/game/vehicles/vehicles";
import { animateRig, animateWeapon, createCharacter, fillWeapon, gliderReachOffset, gunLootGeometry, holdGlider, holdWeapon, kickWeapon, GUN_KIND_LIST, GUN_RARITY_BODY, type Rig } from "@/game/player/character";
import { buildIsland, type Harvestable, type Island, type LootSpot, type StaticBox, type StaticRamp } from "@/game/world/island";
import { addSky, makeEditArrowMap, makeEditTileMap, makeGrassMap, makeSandMap, makeWoodMap, type BuildMat } from "@/game/world/scenery";
export type { BuildMat } from "@/game/world/scenery";
import {
  CELL,
  CELL_H,
  EMOTES,
  GEAR,
  gearById,
  modeById,
  skinById,
  type ModeDef,
  type Settings,
} from "@/game/core/content";

export type PadInput = {
  /** Set by tapping a hotbar slot on touch screens; the engine selects it and clears it. */
  slot?: number;
  moveX: number;
  moveY: number;
  lookX: number;
  lookY: number;
  jump: boolean;
  fire: boolean;
  aim: boolean;
  crouch: boolean;
  edit: boolean;
  reload: boolean;
  wall: boolean;
  floor: boolean;
  ramp: boolean;
  roof: boolean;
  /** Cycle wood → brick → metal (touch "Mat" button). Optional so older callers keep working. */
  material?: boolean;
  /** Open chests / use (touch "Use" button). */
  interact?: boolean;
};

export type Floater = { x: number; y: number; text: string; crit: boolean; life: number };
export type Feed = { text: string; life: number };

export type HudState = {
  /** Set while the player drives: speed in km/h and the car's health. */
  vehicle: { speed: number; hp: number; max: number } | null;
  /** Aim-down-sights blend 0..1, and whether the sniper scope overlay is up. */
  ads: number;
  scope: "sniper" | "ar" | null;
  /** Interaction prompt outside battle royale (e.g. a build door). */
  prompt: string;
  /** 1v1 round score. */
  duel: { you: number; them: number; round: number; limit: number } | null;
  /** Battle royale warm-up on the spawn island: seconds until the drop ship leaves. */
  pregame: { t: number } | null;
  /** Hotbar: which slots hold something, their rarity, colours and the ammo in each gun's magazine. */
  inv: { owned: boolean[]; rarity: number[]; colors: string[]; ammo: (number | null)[] };
  /** Backpack: hotbar order (position -> item), spare ammo by type and meds. */
  bag: { open: boolean; order: number[]; reserve: { ar: number; shotgun: number; smg: number; sniper: number }; bandages: number; medkits: number };
  /** Damage direction indicators: screen angle (radians, 0 = straight ahead, clockwise) and fade 0..1. */
  hurtDirs: { ang: number; a: number }[];
  /** "ELIMINATED <name>" pop under the crosshair after the player gets a kill. */
  elimPop: { name: string; t: number } | null;
  /** Camera heading in degrees (0 = north, clockwise) for the compass strip. */
  heading: number;
  hp: number;
  shield: number;
  wood: number;
  infiniteWood: boolean;
  mat: BuildMat;
  mats: Record<BuildMat, number>;
  slot: number;
  build: BuildKind | null;
  rot: number;
  mag: number;
  reserve: number;
  reloading: boolean;
  weapon: string;
  elims: number;
  alive: number;
  total: number;
  inStorm: boolean;
  stormDps: number;
  stormEta: number;
  hit: number;
  head: boolean;
  hurt: number;
  gap: number;
  banner: string;
  edit: boolean;
  fps: number;
  phase: "countdown" | "live" | "end";
  countdown: number;
  scoreBlue: number;
  scoreRed: number;
  teams: boolean;
  healing: number;
  heals: number;
  floaters: Floater[];
  feed: string[];
  aimScore: number;
  aimStreak: number;
  pointerLocked: boolean;
  minimap: {
    px: number;
    pz: number;
    yaw: number;
    bounds: number;
    storm: { x: number; z: number; r: number } | null;
    next?: { x: number; z: number; r: number } | null;
    bg?: string | null;
    /** The spawn island (drawn on the minimap during the warm-up). */
    isle?: { x: number; z: number; r: number } | null;
    dots: { x: number; z: number; team: number }[];
  };
  buildInfo: { hp: number; max: number; building: boolean; mat: BuildMat } | null;
  royale: RoyaleHud | null;
  paused: boolean;
};

export type RoyaleHud = {
  stage: "bus" | "fall" | "glide" | "ground";
  canJump: boolean;
  busLeft: number;
  bus: { x0: number; z0: number; x1: number; z1: number; x: number; z: number } | null;
  prompt: string;
  owned: boolean[];
  rarity: number[];
  rarityColors: string[];
  bigMap: boolean;
  stormStage: "pre" | "wait" | "shrink" | "done";
};

export type MatchResult = {
  win: boolean;
  title: string;
  subtitle: string;
  elims: number;
  placement: number;
  shots: number;
  hits: number;
  streak: number;
  gold: number;
  xp: number;
  aimScore: number;
};

export type BuildKind = "wall" | "floor" | "ramp" | "pyramid";
/** Height of a cone's flat edit grid above the cone's base. */
const CONE_GRID_Y = 0.1;

type Piece = {
  kind: BuildKind;
  ix: number;
  iy: number;
  iz: number;
  rot: number;
  /** World Y of the piece bottom. Shared by neighbors so walls, floors, and stairs meet. */
  base: number;
  mask: number;
  hp: number;
  max: number;
  owner: number;
  team: number;
  mat: BuildMat;
  /** Seconds of construction left; the piece shows as a frosted frame until this hits 0. */
  buildT: number;
  buildDur: number;
  /** Seconds since placement, drives the pop-in. */
  age: number;
  /** Hit flash / shake timer. */
  hitT: number;
  /** Edited stairs: the path the stairs follow (undefined = regular full-width stairs). */
  stair?: StairSeg[];
  /** Edited walls: doors in the door columns (t animates 0 shut .. 1 open; dir is the swing side). */
  doors?: { col: number; t: number; open: boolean; dir: number }[];
  /** Lowest ground under a piece standing on a slope (cached): a foundation fills the gap down to it. */
  footLo?: number | null;
};

const MAT_HP: Record<BuildMat, number> = { wood: 1, brick: 1.5, metal: 2 };
const MAT_TIME: Record<BuildMat, number> = { wood: 1.4, brick: 2.5, metal: 3.6 };
const MAT_ORDER: BuildMat[] = ["wood", "brick", "metal"];

type AABB = { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };

type Actor = {
  id: number;
  name: string;
  team: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  hp: number;
  shield: number;
  alive: boolean;
  respawn: number;
  mats: number;
  shootCd: number;
  think: number;
  strafe: number;
  coverCd: number;
  aggro: number;
  flash: number;
  grounded: boolean;
  rig: Rig;
  label: THREE.Sprite;
  target: boolean;
  /* battle royale */
  drop?: "bus" | "fall" | "glide" | null;
  dropAt?: number;
  tx?: number;
  tz?: number;
  gun?: number | null;
  rarity?: number;
  heals?: number;
  goalX?: number;
  goalZ?: number;
  goalT?: number;
  stuckT?: number;
  px?: number;
  pz?: number;
  foe?: number;
  react?: number;
  lootI?: number;
  skip?: Set<number>;
  path?: [number, number, number][];
  glider?: GliderRig;
  /** 1v1 opponent brain. */
  duelAI?: DuelAI;
  patrol: number;
  homeX: number;
  homeZ: number;
};

type DuelAI = {
  buildCd: number;
  climbing: boolean;
  rampBase: number;
  ramps: number;
  cx: number;
  cz: number;
  rot: number;
  boxT: number;
  boxCd: number;
  prevHp: number;
  hurtAgo: number;
  jumpCd: number;
  switchT: number;
};
const freshDuelAI = (): DuelAI => ({ buildCd: 1, climbing: false, rampBase: 0, ramps: 0, cx: 0, cz: 0, rot: 0, boxT: 0, boxCd: 4, prevHp: 200, hurtAgo: 9, jumpCd: 2, switchT: 0 });

type Drop = { kind: "shield" | "wood"; x: number; y: number; z: number; mesh: THREE.Mesh; life: number };

const TH = 0.28;
const PYR_H = CELL_H * 0.52; // the 1v1.LOL cone's height on this grid
const PYR_T = 0.34;

function fullMask(kind: BuildKind) {
  // Fortnite grids: walls edit as 3x3 tiles; floors, stairs and cones as 2x2
  return kind === "wall" ? 0b111111111 : 0b1111;
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _gunDir = new THREE.Vector3();
const _aimPt = new THREE.Vector3();
const _rayO = new THREE.Vector3();
const _rayD = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _eul = new THREE.Euler();

type RayHit = { t: number; nx: number; ny: number; nz: number; x: number; y: number; z: number };

function rayAabb(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
): RayHit | null {
  let t0 = 0;
  let t1 = 48;
  let enx = 0;
  let eny = 0;
  let enz = 0;
  const slabs: [number, number, number, number, 0 | 1 | 2][] = [
    [ox, dx, x0, x1, 0],
    [oy, dy, y0, y1, 1],
    [oz, dz, z0, z1, 2],
  ];
  for (const [o, d, min, max, axis] of slabs) {
    if (Math.abs(d) < 1e-8) {
      if (o < min || o > max) return null;
      continue;
    }
    let ta = (min - o) / d;
    let tb = (max - o) / d;
    let na = -1;
    let nb = 1;
    if (ta > tb) {
      const ts = ta;
      ta = tb;
      tb = ts;
      const ns = na;
      na = nb;
      nb = ns;
    }
    if (ta > t0) {
      t0 = ta;
      enx = 0;
      eny = 0;
      enz = 0;
      if (axis === 0) enx = na;
      else if (axis === 1) eny = na;
      else enz = na;
    }
    if (tb < t1) t1 = tb;
    if (t0 > t1) return null;
  }
  if (t0 < 0.08 || t0 > 36) return null;
  return { t: t0, nx: enx, ny: eny, nz: enz, x: ox + dx * t0, y: oy + dy * t0, z: oz + dz * t0 };
}
const _m = new THREE.Matrix4();
const _mw = new THREE.Matrix4();
const _mr = new THREE.Matrix4();
const _ml = new THREE.Matrix4();
const _ms = new THREE.Matrix4();

function smoothstep(a: number, b: number, t: number) {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}


function angDelta(a: number, b: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function faceBox(thin: "y" | "z") {
  return tileBox(thin, 0, 0, 1, 1);
}

function tileBox(axis: "y" | "z", u0: number, v0: number, u1: number, v1: number) {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const uv = g.getAttribute("uv") as THREE.BufferAttribute;
  const big = axis === "z" ? [4, 5] : [2, 3];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      if (big.includes(f)) {
        const u = uv.getX(i);
        const v = uv.getY(i);
        uv.setXY(i, u0 + u * (u1 - u0), v0 + v * (v1 - v0));
      } else uv.setXY(i, 0.02, 0.5);
    }
  }
  uv.needsUpdate = true;
  return g;
}

function pushTri(
  pos: number[],
  nor: number[],
  uv: number[],
  a: number[],
  b: number[],
  c: number[],
  ua: number[],
  ub: number[],
  uc: number[],
  inside?: number[],
) {
  const ax = b[0]! - a[0]!;
  const ay = b[1]! - a[1]!;
  const az = b[2]! - a[2]!;
  const bx = c[0]! - a[0]!;
  const by = c[1]! - a[1]!;
  const bz = c[2]! - a[2]!;
  let nx = ay * bz - az * by;
  let ny = az * bx - ax * bz;
  let nz = ax * by - ay * bx;
  if (inside) {
    const mx = (a[0]! + b[0]! + c[0]!) / 3 - inside[0]!;
    const my = (a[1]! + b[1]! + c[1]!) / 3 - inside[1]!;
    const mz = (a[2]! + b[2]! + c[2]!) / 3 - inside[2]!;
    if (nx * mx + ny * my + nz * mz < 0) {
      pushTri(pos, nor, uv, a, c, b, ua, uc, ub);
      return;
    }
  }
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len;
  ny /= len;
  nz /= len;
  const pts = [a, b, c];
  const uvs = [ua, ub, uc];
  for (let i = 0; i < 3; i++) {
    const p = pts[i]!;
    const u = uvs[i]!;
    pos.push(p[0]!, p[1]!, p[2]!);
    nor.push(nx, ny, nz);
    uv.push(u[0]!, u[1]!);
  }
}

function geoFrom(pos: number[], nor: number[], uv: number[]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/**
 * One quarter of a stair piece, built as real steps like Fortnite's stairs (4 steps per quarter, 8 per piece)
 * with a sloped underside. Tile bit = row * 2 + col; row climbs toward +z, col runs across the width.
 * Treads sit at the slope height of each step's middle, so walking on the smooth collision slope lines up.
 */
function rampTile(col: number, row: number) {
  const hw = CELL / 2;
  const x0 = -CELL / 2 + col * hw;
  const x1 = x0 + hw;
  const z0 = -CELL / 2 + row * hw;
  const z1 = z0 + hw;
  const STEPS = 4;
  const dz = hw / STEPS;
  const THICK = 0.42;
  const slope = (z: number) => ((z + CELL / 2) / CELL) * CELL_H;
  const under0 = Math.max(0.02, slope(z0) - THICK);
  const under1 = Math.max(0.02, slope(z1) - THICK);
  const under = (z: number) => under0 + ((z - z0) / (z1 - z0)) * (under1 - under0);
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const xm = (x0 + x1) / 2;
  const trim = [0.02, 0.5];
  const u0 = 0.06 + ((x0 + CELL / 2) / CELL) * 0.88;
  const u1 = 0.06 + ((x1 + CELL / 2) / CELL) * 0.88;
  const quad = (a: number[], b: number[], c: number[], d: number[], inside: number[], ua: number[], ub: number[], uc: number[], ud: number[]) => {
    pushTri(pos, nor, uv, a, b, c, ua, ub, uc, inside);
    pushTri(pos, nor, uv, a, c, d, ua, uc, ud, inside);
  };
  let prevH = 0.02;
  for (let k = 0; k < STEPS; k++) {
    const za = z0 + k * dz;
    const zb = za + dz;
    const h = slope((za + zb) / 2);
    const lo = row === 0 && k === 0 ? 0.02 : Math.max(under(za), h - dz);
    const va = 0.06 + ((za + CELL / 2) / CELL) * 0.88;
    const vb = 0.06 + ((zb + CELL / 2) / CELL) * 0.88 - 0.02;
    quad([x0, h, za], [x1, h, za], [x1, h, zb], [x0, h, zb], [xm, h - 1, (za + zb) / 2], [u0, va], [u1, va], [u1, vb], [u0, vb]);
    // risers show the same planks as the treads (like the walls and floors)
    if (h - lo > 0.01) quad([x0, lo, za], [x1, lo, za], [x1, h, za], [x0, h, za], [xm, (lo + h) / 2, za + 1], [u0, 0.42], [u1, 0.42], [u1, 0.5], [u0, 0.5]);
    const ba = Math.min(under(za), h - 0.04);
    const bb = Math.min(under(zb), h - 0.04);
    for (const [x, dir] of [
      [x0, 1],
      [x1, -1],
    ] as const) {
      quad([x, ba, za], [x, bb, zb], [x, h, zb], [x, h, za], [x + dir, (ba + h) / 2, (za + zb) / 2], trim, trim, trim, trim);
    }
    prevH = h;
  }
  const endLo = under(z1);
  if (prevH - endLo > 0.01) quad([x0, endLo, z1], [x1, endLo, z1], [x1, prevH, z1], [x0, prevH, z1], [xm, (endLo + prevH) / 2, z1 - 1], trim, trim, trim, trim);
  quad([x0, under0, z0], [x1, under0, z0], [x1, under1, z1], [x0, under1, z1], [xm, (under0 + under1) / 2 + 1, (z0 + z1) / 2], [u0, 0.1], [u1, 0.1], [u1, 0.9], [u0, 0.9]);
  // stringer: a light frame beam along the stairs' outer edge, the same trim the walls and floors have
  const beam = [0.5, 0.975];
  const sx = col === 0 ? x0 : x1;
  const ix = col === 0 ? x0 + 0.2 : x1 - 0.2;
  const top = (z: number) => slope(z) + 0.14;
  const bot = (z: number) => Math.max(0.02, slope(z) - 0.42);
  const out = col === 0 ? -1 : 1;
  const xo = sx + out * 0.03;
  quad([xo, top(z0), z0], [ix, top(z0), z0], [ix, top(z1), z1], [xo, top(z1), z1], [(xo + ix) / 2, top((z0 + z1) / 2) - 1, (z0 + z1) / 2], beam, beam, beam, beam);
  quad([xo, bot(z0), z0], [xo, bot(z1), z1], [xo, top(z1), z1], [xo, top(z0), z0], [xo - out, (top(z0) + bot(z0)) / 2, (z0 + z1) / 2], beam, beam, beam, beam);
  quad([ix, bot(z0), z0], [ix, bot(z1), z1], [ix, top(z1), z1], [ix, top(z0), z0], [ix + out, (top(z0) + bot(z0)) / 2, (z0 + z1) / 2], beam, beam, beam, beam);
  quad([xo, bot(z0), z0], [ix, bot(z0), z0], [ix, bot(z1), z1], [xo, bot(z1), z1], [(xo + ix) / 2, bot((z0 + z1) / 2) + 1, (z0 + z1) / 2], beam, beam, beam, beam);
  if (row === 1) quad([xo, bot(z1), z1], [ix, bot(z1), z1], [ix, top(z1), z1], [xo, top(z1), z1], [(xo + ix) / 2, (top(z1) + bot(z1)) / 2, z1 - 1], beam, beam, beam, beam);
  return geoFrom(pos, nor, uv);
}

/**
 * Roof / cone: a hollow wooden pyramid shell, split into four quarters (bit = qz * 2 + qx).
 * Quarter bit 0 is -x/-z, bit 1 is +x/-z, bit 2 is -x/+z, bit 3 is +x/+z.
 */
function pyramidGeo(mask = 0b1111) {
  const H = PYR_H;
  const a = CELL / 2;
  const k = 1 - PYR_T / H;
  const d = a * k;
  const yb = 0.02;
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const top = [0.55, 0.08];
  const left = [0.22, 0.92];
  const right = [0.94, 0.92];
  const trim = [0.05, 0.5];
  const cen = (p: number[], q: number[], r: number[]) => [(p[0]! + q[0]! + r[0]!) / 3, (p[1]! + q[1]! + r[1]!) / 3, (p[2]! + q[2]! + r[2]!) / 3];
  for (let q = 0; q < 4; q++) {
    if ((mask & (1 << q)) === 0) continue;
    const sx = q % 2 === 0 ? -1 : 1;
    const sz = q < 2 ? -1 : 1;
    const O = [0, H, 0];
    const e1 = [sx * a, yb, 0];
    const e2 = [sx * a, yb, sz * a];
    const e3 = [0, yb, sz * a];
    const I = [0, H * k, 0];
    const i1 = [sx * d, yb, 0];
    const i2 = [sx * d, yb, sz * d];
    const i3 = [0, yb, sz * d];
    const mid = [sx * a * 0.3, H * 0.18, sz * a * 0.3];
    pushTri(pos, nor, uv, O, e1, e2, top, left, right, mid);
    pushTri(pos, nor, uv, O, e2, e3, top, left, right, mid);
    pushTri(pos, nor, uv, I, i1, i2, top, left, right, cen(O, e1, e2));
    pushTri(pos, nor, uv, I, i2, i3, top, left, right, cen(O, e2, e3));
    const sideZ = [sx * a * 0.5, H * 0.3, sz * 1];
    pushTri(pos, nor, uv, O, e1, i1, trim, trim, trim, sideZ);
    pushTri(pos, nor, uv, O, i1, I, trim, trim, trim, sideZ);
    const sideX = [sx * 1, H * 0.3, sz * a * 0.5];
    pushTri(pos, nor, uv, O, e3, i3, trim, trim, trim, sideX);
    pushTri(pos, nor, uv, O, i3, I, trim, trim, trim, sideX);
    const above = [sx * a * 0.7, H, sz * a * 0.7];
    pushTri(pos, nor, uv, e1, e2, i2, trim, trim, trim, above);
    pushTri(pos, nor, uv, e1, i2, i1, trim, trim, trim, above);
    pushTri(pos, nor, uv, e2, e3, i3, trim, trim, trim, above);
    pushTri(pos, nor, uv, e2, i3, i2, trim, trim, trim, above);
  }
  return geoFrom(pos, nor, uv);
}

/** Flat-shaded overlay that hugs the outer surface of one roof quarter, used by the edit grid. */
function pyramidCellGeo(q: number) {
  const H = PYR_H + 0.07;
  const a = CELL / 2;
  const sx = q % 2 === 0 ? -1 : 1;
  const sz = q < 2 ? -1 : 1;
  const yb = 0.09;
  const O = [0, H, 0];
  const e1 = [sx * a, yb, 0];
  const e2 = [sx * a, yb, sz * a];
  const e3 = [0, yb, sz * a];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([...O, ...e1, ...e2, ...O, ...e2, ...e3], 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute([0.5, 0.5, 0, 0, 1, 0, 0.5, 0.5, 1, 0, 1, 1], 2));
  return g;
}

function makeLabel(text: string, color: string) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d");
  if (!g) return new THREE.Sprite();
  g.font = "800 28px Nunito, sans-serif";
  g.fillStyle = "rgba(0,0,0,0.45)";
  g.fillRect(24, 8, 208, 48);
  g.fillStyle = color;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set(2.6, 0.65, 1);
  return sp;
}

function raySphere(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, cx: number, cy: number, cz: number, rad: number) {
  const lx = cx - ox;
  const ly = cy - oy;
  const lz = cz - oz;
  const t = lx * dx + ly * dy + lz * dz;
  if (t < 0) return null;
  const px = ox + dx * t;
  const py = oy + dy * t;
  const pz = oz + dz * t;
  const dist2 = (px - cx) ** 2 + (py - cy) ** 2 + (pz - cz) ** 2;
  if (dist2 > rad * rad) return null;
  return t;
}

export function mountMatch(
  canvas: HTMLCanvasElement,
  opts: {
    modeId: string;
    skinId: string;
    pickaxeId: string;
    backpackId: string;
    gliderId?: string;
    getSettings: () => Settings;
    pad: PadInput;
    onHud: (h: HudState) => void;
    onEnd: (r: MatchResult) => void;
    onPause: () => void;
    /** Battle royale: bots filling the empty slots after matchmaking (default 15). */
    bots?: number;
    /** Battle royale: seconds on the spawn island before the drop ship leaves (default 60, 0 = straight to the ship). */
    pregame?: number;
    /** The backpack (inventory) screen opened or closed (I key / Escape). */
    onBag?: (open: boolean) => void;
    onEmotes?: (open: boolean) => void;
    /** Emote ids the player owns (the wheel only offers these). */
    ownedEmotes?: () => string[];
  },
) {
  const mode: ModeDef = modeById(opts.modeId);
  const audio: AudioBus = createAudio();
  const settings0 = opts.getSettings();
  // Keep integrated GPUs cool by default. Device hints are advisory; quality settings still
  // control the look, while adaptive resolution below can react to real frame-time pressure.
  const cores = navigator.hardwareConcurrency || 8;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 8;
  const lowEndDevice = cores <= 4 || memory <= 4 || /Android|iPhone|iPad/i.test(navigator.userAgent);
  const maxPixelRatio = lowEndDevice ? 0.9 : settings0.quality === "high" ? 1.4 : settings0.quality === "low" ? 0.85 : 1.05;
  // no music in battle royale (sound effects only); 1v1 keeps the music setting
  audio.setVolumes(settings0.master, mode.map === "island" ? 0 : settings0.music, settings0.sfx);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: settings0.quality === "high" && !lowEndDevice,
    alpha: false,
    powerPreference: lowEndDevice ? "low-power" : "high-performance",
    stencil: false,
    depth: true,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = settings0.shadows && settings0.quality !== "low" && !lowEndDevice;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x8ec8f2);

  const scene = new THREE.Scene();
  const fogFar = settings0.renderDistance === "low" ? 90 : settings0.renderDistance === "high" ? 210 : 150;
  scene.fog = new THREE.Fog(0x7ec8f6, fogFar * 0.72, fogFar);
  scene.background = new THREE.Color(0x4aa4f0);
  const skyParts = addSky(scene);

  const camera = new THREE.PerspectiveCamera(72, 1, 0.08, 280);
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x4e9a40, 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff6dc, 1.45);
  sun.position.set(48, 90, 26);
  sun.castShadow = renderer.shadowMap.enabled;
  const shadowResolution = lowEndDevice ? 512 : settings0.quality === "high" ? 2048 : 1024;
  sun.shadow.mapSize.set(shadowResolution, shadowResolution);
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 26;
  sun.shadow.camera.bottom = -26;
  sun.shadow.camera.near = 8;
  sun.shadow.camera.far = 140;
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  scene.add(sun.target);
  const fill = new THREE.DirectionalLight(0x9ec4ff, 0.38);
  fill.position.set(-28, 18, -22);
  scene.add(fill);
  const woodMap = makeWoodMap();
  const grassMap = makeGrassMap();
  const sandMap = makeSandMap();

  const map = mode.map;
  const island: Island | null = map === "island" ? buildIsland({ lite: settings0.quality === "low" }) : null;
  /** Battle royale warm-up: seconds left on the spawn island before everyone boards the drop ship (0 = over). */
  let preT = island ? Math.max(0, opts.pregame ?? 60) : 0;
  const spawnIsle = island && preT > 0 ? buildSpawnIsland() : null;
  /** 1v1 Build Fights: round score, the pre-round freeze and the pause after a round is decided. */
  const duel = map === "duel" ? { you: 0, them: 0, round: 1, freeze: 3.2, over: 0, lastWin: false } : null;
  // drivable cars parked around the island
  const vehicles: Vehicle[] = [];
  let driving: Vehicle | null = null;
  let lookIdle = 0;
  const runOverCd = new Map<Actor, number>();
  if (island)
    for (const sp of island.vehicles) {
      const v = spawnVehicle(sp);
      if (!v) continue;
      vehicles.push(v);
      scene.add(v.group);
    }
  let islandFog = 300;
  let stormFogK = 0;
  const skyFogColor = new THREE.Color(0x8fcff5);
  const stormFogColor = new THREE.Color(0x8a4fd0);
  if (island) {
    // big open island: see much further, and let the sky dome follow the camera
    const far = settings0.renderDistance === "low" ? 190 : settings0.renderDistance === "high" ? 420 : 300;
    islandFog = far;
    scene.fog = new THREE.Fog(0x8fcff5, far * 0.4, far);
    camera.far = 1200;
    camera.updateProjectionMatrix();
    // warmer, brighter daylight for the island
    hemi.color.set(0xdcefff);
    hemi.groundColor.set(0x6f9a5c);
    hemi.intensity = 1.25;
    sun.color.set(0xfff0d2);
    sun.intensity = 1.75;
    renderer.toneMappingExposure = 1.1;
    sun.shadow.camera.left = sun.shadow.camera.bottom = -34;
    sun.shadow.camera.right = sun.shadow.camera.top = 34;
    sun.shadow.camera.updateProjectionMatrix();
    skyParts.sky.scale.setScalar(3.4);
    skyParts.clouds.scale.set(2.7, 2.1, 2.7);
    skyParts.sunDisc.position.multiplyScalar(3.2);
    skyParts.sunDisc.scale.setScalar(2.4);
  } else if (map === "duel") {
    // 1v1: see out to the mountains round the Creative island
    scene.fog = new THREE.Fog(0x9fd6f7, 260, 900);
    camera.far = 1100;
    camera.updateProjectionMatrix();
    hemi.color.set(0xdcefff);
    hemi.groundColor.set(0x6f9a5c);
    hemi.intensity = 1.2;
    sun.color.set(0xfff0d2);
    sun.intensity = 1.7;
    renderer.toneMappingExposure = 1.08;
    skyParts.sky.scale.setScalar(3.4);
    skyParts.clouds.scale.set(3.2, 2.6, 3.2);
    skyParts.sunDisc.position.multiplyScalar(3.2);
    skyParts.sunDisc.scale.setScalar(2.4);
  }

  function groundHeight(x: number, z: number) {
    if (island) {
      if (preT > 0) {
        const h = spawnHeight(x, z);
        if (h !== null) return h;
      }
      return island.height(x, z);
    }
    // 1v1 arena: a floating deck, the void all around
    return Math.abs(x) > ARENA_HALF || Math.abs(z) > ARENA_HALF ? -60 : 0;
  }

  const groundMeshes: THREE.Object3D[] = [];
  const arena = map === "duel" ? buildArena() : null;
  if (island) scene.add(island.group);
  if (spawnIsle) scene.add(spawnIsle.group);
  else if (arena) {
    scene.add(arena.group);
    groundMeshes.push(arena.floor);
  }

  /* ---------- island static collision (boxes + ramps in an 8 m grid) ---------- */
  const SG = 8;
  const sgrid = new Map<number, StaticBox[]>();
  const rgrid = new Map<number, StaticRamp[]>();
  const skey = (ix: number, iz: number) => (ix + 512) * 1024 + (iz + 512);
  function gridAdd<T extends { minX: number; maxX: number; minZ: number; maxZ: number }>(g: Map<number, T[]>, b: T) {
    for (let ix = Math.floor(b.minX / SG); ix <= Math.floor(b.maxX / SG); ix++)
      for (let iz = Math.floor(b.minZ / SG); iz <= Math.floor(b.maxZ / SG); iz++) {
        const k = skey(ix, iz);
        const arr = g.get(k);
        if (arr) arr.push(b);
        else g.set(k, [b]);
      }
  }
  if (island) {
    for (const b of island.boxes) gridAdd(sgrid, b);
    for (const r of island.ramps) gridAdd(rgrid, r);
  }
  const boxesAt = (x: number, z: number) => sgrid.get(skey(Math.floor(x / SG), Math.floor(z / SG)));
  const rampsAt = (x: number, z: number) => rgrid.get(skey(Math.floor(x / SG), Math.floor(z / SG)));

  /** Highest static walkable surface (box top or ramp) at (x, z) no higher than feet + 0.6. */
  function staticTop(x: number, z: number, feet: number, ignoreSmall = false) {
    let best = -Infinity;
    const bs = boxesAt(x, z);
    if (bs)
      for (const b of bs) {
        if (b.dead || x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
        if (ignoreSmall && b.maxX - b.minX < 0.75 && b.maxZ - b.minZ < 0.75 && b.maxY - b.minY < 1.4) continue;
        if (b.maxY <= feet + 0.6 && b.maxY > best) best = b.maxY;
      }
    const rs = rampsAt(x, z);
    if (rs)
      for (const r of rs) {
        if (x < r.minX || x > r.maxX || z < r.minZ || z > r.maxZ) continue;
        if (r.seg) {
          const s = r.seg;
          const ex = s.bx - s.ax;
          const ez = s.bz - s.az;
          const l2 = ex * ex + ez * ez || 1;
          const ts = ((x - s.ax) * ex + (z - s.az) * ez) / l2;
          if (ts < -0.03 || ts > 1.03) continue;
          if (Math.abs((x - s.ax) * ez - (z - s.az) * ex) / Math.sqrt(l2) > s.hw) continue;
          const hs = r.y0 + (r.y1 - r.y0) * Math.max(0, Math.min(1, ts));
          if (hs <= feet + 0.6 && hs > best) best = hs;
          continue;
        }
        let t = r.axis === "x" ? (x - r.minX) / Math.max(0.01, r.maxX - r.minX) : (z - r.minZ) / Math.max(0.01, r.maxZ - r.minZ);
        if (r.dir < 0) t = 1 - t;
        const h = r.y0 + (r.y1 - r.y0) * t;
        if (h <= feet + 0.6 && h > best) best = h;
      }
    return best;
  }

  function staticBlocked(x: number, z: number, y0: number, y1: number, r: number, ignoreSmall = false) {
    const seen = new Set<number>();
    for (const [cx, cz] of [
      [x - r, z - r],
      [x + r, z - r],
      [x - r, z + r],
      [x + r, z + r],
    ] as const) {
      const k = skey(Math.floor(cx / SG), Math.floor(cz / SG));
      if (seen.has(k)) continue;
      seen.add(k);
      const bs = sgrid.get(k);
      if (!bs) continue;
      for (const b of bs) {
        if (b.dead || b.maxY < y0 || b.minY > y1) continue;
        // cars roll over mailboxes, hydrants and the like
        if (ignoreSmall && b.maxX - b.minX < 0.75 && b.maxZ - b.minZ < 0.75 && b.maxY - b.minY < 1.4) continue;
        const nx = Math.max(b.minX, Math.min(x, b.maxX));
        const nz = Math.max(b.minZ, Math.min(z, b.maxZ));
        if ((nx - x) ** 2 + (nz - z) ** 2 < r * r) return true;
      }
    }
    return false;
  }

  function slab(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, b: StaticBox, tMax: number) {
    let t0 = 0;
    let t1 = tMax;
    const o = [ox, oy, oz];
    const d = [dx, dy, dz];
    const lo = [b.minX, b.minY, b.minZ];
    const hi = [b.maxX, b.maxY, b.maxZ];
    for (let i = 0; i < 3; i++) {
      const di = d[i]!;
      if (Math.abs(di) < 1e-9) {
        if (o[i]! < lo[i]! || o[i]! > hi[i]!) return null;
        continue;
      }
      let ta = (lo[i]! - o[i]!) / di;
      let tb = (hi[i]! - o[i]!) / di;
      if (ta > tb) [ta, tb] = [tb, ta];
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return null;
    }
    return t0 > 0.02 ? t0 : null;
  }

  /** Ray against island boxes and terrain. Returns the nearest hit within `range`. */
  function rayStatic(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, range: number, seeThrough = false): { t: number; x: number; y: number; z: number; box: StaticBox | null } | null {
    if (!island) return null;
    let bestT = range;
    let bestBox: StaticBox | null = null;
    const tested = new Set<StaticBox>();
    const step = SG * 0.5;
    let lastKey = -1;
    for (let t = 0; t <= range + step; t += step) {
      const tt = Math.min(t, range);
      const k = skey(Math.floor((ox + dx * tt) / SG), Math.floor((oz + dz * tt) / SG));
      if (k === lastKey) continue;
      lastKey = k;
      const bs = sgrid.get(k);
      if (!bs) continue;
      for (const b of bs) {
        if (b.dead || tested.has(b) || (seeThrough && b.glass)) continue;
        tested.add(b);
        const hit = slab(ox, oy, oz, dx, dy, dz, b, bestT);
        if (hit != null && hit < bestT) {
          bestT = hit;
          bestBox = b;
        }
      }
    }
    // terrain: march then bisect
    let prev = 0;
    for (let t = 0.6; t < bestT; t += 1.2) {
      const x = ox + dx * t;
      const z = oz + dz * t;
      if (oy + dy * t < island.height(x, z)) {
        let a = prev;
        let b = t;
        for (let i = 0; i < 6; i++) {
          const m = (a + b) / 2;
          if (oy + dy * m < island.height(ox + dx * m, oz + dz * m)) b = m;
          else a = m;
        }
        bestT = b;
        bestBox = null;
        return { t: bestT, x: ox + dx * bestT, y: oy + dy * bestT, z: oz + dz * bestT, box: null };
      }
      prev = t;
    }
    if (bestT >= range) return null;
    return { t: bestT, x: ox + dx * bestT, y: oy + dy * bestT, z: oz + dz * bestT, box: bestBox };
  }

  const skin = skinById(opts.skinId);
  const pick = gearById(opts.pickaxeId);
  // back blings were removed from the game: nobody wears one
  const pack = gearById("none-pack");
  const playerRig = createCharacter(skin, pack, pick);
  scene.add(playerRig.group);

  const trees: { x: number; y: number; z: number; hp: number; mesh: { visible: boolean } }[] = [];


  const SLOT = 240;
  const wallGeos = Array.from({ length: 9 }, (_, bit) => {
    const tx = bit % 3;
    const ty = Math.floor(bit / 3);
    return atlasUV(tileBox("z", tx / 3, ty / 3, (tx + 1) / 3, (ty + 1) / 3), ATLAS_WALL);
  });
  const floorGeos = Array.from({ length: 4 }, (_, bit) => {
    const tx = bit % 2;
    const tz = bit >> 1;
    return atlasUV(tileBox("y", tx / 2, tz / 2, (tx + 1) / 2, (tz + 1) / 2), ATLAS_FLAT);
  });
  const wallFullGeo = atlasUV(tileBox("z", 0, 0, 1, 1), ATLAS_WALL);
  const floorFullGeo = atlasUV(tileBox("y", 0, 0, 1, 1), ATLAS_FLAT);
  const rampGeos = [rampTile(0, 0), rampTile(1, 0), rampTile(0, 1), rampTile(1, 1)].map((g) => atlasUV(g, ATLAS_FLAT));
  const pyrGeo = atlasUV(pyramidGeo(0b1111), ATLAS_FLAT);
  const pyrGeos = [0, 1, 2, 3].map((q) => atlasUV(pyramidGeo(1 << q), ATLAS_FLAT));
  // the 1v1.LOL pieces for plain (unedited) builds, in piece space
  const LZ = -CELL / 2 + TH / 2;
  const lolWallFull = lolWallGeo(LOL_WALLS[0b111111111]!, LZ);
  const lolFloorFull = lolFloorGeo({ name: "Floor_New", rot: 0 }, TH);
  const lolRampFull = lolStairGeo(LOL_RAMP);
  const lolConeFull = lolConeGeo({ name: "Pyramid_New", rot: 0 });

  type MeshSet = {
    wall: THREE.InstancedMesh;
    floor: THREE.InstancedMesh;
    walls: THREE.InstancedMesh[];
    floors: THREE.InstancedMesh[];
    ramps: THREE.InstancedMesh[];
    pyrs: THREE.InstancedMesh[];
  };
  /** Instance slot -> piece index, per instanced mesh. Rebuilt every rebuild(). */
  const meshRefs = new Map<THREE.Object3D, number[]>();
  const buildMeshes: THREE.InstancedMesh[] = [];
  function addIM(geo: THREE.BufferGeometry, material: THREE.Material, holo = false) {
    const m = new THREE.InstancedMesh(geo, material, SLOT);
    m.count = 0;
    m.visible = false;
    m.frustumCulled = false;
    m.castShadow = !holo;
    m.receiveShadow = !holo;
    if (holo) m.renderOrder = 2;
    scene.add(m);
    buildMeshes.push(m);
    meshRefs.set(m, []);
    return m;
  }
  const holoMaterial = (map: THREE.Texture) =>
    new THREE.MeshLambertMaterial({
      map,
      color: 0xe6f4ff,
      emissive: 0x7fb6e6,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  const solidSets = {} as Record<BuildMat, MeshSet>;
  const solidMats = {} as Record<BuildMat, { wall: THREE.Material; flat: THREE.Material }>;
  const holoSets = {} as Record<BuildMat, MeshSet>;
  const holoWallMaps = {} as Record<BuildMat, THREE.Texture>;
  const holoFlatMaps = {} as Record<BuildMat, THREE.Texture>;
  // every build uses the 1v1.LOL build texture; the material only changes a piece's health
  const lolTex = lolTexture();
  for (const m of MAT_ORDER) {
    const wallTex = lolTex;
    const flatTex = lolTex;
    const lift = new THREE.Color(1.06, 1.06, 1.06);
    const wm = new THREE.MeshLambertMaterial({ map: wallTex, color: lift });
    const fm = new THREE.MeshLambertMaterial({ map: flatTex, color: lift });
    solidSets[m] = {
      wall: addIM(wallFullGeo, wm),
      floor: addIM(floorFullGeo, fm),
      walls: wallGeos.map((g) => addIM(g, wm)),
      floors: floorGeos.map((g) => addIM(g, fm)),
      ramps: rampGeos.map((g) => addIM(g, fm)),
      pyrs: pyrGeos.map((g) => addIM(g, fm)),
    };
    solidMats[m] = { wall: wm, flat: fm };
    holoWallMaps[m] = lolTex;
    holoFlatMaps[m] = lolTex;
    const hw = holoMaterial(holoWallMaps[m]);
    const hf = holoMaterial(holoFlatMaps[m]);
    holoSets[m] = {
      wall: addIM(wallFullGeo, hw, true),
      floor: addIM(floorFullGeo, hf, true),
      walls: [],
      floors: [],
      ramps: rampGeos.map((g) => addIM(g, hf, true)),
      pyrs: [addIM(pyrGeo, hf, true)],
    };
  }

  /** Edited shapes (doors, arches, triangles, stair paths, cone edits): one instanced mesh per shape and material. */
  const customGeos = new Map<string, THREE.BufferGeometry>();
  const customIMs = new Map<string, THREE.InstancedMesh>();
  function geoCached(key: string, wallTex: boolean, make: () => THREE.BufferGeometry) {
    let g = customGeos.get(key);
    if (!g) {
      g = make();
      // keys starting with L are 1v1.LOL pieces (already on the atlas); the rest are this game's shapes
      if (!key.startsWith("L")) atlasUV(g, wallTex ? ATLAS_WALL : ATLAS_FLAT);
      customGeos.set(key, g);
    }
    return g;
  }
  function customIM(key: string, mat: BuildMat, wallTex: boolean, make: () => THREE.BufferGeometry, holo = false) {
    const k = `${key}|${mat}${holo ? "|h" : ""}`;
    let im = customIMs.get(k);
    if (!im) {
      const g = geoCached(key, wallTex, make);
      im = holo ? addIM(g, holoMaterial(wallTex ? holoWallMaps[mat] : holoFlatMaps[mat]), true) : addIM(g, wallTex ? solidMats[mat].wall : solidMats[mat].flat);
      customIMs.set(k, im);
    }
    return im;
  }

  // build doors: the 1v1.LOL door leaf, hinged at its left edge (origin at the bottom hinge)
  const DOOR_W = CELL / 3 - 0.08;
  const doorIM = addIM(lolDoorLeafGeo(DOOR_W), new THREE.MeshLambertMaterial({ map: lolTex, color: new THREE.Color(1.06, 1.06, 1.06) }));
  const doorTint: Record<BuildMat, THREE.Color> = { wood: new THREE.Color("#ffffff"), brick: new THREE.Color("#ffffff"), metal: new THREE.Color("#ffffff") };

  /** Solid frame beams shown while a piece is still being constructed (Fortnite builds the frame first). */
  const BEAM_CAP = 900;
  const beamMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), BEAM_CAP);
  beamMesh.count = 0;
  beamMesh.visible = false;
  beamMesh.frustumCulled = false;
  beamMesh.castShadow = true;
  scene.add(beamMesh);
  // 1v1.LOL builds are one lavender brick whatever the material
  const beamColor: Record<BuildMat, THREE.Color> = {
    wood: new THREE.Color("#b9b9dc"),
    brick: new THREE.Color("#b9b9dc"),
    metal: new THREE.Color("#b9b9dc"),
  };

  /** Debris chunks when builds are hit or broken. */
  const DEBRIS_CAP = 220;
  const debrisMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), DEBRIS_CAP);
  debrisMesh.count = 0;
  debrisMesh.visible = false;
  debrisMesh.frustumCulled = false;
  scene.add(debrisMesh);
  const debrisColor: Record<BuildMat, string[]> = {
    wood: ["#aeb0d4", "#9c9ec8", "#c3c4e2", "#8a8cb8"],
    brick: ["#aeb0d4", "#9c9ec8", "#c3c4e2", "#8a8cb8"],
    metal: ["#aeb0d4", "#9c9ec8", "#c3c4e2", "#8a8cb8"],
  };
  type Chunk = { x: number; y: number; z: number; vx: number; vy: number; vz: number; rx: number; ry: number; sx: number; sy: number; sz: number; life: number; max: number; col: THREE.Color };
  const chunks: Chunk[] = [];

  const ghostWallMat = new THREE.MeshBasicMaterial({
    map: holoWallMaps.wood,
    color: 0xb9e2ff,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ghostMat = new THREE.MeshBasicMaterial({
    map: holoFlatMaps.wood,
    color: 0xb9e2ff,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ghostLine = new THREE.LineBasicMaterial({ color: 0xf2fbff, transparent: true, opacity: 0.95 });
  const wallBox = new THREE.BoxGeometry(CELL, CELL_H, TH);
  const floorBox = new THREE.BoxGeometry(CELL, TH, CELL);
  // previews use the 1v1.LOL pieces, centred the way the preview code places them
  const ghostWallGeo = lolWallGeo(LOL_WALLS[0b111111111]!, 0).translate(0, -CELL_H / 2, 0);
  const ghostFloorGeo = lolFloorGeo({ name: "Floor_New", rot: 0 }, TH).translate(0, -TH / 2, 0);
  const ghostWall = new THREE.Mesh(ghostWallGeo, ghostWallMat);
  const ghostFloor = new THREE.Mesh(ghostFloorGeo, ghostMat);
  const ghostPyr = new THREE.Mesh(lolConeFull, ghostMat);
  ghostWall.add(new THREE.LineSegments(new THREE.EdgesGeometry(wallBox), ghostLine));
  ghostFloor.add(new THREE.LineSegments(new THREE.EdgesGeometry(floorBox), ghostLine));
  ghostPyr.add(new THREE.LineSegments(new THREE.EdgesGeometry(lolConeFull, 40), ghostLine));
  ghostWall.visible = ghostFloor.visible = ghostPyr.visible = false;
  scene.add(ghostWall, ghostFloor, ghostPyr);

  const rampGhost = new THREE.Group();
  {
    const part = new THREE.Mesh(lolRampFull, ghostMat);
    part.add(new THREE.LineSegments(new THREE.EdgesGeometry(lolRampFull, 40), ghostLine));
    rampGhost.add(part);
  }
  rampGhost.visible = false;
  scene.add(rampGhost);

  const editRoot = new THREE.Group();
  scene.add(editRoot);
  const barGeo = new THREE.BoxGeometry(1, 1, 1);
  const barMat = new THREE.MeshBasicMaterial({ color: 0xdfeaff, transparent: true, opacity: 0.9 });
  const editBars: THREE.Mesh[] = [];
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(barGeo, barMat);
    m.visible = false;
    m.frustumCulled = false;
    m.renderOrder = 4;
    editRoot.add(m);
    editBars.push(m);
  }
  const tileKeep = makeEditTileMap(false);
  const tileCut = makeEditTileMap(true);
  const tileArrow = makeEditArrowMap();
  // 1v1.LOL's edit layout: the piece is swapped for a grid of solid blue blocks (its "EditLayout" colour)
  const EDIT_BLUE = 0x1a7ded;
  const editCellMat = () =>
    new THREE.MeshLambertMaterial({
      color: EDIT_BLUE,
      emissive: 0x0a3a8c,
      emissiveIntensity: 0.55,
      transparent: true,
      opacity: 1,
    });
  const cellGeo = new THREE.BoxGeometry(1, 1, 1);
  const editCells: THREE.Mesh[] = [];
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(cellGeo, editCellMat());
    m.visible = false;
    m.frustumCulled = false;
    m.renderOrder = 3;
    m.rotation.order = "YXZ";
    editRoot.add(m);
    editCells.push(m);
  }
  const pyrCells: THREE.Mesh[] = [0, 1, 2, 3].map((q) => {
    const m = new THREE.Mesh(pyramidCellGeo(q), editCellMat());
    m.visible = false;
    m.frustumCulled = false;
    m.renderOrder = 3;
    editRoot.add(m);
    return m;
  });
  const _zAxis = new THREE.Vector3(0, 0, 1);
  const _bA = new THREE.Vector3();
  const _bB = new THREE.Vector3();
  function barBetween(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, thick = 0.08) {
    _v1.copy(b).sub(a);
    const len = _v1.length() || 0.001;
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(_zAxis, _v1.multiplyScalar(1 / len));
    m.scale.set(thick, thick, len);
    m.visible = true;
  }

  const pieces: Piece[] = [];
  /** Pieces bucketed by build cell, rebuilt lazily whenever the pieces array changes. */
  let piecesVer = 0;
  let gridVer = -1;
  const pieceGrid = new Map<number, Piece[]>();
  const NO_PIECES: Piece[] = [];
  const gridKey = (ix: number, iz: number) => (ix + 32768) * 65536 + (iz + 32768);
  function cellPieces(ix: number, iz: number): Piece[] {
    if (gridVer !== piecesVer) {
      pieceGrid.clear();
      for (const p of pieces) {
        const k = gridKey(p.ix, p.iz);
        const arr = pieceGrid.get(k);
        if (arr) arr.push(p);
        else pieceGrid.set(k, [p]);
      }
      gridVer = piecesVer;
    }
    return pieceGrid.get(gridKey(ix, iz)) ?? NO_PIECES;
  }
  const buckets = new Map<string, AABB[]>();
  let dirty = true;

  const ownColor = new THREE.Color("#ffffff");
  const enemyColor = new THREE.Color("#f3d6bd");
  const blueColor = new THREE.Color("#c4e2ff");
  const redColor = new THREE.Color("#ffc9bd");
  const holoTint = new THREE.Color("#cfe9ff");
  const white = new THREE.Color("#ffffff");
  const _col = new THREE.Color();
  const _col2 = new THREE.Color();

  function pieceColor(p: Piece) {
    if (mode.teams) return p.team === 2 ? redColor : blueColor;
    return p.owner === 0 ? ownColor : enemyColor;
  }

  function pushBucket(ix: number, iz: number, box: AABB) {
    const key = `${ix},${iz}`;
    const arr = buckets.get(key);
    if (arr) arr.push(box);
    else buckets.set(key, [box]);
  }

  // Per-piece transform tweaks applied by put(): pop-in scale and hit shake about the piece centre.
  let fxK = 1;
  let fxShake = 0;
  const fxC = new THREE.Vector3();
  const _mfx = new THREE.Matrix4();
  const _mfx2 = new THREE.Matrix4();
  function put(mesh: THREE.InstancedMesh, m: THREE.Matrix4, col: THREE.Color, pi: number) {
    const refs = meshRefs.get(mesh)!;
    const idx = refs.length;
    if (idx >= SLOT) return;
    if (fxK !== 1 || fxShake !== 0) {
      _mfx.makeTranslation(fxC.x + fxShake * (Math.random() - 0.5), fxC.y + fxShake * (Math.random() - 0.5), fxC.z + fxShake * (Math.random() - 0.5));
      _mfx.multiply(_mfx2.makeScale(fxK, fxK, fxK));
      _mfx.multiply(_mfx2.makeTranslation(-fxC.x, -fxC.y, -fxC.z));
      _mfx.multiply(m);
      mesh.setMatrixAt(idx, _mfx);
    } else mesh.setMatrixAt(idx, m);
    mesh.setColorAt(idx, col);
    refs.push(pi);
  }

  let beamCount = 0;
  function beam(p: Piece, ax: number, ay: number, az: number, bx: number, by: number, bz: number, thick: number) {
    if (beamCount >= BEAM_CAP) return;
    piecePoint(p, ax, ay, az, _bA);
    piecePoint(p, bx, by, bz, _bB);
    _v1.copy(_bB).sub(_bA);
    const len = _v1.length() || 0.001;
    _q.setFromUnitVectors(_zAxis, _v1.multiplyScalar(1 / len));
    _v3.copy(_bA).add(_bB).multiplyScalar(0.5);
    _m.compose(_v3, _q, _v2.set(thick, thick, len + thick * 0.6));
    if (fxK !== 1) {
      _mfx.makeTranslation(fxC.x, fxC.y, fxC.z).multiply(_mfx2.makeScale(fxK, fxK, fxK)).multiply(_mfx2.makeTranslation(-fxC.x, -fxC.y, -fxC.z)).multiply(_m);
      _m.copy(_mfx);
    }
    beamMesh.setMatrixAt(beamCount, _m);
    beamMesh.setColorAt(beamCount, beamColor[p.mat]);
    beamCount++;
  }

  function frameBeams(p: Piece) {
    const h = CELL / 2;
    const t = 0.36;
    if (p.kind === "wall") {
      const z = -CELL / 2 + TH / 2;
      const e = h - t / 2;
      beam(p, -e, 0, z, -e, CELL_H, z, t);
      beam(p, e, 0, z, e, CELL_H, z, t);
      beam(p, -h, t / 2, z, h, t / 2, z, t);
      beam(p, -h, CELL_H - t / 2, z, h, CELL_H - t / 2, z, t);
      beam(p, -h, CELL_H / 2, z, h, CELL_H / 2, z, t * 0.8);
      beam(p, -e, 0.35, z, e, CELL_H - 0.35, z, t * 0.75);
    } else if (p.kind === "floor") {
      const y = TH / 2;
      const e = h - t / 2;
      beam(p, -e, y, -h, -e, y, h, t);
      beam(p, e, y, -h, e, y, h, t);
      beam(p, -h, y, -e, h, y, -e, t);
      beam(p, -h, y, e, h, y, e, t);
      beam(p, 0, y, -h, 0, y, h, t * 0.8);
    } else if (p.kind === "ramp") {
      const e = h - t / 2;
      beam(p, -e, 0.05, -h, -e, CELL_H, h, t);
      beam(p, e, 0.05, -h, e, CELL_H, h, t);
      beam(p, -h, 0.1, -h + 0.1, h, 0.1, -h + 0.1, t);
      beam(p, -h, CELL_H / 2, 0, h, CELL_H / 2, 0, t * 0.8);
      beam(p, -h, CELL_H - 0.05, h - 0.05, h, CELL_H - 0.05, h - 0.05, t);
    } else {
      for (const [x, z] of [
        [-h, -h],
        [h, -h],
        [h, h],
        [-h, h],
      ] as const) beam(p, 0, PYR_H, 0, x, 0.05, z, t);
      beam(p, -h, 0.05, -h, h, 0.05, -h, t);
      beam(p, h, 0.05, -h, h, 0.05, h, t);
      beam(p, h, 0.05, h, -h, 0.05, h, t);
      beam(p, -h, 0.05, h, -h, 0.05, -h, t);
    }
  }

  function easeOutBack(x: number) {
    const c1 = 1.9;
    const c3 = c1 + 1;
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
  }

  /** Cheap fingerprint of everything collision depends on (which pieces, where, wall cut-outs, doors). */
  let collSig = NaN;
  function collisionSignature() {
    let h = pieces.length | 0;
    for (const p of pieces) {
      h = (Math.imul(h, 31) + p.ix * 73 + p.iz * 151 + Math.round(p.base * 100) * 7 + p.rot) | 0;
      if (p.kind === "wall") {
        h = (Math.imul(h, 31) + p.mask) | 0;
        for (const d of p.doors ?? []) h = (Math.imul(h, 31) + (d.t < 0.5 ? 1 : 2) + d.col * 5) | 0;
      } else {
        h = (Math.imul(h, 31) + (p.kind === "floor" ? 11 : p.kind === "ramp" ? 13 : 17) + p.mask * 3) | 0;
        // floor lips and stair rails follow the edit
        for (const q of p.stair ?? []) h = (Math.imul(h, 31) + q.t * 7 + q.d) | 0;
      }
    }
    return h;
  }
  /** Build visuals refresh at most this often while pieces animate (frames filling in, hit shakes). */
  let rebuildCd = 0;
  function maybeRebuild(dt: number) {
    rebuildCd -= dt;
    if (!dirty) return;
    if (rebuildCd > 0 && collisionSignature() === collSig) return;
    rebuild();
    rebuildCd = 1 / 40;
  }

  function rebuild() {
    dirty = false;
    for (const refs of meshRefs.values()) refs.length = 0;
    const sig = collisionSignature();
    const doColl = sig !== collSig;
    if (doColl) {
      buckets.clear();
      collSig = sig;
    }
    beamCount = 0;
    for (let pi = 0; pi < pieces.length; pi++) {
      const p = pieces[pi]!;
      const cx = (p.ix + 0.5) * CELL;
      const cz = (p.iz + 0.5) * CELL;
      const yaw = p.rot * (Math.PI / 2);
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      const ts = CELL / 3;
      // collision for walls (floors, stairs and roofs are walkable surfaces handled by surfaceAt)
      if (p.kind === "wall" && doColl) {
        const lz = -CELL / 2 + TH / 2;
        if (p.mask === 0b111111111) {
          const wx = lz * s + cx;
          const wz = lz * c + cz;
          const hx = (Math.abs(c) * CELL + Math.abs(s) * TH) / 2;
          const hz = (Math.abs(s) * CELL + Math.abs(c) * TH) / 2;
          pushBucket(p.ix, p.iz, { minX: wx - hx, maxX: wx + hx, minY: p.base, maxY: p.base + CELL_H, minZ: wz - hz, maxZ: wz + hz });
        } else {
          const rects = [...wallShape(p.mask).rects];
          for (const d of p.doors ?? []) if (d.t < 0.5) rects.push(doorRect(d.col, p.mask));
          for (const r of rects) {
            const lx = (r.x0 + r.x1) / 2;
            const w = r.x1 - r.x0;
            const wx = lx * c + lz * s + cx;
            const wz = -lx * s + lz * c + cz;
            const hx = (Math.abs(c) * w + Math.abs(s) * TH) / 2;
            const hz = (Math.abs(s) * w + Math.abs(c) * TH) / 2;
            pushBucket(p.ix, p.iz, { minX: wx - hx, maxX: wx + hx, minY: p.base + r.y0, maxY: p.base + r.y1, minZ: wz - hz, maxZ: wz + hz });
          }
        }
      }
      // the raised lips of edited 1v1.LOL floors and the side rails of its stairs block like walls
      if (doColl && (p.kind === "floor" || p.kind === "ramp") && p.mask !== 0) {
        let g: THREE.BufferGeometry | null = null;
        if (p.kind === "floor" && p.mask !== 0b1111) {
          const f = lolFloorFor(p.mask);
          if (f) g = geoCached(`Lf${p.mask}`, false, () => lolFloorGeo(f, TH));
        } else if (p.kind === "ramp" && p.stair) {
          const st = lolStairFor(p.stair.map((q) => q.t));
          if (st) g = geoCached(`Ls${st.name}${st.rot}${st.mirror ? "m" : ""}`, false, () => lolStairGeo(st));
        }
        if (g) {
          const fy = p.kind === "floor" ? 0 : yaw;
          const fc = Math.cos(fy);
          const fs = Math.sin(fy);
          for (const bx of railBoxes(g)) {
            const lx = (bx.x0 + bx.x1) / 2;
            const lz2 = (bx.z0 + bx.z1) / 2;
            const w = bx.x1 - bx.x0;
            const d = bx.z1 - bx.z0;
            const wx = lx * fc + lz2 * fs + cx;
            const wz = -lx * fs + lz2 * fc + cz;
            const hx = (Math.abs(fc) * w + Math.abs(fs) * d) / 2;
            const hz = (Math.abs(fs) * w + Math.abs(fc) * d) / 2;
            pushBucket(p.ix, p.iz, { minX: wx - hx, maxX: wx + hx, minY: p.base + bx.y0, maxY: p.base + bx.y1, minZ: wz - hz, maxZ: wz + hz });
          }
        }
      }
      // in edit mode walls, floors and stairs are replaced by the blue edit tiles; a cone stays as a
      // see-through hologram over its flat grid of squares (like Fortnite)
      const editing = pi === editPiece;
      if (editing && p.kind !== "pyramid" && p.kind !== "ramp") continue;
      // like 1v1.LOL, a new build appears solid straight away (its health still fills in over the build time)
      const building = editing;
      const set = building ? holoSets[p.mat] : solidSets[p.mat];
      _col.copy(pieceColor(p));
      if (editing) _col.copy(holoTint);
      if (p.hitT > 0) _col.lerp(white, Math.min(1, p.hitT / 0.14) * 0.65);
      fxK = p.age < 0.2 ? 0.55 + 0.45 * easeOutBack(p.age / 0.2) : 1;
      fxShake = p.hitT > 0 ? Math.min(1, p.hitT / 0.14) * 0.09 : 0;
      fxC.set(cx, p.base + (p.kind === "floor" ? 0 : CELL_H / 2), cz);
      // every shape that 1v1.LOL has a piece for uses that piece; other edits fall back to this game's shapes
      if (p.kind === "wall") {
        fxC.set(cx + (-CELL / 2) * s, p.base + CELL_H / 2, cz + (-CELL / 2) * c);
        const lz = -CELL / 2 + TH / 2;
        _mw.makeTranslation(cx, p.base, cz);
        _mr.makeRotationY(yaw);
        _m.copy(_mw).multiply(_mr);
        const lol = LOL_WALLS[p.mask];
        if (lol) put(customIM(`Lw${p.mask}`, p.mat, true, () => lolWallGeo(lol, lz), building), _m, _col, pi);
        else put(customIM(`w${p.mask}`, p.mat, true, () => wallGeo(p.mask, lz), building), _m, _col, pi);
        for (const d of p.doors ?? []) {
          const e = d.t * d.t * (3 - 2 * d.t);
          const r = doorRect(d.col, p.mask);
          _ml.makeTranslation(r.x0 + 0.04, 0.03, lz);
          _ms.makeRotationY(d.dir * e * 1.5);
          _m.copy(_mw).multiply(_mr).multiply(_ml).multiply(_ms);
          put(doorIM, _m, _col2.copy(doorTint[p.mat]).multiply(_col), pi);
        }
      } else if (p.kind === "floor") {
        const f = lolFloorFor(p.mask);
        if (f) {
          _m.compose(_v1.set(cx, p.base, cz), _q.identity(), _v2.set(1, 1, 1));
          put(customIM(`Lf${p.mask}`, p.mat, false, () => (p.mask === 0b1111 ? lolFloorFull : lolFloorGeo(f, TH)), building), _m, _col, pi);
        }
      } else if (p.kind === "ramp" && p.stair) {
        _q.setFromAxisAngle(_up, yaw);
        _m.compose(_v1.set(cx, p.base, cz), _q, _v2.set(1, 1, 1));
        const segs = p.stair;
        const st = lolStairFor(segs.map((g) => g.t));
        if (st) put(customIM(`Ls${st.name}${st.rot}${st.mirror ? "m" : ""}`, p.mat, false, () => lolStairGeo(st), editing), _m, _col, pi);
        else put(customIM(`s${stairKey(segs)}`, p.mat, false, () => stairGeo(segs), editing), _m, _col, pi);
      } else if (p.kind === "ramp") {
        _q.setFromAxisAngle(_up, yaw);
        _m.compose(_v1.set(cx, p.base, cz), _q, _v2.set(1, 1, 1));
        if (p.mask === 0b1111) put(customIM("Lr", p.mat, false, () => lolRampFull, building), _m, _col, pi);
        else
          for (let t = 0; t < 4; t++) {
            if ((p.mask & (1 << t)) === 0) continue;
            put(set.ramps[t]!, _m, _col, pi);
          }
      } else {
        _m.compose(_v1.set(cx, p.base, cz), _q.identity(), _v2.set(1, 1, 1));
        const cone = building ? { name: "Pyramid_New", rot: 0 } : lolConeFor(p.mask);
        if (cone) {
          const key = building ? 15 : p.mask;
          put(customIM(`Lp${key}`, p.mat, false, () => (key === 0b1111 ? lolConeFull : lolConeGeo(cone)), building), _m, _col, pi);
        } else {
          const mask = p.mask;
          put(customIM(`p${mask}`, p.mat, false, () => roofGeo(mask)), _m, _col, pi);
        }
      }
      // on a slope a ground-level piece rests on the high side; a foundation fills the gap underneath
      if (p.footLo === undefined) p.footLo = footingLow(p);
      if (p.footLo != null && !building) {
        const gap = p.base - p.footLo;
        if (p.kind === "wall") {
          const lz = -CELL / 2 + TH / 2;
          _q.setFromAxisAngle(_up, yaw);
          _m.compose(_v1.set(cx + lz * s, p.footLo + gap / 2, cz + lz * c), _q, _v2.set(CELL, gap, TH));
        } else {
          const k = p.kind === "floor" ? 1 : 0.96;
          _m.compose(_v1.set(cx, p.footLo + gap / 2, cz), _q.identity(), _v2.set(CELL * k, gap, CELL * k));
        }
        put(set.floor, _m, _col, pi);
      }
    }
    fxK = 1;
    fxShake = 0;
    for (const m of buildMeshes) {
      const n = meshRefs.get(m)!.length;
      m.count = n;
      m.visible = n > 0;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      // three.js computes an InstancedMesh's bounds once; without this, shots (yours and the bots')
      // only "see" builds inside the area the first few builds covered and pass straight through the rest
      m.boundingSphere = null;
      m.boundingBox = null;
    }
    beamMesh.count = beamCount;
    beamMesh.visible = beamCount > 0;
    beamMesh.instanceMatrix.needsUpdate = true;
    if (beamMesh.instanceColor) beamMesh.instanceColor.needsUpdate = true;
  }

  function spawnChunks(mat: BuildMat, x: number, y: number, z: number, n: number, power: number, big: boolean, colors?: string[]) {
    const palette = colors ?? debrisColor[mat];
    for (let i = 0; i < n; i++) {
      if (chunks.length >= DEBRIS_CAP) chunks.shift();
      const a = Math.random() * Math.PI * 2;
      const sp = power * (0.4 + Math.random() * 0.8);
      const life = big ? 0.9 + Math.random() * 0.6 : 0.35 + Math.random() * 0.25;
      const sz = big ? 0.14 + Math.random() * 0.22 : 0.06 + Math.random() * 0.08;
      chunks.push({
        x: x + (big ? (Math.random() - 0.5) * 2.4 : 0),
        y: y + (big ? (Math.random() - 0.5) * 2.4 : 0),
        z: z + (big ? (Math.random() - 0.5) * 2.4 : 0),
        vx: Math.cos(a) * sp,
        vy: (big ? 3 : 2) + Math.random() * 4,
        vz: Math.sin(a) * sp,
        rx: Math.random() * 6,
        ry: Math.random() * 6,
        sx: sz * (mat === "wood" ? 2.2 : 1.3),
        sy: sz * (mat === "wood" ? 0.45 : 0.8),
        sz,
        life,
        max: life,
        col: new THREE.Color(palette[Math.floor(Math.random() * palette.length)]!),
      });
    }
  }

  function pieceCenter(p: Piece, out: THREE.Vector3) {
    if (p.kind === "wall") {
      const yaw = p.rot * (Math.PI / 2);
      out.set((p.ix + 0.5) * CELL - (CELL / 2) * Math.sin(yaw), p.base + CELL_H / 2, (p.iz + 0.5) * CELL - (CELL / 2) * Math.cos(yaw));
    } else out.set((p.ix + 0.5) * CELL, p.base + (p.kind === "floor" ? TH : CELL_H * 0.4), (p.iz + 0.5) * CELL);
    return out;
  }

  /** Damage a build piece with Fortnite-style feedback: flash, shake and wood/brick/metal chips. */
  function hitPiece(piece: Piece, dmg: number, x?: number, y?: number, z?: number) {
    piece.hp -= dmg;
    piece.hitT = 0.14;
    dirty = true;
    if (x == null || y == null || z == null) {
      pieceCenter(piece, _v3);
      x = _v3.x;
      y = _v3.y;
      z = _v3.z;
    }
    spawnChunks(piece.mat, x, y, z, piece.hp <= 0 ? 0 : 3, 2.2, false);
  }

  function updateChunks(dt: number) {
    let n = 0;
    for (let i = chunks.length - 1; i >= 0; i--) {
      const c = chunks[i]!;
      c.life -= dt;
      if (c.life <= 0) {
        chunks.splice(i, 1);
        continue;
      }
      c.vy -= 22 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.z += c.vz * dt;
      const g = surfaceAt(c.x, c.z, c.y + 0.3);
      if (c.y < g + c.sy / 2) {
        c.y = g + c.sy / 2;
        c.vy *= -0.3;
        c.vx *= 0.6;
        c.vz *= 0.6;
      }
      c.rx += dt * 7;
      c.ry += dt * 5;
    }
    for (const c of chunks) {
      const k = Math.min(1, (c.life / c.max) * 3);
      _q.setFromEuler(_eul.set(c.rx, c.ry, 0));
      _m.compose(_v1.set(c.x, c.y, c.z), _q, _v2.set(c.sx * k, c.sy * k, c.sz * k));
      debrisMesh.setMatrixAt(n, _m);
      debrisMesh.setColorAt(n, c.col);
      n++;
    }
    debrisMesh.count = n;
    debrisMesh.visible = n > 0;
    debrisMesh.instanceMatrix.needsUpdate = true;
    if (debrisMesh.instanceColor) debrisMesh.instanceColor.needsUpdate = true;
  }

  function cellKey(ix: number, iz: number) {
    return `${ix},${iz}`;
  }

  function snapBase(y: number) {
    return Math.floor((y + CELL_H * 0.35) / CELL_H) * CELL_H;
  }

  /** Lowest terrain under a ground-level piece when it is resting on a slope, else null (no foundation). */
  function footingLow(p: Piece): number | null {
    const cx = (p.ix + 0.5) * CELL;
    const cz = (p.iz + 0.5) * CELL;
    const pts: [number, number][] = [];
    if (p.kind === "wall") {
      const yaw = p.rot * (Math.PI / 2);
      const c = Math.cos(yaw);
      const sn = Math.sin(yaw);
      const lz = -CELL / 2 + TH / 2;
      for (let k = -2; k <= 2; k++) pts.push([cx + lz * sn + (k / 2) * CELL * 0.48 * c, cz + lz * c - (k / 2) * CELL * 0.48 * sn]);
    } else for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) pts.push([cx + i * CELL * 0.48, cz + j * CELL * 0.48]);
    let lo = Infinity;
    let hi = -Infinity;
    for (const [x, z] of pts) {
      const g = groundHeight(x, z);
      if (g <= -8) return null;
      lo = Math.min(lo, g);
      hi = Math.max(hi, g);
    }
    // only for pieces sitting on the ground (not upper levels), and only when there is a real gap
    if (p.base > hi + 0.35 || p.base - lo < 0.15 || p.base - lo > CELL_H * 1.5) return null;
    return lo - 0.1;
  }

  /** Does the ground (or a world object like a house floor) hold up a piece at this cell and height? */
  function groundHolds(ix: number, iz: number, base: number) {
    if (island) {
      const top = staticTop((ix + 0.5) * CELL, (iz + 0.5) * CELL, base + 0.3);
      if (top > -Infinity && Math.abs(top - base) < 0.95) return true;
    }
    let gLo = Infinity;
    let gHi = -Infinity;
    for (const [ox, oz] of [
      [0.5, 0.5],
      [0.04, 0.04],
      [0.96, 0.04],
      [0.04, 0.96],
      [0.96, 0.96],
    ] as const) {
      const g = groundHeight((ix + ox) * CELL, (iz + oz) * CELL);
      if (g <= -8) continue;
      gLo = Math.min(gLo, g);
      gHi = Math.max(gHi, g);
    }
    return gHi > -8 && base <= gHi + 0.9 && base >= gLo - (CELL_H - 0.05);
  }

  /**
   * Structural support, like Fortnite: every piece must connect, piece to piece, down to the ground.
   * When a piece breaks, anything left hanging collapses with it (no floating builds).
   */
  function collapseUnsupported() {
    if (!pieces.length) return 0;
    const n = pieces.length;
    const held = new Uint8Array(n);
    const queue: number[] = [];
    const idx = new Map<Piece, number>();
    pieces.forEach((p, i) => idx.set(p, i));
    for (let i = 0; i < n; i++) {
      const p = pieces[i]!;
      if (p.hp > 0 && p.mask !== 0 && groundHolds(p.ix, p.iz, p.base)) {
        held[i] = 1;
        queue.push(i);
      }
    }
    const top = (p: Piece) => p.base + (p.kind === "floor" ? TH : CELL_H);
    while (queue.length) {
      const a = pieces[queue.pop()!]!;
      for (let gx = a.ix - 1; gx <= a.ix + 1; gx++)
        for (let gz = a.iz - 1; gz <= a.iz + 1; gz++) {
          if (Math.abs(gx - a.ix) + Math.abs(gz - a.iz) > 1) continue;
          for (const b of cellPieces(gx, gz)) {
            const j = idx.get(b)!;
            if (held[j] || b.hp <= 0 || b.mask === 0) continue;
            if (b.base > top(a) + 0.06 || a.base > top(b) + 0.06) continue;
            held[j] = 1;
            queue.push(j);
          }
        }
    }
    let fell = 0;
    for (let i = 0; i < n; i++) {
      const p = pieces[i]!;
      if (held[i] || p.hp <= 0) continue;
      p.hp = 0;
      fell++;
    }
    return fell;
  }

  /**
   * Stricter support for the player's own builds, so nothing is placed in mid-air: a piece needs the ground,
   * or a build right under it (a wall top, the stairs or cone it sits on, the floor it stands on). Reaching out
   * sideways at the same level only works from where you stand (building out off your own floor or ramp).
   */
  function playerSupport(kind: BuildKind, ix: number, iz: number, rot: number, base: number) {
    // the ground or a world surface (a roof, a deck) under it
    if (hasBuildSupport(ix, iz, base, true)) return true;
    const [ax, az] = pieceAnchor(kind, ix, iz, rot);
    const atMyLevel = Math.abs(player.y - base) < 1.2 && player.grounded;
    for (const p of pieces) {
      const [bx, bz] = pieceAnchor(p.kind, p.ix, p.iz, p.rot);
      const gap = Math.hypot(ax - bx, az - bz);
      if (gap > CELL * 1.05) continue;
      // resting on something: the top of a wall / stairs / cone touching this piece's bottom
      if (p.kind !== "floor" && Math.abs(p.base + CELL_H - base) <= 0.05 && gap <= CELL * 0.75) return true;
      // off the high end of stairs (ramp rushing)
      if (p.kind === "ramp" && Math.abs(p.base + CELL_H - base) <= 0.05 && gap > 0.1) {
        const yaw = p.rot * (Math.PI / 2);
        if (((ax - bx) * Math.sin(yaw) + (az - bz) * Math.cos(yaw)) / gap > 0.7) return true;
      }
      // standing on a floor (a wall on its edge, stairs or a cone on it)
      if (p.kind === "floor" && kind !== "floor" && Math.abs(p.base - base) <= 0.05 && gap <= CELL * 0.75) return true;
      // building out sideways at your own level, from the structure you stand on
      if (atMyLevel && Math.abs(p.base - base) <= 0.05) return true;
    }
    return false;
  }

  function hasBuildSupport(ix: number, iz: number, base: number, groundOnly = false) {
    if (island) {
      const top = staticTop((ix + 0.5) * CELL, (iz + 0.5) * CELL, base + 0.3);
      if (top > -Infinity && Math.abs(top - base) < 0.95) return true;
    }
    // the ground anywhere under the cell holds a piece (builds sit on top of slopes, not inside them)
    let gLo = Infinity;
    let gHi = -Infinity;
    for (const [ox, oz] of [
      [0.5, 0.5],
      [0.04, 0.04],
      [0.96, 0.04],
      [0.04, 0.96],
      [0.96, 0.96],
    ] as const) {
      const g = groundHeight((ix + ox) * CELL, (iz + oz) * CELL);
      if (g <= -8) continue;
      gLo = Math.min(gLo, g);
      gHi = Math.max(gHi, g);
    }
    if (gHi > -8 && base <= gHi + 0.9 && base >= gLo - (CELL_H - 0.05)) return true;
    if (groundOnly) return false;
    for (const p of pieces) {
      if (Math.abs(p.ix - ix) + Math.abs(p.iz - iz) > 1) continue;
      if (Math.abs(p.base - base) <= 0.05) return true;
      // the top edge of a neighbouring wall, ramp or cone also holds a piece (floor off the top of a ramp)
      if (p.kind !== "floor" && Math.abs(p.base + CELL_H - base) <= 0.05) return true;
      // a floor is thin: it only holds pieces at its own level, never a whole level above it
      if (p.ix === ix && p.iz === iz && p.kind !== "floor" && Math.abs(p.base + CELL_H - base) <= 0.05) return true;
    }
    return false;
  }

  /** Where a piece sits on the ground plan: a wall's edge midpoint, otherwise its square's centre. */
  function pieceAnchor(kind: BuildKind, ix: number, iz: number, rot: number): [number, number] {
    const cx = (ix + 0.5) * CELL;
    const cz = (iz + 0.5) * CELL;
    if (kind !== "wall") return [cx, cz];
    const yaw = (rot & 3) * (Math.PI / 2);
    return [cx - Math.sin(yaw) * (CELL / 2), cz - Math.cos(yaw) * (CELL / 2)];
  }
  /** A wall sits on one edge shared by two squares; name the edge the same way whichever square it was placed from. */
  function wallEdge(ix: number, iz: number, rot: number): [number, number, number] {
    const r = rot & 3;
    // rot 0: the -z edge, 1: -x, 2: +z, 3: +x
    if (r === 2) return [ix, iz + 1, 0];
    if (r === 3) return [ix + 1, iz, 1];
    return [ix, iz, r];
  }
  /** Is there a wall on this edge that spans height y (the player's body)? */
  function wallOnEdge(ix: number, iz: number, rot: number, y: number) {
    const [ex, ez, er] = wallEdge(ix, iz, rot);
    return pieces.some((p) => {
      if (p.kind !== "wall" || y < p.base - 0.1 || y > p.base + CELL_H) return false;
      const [px, pz, pr] = wallEdge(p.ix, p.iz, p.rot);
      return px === ex && pz === ez && pr === er;
    });
  }
  function duplicate(kind: BuildKind, ix: number, iz: number, rot: number, base: number) {
    if (kind === "wall") {
      const [ex, ez, er] = wallEdge(ix, iz, rot);
      return pieces.some((p) => {
        if (p.kind !== "wall" || Math.abs(p.base - base) > 0.05) return false;
        const [px, pz, pr] = wallEdge(p.ix, p.iz, p.rot);
        return px === ex && pz === ez && pr === er;
      });
    }
    // one floor, one set of stairs and one cone per square and level, whichever way they face
    return pieces.some((p) => p.kind === kind && p.ix === ix && p.iz === iz && Math.abs(p.base - base) < 0.05);
  }

  const player = {
    x: 0,
    y: 2,
    z: map === "duel" ? ARENA_SPAWN : 10,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    hp: 100,
    shield: mode.shield,
    grounded: false,
    crouch: false,
    slide: 0,
    coyote: 0,
    jumpBuf: 0,
    alive: true,
    team: mode.teams ? 1 : 0,
  };
  player.y = Math.max(0, groundHeight(player.x, player.z));

  const mats: Record<BuildMat, number> = {
    wood: mode.mats,
    brick: map === "duel" ? mode.mats : Math.round(mode.mats * 0.6),
    metal: map === "duel" ? mode.mats : Math.round(mode.mats * 0.4),
  };
  let curMat: BuildMat = "wood";
  const infinite = mode.infiniteMats;
  function gain(m: BuildMat, n: number) {
    if (!infinite) mats[m] = Math.min(999, mats[m] + n);
  }
  let slot = 1;
  let buildKind: BuildKind | null = null;
  let userRot = 0;
  let editPiece = -1;
  let editDrag = false;
  let editMask = 0;
  /** Tiles in the order they were dragged over (stairs follow the drag). */
  let editOrder: number[] = [];
  let editHover = -1;
  /** What the player held before editing; restored when the edit ends (Fortnite returns you to it). */
  let editPrevBuild: BuildKind | null = null;
  let elims = 0;
  let shots = 0;
  let hits = 0;
  let streak = 0;
  let bestStreak = 0;
  let aimScore = 0;
  let aimStreak = 0;
  let ended = false;
  let paused = false;
  let pointerLocked = false;
  let scoreBlue = 0;
  let scoreRed = 0;
  let banner = "";
  let bannerT = 0;
  let hurtT = 0;
  let hitT = 0;
  let hitHead = false;
  /**
   * Hotbar order: hotbar position -> item (0 pickaxe, 1 AR, 2 shotgun, 3 SMG, 4 sniper, 5 meds).
   * The pickaxe stays first; the backpack screen rearranges the other five.
   */
  const hotOrder = [0, 1, 2, 3, 4, 5];
  /** The emote being played (B opens the emote wheel), facing the camera so you see it from the front. */
  let emote: { id: string; t: number; yaw: number } | null = null;
  let emoteWheel = false;
  function setEmoteWheel(open: boolean) {
    if (emoteWheel === open) return;
    emoteWheel = open;
    mouse.l = mouse.r = false;
    if (open && document.pointerLockElement === canvas) document.exitPointerLock();
    opts.onEmotes?.(open);
  }
  function playEmote(id: string) {
    if (opts.ownedEmotes && !opts.ownedEmotes().includes(id)) return false;
    if (!player.alive || drop || driving || !player.grounded) return false;
    buildKind = null;
    if (editPiece >= 0) leaveEdit();
    emote = { id, t: 0, yaw: camYaw + Math.PI };
    return true;
  }
  let bagOpen = false;
  function setBag(open: boolean) {
    if (bagOpen === open) return;
    bagOpen = open;
    mouse.l = mouse.r = false;
    if (open && document.pointerLockElement === canvas) document.exitPointerLock();
    opts.onBag?.(open);
  }
  /** Holding sprint and actually running (drives the faster run animation). */
  let sprinting = false;
  let healT = 0;
  let healDur = 2.6;
  /** What using the meds slot would do now: a bandage (under 75 HP), else a med kit (under 100), else nothing. */
  function medsName() {
    const k = healKind();
    if (k === "medkit") return `Med Kit ×${medkits}`;
    if (heals > 0) return `Bandages ×${heals}${medkits ? ` · Med Kit ×${medkits}` : ""}`;
    return medkits ? `Med Kit ×${medkits}` : "Meds";
  }
  function healKind(): "bandage" | "medkit" | null {
    if (player.hp < 75 && heals > 0) return "bandage";
    if (player.hp < 100 && medkits > 0) return "medkit";
    return null;
  }
  let heals = 3;
  /** Med kits carried (heal to full, slower than a bandage). */
  let medkits = 0;
  let shootCd = 0;
  let reloadT = 0;
  let reloadDur = 1;
  /** Aim-down-sights blend: 0 hip fire, 1 fully aimed. */
  let adsT = 0;
  /** Pickaxe swing length (s). */
  const SWING = 0.46;
  const ADS_FOV: Record<string, number> = { ar: 50, smg: 58, shotgun: 62, sniper: 17, sar: 32 };
  const ADS_DIST: Record<string, number> = { ar: 1.85, smg: 2.05, shotgun: 2.2, sniper: 0.2, sar: 0.2 };
  function curRarity() {
    return (island || duel) && slot >= 1 && slot <= 4 ? (invRarity[slot] ?? 0) : 0;
  }
  /** Guns with a scope on them: the sniper and the Scoped AR (epic/legendary assault rifles). */
  function scopedGun() {
    const k = weaponKind();
    return k === "sniper" || (k === "ar" && curRarity() >= 3);
  }
  /** Key for the ADS tables: the Scoped AR zooms like a scope, not like a plain AR. */
  function adsKey() {
    const k = weaponKind();
    return k === "ar" && scopedGun() ? "sar" : k;
  }
  function adsWanted() {
    if (!(mouse.r || opts.pad.aim) || !player.alive || drop || driving || buildKind || editPiece >= 0) return false;
    // scoped guns drop out of the scope to reload, like Fortnite
    if (reloadT > 0 && scopedGun()) return false;
    const k = weaponKind();
    return k === "ar" || k === "smg" || k === "shotgun" || k === "sniper";
  }
  /** Fully scoped in with the sniper: first-person scope view. */
  function scoped() {
    return adsT > 0.8 && scopedGun();
  }
  let debugCam: [number, number, number, number, number, number] | null = null;
  // test-only staging for screenshots / key art
  let stageFreeze = false;
  /** Test-only: stop real-time simulation (rendering continues; advance() still steps). */
  let testHold = false;
  let stageFerry: [number, number, number, number] | null = null;
  let stageHidePlayer = false;
  let bloom = 0;
  let recoil = 0;
  let swing = 0;
  /** Set while the trigger is still held from building or editing. */
  let fireLatch = false;
  let muzzle = 0;
  let matchT = 0;
  let stormTick = 0;
  let hudAcc = 0;
  let fpsSmoothed = 60;
  let camYaw = 0;
  let camPitch = -0.06;
  let shake = 0;
  const mag = { ar: 30, shotgun: 5, smg: 25, sniper: 1 };
  const reserve = { ar: 150, shotgun: 20, smg: 100, sniper: 15 };
  const keys = new Set<string>();
  let injected: Set<string> | null = null;
  const floaters: { x: number; y: number; z: number; text: string; life: number; crit: boolean }[] = [];
  const feed: Feed[] = [];
  const drops: Drop[] = [];
  const actors: Actor[] = [];
  let nextId = 1;

  const mouse = { l: false, r: false, m: false, cx: 0, cy: 0, have: false };

  function say(text: string) {
    banner = text;
    bannerT = 1.6;
  }
  function pushFeed(text: string) {
    feed.unshift({ text, life: 4 });
    if (feed.length > 4) feed.pop();
  }

  function spend(n: number, m: BuildMat) {
    if (infinite || preT > 0) return true;
    if (mats[m] < n) {
      say(`Out of ${m}`);
      return false;
    }
    mats[m] -= n;
    return true;
  }

  function tryPlace(kind: BuildKind, ix: number, iz: number, rot: number, owner: number, team: number, base: number, free = false, mat: BuildMat = "wood") {
    if (pieces.length > 220) {
      if (owner === 0) say("Too many builds");
      return false;
    }
    if (duplicate(kind, ix, iz, rot, base)) return false;
    if (!hasBuildSupport(ix, iz, base)) {
      if (owner === 0) say("No support");
      return false;
    }
    if (!free && owner === 0 && !spend(10, mat)) return false;
    if (!free && owner !== 0) {
      const bot = actors.find((a) => a.id === owner);
      if (!bot || bot.mats < 10) return false;
      bot.mats -= 10;
    }
    const max = Math.round((kind === "wall" ? 160 : kind === "floor" ? 120 : kind === "ramp" ? 140 : 180) * MAT_HP[mat]);
    const dur = free ? 0 : MAT_TIME[mat];
    piecesVer++;
    pieces.push({
      kind,
      ix,
      iy: Math.round(base / CELL_H),
      iz,
      rot,
      base,
      mask: fullMask(kind),
      hp: dur > 0 ? Math.round(max * 0.1) : max,
      max,
      owner,
      team,
      mat,
      buildT: dur,
      buildDur: Math.max(0.001, dur),
      age: 0,
      hitT: 0,
    });
    dirty = true;
    if (owner === 0) audio.play("build", mat === "wood" ? 1 : mat === "brick" ? 0.9 : 0.8);
    return true;
  }

  function surfaceAt(x: number, z: number, feet: number, cars = true) {
    let best = groundHeight(x, z);
    if (island) best = Math.max(best, staticTop(x, z, feet, !cars));
    if (cars)
      for (const v of vehicles) {
        if (v === driving) continue;
        const roof = vehicleRoof(v, x, z);
        if (roof <= feet + 0.6 && roof > best) best = roof;
      }
    const ix = Math.floor(x / CELL);
    const iz = Math.floor(z / CELL);
    for (let gx = ix - 1; gx <= ix + 1; gx++)
      for (let gz = iz - 1; gz <= iz + 1; gz++)
        for (const p of cellPieces(gx, gz)) {
      let h: number | null = null;
      if (p.kind === "floor") {
        const lx = x - (p.ix + 0.5) * CELL;
        const lz = z - (p.iz + 0.5) * CELL;
        if (Math.abs(lx) <= CELL / 2 && Math.abs(lz) <= CELL / 2) {
          if (lolFloorSolid(p.mask, lx, lz)) h = p.base + TH;
        }
      } else if (p.kind === "ramp") {
        const dx = x - (p.ix + 0.5) * CELL;
        const dz = z - (p.iz + 0.5) * CELL;
        const yaw = p.rot * (Math.PI / 2);
        const lx = dx * Math.cos(yaw) - dz * Math.sin(yaw);
        const lz = dx * Math.sin(yaw) + dz * Math.cos(yaw);
        if (p.stair) {
          const sh = stairHeight(p.stair, lx, lz);
          if (sh != null) h = p.base + sh;
        } else if (Math.abs(lx) <= CELL / 2 && Math.abs(lz) <= CELL / 2) {
          const t = (lz + CELL / 2) / CELL;
          const bit = (t < 0.5 ? 0 : 2) + (lx < 0 ? 0 : 1);
          if (p.mask & (1 << bit)) h = p.base + THREE.MathUtils.clamp(t, 0, 1) * CELL_H;
        }
      } else if (p.kind === "pyramid") {
        const sx = x - (p.ix + 0.5) * CELL;
        const sz = z - (p.iz + 0.5) * CELL;
        const d = Math.max(Math.abs(sx), Math.abs(sz));
        const rad = CELL / 2;
        if (p.mask === 0b1111) {
          if (d <= rad) h = p.base + PYR_H * (1 - d / rad);
        } else {
          const rh = roofHeight(p.mask, sx, sz);
          if (rh != null) h = p.base + rh;
        }
      }
      if (h == null) continue;
      if (h <= feet + 0.6 && h >= feet - 4 && h > best) best = h;
    }
    return best;
  }

  function blocked(x: number, z: number, feet: number, crouch: boolean) {
    const y0 = feet + 0.3;
    // the body blocks sideways up to shoulder height; a low ceiling grazing the head does not wedge you in place
    const y1 = feet + (crouch ? 1.0 : 1.48);
    const r = 0.36;
    for (const v of vehicles) if (v !== driving && feet < vehicleRoof(v, x, z) - 0.08 && vehicleTouches(v, x, z, y0, y1, r)) return true;
    return blockedRange(x, z, y0, y1, r);
  }

  /** World + builds collision for a vertical probe (shared by players, bots and cars). */
  function blockedRange(x: number, z: number, y0: number, y1: number, r: number, car = false) {
    // the 1v1 arena's barrier
    if (arena && (Math.abs(x) > ARENA_HALF - 0.45 || Math.abs(z) > ARENA_HALF - 0.45)) return true;
    // the spawn island's shallows: an invisible wall a few metres out from the beach
    if (preT > 0) {
      if (Math.hypot(x - SPAWN_ISLE.x, z - SPAWN_ISLE.z) > SPAWN_WALK_R) return true;
      for (const c of spawnColliders) if (y0 < c.maxY && x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) return true;
    }
    if (island) {
      if (preT <= 0 && x * x + z * z > island.radius * island.radius) return true;
      if (staticBlocked(x, z, y0, y1, r, car)) return true;
    }
    const ix = Math.floor(x / CELL);
    const iz = Math.floor(z / CELL);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const arr = buckets.get(cellKey(ix + dx, iz + dz));
        if (!arr) continue;
        for (const a of arr) {
          if (a.maxY < y0 || a.minY > y1) continue;
          const nx = Math.max(a.minX, Math.min(x, a.maxX));
          const nz = Math.max(a.minZ, Math.min(z, a.maxZ));
          if ((nx - x) ** 2 + (nz - z) ** 2 < r * r) return true;
        }
      }
    }
    return false;
  }

  function moveBody(b: { x: number; y: number; z: number; vx: number; vy: number; vz: number; grounded: boolean; crouch: boolean }, dt: number) {
    const nx = b.x + b.vx * dt;
    if (!blocked(nx, b.z, b.y, b.crouch)) b.x = nx;
    else {
      const step = surfaceAt(nx, b.z, b.y + 0.2);
      if (step - b.y > 0 && step - b.y < 0.75 && !blocked(nx, b.z, step, b.crouch)) {
        b.x = nx;
        b.y = step;
      } else b.vx = 0;
    }
    const nz = b.z + b.vz * dt;
    if (!blocked(b.x, nz, b.y, b.crouch)) b.z = nz;
    else {
      const step = surfaceAt(b.x, nz, b.y + 0.2);
      if (step - b.y > 0 && step - b.y < 0.75 && !blocked(b.x, nz, step, b.crouch)) {
        b.z = nz;
        b.y = step;
      } else b.vz = 0;
    }
    b.vy -= 27 * dt;
    b.y += b.vy * dt;
    const g = surfaceAt(b.x, b.z, b.y);
    if (b.y <= g) {
      b.y = g;
      b.vy = 0;
      b.grounded = true;
    } else b.grounded = false;
    if (b.y < -30) {
      b.y = -30;
      b.vy = 0;
    }
  }

  const raycaster = new THREE.Raycaster();
  const decals: { mesh: THREE.Mesh; life: number }[] = [];
  const decalGeo = new THREE.CircleGeometry(0.18, 8);
  const decalMat = new THREE.MeshBasicMaterial({ color: "#2a241c", transparent: true, opacity: 0.7, depthWrite: false });
  const tracers: { mesh: THREE.Mesh; life: number }[] = [];
  const tracerGeo = new THREE.BoxGeometry(1, 1, 1);
  const tracerMat = new THREE.MeshBasicMaterial({ color: "#ffe39a" });
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(tracerGeo, tracerMat);
    m.visible = false;
    m.frustumCulled = false;
    scene.add(m);
    tracers.push({ mesh: m, life: 0 });
  }

  function spawnTracer(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
    const t = tracers.find((tr) => tr.life <= 0);
    if (!t) return;
    _v1.set(ax, ay, az);
    _v2.set(bx, by, bz);
    const len = Math.max(0.2, _v1.distanceTo(_v2));
    _v3.copy(_v1).add(_v2).multiplyScalar(0.5);
    t.mesh.position.copy(_v3);
    t.mesh.scale.set(0.045, 0.045, len);
    t.mesh.lookAt(_v2);
    t.mesh.visible = true;
    t.life = 0.06;
  }

  function spawnDecal(x: number, y: number, z: number) {
    const mesh = new THREE.Mesh(decalGeo, decalMat.clone());
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y + 0.05, z);
    scene.add(mesh);
    decals.push({ mesh, life: 2.5 });
    if (decals.length > 24) {
      const old = decals.shift();
      if (old) {
        scene.remove(old.mesh);
        (old.mesh.material as THREE.Material).dispose();
      }
    }
  }

  type ShotHit =
    | { kind: "actor"; id: number; t: number; head: boolean; x: number; y: number; z: number }
    | { kind: "build"; index: number; t: number; x: number; y: number; z: number }
    | { kind: "ground"; t: number; x: number; y: number; z: number; box?: StaticBox | null; veh?: number };

  function pieceFromIntersect(h: THREE.Intersection) {
    const id = h.instanceId ?? -1;
    if (id < 0) return -1;
    return meshRefs.get(h.object)?.[id] ?? -1;
  }

  /** Rough bounds of a piece; used for the piece being edited, which is hidden behind its edit tiles. */
  function pieceBounds(p: Piece): [number, number, number, number, number, number] {
    const x0 = p.ix * CELL;
    const z0 = p.iz * CELL;
    if (p.kind === "floor") return [x0, p.base, z0, x0 + CELL, p.base + TH, z0 + CELL];
    if (p.kind !== "wall") return [x0, p.base, z0, x0 + CELL, p.base + CELL_H * 0.9, z0 + CELL];
    const yaw = p.rot * (Math.PI / 2);
    const cx = (p.ix + 0.5) * CELL + (-CELL / 2 + TH / 2) * Math.sin(yaw);
    const cz = (p.iz + 0.5) * CELL + (-CELL / 2 + TH / 2) * Math.cos(yaw);
    const hx = (Math.abs(Math.cos(yaw)) * CELL + Math.abs(Math.sin(yaw)) * TH) / 2;
    const hz = (Math.abs(Math.sin(yaw)) * CELL + Math.abs(Math.cos(yaw)) * TH) / 2;
    return [cx - hx, p.base, cz - hz, cx + hx, p.base + CELL_H, cz + hz];
  }

  function queryShot(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, range: number, skip: number, seeThrough = false): ShotHit | null {
    if (dirty && collisionSignature() !== collSig) rebuild();
    _v1.set(dx, dy, dz);
    raycaster.set(_v2.set(ox, oy, oz), _v1);
    raycaster.far = range;
    raycaster.near = 0;
    const list = buildMeshes.filter((m) => m.count > 0);
    const hits = raycaster.intersectObjects(list, false);
    let best: ShotHit | null = null;
    if (hits[0]) {
      const h = hits[0];
      const index = pieceFromIntersect(h);
      if (index >= 0) {
        best = { kind: "build", index, t: h.distance, x: h.point.x, y: h.point.y, z: h.point.z };
      }
    }
    const ep = editPiece >= 0 ? pieces[editPiece] : undefined;
    if (ep) {
      const b = pieceBounds(ep);
      const eh = rayAabb(ox, oy, oz, dx, dy, dz, b[0], b[1], b[2], b[3], b[4], b[5]);
      if (eh && eh.t <= range && (!best || eh.t < best.t)) best = { kind: "build", index: editPiece, t: eh.t, x: eh.x, y: eh.y, z: eh.z };
    }
    const gHits = raycaster.intersectObjects(groundMeshes, false);
    if (gHits[0] && (!best || gHits[0].distance < best.t)) {
      best = { kind: "ground", t: gHits[0].distance, x: gHits[0].point.x, y: gHits[0].point.y, z: gHits[0].point.z };
    }
    if (island) {
      const sh = rayStatic(ox, oy, oz, dx, dy, dz, best ? best.t : range, seeThrough);
      if (sh && (!best || sh.t < best.t)) best = { kind: "ground", t: sh.t, x: sh.x, y: sh.y, z: sh.z, box: sh.box };
    }
    // cars block shots (unless it's the shooter's own car)
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i]!;
      if (skip === 0 && v === driving) continue;
      const t = rayVehicle(v, ox, oy, oz, dx, dy, dz, best ? best.t : range);
      if (t != null && t > 0.05 && (!best || t < best.t)) best = { kind: "ground", t, x: ox + dx * t, y: oy + dy * t, z: oz + dz * t, veh: i };
    }
    const consider = (id: number, team: number, x: number, y: number, z: number, alive: boolean) => {
      if (!alive || id === skip) return;
      const ffa = !mode.teams;
      const selfTeam = skip === 0 ? player.team : (actors.find((a) => a.id === skip)?.team ?? -1);
      if (!ffa && team === selfTeam) return;
      const body = raySphere(ox, oy, oz, dx, dy, dz, x, y + 0.9, z, 0.5);
      const head = raySphere(ox, oy, oz, dx, dy, dz, x, y + 1.5, z, 0.26);
      const t = head ?? body;
      if (t == null || t > range) return;
      if (best && t >= best.t) return;
      best = { kind: "actor", id, t, head: head != null && (body == null || head <= body + 0.05), x, y: y + (head ? 1.5 : 0.9), z };
    };
    if (skip !== 0) consider(0, player.team, player.x, player.y, player.z, player.alive);
    for (const a of actors) consider(a.id, a.team, a.x, a.y, a.z, a.alive);
    return best;
  }

  function floatAt(x: number, y: number, z: number, text: string, crit = false) {
    floaters.push({ x, y, z, text, life: 0.7, crit });
  }

  function hurtActor(a: Actor, dmg: number, head: boolean, byPlayer: boolean, by?: string) {
    if (!a.alive || preT > 0) return;
    let left = dmg;
    if (a.shield > 0) {
      const s = Math.min(a.shield, left);
      a.shield -= s;
      left -= s;
    }
    a.hp -= left;
    a.flash = 0.42;
    a.aggro = Math.max(a.aggro, 8);
    floatAt(a.x, a.y + 1.8, a.z, `${Math.round(dmg)}`, head);
    if (byPlayer) {
      hits++;
      streak++;
      bestStreak = Math.max(bestStreak, streak);
      hitT = 0.12;
      hitHead = head;
      audio.play(head ? "head" : "hit");
      if (a.target) {
        aimScore += head ? 2 : 1;
        aimStreak++;
      }
    }
    if (a.hp <= 0) {
      a.alive = false;
      a.hp = 0;
      a.respawn = mode.respawn || a.target ? (a.target ? 0.45 : 2.6) : 999;
      if (duel && !a.target) duelRoundEnd(true);
      if (byPlayer && !a.target) {
        elims++;
        gain("wood", 20);
        gain("brick", 10);
        gain("metal", 6);
        audio.play("elim");
        pushFeed(`You eliminated ${a.name}`);
        elimPop = { name: a.name, life: 2.6 };
        if (mode.teams) {
          if (player.team === 1) scoreBlue++;
          else scoreRed++;
        }
        if (!duel) spawnDrop(a.x, a.y, a.z);
      } else if (!a.target && !byPlayer) {
        pushFeed(by ? (by === "the storm" ? `${a.name} was lost in the storm` : `${by} eliminated ${a.name}`) : `${a.name} down`);
      }
      if (island && !a.target) {
        if (a.gun) spillItem(a.x + 0.6, a.y, a.z, { t: "gun", slot: a.gun as GunSlot, r: a.rarity ?? 0 });
        if (Math.random() < 0.5) spillItem(a.x - 0.6, a.y, a.z + 0.4, { t: "shield", n: 50 });
        if (a.glider) {
          a.glider.open = 0;
          a.glider.group.visible = false;
        }
      }
      if (a.target) {
        a.respawn = 0.4;
      }
    }
  }

  let godMode = false;
  /** Tests: bots stand still and don't shoot. */
  let botsFrozen = false;
  const hurtDirs: { x: number; z: number; life: number }[] = [];
  let elimPop: { name: string; life: number } | null = null;
  function hurtPlayer(dmg: number, src: string, from?: { x: number; z: number }) {
    if (!player.alive || ended || godMode) return;
    if (preT > 0) return; // warm-up on the spawn island: no damage
    if (matchT < 3 && src !== "the void") return;
    if (from) {
      const old = hurtDirs.find((d) => Math.hypot(d.x - from.x, d.z - from.z) < 2);
      if (old) old.life = 1;
      else hurtDirs.push({ x: from.x, z: from.z, life: 1 });
      if (hurtDirs.length > 4) hurtDirs.shift();
    }
    let left = dmg;
    if (player.shield > 0) {
      const s = Math.min(player.shield, left);
      player.shield -= s;
      left -= s;
    }
    player.hp -= left;
    hurtT = 0.35;
    shake = Math.min(0.4, shake + 0.12);
    healT = 0;
    audio.play("hurt");
    streak = 0;
    aimStreak = 0;
    if (player.hp <= 0) {
      player.hp = 0;
      player.alive = false;
      if (duel) {
        duelRoundEnd(false, src);
        return;
      }
      if (mode.teams) {
        const mate = actors.some((a) => a.alive && a.team === player.team);
        if (mate) {
          say("Down — teammate still up");
          return;
        }
      }
      finish(false, `Eliminated by ${src}`);
    }
  }

  function spawnDrop(x: number, y: number, z: number) {
    const kind = Math.random() < 0.5 ? "shield" : "wood";
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.28),
      new THREE.MeshLambertMaterial({ color: kind === "shield" ? "#7ecbff" : "#e0a15c", emissive: kind === "shield" ? "#226" : "#420" }),
    );
    mesh.position.set(x, y + 0.8, z);
    scene.add(mesh);
    drops.push({ kind, x, y: y + 0.8, z, mesh, life: 18 });
  }

  function livingHostiles() {
    return actors.filter((a) => a.alive && !a.target && (mode.teams ? a.team !== player.team : true)).length;
  }

  function checkRound() {
    if (ended || mode.aim || duel) return;
    if (mode.teams && mode.scoreLimit && (scoreBlue >= mode.scoreLimit || scoreRed >= mode.scoreLimit)) {
      const win = scoreBlue >= mode.scoreLimit;
      finish(win, win ? "Blue holds the point" : "Red takes the round");
      return;
    }
    if (!mode.respawn && livingHostiles() === 0 && actors.some((a) => !a.target)) {
      finish(true, mode.teams ? "Enemy team wiped" : "Last builder standing");
    }
    if (mode.teams && !player.alive && !actors.some((a) => a.alive && a.team === player.team)) {
      finish(false, "Team wiped");
    }
  }

  function finish(win: boolean, subtitle: string) {
    if (ended) return;
    ended = true;
    const placement = win ? 1 : livingHostiles() + 1;
    const gold = mode.aim ? aimScore * 2 : (win ? 160 : 30) + elims * 28;
    const xp = mode.aim ? aimScore : (win ? 120 : 40) + elims * 20;
    if (win) audio.play("win");
    opts.onEnd({
      win,
      title: win ? "Victory" : "Eliminated",
      subtitle,
      elims,
      placement,
      shots,
      hits,
      streak: bestStreak,
      gold,
      xp,
      aimScore,
    });
  }

  function syncWeapon(rig: Rig, kind: "pick" | "ar" | "shotgun" | "smg" | "sniper" | "heal" | "build", color?: string, rarity = 0, style?: string) {
    const key = `${kind}:${color ?? ""}:${rarity}:${style ?? ""}`;
    if (rig.weapon.userData.vis === key) return;
    const first = rig.weapon.userData.vis === undefined;
    rig.weapon.userData.vis = key;
    fillWeapon(rig.weapon, kind, color, rarity, style);
    if (!first) rig.fx.equip = 1;
    rig.backPick.visible = kind !== "pick" && kind !== "build";
    rig.armed = kind === "ar" || kind === "shotgun" || kind === "smg" || kind === "sniper";
  }

  function weaponKind(): "pick" | "ar" | "shotgun" | "smg" | "sniper" | "heal" | "build" {
    if (buildKind) return "build";
    return (["pick", "ar", "shotgun", "smg", "sniper", "heal"] as const)[slot] ?? "ar";
  }

  function currentGun() {
    const k = weaponKind();
    if (k === "ar") return { id: "ar" as const, cd: 0.1, dmg: 24, spread: 0.02, auto: true, pellets: 1, range: 90, mag: "ar" as const };
    if (k === "shotgun") return { id: "shotgun" as const, cd: 0.85, dmg: 11, spread: 0.12, auto: false, pellets: 8, range: 28, mag: "shotgun" as const };
    if (k === "smg") return { id: "smg" as const, cd: 0.07, dmg: 14, spread: 0.04, auto: true, pellets: 1, range: 55, mag: "smg" as const };
    if (k === "sniper") return { id: "sniper" as const, cd: 1.2, dmg: 98, spread: 0.002, auto: false, pellets: 1, range: 160, mag: "sniper" as const };
    return null;
  }

  let prevFire = false;

  function shoot() {
    const gun = currentGun();
    if (!gun || !player.alive || ended || drop) return;
    if (duel && (duel.freeze > 0 || duel.over > 0)) return;
    if (reloadT > 0) return;
    if (mag[gun.mag] <= 0) {
      if (reserve[gun.mag] > 0) startReload();
      else audio.play("empty");
      return;
    }
    if (shootCd > 0) return;
    shootCd = gun.cd;
    mag[gun.mag]--;
    shots++;
    bloom = Math.min(1, bloom + (gun.id === "shotgun" ? 0.5 : 0.18));
    const kick = gun.id === "sniper" ? 0.05 : gun.id === "shotgun" ? 0.045 : 0.012;
    camPitch = Math.min(1.15, camPitch + kick);
    recoil += kick;
    kickWeapon(playerRig, gun.id === "sniper" ? 1.5 : gun.id === "shotgun" ? 1.25 : gun.id === "smg" ? 0.32 : 0.45);
    shake = Math.min(0.25, shake + kick);
    audio.play(gun.id === "shotgun" ? "shotgun" : gun.id === "sniper" ? "sniper" : gun.id === "smg" ? "smg" : "shot");
    muzzle = 0.22;
    // aiming down sights tightens the spread (snipers are pin-point when scoped, near useless from the hip)
    const adsK = gun.id === "sniper" ? 1 - adsT * 0.97 : gun.id === "shotgun" ? 1 - adsT * 0.25 : scopedGun() ? 1 - adsT * 0.85 : 1 - adsT * 0.62;
    const spread = (gun.id === "sniper" && adsT < 0.5 ? 0.05 : gun.spread) * (1 + bloom * (2 - adsT * 1.2)) * adsK;
    const origin = camera.position.clone();
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const advance = Math.max(0, origin.distanceTo(_v3.set(player.x, player.y + 1.4, player.z)) - 0.2);
    origin.addScaledVector(dir, advance);
    for (let p = 0; p < gun.pellets; p++) {
      const d = dir.clone();
      d.x += (Math.random() - 0.5) * spread;
      d.y += (Math.random() - 0.5) * spread;
      d.z += (Math.random() - 0.5) * spread;
      d.normalize();
      const hit = queryShot(origin.x, origin.y, origin.z, d.x, d.y, d.z, gun.range, 0);
      const end = origin.clone().addScaledVector(d, hit ? hit.t : Math.min(40, gun.range));
      spawnTracer(origin.x, origin.y, origin.z, end.x, end.y, end.z);
      if (!hit) {
        if (gun.pellets === 1) {
          streak = 0;
          aimStreak = 0;
        }
        continue;
      }
      if (hit.kind === "actor") {
        const a = actors.find((ac) => ac.id === hit.id);
        const mult = hit.head ? 1.75 : 1;
        if (a) hurtActor(a, gun.dmg * mult * (island ? RAR_MULT[invRarity[slot]!]! : 1), hit.head, true);
      } else if (hit.kind === "build") {
        const piece = pieces[hit.index];
        if (piece && (piece.owner !== 0 || slot === 0)) {
          hitPiece(piece, gun.id === "shotgun" ? 18 : gun.dmg, hit.x, hit.y, hit.z);
          if (piece.hp <= 0) {
            audio.play("break");
            if (piece.owner === 0) gain(piece.mat, 4);
          }
        }
      } else if (hit.veh != null) damageVehicle(vehicles[hit.veh]!, gun.dmg * (gun.id === "shotgun" ? 0.6 : 1), hit.x, hit.y, hit.z);
      else if (!shatter(hit.box)) spawnDecal(hit.x, hit.y, hit.z);
    }
    if (mag[gun.mag] <= 0 && reserve[gun.mag] > 0) startReload();
    checkRound();
  }

  function startReload() {
    const gun = currentGun();
    if (!gun || reloadT > 0 || mag[gun.mag] >= (gun.mag === "ar" ? 30 : gun.mag === "shotgun" ? 5 : gun.mag === "smg" ? 25 : 1)) return;
    if (reserve[gun.mag] <= 0) return;
    reloadT = gun.id === "sniper" ? 2.1 : gun.id === "shotgun" ? 1.7 : gun.id === "smg" ? 1.3 : 1.5;
    reloadDur = reloadT;
    audio.play("reload");
  }

  function finishReload() {
    const gun = currentGun();
    if (!gun) return;
    const cap = gun.mag === "ar" ? 30 : gun.mag === "shotgun" ? 5 : gun.mag === "smg" ? 25 : 1;
    const need = cap - mag[gun.mag];
    const take = Math.min(need, reserve[gun.mag]);
    mag[gun.mag] += take;
    reserve[gun.mag] -= take;
  }

  /* ---------- harvesting weak points (Fortnite's blue circle) ---------- */
  const weak = { key: null as object | null, x: 0, y: 0, z: 0, life: 0, pop: 0, px: 0, py: 0, pz: 0 };
  const weakTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const grd = g.createRadialGradient(64, 64, 10, 64, 64, 62);
    grd.addColorStop(0, "rgba(120,220,255,0.95)");
    grd.addColorStop(0.45, "rgba(40,150,255,0.75)");
    grd.addColorStop(0.75, "rgba(30,110,255,0.35)");
    grd.addColorStop(1, "rgba(30,110,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = "rgba(255,255,255,0.95)";
    g.lineWidth = 7;
    g.beginPath();
    g.arc(64, 64, 40, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "rgba(255,255,255,0.9)";
    g.beginPath();
    g.arc(64, 64, 11, 0, Math.PI * 2);
    g.fill();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const weakSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: weakTex, transparent: true, depthTest: false, depthWrite: false }));
  weakSprite.renderOrder = 5;
  weakSprite.visible = false;
  scene.add(weakSprite);
  const weakPop = new THREE.Sprite(new THREE.SpriteMaterial({ map: weakTex, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
  weakPop.renderOrder = 5;
  weakPop.visible = false;
  scene.add(weakPop);
  /** Put the weak point on the side of a round object facing the player. */
  function placeWeakRound(key: object, cx: number, cz: number, r: number, y0: number, y1: number) {
    const ang = Math.atan2(player.x - cx, player.z - cz) + (Math.random() - 0.5) * 1.3;
    weak.key = key;
    weak.x = cx + Math.sin(ang) * r;
    weak.z = cz + Math.cos(ang) * r;
    weak.y = y0 + Math.random() * Math.max(0.1, y1 - y0);
    weak.life = 4.5;
  }
  /** Put the weak point on a flat surface around where it was hit. */
  function placeWeakFlat(key: object, x: number, y: number, z: number) {
    const dx = x - player.x;
    const dz = z - player.z;
    const l = Math.hypot(dx, dz) || 1;
    const tx = -dz / l;
    const tz = dx / l;
    const off = (Math.random() - 0.5) * 1.6;
    weak.key = key;
    weak.x = x + tx * off - (dx / l) * 0.06;
    weak.z = z + tz * off - (dz / l) * 0.06;
    weak.y = Math.max(player.y + 0.4, Math.min(player.y + 2.1, y + (Math.random() - 0.5) * 1.1));
    weak.life = 4.5;
  }
  /** True when the crosshair is on the current weak point of `key`. */
  function aimOnWeak(key: object) {
    if (weak.key !== key || weak.life <= 0) return false;
    viewRay(_rayO, _rayD);
    const lx = weak.x - _rayO.x;
    const ly = weak.y - _rayO.y;
    const lz = weak.z - _rayO.z;
    const t = lx * _rayD.x + ly * _rayD.y + lz * _rayD.z;
    if (t < 0) return false;
    const d = Math.hypot(lx - _rayD.x * t, ly - _rayD.y * t, lz - _rayD.z * t);
    return d < 0.42 + t * 0.02;
  }
  function weakCrit() {
    weak.pop = 0.3;
    weak.px = weak.x;
    weak.py = weak.y;
    weak.pz = weak.z;
    audio.play("weak");
  }
  function updateWeak(dt: number, time: number) {
    weak.life -= dt;
    if (weak.key && (weak.life <= 0 || Math.hypot(weak.x - player.x, weak.z - player.z) > 7)) weak.key = null;
    weakSprite.visible = !!weak.key && player.alive;
    if (weakSprite.visible) {
      weakSprite.position.set(weak.x, weak.y, weak.z);
      const s = 0.52 + Math.sin(time * 9) * 0.05;
      weakSprite.scale.set(s, s, 1);
      (weakSprite.material as THREE.SpriteMaterial).opacity = Math.min(1, weak.life * 2);
    }
    weak.pop = Math.max(0, weak.pop - dt);
    weakPop.visible = weak.pop > 0;
    if (weakPop.visible) {
      const k = 1 - weak.pop / 0.3;
      weakPop.position.set(weak.px, weak.py, weak.pz);
      weakPop.scale.setScalar(0.5 + k * 1.1);
      (weakPop.material as THREE.SpriteMaterial).opacity = 1 - k;
    }
  }

  function melee() {
    if (swing > 0 || !player.alive || drop) return;
    swing = SWING;
    playerRig.fx.combo++;
    audio.play("swing");
    const fx = -Math.sin(camYaw);
    const fz = -Math.cos(camYaw);
    if (island) {
      let done = false;
      for (const h of island.harvest) {
        if (!h.alive) continue;
        const dx = h.x - player.x;
        const dz = h.z - player.z;
        const d = Math.hypot(dx, dz);
        if (d > h.r + 1.5 || dx * fx + dz * fz < 0.15 * d || player.y > h.y + h.height + 1 || player.y + 2.2 < h.y) continue;
        const crit = aimOnWeak(h);
        h.hp -= crit ? 2 : 1;
        h.hit(fx, fz);
        const give = crit ? h.give * 2 : h.give;
        gain(h.mat, give);
        floatAt(h.x, player.y + 1.8, h.z, `+${give}`, crit);
        if (crit) weakCrit();
        // the weak point appears after the first hit, then jumps to a new spot on every crit
        if (crit || weak.key !== h) {
          const yTop = Math.min(h.y + h.height * 0.85, player.y + 2.1);
          const yBot = Math.max(h.y + 0.35, player.y + 0.3);
          const r = h.kind === "tree" ? Math.max(0.3, h.r * 0.3) : h.kind === "car" ? 1.05 : h.kind === "rock" ? Math.max(0.6, h.r - 0.75) : 0.62;
          placeWeakRound(h, h.x, h.z, r, yBot, Math.max(yBot + 0.2, yTop));
        }
        spawnChunks(h.mat, player.x + fx * 1.1, player.y + 1.2, player.z + fz * 1.1, 4, 2.2, false);
        audio.play("hit");
        if (h.hp <= 0) {
          h.alive = false;
          h.hide();
          if (weak.key === h) weak.key = null;
          audio.play("break");
          spawnChunks(h.mat, h.x, h.y + 1, h.z, 12, 3, true);
        }
        done = true;
        break;
      }
      if (!done) {
        const sh = queryShot(player.x, player.y + 1.2, player.z, fx, 0, fz, 2.6, 0);
        if (sh?.kind === "ground" && sh.veh != null) {
          const v = vehicles[sh.veh]!;
          const crit = aimOnWeak(v);
          gain("metal", crit ? 12 : 6);
          floatAt(sh.x, sh.y + 0.4, sh.z, crit ? "+12" : "+6", crit);
          if (crit) weakCrit();
          if (crit || weak.key !== v) placeWeakFlat(v, sh.x, sh.y, sh.z);
          damageVehicle(v, crit ? 60 : 30, sh.x, sh.y, sh.z);
          audio.play("hit");
        } else if (sh?.kind === "ground" && sh.box?.glass) shatter(sh.box);
        else if (sh?.kind === "ground" && sh.box && breakable(sh.box)) {
          // everything standing on the island can be pickaxed down: house walls (just the section you
          // hit), fences, furniture, props. Floors, roofs and foundations stay so the ground stays whole.
          const box = sh.box;
          const crit = aimOnWeak(box);
          const m = box.mat ?? "wood";
          if (box.mat) {
            gain(box.mat, crit ? 8 : 4);
            floatAt(sh.x, sh.y + 0.4, sh.z, crit ? "+8" : "+4", crit);
          }
          if (crit) weakCrit();
          const left = (worldHp.get(box) ?? worldMaxHp(box)) - (crit ? 100 : 50);
          worldHp.set(box, left);
          spawnChunks(m, sh.x, sh.y, sh.z, 4, 2, false);
          audio.play("hit");
          if (left <= 0) {
            const c = island.breakBox(box);
            if (weak.key === box) weak.key = null;
            if (c) {
              const big = Math.max(box.maxX - box.minX, box.maxZ - box.minZ, box.maxY - box.minY);
              spawnChunks(m, c[0], c[1], c[2], Math.min(22, 8 + Math.round(big * 2)), 3, true);
              audio.play("break");
            }
          } else if (crit || weak.key !== box) placeWeakFlat(box, sh.x, sh.y, sh.z);
        }
      }
    }
    for (const tree of trees) {
      if (tree.hp <= 0) continue;
      const dx = tree.x - player.x;
      const dz = tree.z - player.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 3.1 && dx * fx + dz * fz > 0.2) {
        tree.hp--;
        audio.play("hit");
        if (tree.hp <= 0) {
          tree.mesh.visible = false;
          gain("wood", 35);
          say("+35 wood");
          audio.play("break");
        }
      }
    }
    for (const a of actors) {
      if (!a.alive) continue;
      const dx = a.x - player.x;
      const dz = a.z - player.z;
      if (Math.hypot(dx, dz) < 2.6 && dx * fx + dz * fz > 0.15) hurtActor(a, 28, false, true);
    }
    if (dirty) {
      /* builds */
    }
    const hit = queryShot(player.x, player.y + 1.2, player.z, fx, 0, fz, 3.2, 0);
    if (hit?.kind === "build") {
      const piece = pieces[hit.index];
      if (piece) {
        hitPiece(piece, 55, hit.x, hit.y, hit.z);
        audio.play("hit");
        if (piece.hp <= 0) {
          audio.play("break");
          gain(piece.mat, 8);
        }
      }
    }
  }

  function isDown(code: string) {
    if (injected) return injected.has(code);
    return keys.has(code);
  }

  function readMove() {
    const binds = opts.getSettings().binds;
    let x = 0;
    let z = 0;
    if (isDown("KeyW") || isDown("ArrowUp") || isDown(binds.jump) && false) z += 1;
    if (isDown("KeyS") || isDown("ArrowDown")) z -= 1;
    if (isDown("KeyD") || isDown("ArrowRight")) x += 1;
    if (isDown("KeyA") || isDown("ArrowLeft")) x -= 1;
    if (!injected) {
      x += opts.pad.moveX;
      z += opts.pad.moveY;
    }
    return { x, z };
  }

  // yaw 0 faces world -Z. +yaw turns toward -X (screen-left from the chase cam).
  // forward = (-sin yaw, 0, -cos yaw), right = (cos yaw, 0, -sin yaw)
  // A strafes on -right, which is screen-left. Body yaw eases toward the
  // move vector so W+A increases yaw; aim and shots stay on camera yaw.
  function updatePlayer(dt: number) {
    const st = opts.getSettings();
    const sens = (0.0004 + (st.mouseSens / 100) * 0.0042) * (adsT > 0.5 ? (st.adsSens / 100) * (scoped() ? 0.45 : 1) : 1);
    const lookX = opts.pad.lookX;
    const lookY = opts.pad.lookY;
    opts.pad.lookX = 0;
    opts.pad.lookY = 0;
    camYaw -= lookX * (0.004 + (st.gamepadSens / 100) * 0.01);
    const my = st.invertY ? -lookY : lookY;
    camPitch -= my * (0.0035 + (st.gamepadSens / 100) * 0.008);
    camPitch = Math.max(-0.85, Math.min(1.15, camPitch));
    if (recoil > 0) {
      const rec = recoil * Math.min(1, dt * 8);
      recoil -= rec;
      camPitch = Math.max(-0.85, camPitch - rec);
    }

    if (drop) {
      updateDrop(dt);
      return;
    }
    if (driving) {
      updateDriving(dt);
      return;
    }
    if (duel && (duel.freeze > 0 || duel.over > 0)) {
      // round countdown / round over: hold still (gravity still applies)
      player.vx = player.vz = 0;
      moveBody(player, dt);
      return;
    }
    const wish = readMove();
    const forwardX = -Math.sin(camYaw);
    const forwardZ = -Math.cos(camYaw);
    const rightX = Math.cos(camYaw);
    const rightZ = -Math.sin(camYaw);
    let mx = forwardX * wish.z + rightX * wish.x;
    let mz = forwardZ * wish.z + rightZ * wish.x;
    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }
    const sprint = isDown("ControlLeft") || isDown(st.binds.sprint);
    // Shift sprints (forward-ish only, not while aiming); Z crouches. No sliding or rolling.
    const crouch = isDown(st.binds.crouch) || !!opts.pad.crouch;
    player.crouch = crouch;
    sprinting = sprint && !crouch && adsT < 0.3 && player.grounded && len > 0.4;
    const speed = player.crouch ? 4.3 : sprinting ? 10.8 : 7.5;
    const slow = (healT > 0 ? 0.45 : 1) * (island && player.y < 0.3 && island.wet(player.x, player.z) ? 0.62 : 1) * (1 - adsT * 0.42);
    const tx = mx * speed * slow;
    const tz = mz * speed * slow;
    const accel = player.grounded ? 16 : 3.2;
    const k = 1 - Math.exp(-accel * dt);
    player.vx += (tx - player.vx) * k;
    player.vz += (tz - player.vz) * k;

    const moving = Math.hypot(tx, tz) > 0.4;
    // with a gun out the character keeps facing where the camera looks (strafing / backpedalling), so the
    // gun stays up in front instead of the body turning away and hiding it
    const gunOut = !!currentGun() && !buildKind;
    const aiming = mouse.r || opts.pad.aim || mouse.l || buildKind != null || gunOut;
    // moving, jumping, aiming, shooting or building stops an emote (like Fortnite)
    if (emote && (moving || mouse.r || opts.pad.aim || mouse.l || buildKind != null || editPiece >= 0 || !player.grounded || isDown("Space") || isDown(st.binds.jump) || opts.pad.jump)) emote = null;
    if (emote) {
      emote.t += dt;
      player.yaw += angDelta(player.yaw, emote.yaw) * Math.min(1, 10 * dt);
    } else if (aiming || !moving) {
      player.yaw += angDelta(player.yaw, camYaw) * Math.min(1, 14 * dt);
    } else {
      const desired = Math.atan2(-tx, -tz);
      player.yaw += angDelta(player.yaw, desired) * Math.min(1, 12 * dt);
    }

    const jumpPressed = isDown("Space") || isDown(st.binds.jump) || opts.pad.jump;
    if (jumpPressed) player.jumpBuf = 0.14;
    else player.jumpBuf = Math.max(0, player.jumpBuf - dt);
    if (player.grounded) player.coyote = 0.12;
    else player.coyote = Math.max(0, player.coyote - dt);
    if (player.jumpBuf > 0 && player.coyote > 0) {
      player.vy = 9.4;
      player.grounded = false;
      player.coyote = 0;
      player.jumpBuf = 0;
      audio.play("jump");
    }
    moveBody(player, dt);
    if (player.y < -8 && player.alive && !ended) {
      if (preT > 0) {
        const [sx, sz] = spawnPoints(16)[0]!;
        player.x = sx;
        player.z = sz;
        player.y = groundHeight(sx, sz);
        player.vy = 0;
      } else if (mode.aim) {
        player.x = 0;
        player.z = 8;
        player.y = 2;
        player.vy = 0;
      } else hurtPlayer(100, "the void");
    }
  }

  function viewRay(origin: THREE.Vector3, dir: THREE.Vector3) {
    if (document.pointerLockElement === canvas || !mouse.have) {
      camera.getWorldDirection(dir);
      origin.copy(camera.position);
    } else {
      const rect = canvas.getBoundingClientRect();
      const ndcX = ((mouse.cx - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      const ndcY = -((mouse.cy - rect.top) / Math.max(1, rect.height)) * 2 + 1;
      _v3.set(ndcX, ndcY, 0.5).unproject(camera);
      dir.copy(_v3).sub(camera.position).normalize();
      origin.copy(camera.position);
    }
    const adv = Math.max(0, origin.distanceTo(_v2.set(player.x, player.y + 1.3, player.z)) - 0.15);
    origin.addScaledVector(dir, adv);
  }

  function closestOwnPiece(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number) {
    let best = -1;
    let bestD = 3.8;
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i];
      if (!p || p.owner !== 0) continue;
      if (camPitch > -0.55 && underPlayer(p)) continue;
      const cx = (p.ix + 0.5) * CELL;
      const cy = p.base + (p.kind === "floor" ? 0.2 : CELL_H * 0.45);
      const cz = (p.iz + 0.5) * CELL;
      const lx = cx - ox;
      const ly = cy - oy;
      const lz = cz - oz;
      const t = lx * dx + ly * dy + lz * dz;
      if (t < 0.3 || t > 18) continue;
      const d = Math.hypot(lx - dx * t, ly - dy * t, lz - dz * t);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  function cellGround(ix: number, iz: number) {
    const cx = (ix + 0.5) * CELL;
    const cz = (iz + 0.5) * CELL;
    const center = island ? surfaceAt(cx, cz, player.y + 1.5) : groundHeight(cx, cz);
    if (center < -8) return center;
    const dx = player.x - cx;
    const dz = player.z - cz;
    const len = Math.hypot(dx, dz) || 1;
    const ex = cx + (dx / len) * CELL * 0.42;
    const ez = cz + (dz / len) * CELL * 0.42;
    const edge = island ? surfaceAt(ex, ez, player.y + 1.5) : groundHeight(ex, ez);
    return Math.max(Math.min(center, edge), center - 0.9);
  }

  /**
   * Which way a wall or stairs faces: set by the way the player is looking (snapped to the grid), with a
   * little stickiness so the piece doesn't flip back and forth when you look along a diagonal. It only
   * turns when the player turns (or rotates it with the wheel / middle mouse).
   */
  let lookRot = 0;
  function facingRot(_ix?: number, _iz?: number) {
    const fx = -Math.sin(camYaw);
    const fz = -Math.cos(camYaw);
    const ang = Math.atan2(fx, fz); // 0 = +z, +pi/2 = +x
    const cur = (lookRot * Math.PI) / 2;
    const off = Math.atan2(Math.sin(ang - cur), Math.cos(ang - cur));
    if (Math.abs(off) > Math.PI / 4 + 0.14) lookRot = ((Math.round(ang / (Math.PI / 2)) % 4) + 4) % 4;
    return lookRot;
  }

  /**
   * Highest ground (terrain or solid props, not builds) under a piece's footprint: the whole cell
   * for floors, ramps and cones, the wall's own edge for walls. A piece placed at this height sits on
   * the slope instead of sinking into it.
   */
  function groundFit(kind: BuildKind, ix: number, iz: number, rot: number) {
    const cx = (ix + 0.5) * CELL;
    const cz = (iz + 0.5) * CELL;
    const pts: [number, number][] = [];
    if (kind === "wall") {
      const yaw = rot * (Math.PI / 2);
      const c = Math.cos(yaw);
      const sn = Math.sin(yaw);
      const lz = -CELL / 2 + TH / 2;
      for (let k = -2; k <= 2; k++) {
        const lx = (k / 2) * CELL * 0.46;
        pts.push([cx + lz * sn + lx * c, cz + lz * c - lx * sn]);
      }
    } else for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) pts.push([cx + i * CELL * 0.46, cz + j * CELL * 0.46]);
    let hi = -Infinity;
    for (const [x, z] of pts) {
      let h = groundHeight(x, z);
      if (island) h = Math.max(h, staticTop(x, z, player.y + 1.5, true));
      if (h > -8) hi = Math.max(hi, h);
    }
    return hi;
  }

  function connectBase(ix: number, iz: number, kind: BuildKind, rot: number, dy: number) {
    const fit = groundFit(kind, ix, iz, rot);
    const g = cellGround(ix, iz);
    // looking steeply up builds a level higher (floors/cones over your head, walls above)
    const lift = 0;
    const grounded = g > -8 && player.y < g + 1.1;
    let base: number;
    let best: number;
    if (grounded && fit > -8) {
      // on the ground: sit the piece on the terrain under it
      base = Math.max(fit, 0) + lift;
      best = 0;
    } else {
      const hint = grounded ? Math.max(g, 0) + lift : player.y + 0.35 + lift;
      base = snapBase(hint);
      best = Math.abs(base - hint);
    }
    const floorY = fit > -8 ? Math.max(fit, 0) + lift : -Infinity;
    const target = base;
    let matched = false;
    // neighbours are judged by where pieces really are (a wall's middle is on its edge), so the four walls
    // of a box, the floor inside it and the stairs next to it all count as touching and share one level
    const [ax, az] = pieceAnchor(kind, ix, iz, rot);
    for (const p of pieces) {
      const [bx, bz] = pieceAnchor(p.kind, p.ix, p.iz, p.rot);
      const gap = Math.hypot(ax - bx, az - bz);
      if (gap > CELL * 1.05) continue;
      const manh = gap < CELL * 0.3 || (p.ix === ix && p.iz === iz) ? 0 : 1;
      // pieces in the same cell share its level (a ramp behind a wall, a floor under a cone)
      if (manh === 0 && grounded && fit > -8) {
        if (p.base - floorY <= 1.3 && p.base - floorY >= -0.45 && (!matched || Math.abs(p.base - target) < best)) {
          base = p.base;
          best = Math.abs(p.base - target);
          matched = true;
        }
        continue;
      }
      if (manh === 0) continue;
      // a neighbour offers its own level, and (walls, ramps, cones) its top edge; snapping to it keeps
      // structures lined up, but never pulls a piece down into the ground
      const levels = p.kind === "floor" ? [p.base] : [p.base, p.base + CELL_H];
      for (const lv of levels) {
        if (lv < floorY - 0.45) continue;
        const d = Math.abs(lv - target);
        // on the ground a neighbour's level wins if it is close (raised over or sunk a little into the
        // slope), so pieces built side by side line up and connect instead of stepping
        const ok = grounded && fit > -8 ? lv - floorY <= 1.3 && lv - floorY >= -0.45 && (!matched || d < best) : d <= CELL_H * 0.85 && d <= best + 0.25;
        if (ok) {
          base = lv;
          best = d;
          matched = true;
        }
      }
    }
    if (fit > -8 && base < Math.max(fit, 0) - 0.45) base = Math.max(fit, 0);
    return base;
  }

  function inFootprint(ix: number, iz: number) {
    return player.x > ix * CELL + 0.2 && player.x < (ix + 1) * CELL - 0.2 && player.z > iz * CELL + 0.2 && player.z < (iz + 1) * CELL - 0.2;
  }

  function wallHitsPlayer(ix: number, iz: number, base: number, rot: number) {
    const yaw = rot * (Math.PI / 2);
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const lz = -CELL / 2 + TH / 2;
    const cx = (ix + 0.5) * CELL + lz * s;
    const cz = (iz + 0.5) * CELL + lz * c;
    const hx = (Math.abs(c) * CELL + Math.abs(s) * TH) / 2;
    const hz = (Math.abs(s) * CELL + Math.abs(c) * TH) / 2;
    const y0 = base;
    const y1 = base + CELL_H;
    if (player.y + 1.6 < y0 || player.y + 0.2 > y1) return false;
    const nx = Math.max(cx - hx, Math.min(player.x, cx + hx));
    const nz = Math.max(cz - hz, Math.min(player.z, cz + hz));
    return (nx - player.x) ** 2 + (nz - player.z) ** 2 < 0.42 ** 2;
  }

  function overlapsPlayer(kind: BuildKind, ix: number, iz: number, base: number, rot: number) {
    // stairs and cones can go on the square you stand in (like Fortnite): they lift you onto them
    if (kind === "floor" || kind === "ramp" || kind === "pyramid") return false;
    if (kind === "wall") return wallHitsPlayer(ix, iz, base, rot);
    const head = player.y + (player.crouch ? 1.05 : 1.62);
    if (head < base + 0.25 || player.y > base + CELL_H - 0.05) return false;
    return inFootprint(ix, iz);
  }

  /**
   * Where the held piece goes. Like Fortnite and 1v1.LOL this is decided by where you stand and which way you
   * face, never by what the crosshair happens to hit, so the same aim always gives the same spot:
   *  - walls go on the edge of your own square that you are facing
   *  - floors, stairs and cones go on the square in front of you, or your own square when you look down
   *  - the level is the one you stand on (ground pieces sit on the terrain; up on builds they line up)
   */
  function placement(): { ix: number; iy: number; iz: number; rot: number; base: number; ok: boolean; why: string } | null {
    if (!buildKind || drop) return null;
    const REACH = CELL * 1.9;
    const d = facingRot(); // 0 +z, 1 +x, 2 -z, 3 -x
    const DX = [0, 1, 0, -1];
    const DZ = [1, 0, -1, 0];
    const pcx = Math.floor(player.x / CELL);
    const pcz = Math.floor(player.z / CELL);
    const down = camPitch < -0.62;
    let ix = pcx + DX[d]!;
    let iz = pcz + DZ[d]!;
    let why = "front";
    if (buildKind !== "wall" && down) {
      ix = pcx;
      iz = pcz;
      why = "under";
    }
    // a wall on the front edge of your square is the back edge of the square in front, facing you
    let rot = buildKind === "wall" || buildKind === "ramp" ? d : 0;
    rot = (rot + userRot) & 3;
    let base = connectBase(ix, iz, buildKind, rot, 0);
    // standing on stairs: the piece ahead in the way they climb goes off their top (ramp rushing); pieces
    // to the sides or behind stay at the stairs' own level
    let onStairs = false;
    for (const p of cellPieces(pcx, pcz)) {
      if (p.kind !== "ramp") continue;
      if (player.y < p.base - 0.2 || player.y > p.base + CELL_H + 0.3) continue;
      onStairs = true;
      if (why !== "front") break;
      if (!p.stair && p.mask === 0b1111 && p.rot === d) {
        base = p.base + CELL_H;
        why = "ramp-top";
      } else {
        base = p.base;
        why = "ramp-side";
      }
      break;
    }
    // a wall already on the edge you face (inside a box): floors, stairs and cones go in your own square
    // instead of outside the wall
    if (buildKind !== "wall" && why === "front" && wallOnEdge(ix, iz, d, player.y + 0.6)) {
      ix = pcx;
      iz = pcz;
      why = "inside";
      base = connectBase(ix, iz, buildKind, rot, 0);
    }
    // looking up builds on top of your builds: a roof over your head with floors and cones, and the next
    // level up when the spot at your level is already built
    if (!onStairs && (buildKind === "floor" || buildKind === "pyramid") && camPitch > 0.62) {
      ix = pcx;
      iz = pcz;
      base = snapBase(player.y + 0.35) + CELL_H;
      why = "roof";
    } else if (camPitch > 0.18 && buildKind === "wall") {
      // walls stack straight up on walls; stairs never pile up on stairs in mid-air
      for (let k = 0; k < 2 && duplicate(buildKind, ix, iz, rot, base); k++) {
        base += CELL_H;
        why = "stack";
      }
    }
    const dist = Math.hypot((ix + 0.5) * CELL - player.x, (iz + 0.5) * CELL - player.z);
    const iy = Math.round(base / CELL_H);
    const ok =
      dist <= REACH + CELL * 0.35 &&
      playerSupport(buildKind, ix, iz, rot, base) &&
      !duplicate(buildKind, ix, iz, rot, base) &&
      (infinite || preT > 0 || mats[curMat] >= 10) &&
      !overlapsPlayer(buildKind, ix, iz, base, rot);
    return { ix, iy, iz, rot, base, ok, why };
  }

  function showGhost() {
    const spot = buildKind && player.alive && !ended ? placement() : null;
    ghostWall.visible = false;
    ghostFloor.visible = false;
    ghostPyr.visible = false;
    rampGhost.visible = false;
    if (!spot || !buildKind) return;
    const col = spot.ok ? 0xb9e2ff : 0xff7a7a;
    const pulse = 0.46 + Math.sin(performance.now() * 0.006) * 0.07;
    for (const gm of [ghostMat, ghostWallMat]) {
      gm.color.setHex(col);
      gm.opacity = pulse;
    }
    ghostLine.color.setHex(spot.ok ? 0xf2fbff : 0xffd0d0);
    if (ghostWallMat.map !== holoWallMaps[curMat]) {
      ghostWallMat.map = holoWallMaps[curMat];
      ghostMat.map = holoFlatMaps[curMat];
    }
    const cx = (spot.ix + 0.5) * CELL;
    const cz = (spot.iz + 0.5) * CELL;
    const yaw = spot.rot * (Math.PI / 2);
    const y = spot.base;
    if (buildKind === "wall") {
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      const lz = -CELL / 2 + TH / 2;
      ghostWall.position.set(cx + lz * s, y + CELL_H / 2, cz + lz * c);
      ghostWall.rotation.y = yaw;
      ghostWall.visible = true;
    } else if (buildKind === "floor") {
      ghostFloor.position.set(cx, y + TH / 2, cz);
      ghostFloor.visible = true;
    } else if (buildKind === "pyramid") {
      ghostPyr.position.set(cx, y, cz);
      ghostPyr.visible = true;
    } else {
      rampGhost.position.set(cx, y, cz);
      rampGhost.rotation.y = yaw;
      rampGhost.visible = true;
    }
  }

  function piecePoint(p: Piece, lx: number, ly: number, lz: number, out: THREE.Vector3) {
    const yaw = p.rot * (Math.PI / 2);
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const cx = (p.ix + 0.5) * CELL;
    const cz = (p.iz + 0.5) * CELL;
    out.set(cx + lx * c + lz * s, p.base + ly, cz - lx * s + lz * c);
  }

  function paintCell(mesh: THREE.Mesh, bit: number, exists: boolean, pick = false, arrow = false) {
    const mat = mesh.material as THREE.MeshLambertMaterial;
    const sel = (editMask & (1 << bit)) !== 0;
    const hover = bit === editHover;
    const map = arrow ? tileArrow : null;
    if (mat.map !== map) {
      mat.map = map;
      mat.needsUpdate = true;
    }
    let col: number;
    let op = 1;
    if (pick) {
      // stairs and cones: picked squares light up (the stair path / the corners that rise)
      col = sel ? 0xa8d8ff : hover ? 0x4f9dff : exists ? EDIT_BLUE : 0x0d4596;
    } else if (exists !== sel) {
      // this block stays after the edit
      col = hover ? 0x4f9dff : EDIT_BLUE;
    } else {
      // this block is cut out by the edit: a faint ghost of it
      col = hover ? 0xbfe2ff : 0x9cc8ff;
      op = hover ? 0.42 : 0.24;
    }
    mat.color.setHex(col);
    mat.emissive.setHex(op < 1 ? 0x000000 : 0x0a3a8c);
    if (mat.opacity !== op) {
      mat.opacity = op;
      mat.depthWrite = op >= 1;
    }
    mesh.visible = true;
  }

  function syncEditChrome() {
    const p = editPiece >= 0 ? pieces[editPiece] : undefined;
    if (!p) {
      for (const m of editBars) m.visible = false;
      for (const m of editCells) m.visible = false;
      for (const m of pyrCells) m.visible = false;
      return;
    }
    viewRay(_rayO, _rayD);
    editHover = tileOnPiece(p, _rayO.x, _rayO.y, _rayO.z, _rayD.x, _rayD.y, _rayD.z);
    const yaw = p.rot * (Math.PI / 2);
    for (const m of editBars) m.visible = false;
    for (const m of editCells) m.visible = false;
    for (const m of pyrCells) m.visible = false;
    if (p.kind !== "pyramid" && p.kind !== "ramp" && throughConeMats.size) restoreDepth();
    const ts = CELL / 3;
    const tsy = CELL_H / 3;
    if (p.kind === "wall") {
      // nine blue blocks in the wall's place, with thin gaps between them
      const z = -CELL / 2 + TH / 2;
      for (let bit = 0; bit < 9; bit++) {
        const tx = bit % 3;
        const ty = Math.floor(bit / 3);
        const mesh = editCells[bit]!;
        piecePoint(p, -CELL / 2 + (tx + 0.5) * ts, (ty + 0.5) * tsy, z, mesh.position);
        mesh.rotation.set(0, yaw, 0);
        mesh.scale.set(ts * 0.94, tsy * 0.94, 0.24);
        paintCell(mesh, bit, (p.mask & (1 << bit)) !== 0);
      }
      return;
    }
    if (p.kind === "floor") {
      const fs = CELL / 2;
      for (let bit = 0; bit < 4; bit++) {
        const tx = bit % 2;
        const tz = bit >> 1;
        const mesh = editCells[bit]!;
        mesh.position.set((p.ix + 0.5) * CELL + -CELL / 2 + (tx + 0.5) * fs, p.base + TH / 2, (p.iz + 0.5) * CELL + -CELL / 2 + (tz + 0.5) * fs);
        mesh.rotation.set(0, 0, 0);
        mesh.scale.set(fs * 0.96, TH + 0.06, fs * 0.96);
        paintCell(mesh, bit, (p.mask & (1 << bit)) !== 0);
      }
      return;
    }
    const hw = CELL / 2;
    if (p.kind === "ramp") {
      // stairs: four flat blue plates on the floor under them, chevrons showing which way each part climbs
      for (let bit = 0; bit < 4; bit++) {
        const col = bit % 2;
        const row = bit >> 1;
        const mesh = editCells[bit]!;
        piecePoint(p, -CELL / 2 + (col + 0.5) * hw, CONE_GRID_Y, -CELL / 2 + (row + 0.5) * hw, mesh.position);
        // arrow direction in piece space: full stairs climb +z; edited stairs follow their path
        const seg = p.stair?.find((sg) => sg.t === bit);
        const d = p.stair ? (seg ? seg.d : -1) : 0;
        const turn = d === 1 ? -Math.PI / 2 : d === 2 ? 0 : d === 3 ? Math.PI / 2 : Math.PI;
        mesh.rotation.set(0, yaw + turn, 0);
        mesh.scale.set(hw * 0.94, 0.08, hw * 0.94);
        paintCell(mesh, bit, (p.mask & (1 << bit)) !== 0, true, d >= 0);
        throughCone(mesh);
      }
      return;
    }
    // cone: four flat blue plates on the floor under it (seen through the cone)
    const cx = (p.ix + 0.5) * CELL;
    const cz = (p.iz + 0.5) * CELL;
    for (let q = 0; q < 4; q++) {
      const mesh = editCells[q]!;
      mesh.position.set(cx + (q % 2 === 0 ? -1 : 1) * (CELL / 4), p.base + CONE_GRID_Y, cz + (q < 2 ? -1 : 1) * (CELL / 4));
      mesh.rotation.set(0, 0, 0);
      mesh.scale.set(hw * 0.94, 0.08, hw * 0.94);
      paintCell(mesh, q, p.mask === 0b1111 || (p.mask & (1 << q)) === 0, true);
      throughCone(mesh);
    }
  }

  /** Edit chrome for cones sits under the cone, so it draws on top instead of being hidden by it. */
  function throughCone(m: THREE.Mesh) {
    const mat = m.material as THREE.MeshBasicMaterial;
    if (mat.depthTest) {
      mat.depthTest = false;
      mat.needsUpdate = true;
      throughConeMats.add(mat);
    }
    m.renderOrder = 6;
  }
  const throughConeMats = new Set<THREE.Material>();
  function restoreDepth() {
    for (const mat of throughConeMats) {
      mat.depthTest = true;
      mat.needsUpdate = true;
    }
    throughConeMats.clear();
    for (const m of editCells) m.renderOrder = 3;
    for (const m of editBars) m.renderOrder = 4;
  }

  function placePlayerBuild() {
    const spot = placement();
    if (!spot || !buildKind || !spot.ok) {
      if (buildKind && spot && !spot.ok) audio.play("empty");
      return;
    }
    if (tryPlace(buildKind, spot.ix, spot.iz, spot.rot, 0, player.team, spot.base, false, curMat) && (buildKind === "ramp" || buildKind === "pyramid") && inFootprint(spot.ix, spot.iz)) {
      // placed over yourself: step up onto its surface instead of ending up inside it
      dirty = true;
      const top = surfaceAt(player.x, player.z, player.y + CELL_H, false);
      if (top > player.y && top < player.y + CELL_H + 0.1) {
        player.y = top;
        player.vy = Math.max(0, player.vy);
      }
    }
  }

  /** The floor / stairs / cone the player is standing on (not something they mean to aim at). */
  function underPlayer(p: Piece) {
    if (p.kind === "wall") return false;
    if (Math.floor(player.x / CELL) !== p.ix || Math.floor(player.z / CELL) !== p.iz) return false;
    return player.y >= p.base - 0.4 && player.y <= p.base + (p.kind === "floor" ? 1.2 : CELL_H + 0.4);
  }

  /**
   * The build under the crosshair. It uses the pieces' real shapes (what you see is what you get), skips the
   * piece you are standing on unless you look down at your feet, and only then falls back to the nearest
   * build along the line of sight.
   */
  function pieceAimed(ownOnly: boolean, strict = false) {
    viewRay(_rayO, _rayD);
    const ox = _rayO.x;
    const oy = _rayO.y;
    const oz = _rayO.z;
    const dx = _rayD.x;
    const dy = _rayD.y;
    const dz = _rayD.z;
    const lookingDown = camPitch < -0.55;
    if (dirty && collisionSignature() !== collSig) rebuild();
    raycaster.set(_v2.set(ox, oy, oz), _v1.set(dx, dy, dz));
    raycaster.near = 0;
    raycaster.far = 18;
    const hits = raycaster.intersectObjects(
      buildMeshes.filter((m) => m.count > 0 && m.visible),
      false,
    );
    let under = -1;
    for (const h of hits) {
      const i = pieceFromIntersect(h);
      if (i < 0) continue;
      const p = pieces[i]!;
      if (ownOnly && p.owner !== 0) continue;
      if (!lookingDown && underPlayer(p)) {
        if (under < 0) under = i;
        continue;
      }
      return i;
    }
    if (under >= 0 && lookingDown) return under;
    // nothing solid under the crosshair: the nearest build along the line of sight
    let best = -1;
    let bestT = 1e9;
    const pad = 0.35;
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i]!;
      if (ownOnly && p.owner !== 0) continue;
      if (!lookingDown && underPlayer(p)) continue;
      const bb = pieceBounds(p);
      const hit = rayAabb(ox, oy, oz, dx, dy, dz, bb[0] - pad, bb[1] - pad, bb[2] - pad, bb[3] + pad, bb[4] + pad, bb[5] + pad);
      if (hit && hit.t < bestT && hit.t < 18) {
        bestT = hit.t;
        best = i;
      }
    }
    if (best >= 0) return best;
    if (under >= 0) return under;
    return ownOnly && !strict ? closestOwnPiece(ox, oy, oz, dx, dy, dz) : -1;
  }

  function leaveEdit() {
    editPiece = -1;
    editDrag = false;
    editMask = 0;
    editOrder = [];
    if (editPrevBuild) buildKind = editPrevBuild;
    editPrevBuild = null;
    dirty = true;
  }

  function toggleEdit() {
    if (editPiece >= 0) {
      if (editMask) confirmEdit();
      leaveEdit();
      audio.play("edit");
      return;
    }
    const own = pieceAimed(true);
    if (own >= 0) {
      editPiece = own;
      editDrag = false;
      editMask = 0;
      editOrder = [];
      editPrevBuild = buildKind;
      buildKind = null;
      dirty = true;
      audio.play("edit");
      const pk = pieces[own]!.kind;
      say(
        pk === "ramp"
          ? "Drag the stairs' path · 2 tiles half · 3 an L · 4 a U"
          : pk === "pyramid"
            ? "Pick corners to raise · release to confirm"
            : pk === "wall"
              ? "Pick tiles to cut · bottom two = door · release to confirm"
              : "Pick tiles to cut · release to confirm · right-click resets",
      );
    } else say("Look at your build");
  }

  function tileOnPiece(p: Piece, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number) {
    const cx = (p.ix + 0.5) * CELL;
    const cz = (p.iz + 0.5) * CELL;
    const yaw = p.rot * (Math.PI / 2);
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const ts = CELL / 3;
    if (p.kind === "pyramid") {
      // Fortnite-style: the cone's edit grid is four flat squares on the floor underneath it
      if (Math.abs(dy) < 0.02) return -1;
      const t = (p.base + CONE_GRID_Y - oy) / dy;
      if (t < 0.05 || t > 28) return -1;
      const x = ox + dx * t - cx;
      const z = oz + dz * t - cz;
      const lim = CELL / 2 + 0.7;
      if (Math.abs(x) > lim || Math.abs(z) > lim) return -1;
      return (x < 0 ? 0 : 1) + (z < 0 ? 0 : 2);
    }
    if (p.kind === "floor") {
      if (Math.abs(dy) < 0.04) return -1;
      const t = (p.base + 0.2 - oy) / dy;
      if (t < 0.05 || t > 28) return -1;
      const lx = ox + dx * t - p.ix * CELL;
      const lz = oz + dz * t - p.iz * CELL;
      if (lx < -0.7 || lz < -0.7 || lx > CELL + 0.7 || lz > CELL + 0.7) return -1;
      const tx = lx < CELL / 2 ? 0 : 1;
      const tz = lz < CELL / 2 ? 0 : 1;
      return tz * 2 + tx;
    }
    if (p.kind === "ramp") {
      // stairs edit on a flat 2x2 grid laid on the floor under them, like Fortnite (same size as cones)
      if (Math.abs(dy) < 0.02) return -1;
      const t = (p.base + CONE_GRID_Y - oy) / dy;
      if (t < 0.05 || t > 28) return -1;
      const x = ox + dx * t - cx;
      const z = oz + dz * t - cz;
      const localX = x * c - z * s;
      const localZ = x * s + z * c;
      if (Math.abs(localX) > CELL / 2 + 0.7 || Math.abs(localZ) > CELL / 2 + 0.7) return -1;
      return (localZ < 0 ? 0 : 2) + (localX < 0 ? 0 : 1);
    }
    const lz0 = -CELL / 2 + TH / 2;
    const px = cx + lz0 * s;
    const pz = cz + lz0 * c;
    const denom = dx * s + dz * c;
    if (Math.abs(denom) < 1e-4) return -1;
    const t = ((px - ox) * s + (pz - oz) * c) / denom;
    if (t < 0.05 || t > 28) return -1;
    const x = ox + dx * t;
    const y = oy + dy * t;
    const z = oz + dz * t;
    const localX = (x - cx) * c - (z - cz) * s;
    const localY = y - p.base;
    if (localY < -0.55 || localY > CELL_H + 0.55) return -1;
    if (Math.abs(localX) > CELL / 2 + 0.55) return -1;
    const tx = Math.max(0, Math.min(2, Math.floor((localX + CELL / 2) / ts)));
    const ty = Math.max(0, Math.min(2, Math.floor(localY / (CELL_H / 3))));
    return ty * 3 + tx;
  }

  function nearestTile(p: Piece, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number) {
    const cx = (p.ix + 0.5) * CELL;
    const cz = (p.iz + 0.5) * CELL;
    const yaw = p.rot * (Math.PI / 2);
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    let best = -1;
    let bestD = 2.4;
    const consider = (tile: number, x: number, y: number, z: number) => {
      const lx = x - ox;
      const ly = y - oy;
      const lz = z - oz;
      const t = lx * dx + ly * dy + lz * dz;
      if (t < 0.2) return;
      const d = Math.hypot(lx - dx * t, ly - dy * t, lz - dz * t);
      if (d < bestD) {
        bestD = d;
        best = tile;
      }
    };
    if (p.kind === "pyramid") {
      for (let q = 0; q < 4; q++) {
        consider(q, cx + (q % 2 === 0 ? -1 : 1) * CELL * 0.25, p.base + CONE_GRID_Y, cz + (q < 2 ? -1 : 1) * CELL * 0.25);
      }
      return best;
    }
    const ts = CELL / 3;
    if (p.kind === "ramp") {
      const hw = CELL / 2;
      for (let bit = 0; bit < 4; bit++) {
        const lx = -CELL / 2 + ((bit % 2) + 0.5) * hw;
        const lz = -CELL / 2 + ((bit >> 1) + 0.5) * hw;
        consider(bit, cx + lx * c + lz * s, p.base + CONE_GRID_Y, cz - lx * s + lz * c);
      }
      return best;
    }
    if (p.kind === "wall") {
      for (let ty = 0; ty < 3; ty++) {
        for (let tx = 0; tx < 3; tx++) {
          const lx = -CELL / 2 + (tx + 0.5) * ts;
          const ly = (ty + 0.5) * (CELL_H / 3);
          const lz = -CELL / 2 + TH / 2;
          consider(ty * 3 + tx, cx + lx * c + lz * s, p.base + ly, cz - lx * s + lz * c);
        }
      }
      return best;
    }
    for (let tz = 0; tz < 2; tz++) {
      for (let tx = 0; tx < 2; tx++) {
        const lx = -CELL / 2 + (tx + 0.5) * (CELL / 2);
        const lz = -CELL / 2 + (tz + 0.5) * (CELL / 2);
        consider(tz * 2 + tx, cx + lx, p.base + TH / 2, cz + lz);
      }
    }
    return best;
  }

  function editClick() {
    if (editPiece < 0) return;
    const p = pieces[editPiece];
    if (!p) return;
    viewRay(_rayO, _rayD);
    const tile = tileOnPiece(p, _rayO.x, _rayO.y, _rayO.z, _rayD.x, _rayD.y, _rayD.z);
    const picked = tile >= 0 ? tile : nearestTile(p, _rayO.x, _rayO.y, _rayO.z, _rayD.x, _rayD.y, _rayD.z);
    if (picked < 0) return;
    if ((editMask & (1 << picked)) === 0) {
      editMask |= 1 << picked;
      editOrder.push(picked);
      dirty = true;
      audio.play("tile");
    }
  }

  /** Doors of an edited wall follow its shape; doors that survive keep their state. */
  function syncDoors(p: Piece) {
    if (p.kind !== "wall") return;
    const cols = p.mask === 0b111111111 ? [] : wallShape(p.mask).doors;
    const old = p.doors ?? [];
    p.doors = cols.map((col) => old.find((d) => d.col === col) ?? { col, t: 0, open: false, dir: 1 });
    if (!p.doors.length) p.doors = undefined;
  }

  function confirmEdit(exitAfter = false) {
    const p = pieces[editPiece];
    editDrag = false;
    if (!p || editMask === 0) {
      editMask = 0;
      dirty = true;
      return;
    }
    let ok = true;
    if (p.kind === "ramp") {
      const res = stairFromPath(editOrder);
      if (!res) ok = false;
      else if ("redirect" in res) {
        // full stairs turned to face the drag
        const yaw = p.rot * (Math.PI / 2);
        const [dx, dz] = [
          [0, 1],
          [1, 0],
          [0, -1],
          [-1, 0],
        ][res.redirect]!;
        const wx = dx * Math.cos(yaw) + dz * Math.sin(yaw);
        const wz = -dx * Math.sin(yaw) + dz * Math.cos(yaw);
        p.rot = ((Math.round(Math.atan2(wx, wz) / (Math.PI / 2)) % 4) + 4) % 4;
        p.stair = undefined;
        p.mask = fullMask("ramp");
      } else {
        p.stair = res.segs;
        p.mask = res.segs.reduce((m, sg) => m | (1 << sg.t), 0);
      }
    } else {
      const next = p.mask ^ editMask;
      // Fortnite won't let an edit remove every tile
      if (next === 0) ok = false;
      else {
        p.mask = next;
        syncDoors(p);
      }
    }
    editMask = 0;
    editOrder = [];
    if (ok) {
      // brief white flash on the reshaped piece
      p.hitT = 0.1;
      audio.play("editDone");
    } else audio.play("empty");
    if (exitAfter) leaveEdit();
    dirty = true;
  }

  /** Scroll wheel while editing: first clears the pending selection, then stages a restore of the original full shape. */
  function resetEdit() {
    const p = editPiece >= 0 ? pieces[editPiece] : undefined;
    if (!p) return;
    const full = fullMask(p.kind);
    if (editMask !== 0) {
      editMask = 0;
      editOrder = [];
    } else if (p.kind === "ramp" || p.kind === "pyramid") {
      // stairs and cones snap straight back to their original shape
      if (p.mask === full && !p.stair) return;
      p.mask = full;
      p.stair = undefined;
      p.hitT = 0.1;
    } else if (p.mask !== full) editMask = full ^ p.mask;
    else return;
    dirty = true;
    audio.play("edit");
  }

  /** Put an edited piece back to its full, unedited shape. */
  function restoreFull(p: Piece) {
    const full = fullMask(p.kind);
    if (p.mask === full && !p.stair) return false;
    p.mask = full;
    p.stair = undefined;
    syncDoors(p);
    p.hitT = 0.1;
    dirty = true;
    piecesVer++;
    audio.play("editDone");
    return true;
  }

  /** Reset the player's own edited build under the crosshair (scroll wheel / reset key). */
  function resetAimedEdit() {
    if (!player.alive || drop || driving) return false;
    const edited = (p: Piece) => p.owner === 0 && (p.mask !== fullMask(p.kind) || !!p.stair);
    const i = pieceAimed(true, true);
    if (i >= 0 && edited(pieces[i]!)) return restoreFull(pieces[i]!);
    // otherwise the edited build of yours closest to the line of sight
    viewRay(_rayO, _rayD);
    let best: Piece | null = null;
    let bestD = 2.6;
    for (const p of pieces) {
      if (!edited(p)) continue;
      const [ax, az] = pieceAnchor(p.kind, p.ix, p.iz, p.rot);
      const ay = p.base + (p.kind === "floor" ? 0.2 : CELL_H / 2);
      if (Math.hypot(ax - player.x, az - player.z) > CELL * 2.4) continue;
      const lx = ax - _rayO.x;
      const ly = ay - _rayO.y;
      const lz = az - _rayO.z;
      const t = lx * _rayD.x + ly * _rayD.y + lz * _rayD.z;
      if (t < 0.3) continue;
      const dd = Math.hypot(lx - _rayD.x * t, ly - _rayD.y * t, lz - _rayD.z * t);
      if (dd < bestD) {
        bestD = dd;
        best = p;
      }
    }
    return best ? restoreFull(best) : false;
  }

  function addBot(team: number, x: number, z: number, name: string, target = false) {
    const botSkin = skinById(["mesa", "static", "hare", "warden", "honey", "glacier", "goldstandard", "chainline"][actors.length % 8]!);
    const rig = createCharacter(botSkin, null, null);
    scene.add(rig.group);
    const label = makeLabel(name, target ? "#ffe08a" : team === 2 ? "#ffb4b0" : team === 1 ? "#b9d6ff" : "#ffffff");
    scene.add(label);
    const y = Math.max(0, groundHeight(x, z));
    actors.push({
      id: nextId++,
      name,
      team,
      x,
      y,
      z,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: 0,
      hp: target ? 45 : 100,
      shield: target ? 0 : mode.shield > 0 ? 50 : 0,
      alive: true,
      respawn: 0,
      mats: 180,
      shootCd: 0.4 + Math.random(),
      think: Math.random(),
      strafe: Math.random() < 0.5 ? -1 : 1,
      coverCd: 1,
      aggro: mode.passive ? 0 : 99,
      flash: 0,
      grounded: true,
      rig,
      label,
      target,
      patrol: Math.random() * 10,
      homeX: x,
      homeZ: z,
    });
  }

  if (mode.aim) {
    for (let i = 0; i < 6; i++) {
      addBot(2, -10 + (i % 3) * 8, -8 - Math.floor(i / 3) * 8, `Target ${i + 1}`, true);
    }
  }

  let stormX = 0;
  let stormZ = 0;
  let stormR = mode.storm ? mode.stormRadius : 0;
  let stormTarget = stormR;
  let phaseI = 0;
  let phaseT = mode.stormDelay;
  let shrinking = false;
  const stormPhases = mode.storm
    ? [
        { r: mode.stormRadius, dps: 1 },
        { r: Math.max(18, mode.stormRadius * 0.62), dps: 2 },
        { r: Math.max(12, mode.stormRadius * 0.38), dps: 4 },
        { r: 8, dps: 8 },
      ]
    : [];
  const stormRing = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.045, 6, 64),
    new THREE.MeshBasicMaterial({ color: 0xd7ecff, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  stormRing.rotation.x = Math.PI / 2;
  stormRing.visible = mode.storm;
  scene.add(stormRing);
  // the storm wall: a towering wall of swirling purple cloud, like Fortnite's. It ignores fog so it can
  // be seen from anywhere on the island, even while it is still out past the coast.
  const stormTex = (() => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    const g = c.getContext("2d")!;
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, "#c48cff");
    grd.addColorStop(0.5, "#8d4be0");
    grd.addColorStop(1, "#b77cff");
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // soft cloud blobs and long diagonal streaks (wraps cleanly left-right)
    for (let i = 0; i < 70; i++) {
      const x = rnd() * 256;
      const y = rnd() * 256;
      const r = 12 + rnd() * 34;
      for (const ox of [-256, 0, 256]) {
        const rg = g.createRadialGradient(x + ox, y, 0, x + ox, y, r);
        const light = rnd() < 0.5;
        rg.addColorStop(0, light ? "rgba(235,205,255,0.45)" : "rgba(70,20,140,0.4)");
        rg.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = rg;
        g.fillRect(x + ox - r, y - r, r * 2, r * 2);
      }
    }
    g.strokeStyle = "rgba(240,220,255,0.35)";
    g.lineWidth = 2;
    for (let i = 0; i < 26; i++) {
      const x = rnd() * 256;
      g.beginPath();
      g.moveTo(x, 0);
      g.bezierCurveTo(x + 30, 80, x - 30, 170, x + 10, 256);
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(28, 3);
    return t;
  })();
  const stormMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 50, 96, 1, true),
    new THREE.MeshBasicMaterial({ map: stormTex, color: 0xffffff, transparent: true, opacity: 0.58, side: THREE.DoubleSide, depthWrite: false, fog: false }),
  );
  stormMesh.renderOrder = 5;
  stormMesh.position.y = 22;
  stormMesh.visible = mode.storm;
  scene.add(stormMesh);

  function updateStorm(dt: number) {
    if (island) {
      updateStormBR(dt);
      return;
    }
    if (!mode.storm) return;
    phaseT -= dt;
    if (phaseT <= 0 && phaseI < stormPhases.length - 1) {
      if (!shrinking) {
        shrinking = true;
        phaseI++;
        stormTarget = stormPhases[phaseI]!.r;
        phaseT = 12;
        stormX += (Math.random() - 0.5) * 10;
        stormZ += (Math.random() - 0.5) * 10;
      } else {
        shrinking = false;
        phaseT = 22;
      }
    }
    if (shrinking) stormR += (stormTarget - stormR) * Math.min(1, dt * 0.35);
    stormMesh.scale.set(Math.max(1, stormR), 1, Math.max(1, stormR));
    stormMesh.position.x = stormX;
    stormMesh.position.z = stormZ;
    stormRing.scale.set(Math.max(1, stormR), Math.max(1, stormR), 1);
    stormRing.position.set(stormX, 0.35, stormZ);
    const dps = stormPhases[Math.min(phaseI, stormPhases.length - 1)]?.dps ?? 1;
    stormTick -= dt;
    const px = Math.hypot(player.x - stormX, player.z - stormZ);
    if (px > stormR && player.alive && stormTick <= 0) {
      hurtPlayer(dps, "the storm");
      audio.play("storm");
    }
    for (const a of actors) {
      if (!a.alive || a.target) continue;
      if (Math.hypot(a.x - stormX, a.z - stormZ) > stormR) a.hp -= dps * dt;
      if (a.hp <= 0) hurtActor(a, 5, false, false);
    }
    if (stormTick <= 0) stormTick = 0.8;
  }

  /* =================================================================
   * Battle royale (Driftwood Isle): drop ship, skydive + glider, loot,
   * rarity, storm circles and 15 AI opponents.
   * ================================================================= */
  type GunSlot = 1 | 2 | 3 | 4;
  type AmmoKind = "ar" | "shotgun" | "smg" | "sniper";
  type Item = { t: "gun"; slot: GunSlot; r: number } | { t: "ammo"; ammo: AmmoKind; n: number } | { t: "heal"; n: number } | { t: "medkit"; n: number } | { t: "shield"; n: number };
  type LootItem = { spot: LootSpot; open: boolean; item: Item | null; vis: number; ring: number; bob: number; openAt?: number; fly?: { x: number; y: number; z: number; start: number } };

  const RARITY_NAMES = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];
  const RARITY_COLORS = ["#b8bec6", "#5fd35a", "#3d9df5", "#b25cf2", "#f5a524"];
  const RAR_MULT = [1, 1.08, 1.16, 1.25, 1.35];
  const SLOT_NAMES = ["Pickaxe", "Assault Rifle", "Shotgun", "SMG", "Sniper Rifle", "Bandages"];
  const SLOT_AMMO: AmmoKind[] = ["ar", "ar", "shotgun", "smg", "sniper", "ar"];
  const AMMO_N: Record<AmmoKind, number> = { ar: 40, shotgun: 8, smg: 45, sniper: 5 };
  const invOwned = [true, !island, !island, !island, !island, !island];
  const invRarity = [0, 1, 1, 1, 1, 0];
  if (duel) invRarity.splice(0, 6, 0, 4, 4, 3, 4, 0);

  /* ---------- 1v1 Build Fights ---------- */
  function spawnRival() {
    addBot(2, 0, -ARENA_SPAWN, "Rival");
    const r = actors[actors.length - 1]!;
    r.shield = 100;
    r.mats = 999;
    r.gun = 1;
    r.rarity = 3;
    r.yaw = Math.PI;
    r.duelAI = freshDuelAI();
  }
  if (duel) spawnRival();

  function duelRoundEnd(win: boolean, by?: string) {
    if (!duel || duel.over > 0 || ended) return;
    if (win) duel.you++;
    else duel.them++;
    duel.lastWin = win;
    duel.over = 3.4;
    banner = win ? `ROUND WON  ${duel.you} – ${duel.them}` : `ROUND LOST  ${duel.you} – ${duel.them}`;
    bannerT = 3;
    if (!win) {
      player.alive = false;
      player.hp = 0;
      if (by) pushFeed(`${by} won round ${duel.round}`);
    } else pushFeed(`You won round ${duel.round}`);
    audio.play(win ? "elim" : "hurt");
  }

  function resetDuelRound() {
    if (!duel) return;
    duel.round++;
    duel.freeze = 3.2;
    // builds reset every round, like Fortnite's build-fight maps
    pieces.length = 0;
    piecesVer++;
    if (editPiece >= 0) leaveEdit();
    buildKind = null;
    dirty = true;
    player.x = 0;
    player.z = ARENA_SPAWN;
    player.y = 0;
    player.vx = player.vy = player.vz = 0;
    player.hp = 100;
    player.shield = 100;
    player.alive = true;
    player.crouch = false;
    player.slide = 0;
    player.yaw = 0;
    camYaw = 0;
    camPitch = -0.06;
    mats.wood = mode.mats;
    mats.brick = mode.mats;
    mats.metal = mode.mats;
    Object.assign(mag, { ar: 30, shotgun: 5, smg: 25, sniper: 1 });
    Object.assign(reserve, { ar: 150, shotgun: 20, smg: 100, sniper: 15 });
    reloadT = 0;
    heals = 3;
    medkits = 0;
    healT = 0;
    slot = 1;
    adsT = 0;
    for (const a of actors) {
      if (!a.duelAI) continue;
      a.alive = true;
      a.hp = 100;
      a.shield = 100;
      a.mats = 999;
      a.x = 0;
      a.z = -ARENA_SPAWN;
      a.y = 0;
      a.vx = a.vy = a.vz = 0;
      a.yaw = Math.PI;
      a.gun = 1;
      a.rig.group.rotation.x = 0;
      a.label.visible = true;
      a.duelAI = freshDuelAI();
    }
    say(`Round ${duel.round} · first to ${mode.scoreLimit}`);
  }

  function updateDuel(dt: number) {
    if (!duel || ended) return;
    if (duel.over > 0) {
      duel.over -= dt;
      if (duel.over <= 0) {
        if (duel.you >= mode.scoreLimit || duel.them >= mode.scoreLimit) finish(duel.you >= mode.scoreLimit, `1v1 · ${duel.you} – ${duel.them}`);
        else resetDuelRound();
      }
      return;
    }
    if (duel.freeze > 0) {
      duel.freeze -= dt;
      if (duel.freeze <= 0) {
        say("FIGHT!");
        audio.play("storm");
      }
    }
  }

  /**
   * The 1v1 rival: pushes with the AR, swaps to the pump up close, answers damage with a wall and a
   * ramp rush (wall + ramp, again and again, to take height), boxes up to heal when it's low, and
   * shoots through your builds when you hide behind them.
   */
  function updateDuelBot(a: Actor, ai: DuelAI, dt: number) {
    if (!a.alive) {
      a.rig.group.rotation.x += (1.3 - a.rig.group.rotation.x) * Math.min(1, dt * 4);
      a.label.visible = false;
      return;
    }
    a.flash = Math.max(0, a.flash - dt);
    const dx = player.x - a.x;
    const dz = player.z - a.z;
    const d = Math.hypot(dx, dz) || 1;
    const fx = dx / d;
    const fz = dz / d;
    a.yaw = Math.atan2(-dx, -dz);
    const tot = a.hp + a.shield;
    if (tot < ai.prevHp - 0.5) ai.hurtAgo = 0;
    else ai.hurtAgo += dt;
    ai.prevHp = tot;
    const body = { x: a.x, y: a.y, z: a.z, vx: 0, vy: a.vy, vz: 0, grounded: a.grounded, crouch: false };
    const settle = () => {
      moveBody(body, dt);
      a.x = body.x;
      a.y = body.y;
      a.z = body.z;
      a.vy = body.vy;
      a.grounded = body.grounded;
      a.vx = body.vx;
      a.vz = body.vz;
    };
    if (!duel || duel.freeze > 0 || duel.over > 0 || !player.alive) {
      settle();
      return;
    }
    ai.buildCd -= dt;
    ai.boxCd -= dt;
    ai.jumpCd -= dt;
    ai.switchT -= dt;
    a.shootCd -= dt;
    a.think -= dt;
    if (a.think <= 0) {
      a.think = 0.5 + Math.random() * 0.7;
      if (Math.random() < 0.45) a.strafe = -a.strafe;
    }
    // pump up close, AR at range
    const wantGun = d < 10 ? 2 : 1;
    if (a.gun !== wantGun && ai.switchT <= 0) {
      a.gun = wantGun;
      ai.switchT = 0.45;
      a.rarity = wantGun === 2 ? 4 : 3;
    }
    const cellX = Math.floor(a.x / CELL);
    const cellZ = Math.floor(a.z / CELL);
    const level = Math.max(0, Math.round(a.y / CELL_H) * CELL_H);
    const faceRot = ((Math.round(Math.atan2(fx, fz) / (Math.PI / 2)) % 4) + 4) % 4;
    let mx = 0;
    let mz = 0;
    let speed = 0;
    if (ai.boxT > 0) {
      // boxed up: heal (shield pots), then open the wall facing you with an edit and push out
      ai.boxT -= dt;
      if (ai.boxT < 2.8) a.shield = Math.min(100, a.shield + dt * 32);
      if (ai.boxT < 1.2) a.hp = Math.min(100, a.hp + dt * 12);
      if (ai.boxT <= 0) {
        const want = (faceRot + 2) & 3;
        const wall = pieces.find((pc) => pc.kind === "wall" && pc.owner === a.id && pc.ix === cellX && pc.iz === cellZ && pc.rot === want && Math.abs(pc.base - level) < 1);
        if (wall) {
          wall.mask = 0b111000000;
          dirty = true;
        }
        ai.boxCd = 9;
      }
    } else if (tot < 95 && ai.boxCd <= 0 && d > 5 && a.grounded) {
      for (let r = 0; r < 4; r++) tryPlace("wall", cellX, cellZ, r, a.id, a.team, level, false, "brick");
      tryPlace("pyramid", cellX, cellZ, 0, a.id, a.team, level + CELL_H, false, "brick");
      ai.boxT = 3.6;
      ai.climbing = false;
    } else if (ai.climbing) {
      // up our own ramp; keep adding wall + ramp while we're behind on height
      const rx = Math.round(Math.sin(ai.rot * (Math.PI / 2)));
      const rz = Math.round(Math.cos(ai.rot * (Math.PI / 2)));
      mx = rx;
      mz = rz;
      speed = 6.4;
      if (a.y > ai.rampBase + CELL_H * 0.55 && ai.buildCd <= 0) {
        if (ai.ramps >= 5 || a.y > player.y + 5 || d < 5) ai.climbing = false;
        else {
          const nx = ai.cx + rx;
          const nz = ai.cz + rz;
          const base = ai.rampBase + CELL_H;
          tryPlace("wall", nx, nz, (ai.rot + 2) & 3, a.id, a.team, base, false, "wood");
          if (tryPlace("ramp", nx, nz, ai.rot, a.id, a.team, base, false, "wood")) {
            ai.cx = nx;
            ai.cz = nz;
            ai.rampBase = base;
            ai.ramps++;
          } else ai.climbing = false;
          ai.buildCd = 0.28;
        }
      }
      if (a.grounded && a.y < ai.rampBase - 0.8) ai.climbing = false;
    } else {
      const behindOnHeight = player.y > a.y + 1.6 && d < 26;
      const underFire = ai.hurtAgo < 0.5 && d > 8 && d < 32;
      // now and then push in with wall + ramp even when nothing forces it
      const push = d > 13 && d < 34 && Math.random() < dt * 0.3;
      if ((behindOnHeight || underFire || push) && ai.buildCd <= 0 && a.grounded) {
        const rx = Math.round(Math.sin(faceRot * (Math.PI / 2)));
        const rz = Math.round(Math.cos(faceRot * (Math.PI / 2)));
        const nx = cellX + rx;
        const nz = cellZ + rz;
        tryPlace("wall", nx, nz, (faceRot + 2) & 3, a.id, a.team, level, false, "wood");
        if (tryPlace("ramp", nx, nz, faceRot, a.id, a.team, level, false, "wood")) {
          ai.climbing = true;
          ai.rampBase = level;
          ai.ramps = 1;
          ai.cx = nx;
          ai.cz = nz;
          ai.rot = faceRot;
          ai.buildCd = 0.3;
        } else ai.buildCd = 0.8;
      }
      if (d > 9) {
        mx = fx + -fz * a.strafe * 0.35;
        mz = fz + fx * a.strafe * 0.35;
        speed = 7.2;
      } else {
        mx = -fz * a.strafe + fx * (d > 5 ? 0.3 : -0.4);
        mz = fx * a.strafe + fz * (d > 5 ? 0.3 : -0.4);
        speed = 6;
      }
      if (ai.jumpCd <= 0 && a.grounded) {
        if (Math.random() < 0.55) a.vy = 8.6;
        ai.jumpCd = 0.9 + Math.random() * 1.6;
      }
    }
    const ml = Math.hypot(mx, mz) || 1;
    body.vx = (mx / ml) * speed;
    body.vz = (mz / ml) * speed;
    body.vy = a.vy;
    settle();
    a.vx = (mx / ml) * speed;
    a.vz = (mz / ml) * speed;
    // shooting (through your builds if you hide: the shots chip the walls down)
    if (a.shootCd <= 0 && ai.switchT <= 0 && matchT > 1 && ai.boxT < 2.4) {
      const pump = a.gun === 2;
      if (pump && d > 16) a.shootCd = 0.2;
      else {
        a.shootCd = pump ? 0.9 + Math.random() * 0.25 : 0.2 + Math.random() * 0.14;
        kickWeapon(a.rig, pump ? 1.2 : 0.5);
        const ox = a.x;
        const oy = a.y + 1.45;
        const oz = a.z;
        const aimX = player.x - ox;
        const aimY = player.y + 1.15 - oy;
        const aimZ = player.z - oz;
        const al = Math.hypot(aimX, aimY, aimZ) || 1;
        const moving = Math.hypot(player.vx, player.vz) > 3 ? 0.012 : 0;
        const spread = pump ? 0.085 : 0.02 + d * 0.0007 + moving;
        const pellets = pump ? 8 : 1;
        const hear = Math.hypot(a.x - player.x, a.z - player.z);
        audio.play(pump ? "shotgun" : "shot", Math.max(0.2, Math.min(0.8, 1.1 - hear / 45)));
        for (let k = 0; k < pellets; k++) {
          const ddx = aimX / al + (Math.random() - 0.5) * spread;
          const ddy = aimY / al + (Math.random() - 0.5) * spread;
          const ddz = aimZ / al + (Math.random() - 0.5) * spread;
          const dl = Math.hypot(ddx, ddy, ddz) || 1;
          const hit = queryShot(ox, oy, oz, ddx / dl, ddy / dl, ddz / dl, 120, a.id);
          if (k === 0) spawnTracer(ox, oy, oz, ox + (ddx / dl) * (hit ? hit.t : 40), oy + (ddy / dl) * (hit ? hit.t : 40), oz + (ddz / dl) * (hit ? hit.t : 40));
          const dmg = pump ? (d < 6 ? 11 : d < 11 ? 8 : 4) : 10;
          if (hit?.kind === "actor" && hit.id === 0) hurtPlayer(dmg * (hit.head ? 1.6 : 1), a.name, a);
          else if (hit?.kind === "build") {
            const piece = pieces[hit.index];
            if (piece && piece.owner !== a.id) hitPiece(piece, dmg * 1.5, hit.x, hit.y, hit.z);
          }
        }
      }
    }
  }
  if (island) {
    mag.ar = mag.shotgun = mag.smg = mag.sniper = 0;
    reserve.ar = reserve.shotgun = reserve.smg = reserve.sniper = 0;
    heals = 0;
    medkits = 0;
    slot = 0;
  }

  function rollRarity(boost: number) {
    const r = Math.min(0.999, Math.random() + boost);
    return r < 0.38 ? 0 : r < 0.68 ? 1 : r < 0.88 ? 2 : r < 0.97 ? 3 : 4;
  }
  function rollGun(boost: number): Item {
    const s = ([1, 1, 2, 2, 3, 4] as const)[Math.floor(Math.random() * 6)]!;
    return { t: "gun", slot: s, r: rollRarity(boost) };
  }
  function rollFloor(kind: LootSpot["kind"]): Item {
    if (kind === "ammo") {
      const a = (["ar", "ar", "shotgun", "smg", "sniper"] as const)[Math.floor(Math.random() * 5)]!;
      return { t: "ammo", ammo: a, n: AMMO_N[a] };
    }
    const r = Math.random();
    if (r < 0.52) return rollGun(0);
    if (r < 0.62) return { t: "heal", n: 3 };
    if (r < 0.68) return { t: "medkit", n: 1 };
    if (r < 0.86) return { t: "shield", n: Math.random() < 0.6 ? 25 : 50 };
    const a = (["ar", "shotgun", "smg"] as const)[Math.floor(Math.random() * 3)]!;
    return { t: "ammo", ammo: a, n: AMMO_N[a] };
  }

  /* ---------- loot visuals ---------- */
  // this match's loot: the island's spots plus chests in three random shipping containers (new ones each round)
  const roundLoot: LootSpot[] = island ? [...island.loot] : [];
  if (island) {
    const pool = [...island.containerSpots];
    for (let i = 0; i < 3 && pool.length; i++) roundLoot.push({ ...pool.splice(Math.floor(Math.random() * pool.length), 1)[0]! });
  }
  const lootChestCount = roundLoot.filter((l) => l.kind === "chest").length;
  const SPARE = 24 + lootChestCount * 3;
  /** Chests and ammo boxes are containers you open; everything else is an item lying on the floor. */
  const isBox = (s: LootSpot) => s.kind === "chest" || s.kind === "ammo";
  const lootItems: LootItem[] = island ? roundLoot.map((spot) => ({ spot, open: false, item: isBox(spot) ? null : rollFloor(spot.kind), vis: -1, ring: -1, bob: Math.random() * 6 })) : [];
  const chestCount = lootItems.filter((l) => l.spot.kind === "chest").length;
  const ammoBoxCount = lootItems.filter((l) => l.spot.kind === "ammo").length;
  const floorCount = lootItems.length - chestCount + SPARE;
  let lootClock = 0;
  const lootMat = new THREE.MeshLambertMaterial({ color: "#ffffff" });
  const ringMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.75, depthWrite: false });
  /** Small vertex-coloured box for hand-built props. */
  const vcBox = (w: number, h: number, d: number, x: number, y: number, z: number, color: string) => {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed().translate(x, y, z);
    const c = new THREE.Color(color);
    const n = g.attributes.position!.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      // a touch of top-down shading so the boxes read as chunky shapes
      const k = 0.86 + 0.14 * (g.attributes.normal!.getY(i) > 0.5 ? 1 : g.attributes.normal!.getY(i) < -0.5 ? -1 : 0.3);
      col[i * 3] = c.r * k;
      col[i * 3 + 1] = c.g * k;
      col[i * 3 + 2] = c.b * k;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.deleteAttribute("uv");
    return g;
  };
  const vcPaint = (g: THREE.BufferGeometry, color: string) => {
    const f = g.index ? g.toNonIndexed() : g;
    f.deleteAttribute("uv");
    const c = new THREE.Color(color);
    const n = f.attributes.position!.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    f.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return f;
  };
  const vcMerge = (parts: THREE.BufferGeometry[]) => {
    const pos: number[] = [];
    const nor: number[] = [];
    const col: number[] = [];
    for (const p of parts) {
      pos.push(...(p.attributes.position!.array as Float32Array));
      nor.push(...(p.attributes.normal!.array as Float32Array));
      col.push(...(p.attributes.color!.array as Float32Array));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    return g;
  };
  // Treasure chest: wooden body with gold straps, corners and lock; domed lid hinged at the back.
  const WOOD = "#9a5f2e";
  const WOOD_D = "#6e3f1c";
  const GOLD = "#f6c544";
  const chestBaseGeo = vcMerge([
    vcBox(1.02, 0.56, 0.64, 0, 0.31, 0, WOOD),
    vcBox(1.03, 0.025, 0.65, 0, 0.22, 0, WOOD_D),
    vcBox(1.03, 0.025, 0.65, 0, 0.41, 0, WOOD_D),
    vcBox(0.1, 0.6, 0.7, -0.3, 0.31, 0, GOLD),
    vcBox(0.1, 0.6, 0.7, 0.3, 0.31, 0, GOLD),
    vcBox(1.1, 0.07, 0.72, 0, 0.035, 0, GOLD),
    vcBox(1.08, 0.05, 0.7, 0, 0.6, 0, GOLD),
    ...([-1, 1] as const).flatMap((sx) => ([-1, 1] as const).map((sz) => vcBox(0.09, 0.6, 0.09, sx * 0.52, 0.31, sz * 0.33, GOLD))),
    vcBox(0.22, 0.24, 0.05, 0, 0.47, 0.345, GOLD),
    vcBox(0.05, 0.09, 0.02, 0, 0.45, 0.375, "#3a2410"),
    vcBox(0.98, 0.02, 0.6, 0, 0.585, 0, "#ffe58a"),
  ]);
  const lidDome = (r: number, len: number, color: string) => vcPaint(new THREE.CylinderGeometry(r, r, len, 14, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).scale(1, 0.78, 1).translate(0, 0, 0.36), color);
  const chestLidGeo = vcMerge([
    lidDome(0.355, 1.04, WOOD),
    lidDome(0.375, 0.1, GOLD).translate(-0.3, 0, 0),
    lidDome(0.375, 0.1, GOLD).translate(0.3, 0, 0),
    lidDome(0.37, 0.07, GOLD).translate(-0.52, 0, 0),
    lidDome(0.37, 0.07, GOLD).translate(0.52, 0, 0),
    vcBox(1.08, 0.06, 0.05, 0, 0.02, 0.715, GOLD),
    vcBox(0.16, 0.14, 0.05, 0, 0.06, 0.735, GOLD),
  ]);
  const chestMat = new THREE.MeshLambertMaterial({ color: "#ffffff", vertexColors: true, emissive: new THREE.Color("#5a3a06"), emissiveIntensity: 0.45 });
  // floor guns use the real gun models (one instanced mesh per kind, tinted by rarity)
  const gunGeos = GUN_KIND_LIST.map((k) => gunLootGeometry(k));
  const fallbackGunGeo = vcBox(0.8, 0.16, 0.1, 0, 0, 0, "#ffffff").rotateY(Math.PI / 2);
  const gunLootMat = new THREE.MeshLambertMaterial({ color: "#ffffff", vertexColors: true });
  // rarity light beam: soft vertical gradient, additive
  const beamTex = (() => {
    const c = document.createElement("canvas");
    c.width = 4;
    c.height = 64;
    const g = c.getContext("2d")!;
    const grd = g.createLinearGradient(0, 0, 0, 64);
    grd.addColorStop(0, "rgba(255,255,255,0)");
    grd.addColorStop(0.55, "rgba(255,255,255,0.35)");
    grd.addColorStop(1, "rgba(255,255,255,0.9)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 4, 64);
    const t = new THREE.CanvasTexture(c);
    return t;
  })();
  const beamMat = new THREE.MeshBasicMaterial({ color: "#ffffff", map: beamTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  /* item models, styled after Fortnite's (built here; no free models matched the look) */
  const itemMat = new THREE.MeshLambertMaterial({ color: "#ffffff", vertexColors: true });
  const shieldMat = new THREE.MeshLambertMaterial({ color: "#ffffff", vertexColors: true, emissive: new THREE.Color("#1f6fd6"), emissiveIntensity: 0.55 });
  const ammoBoxMat = new THREE.MeshLambertMaterial({ color: "#ffffff", vertexColors: true });
  const vcCyl = (rt: number, rb: number, h: number, seg: number, color: string) => vcPaint(new THREE.CylinderGeometry(rt, rb, h, seg), color);
  const vcLathe = (pts: [number, number][], seg: number, color: string) => vcPaint(new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg), color);
  /** Shield Potion: a chunky round glass jug of glowing blue liquid with a silver screw cap. */
  function shieldBigGeo() {
    return vcMerge([
      vcLathe([[0.001, -0.2], [0.12, -0.2], [0.18, -0.15], [0.205, -0.06], [0.2, 0.04], [0.16, 0.12], [0.095, 0.17], [0.085, 0.2], [0.001, 0.2]], 18, "#3a9bff"),
      // pale highlight band and a white label
      vcLathe([[0.207, -0.02], [0.207, 0.02]], 18, "#bfe6ff"),
      vcBox(0.16, 0.12, 0.02, 0, -0.06, 0.2, "#f2f8ff"),
      vcBox(0.04, 0.09, 0.025, 0, -0.06, 0.205, "#2f7fe0"),
      vcBox(0.09, 0.035, 0.025, 0, -0.06, 0.205, "#2f7fe0"),
      // silver cap with ridges
      vcCyl(0.105, 0.105, 0.08, 14, "#cfd6de").translate(0, 0.24, 0),
      vcCyl(0.11, 0.11, 0.02, 14, "#9aa4ae").translate(0, 0.215, 0),
      vcCyl(0.07, 0.09, 0.03, 14, "#e8edf2").translate(0, 0.295, 0),
    ]);
  }
  /** Small Shield Potion: a little bottle of blue liquid with a cap. */
  function shieldSmallGeo() {
    return vcMerge([
      vcLathe([[0.001, -0.14], [0.075, -0.14], [0.085, -0.1], [0.085, 0.04], [0.06, 0.08], [0.04, 0.1], [0.04, 0.12], [0.001, 0.12]], 14, "#4aa8ff"),
      vcBox(0.09, 0.07, 0.015, 0, -0.04, 0.084, "#f2f8ff"),
      vcBox(0.025, 0.05, 0.02, 0, -0.04, 0.088, "#2f7fe0"),
      vcBox(0.05, 0.02, 0.02, 0, -0.04, 0.088, "#2f7fe0"),
      vcCyl(0.05, 0.05, 0.05, 12, "#cfd6de").translate(0, 0.145, 0),
    ]).scale(1.25, 1.25, 1.25);
  }
  /** Med Kit: a white hard case with a red cross, grey carry handle, latches and red corner trim. */
  function medkitGeo() {
    const W = 0.56;
    const H = 0.36;
    const D = 0.22;
    return vcMerge([
      vcBox(W, H, D, 0, 0, 0, "#f4f6f8"),
      vcBox(W + 0.01, 0.035, D + 0.01, 0, 0.02, 0, "#d33a32"),
      // red cross on both faces
      ...[1, -1].flatMap((f) => [vcBox(0.07, 0.22, 0.012, 0, -0.02, (f * (D + 0.012)) / 2, "#e2342c"), vcBox(0.22, 0.07, 0.012, 0, -0.02, (f * (D + 0.012)) / 2, "#e2342c")]),
      // handle on top
      vcBox(0.04, 0.07, 0.05, -0.12, H / 2 + 0.035, 0, "#6b7682"),
      vcBox(0.04, 0.07, 0.05, 0.12, H / 2 + 0.035, 0, "#6b7682"),
      vcBox(0.28, 0.035, 0.06, 0, H / 2 + 0.08, 0, "#4b545e"),
      // latches
      vcBox(0.05, 0.06, 0.02, -0.18, 0.05, D / 2 + 0.01, "#9aa4ae"),
      vcBox(0.05, 0.06, 0.02, 0.18, 0.05, D / 2 + 0.01, "#9aa4ae"),
      // corner bumpers
      ...([-1, 1] as const).flatMap((sx) => ([-1, 1] as const).map((sy) => vcBox(0.05, 0.05, D + 0.02, (sx * (W - 0.03)) / 2, (sy * (H - 0.03)) / 2, 0, "#c9302a"))),
    ]);
  }
  /** Bandages: two rolled bandages with a loose tail and a red stripe. */
  function bandageGeo() {
    const roll = (x: number, z: number) => [
      vcCyl(0.085, 0.085, 0.19, 16, "#f7f3ea").rotateZ(Math.PI / 2).translate(x, 0, z),
      vcCyl(0.088, 0.088, 0.035, 16, "#e2453c").rotateZ(Math.PI / 2).translate(x, 0, z),
      vcCyl(0.03, 0.03, 0.195, 10, "#d8d2c4").rotateZ(Math.PI / 2).translate(x, 0, z),
    ];
    return vcMerge([...roll(0, -0.05), ...roll(0.03, 0.11).map((g) => g.translate(0, 0.0, 0)), vcBox(0.17, 0.008, 0.16, 0.0, -0.08, -0.2, "#f2ede2")]).translate(0, 0.08, 0);
  }
  /** Ammo pickups, one look per ammo type (like Fortnite's light, medium, heavy and shells). */
  function ammoGeo(kind: "ar" | "smg" | "shotgun" | "sniper") {
    const parts: THREE.BufferGeometry[] = [];
    if (kind === "shotgun") {
      // a handful of red shells with brass heads
      for (let i = 0; i < 4; i++) {
        const z = -0.12 + i * 0.08;
        parts.push(vcCyl(0.035, 0.035, 0.2, 10, "#c8322b").rotateZ(Math.PI / 2).translate(0.02, 0.035, z));
        parts.push(vcCyl(0.038, 0.038, 0.05, 10, "#d9b04a").rotateZ(Math.PI / 2).translate(-0.1, 0.035, z));
      }
      parts.push(vcCyl(0.035, 0.035, 0.2, 10, "#c8322b").rotateZ(Math.PI / 2).translate(0.02, 0.1, -0.04));
      parts.push(vcCyl(0.038, 0.038, 0.05, 10, "#d9b04a").rotateZ(Math.PI / 2).translate(-0.1, 0.1, -0.04));
      return vcMerge(parts);
    }
    const box = kind === "ar" ? "#5d7a3a" : kind === "smg" ? "#6f7d8c" : "#3d4a5a";
    const W = kind === "sniper" ? 0.34 : 0.3;
    const Dp = kind === "smg" ? 0.16 : 0.2;
    parts.push(vcBox(W, 0.14, Dp, 0, 0.07, 0, box));
    parts.push(vcBox(W + 0.01, 0.03, Dp + 0.01, 0, 0.11, 0, "#e8c15a"));
    // rounds standing in the open box, brass with copper or black tips
    const n = kind === "sniper" ? 3 : 4;
    const len = kind === "sniper" ? 0.22 : kind === "smg" ? 0.1 : 0.15;
    const rad = kind === "sniper" ? 0.026 : kind === "smg" ? 0.016 : 0.02;
    const tip = kind === "sniper" ? "#2b2b2b" : "#c46a3a";
    for (let i = 0; i < n; i++)
      for (let j = 0; j < 2; j++) {
        const x = -W / 2 + ((i + 0.5) * W) / n;
        const z = (j - 0.5) * (Dp * 0.5);
        parts.push(vcCyl(rad, rad, len, 8, "#e0b84c").translate(x, 0.14 + len / 2, z));
        parts.push(vcPaint(new THREE.ConeGeometry(rad, rad * 2.6, 8), tip).translate(x, 0.14 + len + rad * 1.3, z));
      }
    return vcMerge(parts);
  }
  /** Ammo box: an olive military ammo case with a yellow band, latches and a lid that flips open. */
  function ammoBoxBaseGeo() {
    const OL = "#56663a";
    const OD = "#3f4c2a";
    return vcMerge([
      vcBox(0.86, 0.42, 0.44, 0, 0.21, 0, OL),
      vcBox(0.88, 0.04, 0.46, 0, 0.02, 0, OD),
      vcBox(0.87, 0.07, 0.45, 0, 0.27, 0, "#e3b93a"),
      // stencil blocks on the band
      ...[-0.24, -0.12, 0, 0.12, 0.24].map((x) => vcBox(0.06, 0.04, 0.005, x, 0.27, 0.228, "#2a2a22")),
      // ribs and latches
      vcBox(0.04, 0.42, 0.46, -0.36, 0.21, 0, OD),
      vcBox(0.04, 0.42, 0.46, 0.36, 0.21, 0, OD),
      vcBox(0.08, 0.1, 0.03, -0.22, 0.38, 0.23, "#9aa4ae"),
      vcBox(0.08, 0.1, 0.03, 0.22, 0.38, 0.23, "#9aa4ae"),
      vcBox(0.8, 0.02, 0.4, 0, 0.415, 0, "#2a3220"),
    ]);
  }
  function ammoBoxLidGeo() {
    const OL = "#5f7040";
    return vcMerge([
      vcBox(0.88, 0.09, 0.46, 0, 0.045, 0.23, OL),
      vcBox(0.89, 0.02, 0.47, 0, 0.095, 0.23, "#4a5832"),
      // carry handle
      vcBox(0.05, 0.06, 0.05, -0.15, 0.13, 0.23, "#3b3f45"),
      vcBox(0.05, 0.06, 0.05, 0.15, 0.13, 0.23, "#3b3f45"),
      vcBox(0.34, 0.035, 0.06, 0, 0.17, 0.23, "#2c2f33"),
    ]);
  }
  const LV = {
    chestBase: new THREE.InstancedMesh(chestBaseGeo, chestMat, chestCount + 4),
    chestLid: new THREE.InstancedMesh(chestLidGeo, chestMat, chestCount + 4),
    gun1: new THREE.InstancedMesh(gunGeos[0] ?? fallbackGunGeo, gunLootMat, floorCount),
    gun2: new THREE.InstancedMesh(gunGeos[1] ?? fallbackGunGeo, gunLootMat, floorCount),
    gun3: new THREE.InstancedMesh(gunGeos[2] ?? fallbackGunGeo, gunLootMat, floorCount),
    gun4: new THREE.InstancedMesh(gunGeos[3] ?? fallbackGunGeo, gunLootMat, floorCount),
    heal: new THREE.InstancedMesh(bandageGeo(), itemMat, floorCount),
    medkit: new THREE.InstancedMesh(medkitGeo(), itemMat, floorCount),
    shield: new THREE.InstancedMesh(shieldSmallGeo(), shieldMat, floorCount),
    shieldBig: new THREE.InstancedMesh(shieldBigGeo(), shieldMat, floorCount),
    ammo: new THREE.InstancedMesh(ammoGeo("ar"), itemMat, floorCount),
    ammoSmg: new THREE.InstancedMesh(ammoGeo("smg"), itemMat, floorCount),
    ammoShell: new THREE.InstancedMesh(ammoGeo("shotgun"), itemMat, floorCount),
    ammoHeavy: new THREE.InstancedMesh(ammoGeo("sniper"), itemMat, floorCount),
    ammoBoxBase: new THREE.InstancedMesh(ammoBoxBaseGeo(), ammoBoxMat, ammoBoxCount + 2),
    ammoBoxLid: new THREE.InstancedMesh(ammoBoxLidGeo(), ammoBoxMat, ammoBoxCount + 2),
    ring: new THREE.InstancedMesh(new THREE.RingGeometry(0.42, 0.62, 24).rotateX(-Math.PI / 2), ringMat, floorCount),
    beam: new THREE.InstancedMesh(new THREE.CylinderGeometry(0.34, 0.5, 2.6, 16, 1, true).translate(0, 1.3, 0), beamMat, floorCount),
  };
  type LvKey = keyof typeof LV;
  const lvUsed = Object.fromEntries(Object.keys(LV).map((k) => [k, 0])) as Record<LvKey, number>;
  const _zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (const m of Object.values(LV)) {
    m.count = m.instanceMatrix.count;
    for (let i = 0; i < m.count; i++) m.setMatrixAt(i, _zero);
    m.frustumCulled = false;
    m.castShadow = m !== LV.ring && m !== LV.beam;
    m.visible = !!island;
    scene.add(m);
  }
  const _lc = new THREE.Color();
  function itemKey(it: Item): LvKey {
    if (it.t === "gun") return (["gun1", "gun2", "gun3", "gun4"] as const)[it.slot - 1]!;
    if (it.t === "shield") return it.n >= 50 ? "shieldBig" : "shield";
    if (it.t === "ammo") return it.ammo === "smg" ? "ammoSmg" : it.ammo === "shotgun" ? "ammoShell" : it.ammo === "sniper" ? "ammoHeavy" : "ammo";
    return it.t;
  }
  function itemColor(it: Item) {
    if (it.t === "gun") return GUN_RARITY_BODY[it.r]!;
    return "#ffffff";
  }
  function assignVis(li: LootItem) {
    if (li.spot.kind === "ammo") {
      li.vis = lvUsed.ammoBoxBase++;
      LV.ammoBoxBase.setColorAt(li.vis, _lc.set("#ffffff"));
      LV.ammoBoxLid.setColorAt(li.vis, _lc.set("#ffffff"));
      return;
    }
    if (li.spot.kind === "chest") {
      li.vis = lvUsed.chestBase++;
      LV.chestBase.setColorAt(li.vis, _lc.set("#ffffff"));
      LV.chestLid.setColorAt(li.vis, _lc.set("#ffffff"));
      return;
    }
    const it = li.item;
    if (!it) return;
    const key = itemKey(it);
    li.vis = lvUsed[key]++;
    LV[key].setColorAt(li.vis, _lc.set(itemColor(it)));
    li.ring = lvUsed.ring++;
    const rc = it.t === "gun" ? RARITY_COLORS[it.r]! : "#ffffff";
    LV.ring.setColorAt(li.ring, _lc.set(rc));
    LV.beam.setColorAt(li.ring, _lc.set(rc).multiplyScalar(it.t === "gun" ? (it.r === 0 ? 0.22 : 0.5 + it.r * 0.12) : 0.2));
  }
  for (const li of lootItems) assignVis(li);
  const _lm = new THREE.Matrix4();
  const _lm2 = new THREE.Matrix4();
  const _lq = new THREE.Quaternion();
  const _lp = new THREE.Vector3();
  const _ls = new THREE.Vector3(1, 1, 1);
  const _le = new THREE.Euler();
  /** True once an item spilled from a chest has landed and can be picked up. */
  function lootReady(li: LootItem) {
    return !li.fly || lootClock - li.fly.start > 0.7;
  }
  // chest glow: a pulsing halo sprite and drifting sparkles on the closest unopened chests
  const GLOW_N = 6;
  const glowTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,236,150,0.9)");
    grd.addColorStop(0.4, "rgba(255,200,60,0.35)");
    grd.addColorStop(1, "rgba(255,180,40,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const sparkTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const g = c.getContext("2d")!;
    g.fillStyle = "rgba(255,240,170,1)";
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = i % 2 ? 3 : 15;
      g.lineTo(16 + Math.cos(a) * r, 16 + Math.sin(a) * r);
    }
    g.fill();
    return new THREE.CanvasTexture(c);
  })();
  const chestHalos: THREE.Sprite[] = [];
  for (let i = 0; i < GLOW_N; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.visible = false;
    scene.add(sp);
    chestHalos.push(sp);
  }
  const SPARK_PER = 9;
  const sparkPos = new Float32Array(GLOW_N * SPARK_PER * 3 + 40 * 3);
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ map: sparkTex, size: 0.22, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: "#ffe9a0" }));
  sparks.frustumCulled = false;
  sparks.visible = !!island;
  scene.add(sparks);
  // gold burst when a chest opens
  const bursts: { x: number; y: number; z: number; t: number }[] = [];
  const _near: LootItem[] = [];
  function drawLoot(time: number) {
    _near.length = 0;
    for (const li of lootItems) {
      if (li.vis < 0) continue;
      const s = li.spot;
      if (s.kind === "ammo") {
        let sc = 1;
        let lid = 0;
        if (li.openAt !== undefined) {
          const t = lootClock - li.openAt;
          lid = 1.75 * (1 - Math.exp(-t * 8) * Math.cos(t * 12));
          if (t > 3.4) sc = Math.max(0, 1 - (t - 3.4) / 0.35);
        }
        if (sc <= 0) {
          LV.ammoBoxBase.setMatrixAt(li.vis, _zero);
          LV.ammoBoxLid.setMatrixAt(li.vis, _zero);
          continue;
        }
        _lq.setFromAxisAngle(_up, s.yaw);
        _lm.compose(_lp.set(s.x, s.y, s.z), _lq, _ls.set(sc, sc, sc));
        LV.ammoBoxBase.setMatrixAt(li.vis, _lm);
        _lm2.makeTranslation(0, 0.42, -0.23);
        _lm.multiply(_lm2);
        _lm.multiply(_lm2.makeRotationX(-lid));
        LV.ammoBoxLid.setMatrixAt(li.vis, _lm);
        continue;
      }
      if (s.kind === "chest") {
        let sc = 1;
        let lid = 0;
        if (li.openAt !== undefined) {
          const t = lootClock - li.openAt;
          lid = 1.95 * (1 - Math.exp(-t * 7) * Math.cos(t * 13));
          if (t > 3.4) sc = Math.max(0, 1 - (t - 3.4) / 0.35);
        } else {
          // closed chests hum: a tiny lid rattle
          lid = Math.max(0, Math.sin(time * 5 + li.bob)) * 0.05;
          const dc = Math.hypot(s.x - camera.position.x, s.z - camera.position.z);
          if (dc < 55) _near.push(li);
        }
        if (sc <= 0) {
          LV.chestBase.setMatrixAt(li.vis, _zero);
          LV.chestLid.setMatrixAt(li.vis, _zero);
          continue;
        }
        _lq.setFromAxisAngle(_up, s.yaw);
        _lm.compose(_lp.set(s.x, s.y, s.z), _lq, _ls.set(sc, sc, sc));
        LV.chestBase.setMatrixAt(li.vis, _lm);
        _lm2.makeTranslation(0, 0.62, -0.36);
        _lm.multiply(_lm2);
        _lm.multiply(_lm2.makeRotationX(-lid));
        LV.chestLid.setMatrixAt(li.vis, _lm);
        continue;
      }
      const it = li.item;
      if (!it) continue;
      const key = itemKey(it);
      if (li.open) {
        LV[key].setMatrixAt(li.vis, _zero);
        if (li.ring >= 0) {
          LV.ring.setMatrixAt(li.ring, _zero);
          LV.beam.setMatrixAt(li.ring, _zero);
        }
        continue;
      }
      let px = s.x;
      let py = s.y;
      let pz = s.z;
      let spin = time * 1.4 + li.bob;
      if (li.fly && !lootReady(li)) {
        // arc out of the chest
        const u = Math.min(1, (lootClock - li.fly.start) / 0.7);
        px = li.fly.x + (s.x - li.fly.x) * u;
        pz = li.fly.z + (s.z - li.fly.z) * u;
        py = li.fly.y + (s.y - li.fly.y) * u + Math.sin(u * Math.PI) * 1.3;
        spin += u * 9;
      }
      const bob = Math.sin(time * 2.2 + li.bob) * 0.08;
      _lq.setFromEuler(_le.set(it.t === "gun" ? 0.25 : 0, spin, 0, "YXZ"));
      const sc = it.t === "gun" ? 1.05 : 1;
      _lm.compose(_lp.set(px, py + 0.55 + bob, pz), _lq, _ls.set(sc, sc, sc));
      LV[key].setMatrixAt(li.vis, _lm);
      if (li.ring >= 0) {
        if (lootReady(li)) {
          _lm.makeTranslation(s.x, s.y + 0.06, s.z);
          LV.ring.setMatrixAt(li.ring, _lm);
          const pulse = 0.85 + Math.sin(time * 3 + li.bob) * 0.15;
          _lm.compose(_lp.set(s.x, s.y + 0.02, s.z), _lq.identity(), _ls.set(pulse, it.t === "gun" ? 0.8 + it.r * 0.12 : 0.45, pulse));
          LV.beam.setMatrixAt(li.ring, _lm);
        } else {
          LV.ring.setMatrixAt(li.ring, _zero);
          LV.beam.setMatrixAt(li.ring, _zero);
        }
      }
    }
    // only draw the instance slots in use (hidden slots would still cost vertex work)
    for (const k of Object.keys(LV) as LvKey[]) {
      const m = LV[k];
      m.count = Math.min(m.instanceMatrix.count, k === "chestLid" ? lvUsed.chestBase : k === "ammoBoxLid" ? lvUsed.ammoBoxBase : k === "beam" ? lvUsed.ring : lvUsed[k]);
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    // halos and sparkles on the nearest closed chests
    _near.sort((a, b) => Math.hypot(a.spot.x - camera.position.x, a.spot.z - camera.position.z) - Math.hypot(b.spot.x - camera.position.x, b.spot.z - camera.position.z));
    let sp = 0;
    for (let i = 0; i < GLOW_N; i++) {
      const li = _near[i];
      const halo = chestHalos[i]!;
      if (!li) {
        halo.visible = false;
        for (let k = 0; k < SPARK_PER; k++) sparkPos.set([0, -999, 0], (i * SPARK_PER + k) * 3);
        continue;
      }
      const s = li.spot;
      halo.visible = true;
      halo.position.set(s.x, s.y + 0.55, s.z);
      const pulse = 2.3 + Math.sin(time * 3.2 + li.bob) * 0.35;
      halo.scale.set(pulse, pulse * 0.8, 1);
      for (let k = 0; k < SPARK_PER; k++) {
        const ph = (time * 0.45 + k / SPARK_PER + li.bob) % 1;
        const a = k * 2.399 + li.bob + time * 0.6;
        const r = 0.45 + 0.25 * Math.sin(k * 1.7);
        sparkPos.set([s.x + Math.cos(a) * r, s.y + 0.4 + ph * 1.5, s.z + Math.sin(a) * r], sp * 3);
        sp++;
      }
    }
    sp = GLOW_N * SPARK_PER;
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i]!;
      const t = lootClock - b.t;
      if (t > 1.1) {
        bursts.splice(i, 1);
        continue;
      }
    }
    // up to 40 burst particles shared by recent bursts
    for (let k = 0; k < 40; k++) {
      const b = bursts[k % Math.max(1, bursts.length)];
      if (!b) {
        sparkPos.set([0, -999, 0], (sp + k) * 3);
        continue;
      }
      const t = lootClock - b.t;
      const a = k * 2.399;
      const v = 1.4 + (k % 5) * 0.45;
      sparkPos.set([b.x + Math.cos(a) * v * t, b.y + 0.7 + (3.2 - 4.5 * t) * t + (k % 3) * 0.1, b.z + Math.sin(a) * v * t], (sp + k) * 3);
    }
    sparkGeo.attributes.position!.needsUpdate = true;
  }
  /** Drop an item on the floor (eliminated players spill their gun, chests pop items out). */
  function spillItem(x: number, y: number, z: number, item: Item, from?: [number, number, number]) {
    if (!island) return null;
    const key = itemKey(item);
    if (lvUsed[key] >= floorCount || lvUsed.ring >= floorCount) return null;
    const li: LootItem = { spot: { kind: "floor", x, y, z, yaw: 0 }, open: false, item, vis: -1, ring: -1, bob: Math.random() * 6 };
    if (from) li.fly = { x: from[0], y: from[1], z: from[2], start: lootClock };
    assignVis(li);
    lootItems.push(li);
    return li;
  }
  /** A clear landing spot `dist` metres from a chest at angle `ang`, pulled in before walls. */
  function landSpot(x: number, y: number, z: number, ang: number, dist: number): [number, number, number] {
    const dx = Math.sin(ang);
    const dz = Math.cos(ang);
    const hit = queryShot(x, y + 0.45, z, dx, 0, dz, dist + 0.5, 0);
    const d = hit && hit.kind !== "actor" ? Math.max(0.35, Math.min(dist, hit.t - 0.45)) : dist;
    return [x + dx * d, y, z + dz * d];
  }

  /* ---------- granting items ---------- */
  function gunName(it: { slot: number; r: number }) {
    return `${RARITY_NAMES[it.r]} ${SLOT_NAMES[it.slot]}`;
  }
  /** Gives an item to the player. Returns a short message, or "" when it was not useful (left on the floor). */
  function grantPlayer(it: Item, force = false): string {
    if (it.t === "gun") {
      if (!invOwned[it.slot] || it.r > invRarity[it.slot]!) {
        const fresh = !invOwned[it.slot];
        invOwned[it.slot] = true;
        invRarity[it.slot] = it.r;
        const a = SLOT_AMMO[it.slot]!;
        const cap = a === "ar" ? 30 : a === "shotgun" ? 5 : a === "smg" ? 25 : 1;
        if (fresh) {
          mag[a] = Math.max(mag[a], cap);
          reserve[a] += AMMO_N[a];
        }
        if (slot === 0 || !invOwned[slot]) {
          slot = it.slot;
          buildKind = null;
        }
        return gunName(it);
      }
      if (!force) return "";
      reserve[SLOT_AMMO[it.slot]!] += Math.round(AMMO_N[SLOT_AMMO[it.slot]!] / 2);
      return "+Ammo";
    }
    if (it.t === "ammo") {
      reserve[it.ammo] += it.n;
      return `+${it.n} ${it.ammo === "ar" ? "rifle" : it.ammo} ammo`;
    }
    if (it.t === "heal") {
      if (heals >= 15 && !force) return "";
      heals = Math.min(15, heals + it.n);
      invOwned[5] = true;
      return `+${it.n} Bandages`;
    }
    if (it.t === "medkit") {
      if (medkits >= 3 && !force) return "";
      medkits = Math.min(3, medkits + it.n);
      invOwned[5] = true;
      return "+1 Med Kit";
    }
    if (player.shield >= 100 && !force) return "";
    player.shield = Math.min(100, player.shield + it.n);
    return `+${it.n} Shield`;
  }
  const BOT_GUN: Record<GunSlot, { cd: [number, number]; dmg: number; range: number; spread: number; pellets: number; pref: number; kind: "ar" | "shotgun" | "smg" | "sniper" }> = {
    1: { cd: [0.38, 0.62], dmg: 8, range: 75, spread: 0.06, pellets: 1, pref: 22, kind: "ar" },
    2: { cd: [0.95, 1.25], dmg: 7, range: 16, spread: 0.13, pellets: 6, pref: 4, kind: "shotgun" },
    3: { cd: [0.18, 0.3], dmg: 5.5, range: 40, spread: 0.09, pellets: 1, pref: 9, kind: "smg" },
    4: { cd: [2.1, 2.7], dmg: 55, range: 150, spread: 0.012, pellets: 1, pref: 45, kind: "sniper" },
  };
  function botScore(a: Actor) {
    return a.gun ? 1 + (a.rarity ?? 0) * 0.3 + (a.gun === 1 ? 0.3 : a.gun === 2 ? 0.4 : 0) : 0;
  }
  function grantBot(a: Actor, it: Item) {
    if (it.t === "gun") {
      const cur = a.gun ? 1 + (a.rarity ?? 0) * 0.3 : 0;
      if (1 + it.r * 0.3 >= cur) {
        a.gun = it.slot;
        a.rarity = it.r;
      }
    } else if (it.t === "shield") a.shield = Math.min(100, a.shield + it.n);
    else if (it.t === "heal" || it.t === "medkit") a.heals = (a.heals ?? 0) + it.n;
  }
  function openChest(li: LootItem, who: Actor | null) {
    if (li.open) return;
    li.open = true;
    li.openAt = lootClock;
    const s = li.spot;
    if (s.kind === "ammo") {
      // ammo box: two or three stacks of ammo, favouring the guns the player carries
      if (Math.hypot(s.x - player.x, s.z - player.z) < 30) audio.play("chest");
      if (who) return;
      const carried = ([1, 2, 3, 4] as const).filter((k) => invOwned[k]).map((k) => SLOT_AMMO[k]!);
      const pickAmmo = (): AmmoKind => (carried.length && Math.random() < 0.7 ? carried[Math.floor(Math.random() * carried.length)]! : (["ar", "ar", "shotgun", "smg", "sniper"] as const)[Math.floor(Math.random() * 5)]!);
      const from: [number, number, number] = [s.x, s.y + 0.5, s.z];
      const n = Math.random() < 0.4 ? 3 : 2;
      for (let k = 0; k < n; k++) {
        const a = pickAmmo();
        const it: Item = { t: "ammo", ammo: a, n: AMMO_N[a] };
        const [x, y, z] = landSpot(s.x, s.y, s.z, s.yaw + (k - (n - 1) / 2) * 0.7, 1.3);
        if (!spillItem(x, y, z, it, from)) grantPlayer(it, true);
      }
      return;
    }
    bursts.push({ x: s.x, y: s.y, z: s.z, t: lootClock });
    const gun = rollGun(0.12);
    const xr = Math.random();
    const extra: Item = xr < 0.35 ? { t: "heal", n: 3 } : xr < 0.5 ? { t: "medkit", n: 1 } : { t: "shield", n: xr < 0.75 ? 25 : 50 };
    const near = Math.hypot(s.x - player.x, s.z - player.z) < 30;
    if (near) audio.play("chest");
    if (!who) {
      // Fortnite-style: the loot pops out of the chest and lands in front of it
      const from: [number, number, number] = [s.x, s.y + 0.7, s.z];
      const ammo: Item = { t: "ammo", ammo: SLOT_AMMO[(gun as { slot: number }).slot]!, n: AMMO_N[SLOT_AMMO[(gun as { slot: number }).slot]!] };
      const items: [Item, number, number][] = [
        [gun, 0, 1.55],
        [ammo, -0.75, 1.35],
        [extra, 0.75, 1.35],
      ];
      for (const [it, da, dist] of items) {
        const [x, y, z] = landSpot(s.x, s.y, s.z, s.yaw + da, dist);
        if (!spillItem(x, y, z, it, from)) grantPlayer(it, true);
      }
      const m = MAT_ORDER[Math.floor(Math.random() * 3)]!;
      gain(m, 30);
      floatAt(s.x, s.y + 1.4, s.z, `+30 ${m}`);
      return;
    }
    grantBot(who, gun);
    grantBot(who, extra);
    who.mats += 30;
  }

  /* ---------- drop ship ---------- */
  const busAng = Math.random() * Math.PI * 2;
  const busOff = (Math.random() - 0.5) * (island ? island.mapHalf * 0.5 : 110);
  const bdx = Math.cos(busAng);
  const bdz = Math.sin(busAng);
  const BUS_LEN = island ? island.mapHalf * 1.05 : 255;
  const bus = {
    x0: -bdx * BUS_LEN - bdz * busOff,
    z0: -bdz * BUS_LEN + bdx * busOff,
    x1: bdx * BUS_LEN - bdz * busOff,
    z1: bdz * BUS_LEN + bdx * busOff,
    t: 0,
    dur: (BUS_LEN * 2) / 30,
    // high over the island like the Battle Bus, so the skydive is a proper one
    y: 185,
  };
  function busXZ(t = bus.t): [number, number] {
    const u = Math.min(1, Math.max(0, t / bus.dur));
    return [bus.x0 + (bus.x1 - bus.x0) * u, bus.z0 + (bus.z1 - bus.z0) * u];
  }
  const ferry = buildFerry();
  const busModel = ferry.group;
  busModel.rotation.y = Math.atan2(-bdz, bdx);
  busModel.visible = !!island;
  scene.add(busModel);
  function makeGlider(id: string) {
    const gear = gearById(id);
    const g = buildGlider(gear.kind === "glider" ? gear : gearById("glider"));
    scene.add(g.group, ...g.trails);
    return g;
  }
  const playerGlider = makeGlider(opts.gliderId ?? "glider");
  const BOT_GLIDERS = GEAR.filter((g) => g.kind === "glider").map((g) => g.id);
  let drop: "bus" | "fall" | "glide" | null = island && preT <= 0 ? "bus" : null;
  if (spawnIsle) {
    // start on the spawn island, facing the countdown board
    const [sx, sz, syaw] = spawnPoints(16)[0]!;
    player.x = sx;
    player.z = sz;
    player.y = groundHeight(sx, sz);
    camYaw = syaw;
    player.yaw = syaw;
  }
  let jumpWas = false;
  let bigMap = false;

  function nearestPoi(x: number, z: number) {
    if (!island) return "";
    let best = "";
    let bd = 1e9;
    for (const p of island.pois) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < p.r && d < bd) {
        bd = d;
        best = p.name;
      }
    }
    return best;
  }

  /** Skydiving and gliding for the player. */
  /** Skydive pose state: seconds since jumping, body pitch (forward lean), roll (turn lean), dive blend. */
  let skyT = 0;
  let skyPitch = 0;
  let skyRoll = 0;
  let skyDive = 0;
  function updateDrop(dt: number) {
    const st = opts.getSettings();
    const jump = isDown("Space") || isDown(st.binds.jump) || opts.pad.jump;
    const pressed = jump && !jumpWas;
    jumpWas = jump;
    if (drop === "bus") {
      const [bx, bz] = busXZ();
      player.x = bx;
      player.z = bz;
      player.y = bus.y - 4;
      player.vx = player.vy = player.vz = 0;
      if ((pressed && bus.t > 1.2) || bus.t > bus.dur * 0.9) {
        // leap off the deck like jumping out of the Battle Bus: a hop up and out, then into the dive
        drop = "fall";
        player.vx = bdx * 14;
        player.vz = bdz * 14;
        player.vy = 6.5;
        skyT = 0;
        skyPitch = 0;
        skyRoll = 0;
        skyDive = 0;
        audio.play("jump");
      }
      return;
    }
    const wish = readMove();
    const fx = -Math.sin(camYaw);
    const fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw);
    const rz = -Math.sin(camYaw);
    let mx = fx * wish.z + rx * wish.x;
    let mz = fz * wish.z + rz * wish.x;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) {
      mx /= ml;
      mz /= ml;
    }
    const ground = surfaceAt(player.x, player.z, player.y);
    const above = player.y - ground;
    if (drop === "fall" && (above < 32 || (pressed && above < 70))) {
      drop = "glide";
      audio.play("ui");
    }
    const dive = drop === "fall" && wish.z > 0.5;
    // skydive pose: tip forward into a belly-down fall (steeper while diving), lean into turns
    skyT += dt;
    if (drop === "fall") {
      const wantPitch = skyT < 0.35 ? -0.15 : dive ? 1.42 : 0.95 + Math.max(0, wish.z) * 0.15 - Math.max(0, -wish.z) * 0.3;
      skyPitch += (wantPitch - skyPitch) * Math.min(1, dt * (skyT < 0.9 ? 3.2 : 4.5));
      skyRoll += (-wish.x * 0.42 - skyRoll) * Math.min(1, dt * 4);
      skyDive += ((dive ? 1 : 0) - skyDive) * Math.min(1, dt * 4);
    } else {
      skyPitch += (0.12 - skyPitch) * Math.min(1, dt * 5);
      skyRoll += (-wish.x * 0.18 - skyRoll) * Math.min(1, dt * 4);
    }
    const hs = drop === "fall" ? (dive ? 12 : 17) : 12;
    const vt = drop === "fall" ? (dive ? -46 : -30) : -7.5;
    const kh = 1 - Math.exp(-2.4 * dt);
    player.vx += (mx * hs - player.vx) * kh;
    player.vz += (mz * hs - player.vz) * kh;
    player.vy += (vt - player.vy) * (1 - Math.exp(-2 * dt));
    player.x += player.vx * dt;
    player.z += player.vz * dt;
    player.y += player.vy * dt;
    const lim = (island?.radius ?? 200) - 3;
    const rr = Math.hypot(player.x, player.z);
    if (rr > lim) {
      player.x *= lim / rr;
      player.z *= lim / rr;
    }
    player.yaw += angDelta(player.yaw, camYaw) * Math.min(1, 6 * dt);
    const floor = surfaceAt(player.x, player.z, player.y + 1);
    if (player.y <= floor) {
      player.y = floor;
      player.vy = 0;
      player.grounded = true;
      drop = null;
      audio.play("build", 0.6);
      const where = nearestPoi(player.x, player.z);
      say(where ? `Landed at ${where}` : "Landed — find a chest!");
    }
  }

  /* ---------- storm circles ---------- */
  const BR_PHASES = [
    // the storm waits about a minute, then moves to its next random spot
    { wait: 60, shrink: 40, r: 230, dps: 1 },
    { wait: 60, shrink: 34, r: 150, dps: 1 },
    { wait: 60, shrink: 30, r: 95, dps: 2 },
    { wait: 60, shrink: 26, r: 56, dps: 4 },
    { wait: 60, shrink: 22, r: 30, dps: 6 },
    { wait: 60, shrink: 18, r: 12, dps: 8 },
    { wait: 60, shrink: 24, r: 0, dps: 12 },
  ];
  let brPhase = 0;
  let brStage: "pre" | "wait" | "shrink" | "done" = "pre";
  let brT = 0;
  let fromX = 0;
  let fromZ = 0;
  let fromR = 240;
  let toX = 0;
  let toZ = 0;
  let toR = 150;
  function pickNext() {
    const ph = BR_PHASES[brPhase]!;
    const room = Math.max(0, stormR - ph.r) * 0.85;
    let nx = stormX;
    let nz = stormZ;
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * room;
      nx = stormX + Math.cos(a) * d;
      nz = stormZ + Math.sin(a) * d;
      if (Math.hypot(nx, nz) + ph.r * 0.35 < (island?.landRadius ?? 130) && groundHeight(nx, nz) > 1) break;
    }
    toX = nx;
    toZ = nz;
    toR = ph.r;
  }
  if (island) {
    stormX = 0;
    stormZ = 0;
    stormR = island.radius + 15;
    pickNext();
    stormMesh.scale.set(stormR, 8, stormR);
    stormMesh.position.y = 120;
  }
  function stormDps() {
    return BR_PHASES[Math.min(brPhase, BR_PHASES.length - 1)]!.dps;
  }
  function updateStormBR(dt: number) {
    if (brStage === "pre") {
      if (bus.t >= bus.dur) {
        brStage = "wait";
        brT = BR_PHASES[0]!.wait;
      }
    } else if (brStage === "wait") {
      brT -= dt;
      if (brT <= 0) {
        brStage = "shrink";
        brT = BR_PHASES[brPhase]!.shrink;
        fromX = stormX;
        fromZ = stormZ;
        fromR = stormR;
        say("The storm is closing in!");
        audio.play("storm");
      }
    } else if (brStage === "shrink") {
      brT -= dt;
      const ph = BR_PHASES[brPhase]!;
      const u = 1 - Math.max(0, brT) / ph.shrink;
      stormX = fromX + (toX - fromX) * u;
      stormZ = fromZ + (toZ - fromZ) * u;
      stormR = fromR + (toR - fromR) * u;
      if (brT <= 0) {
        brPhase++;
        if (brPhase < BR_PHASES.length) {
          pickNext();
          brStage = "wait";
          brT = BR_PHASES[brPhase]!.wait;
        } else brStage = "done";
      }
    }
    stormMesh.scale.set(Math.max(1, stormR), 8, Math.max(1, stormR));
    stormMesh.position.set(stormX, 120, stormZ);
    // the clouds swirl round the wall and roll upward
    stormTex.offset.x = (matchT * 0.0035) % 1;
    stormTex.offset.y = (matchT * 0.02) % 1;
    stormRing.scale.set(Math.max(1, stormR), Math.max(1, stormR), 1);
    stormRing.position.set(stormX, 2.5, stormZ);
    const dps = stormDps();
    stormTick -= dt;
    if (player.alive && !drop && Math.hypot(player.x - stormX, player.z - stormZ) > stormR && stormTick <= 0) {
      hurtPlayer(dps, "the storm");
      audio.play("storm");
    }
    if (stormTick <= 0) stormTick = 0.8;
    for (const a of actors) {
      if (!a.alive || a.drop) continue;
      if (Math.hypot(a.x - stormX, a.z - stormZ) > stormR) {
        a.hp -= dps * dt;
        if (a.hp <= 0) hurtActor(a, 1, false, false, "the storm");
      }
    }
  }

  /* ---------- bots ---------- */
  const BOT_NAMES = ["Pixel_Pete", "Tidewalker", "Nova", "Buckshot Bea", "Mossy", "Kettle", "Rook77", "Juniper", "Sparrow", "Chomper", "Vex", "Lumen", "Grit", "Hazel_K", "Pogo", "Ember", "Quill", "Drift"];
  const LAND_SPOTS = island ? [...island.pois.map((p) => [p.x, p.z, p.r * 0.6] as const), [0, 0, 120] as const] : [];
  function addRoyaleBots(n: number) {
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    for (let i = 0; i < n; i++) {
      const [bx, bz] = busXZ(0);
      addBot(2, bx, bz, names[i % names.length]!);
      const a = actors[actors.length - 1]!;
      const spot = LAND_SPOTS[Math.floor(Math.random() * LAND_SPOTS.length)]!;
      const ang = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * spot[2];
      a.tx = spot[0] + Math.cos(ang) * rr;
      a.tz = spot[1] + Math.sin(ang) * rr;
      // jump when the ship is closest to the chosen landing spot
      const px = a.tx - bus.x0;
      const pz = a.tz - bus.z0;
      const along = (px * (bus.x1 - bus.x0) + pz * (bus.z1 - bus.z0)) / ((BUS_LEN * 2) ** 2);
      a.dropAt = Math.min(bus.dur * 0.88, Math.max(1.5, along * bus.dur - 2 + Math.random() * 2));
      a.drop = "bus";
      a.gun = null;
      a.rarity = 0;
      a.mats = 0;
      a.shield = 0;
      a.heals = 0;
      a.y = bus.y;
      a.goalT = 0;
      a.stuckT = 0;
      a.px = a.x;
      a.pz = a.z;
      a.foe = -1;
      a.react = 0;
      a.lootI = -1;
      a.skip = new Set();
      a.glider = makeGlider(BOT_GLIDERS[(i * 7 + 3) % BOT_GLIDERS.length]!);
      a.label.material.depthTest = true;
    }
  }

  function botSteer(a: Actor, mx: number, mz: number): [number, number] {
    const probe = 0.9;
    if (!blocked(a.x + mx * probe, a.z + mz * probe, a.y, false)) return [mx, mz];
    for (const ang of [0.6, -0.6, 1.2, -1.2, 1.9, -1.9]) {
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const nx = mx * c - mz * s;
      const nz = mx * s + mz * c;
      if (!blocked(a.x + nx * probe, a.z + nz * probe, a.y, false)) return [nx, nz];
    }
    if (a.grounded) a.vy = 8.6;
    return [mx, mz];
  }

  function findLoot(a: Actor) {
    let best = -1;
    let bd = 48;
    for (let i = 0; i < lootItems.length; i++) {
      const li = lootItems[i]!;
      if (li.open || a.skip?.has(i) || !lootReady(li)) continue;
      if (li.spot.kind !== "chest") {
        const it = li.item;
        if (!it) continue;
        if (it.t === "gun" && a.gun && 1 + it.r * 0.3 < botScore(a)) continue;
        if (it.t === "ammo" || it.t === "heal") continue;
      }
      const d = Math.hypot(li.spot.x - a.x, li.spot.z - a.z) + Math.abs(li.spot.y - a.y) * 3;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  function updateBotBR(a: Actor, dt: number) {
    if (stageFreeze) return;
    if (!a.alive) {
      a.rig.group.rotation.x += (1.3 - a.rig.group.rotation.x) * Math.min(1, dt * 4);
      a.label.visible = false;
      return;
    }
    a.flash = Math.max(0, a.flash - dt);
    a.shootCd -= dt;
    a.think -= dt;
    a.coverCd -= dt;
    a.react = (a.react ?? 0) - dt;
    if (preT > 0) {
      warmupBot(a, dt);
      return;
    }
    if (a.drop === "bus") {
      const [bx, bz] = busXZ();
      a.x = bx;
      a.z = bz;
      a.y = bus.y - 4;
      if (bus.t >= (a.dropAt ?? 3)) {
        a.drop = "fall";
        a.vy = -6;
      }
      return;
    }
    if (a.drop === "fall" || a.drop === "glide") {
      const ground = surfaceAt(a.x, a.z, a.y);
      if (a.drop === "fall" && a.y - ground < 30) a.drop = "glide";
      const dx = (a.tx ?? 0) - a.x;
      const dz = (a.tz ?? 0) - a.z;
      const d = Math.hypot(dx, dz) || 1;
      const hs = Math.min(a.drop === "fall" ? 17 : 12, d * 0.8);
      a.vx += ((dx / d) * hs - a.vx) * Math.min(1, dt * 2.4);
      a.vz += ((dz / d) * hs - a.vz) * Math.min(1, dt * 2.4);
      const vt = a.drop === "fall" ? (d < 40 ? -46 : -30) : -7.5;
      a.vy += (vt - a.vy) * Math.min(1, dt * 2);
      a.x += a.vx * dt;
      a.z += a.vz * dt;
      a.y += a.vy * dt;
      a.yaw = Math.atan2(-a.vx, -a.vz);
      const floor = surfaceAt(a.x, a.z, a.y + 1);
      if (a.y <= floor) {
        a.y = floor;
        a.vy = 0;
        a.drop = null;
        a.grounded = true;
        a.mats = 40 + Math.floor(Math.random() * 60);
        a.px = a.x;
        a.pz = a.z;
      }
      return;
    }

    /* perception */
    if (a.think <= 0) {
      a.think = 0.28 + Math.random() * 0.2;
      const cands: { id: number; x: number; y: number; z: number; d: number }[] = [];
      if (player.alive && !drop) cands.push({ id: 0, x: player.x, y: player.y, z: player.z, d: Math.hypot(player.x - a.x, player.z - a.z) });
      for (const o of actors) if (o !== a && o.alive && !o.drop) cands.push({ id: o.id, x: o.x, y: o.y, z: o.z, d: Math.hypot(o.x - a.x, o.z - a.z) });
      cands.sort((p, q) => p.d - q.d);
      const sight = a.gun === 4 ? 120 : 62;
      let found = -1;
      for (const c of cands.slice(0, 3)) {
        if (c.d > sight) break;
        const ox = a.x;
        const oy = a.y + 1.5;
        const oz = a.z;
        const tx = c.x - ox;
        const ty = c.y + 1.1 - oy;
        const tz = c.z - oz;
        const tl = Math.hypot(tx, ty, tz) || 1;
        const h = queryShot(ox, oy, oz, tx / tl, ty / tl, tz / tl, tl + 1, a.id, true);
        if (h?.kind === "actor" && h.id === c.id) {
          found = c.id;
          break;
        }
        if (c.d < 4) {
          found = c.id;
          break;
        }
      }
      if (found !== a.foe) {
        a.foe = found;
        if (found >= 0) a.react = 0.6 + Math.random() * 0.7;
      }
      if ((a.foe! < 0 || !a.gun) && (!a.gun || botScore(a) < 1.5 || a.shield < 50) && (a.lootI ?? -1) < 0) {
        a.lootI = findLoot(a);
        const li = a.lootI >= 0 ? lootItems[a.lootI] : undefined;
        a.path = [];
        if (li?.spot.path) {
          const box = li.spot.inside;
          const indoors = box && a.x > box[0] && a.x < box[2] && a.z > box[1] && a.z < box[3];
          a.path = li.spot.path.slice(indoors ? 2 : 0).map((p) => [...p] as [number, number, number]);
          if (indoors && a.y > li.spot.y - 1) a.path = [];
        }
      }
    }
    let foeObj = a.foe === 0 ? (player.alive ? { x: player.x, y: player.y, z: player.z } : null) : a.foe! > 0 ? actors.find((o) => o.id === a.foe && o.alive) ?? null : null;
    if (!foeObj) a.foe = -1;
    else if (!a.gun && Math.hypot(foeObj.x - a.x, foeObj.z - a.z) > 7 && (a.lootI ?? -1) >= 0) foeObj = null;

    /* movement goal */
    let gx = a.goalX ?? a.x;
    let gz = a.goalZ ?? a.z;
    let strafe = false;
    let pref = 0;
    const inStormNow = Math.hypot(a.x - stormX, a.z - stormZ) > stormR - 3;
    const outsideNext = brStage !== "pre" && Math.hypot(a.x - toX, a.z - toZ) > toR - 4 && (brStage === "shrink" || brT < 20);
    if (foeObj && !inStormNow) {
      const g = a.gun ? BOT_GUN[a.gun as GunSlot] : null;
      pref = g ? g.pref : 1;
      const dx = foeObj.x - a.x;
      const dz = foeObj.z - a.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d > pref + 5) {
        gx = foeObj.x;
        gz = foeObj.z;
      } else if (d < pref - 3 && pref > 3) {
        gx = a.x - dx;
        gz = a.z - dz;
      } else strafe = true;
      a.yaw = Math.atan2(-dx, -dz);
    } else if (inStormNow || outsideNext) {
      gx = brStage === "shrink" || inStormNow ? stormX : toX;
      gz = brStage === "shrink" || inStormNow ? stormZ : toZ;
    } else if ((a.lootI ?? -1) >= 0) {
      const li = lootItems[a.lootI!];
      if (!li || li.open) a.lootI = -1;
      else if (a.path && a.path.length) {
        const wp = a.path[0]!;
        gx = wp[0];
        gz = wp[2];
        if (Math.hypot(wp[0] - a.x, wp[2] - a.z) < 1.1) a.path.shift();
      } else {
        gx = li.spot.x;
        gz = li.spot.z;
        if (Math.hypot(li.spot.x - a.x, li.spot.z - a.z) < 1.7 && Math.abs(li.spot.y - a.y) < 1.8) {
          if (isBox(li.spot)) openChest(li, a);
          else if (li.item) {
            grantBot(a, li.item);
            li.open = true;
          }
          a.lootI = -1;
        }
      }
    } else {
      a.goalT = (a.goalT ?? 0) - dt;
      if (a.goalT <= 0 || Math.hypot(gx - a.x, gz - a.z) < 3) {
        const cx = brStage === "pre" ? a.x : toX;
        const cz = brStage === "pre" ? a.z : toZ;
        const rad = brStage === "pre" ? 40 : Math.max(6, toR * 0.7);
        const ang = Math.random() * Math.PI * 2;
        gx = cx + Math.cos(ang) * Math.random() * rad;
        gz = cz + Math.sin(ang) * Math.random() * rad;
        a.goalT = 8 + Math.random() * 8;
      }
    }
    a.goalX = gx;
    a.goalZ = gz;
    const dx = gx - a.x;
    const dz = gz - a.z;
    const dist = Math.hypot(dx, dz) || 1;
    let mx = dx / dist;
    let mz = dz / dist;
    if (strafe) {
      if (Math.random() < dt * 1.5) a.strafe = -a.strafe;
      mx = (-dz / dist) * a.strafe;
      mz = (dx / dist) * a.strafe;
    }
    const moving = dist > 1.2 || strafe;
    let speed = 0;
    if (moving) {
      [mx, mz] = botSteer(a, mx, mz);
      speed = strafe ? 5.6 : foeObj ? 7.6 : 8.6;
      if (island && island.wet(a.x, a.z) && a.y < 0.2) speed *= 0.6;
    }
    a.vx += (mx * speed - a.vx) * Math.min(1, dt * 10);
    a.vz += (mz * speed - a.vz) * Math.min(1, dt * 10);
    if (!foeObj && speed > 0) a.yaw = Math.atan2(-a.vx, -a.vz);
    const body = { x: a.x, y: a.y, z: a.z, vx: a.vx, vy: a.vy, vz: a.vz, grounded: a.grounded, crouch: false };
    moveBody(body, dt);
    a.x = body.x;
    a.y = body.y;
    a.z = body.z;
    a.vy = body.vy;
    a.grounded = body.grounded;
    // walk through doors: open any closed door the bot is pushing against
    if (island && moving) {
      for (let i = 0; i < island.doors.length; i++) {
        const d = island.doors[i]!;
        if (d.open || Math.abs(a.y - d.y) > 1.6) continue;
        if (Math.hypot(d.cx - a.x, d.cz - a.z) < 1.9) island.toggleDoor(i, true);
      }
    }
    // stuck detection
    a.stuckT = (a.stuckT ?? 0) + dt;
    if (a.stuckT > 1.6) {
      const moved = Math.hypot(a.x - (a.px ?? a.x), a.z - (a.pz ?? a.z));
      if (moving && moved < 0.9) {
        if ((a.lootI ?? -1) >= 0) a.skip?.add(a.lootI!);
        a.lootI = -1;
        a.goalT = 0;
        if (a.grounded) a.vy = 8.6;
      }
      a.stuckT = 0;
      a.px = a.x;
      a.pz = a.z;
    }

    /* combat */
    if (foeObj && (a.react ?? 0) <= 0 && matchT > 3) {
      const ox = a.x;
      const oy = a.y + 1.45;
      const oz = a.z;
      const d = Math.hypot(foeObj.x - ox, foeObj.z - oz);
      if (!a.gun) {
        if (d < 2.3 && a.shootCd <= 0) {
          a.shootCd = 0.85;
          if (a.foe === 0) hurtPlayer(15, a.name, a);
          else {
            const o = actors.find((x) => x.id === a.foe);
            if (o) hurtActor(o, 15, false, false, a.name);
          }
        }
      } else {
        const g = BOT_GUN[a.gun as GunSlot];
        if (a.shootCd <= 0 && d < g.range) {
          a.shootCd = g.cd[0] + Math.random() * (g.cd[1] - g.cd[0]);
          kickWeapon(a.rig, g.kind === "sniper" ? 1.5 : g.kind === "shotgun" ? 1.25 : 0.5);
          const hear = Math.hypot(a.x - player.x, a.z - player.z);
          if (hear < 90) audio.play(g.kind === "shotgun" ? "shotgun" : g.kind === "sniper" ? "sniper" : g.kind === "smg" ? "smg" : "shot", Math.max(0.08, Math.min(0.6, 1 - hear / 90)));
          const mult = RAR_MULT[a.rarity ?? 0]!;
          for (let p = 0; p < g.pellets; p++) {
            const ax = foeObj.x - ox;
            const ay = foeObj.y + 1.1 - oy;
            const az = foeObj.z - oz;
            const al = Math.hypot(ax, ay, az) || 1;
            const spread = g.spread + d * 0.0016 + (a.foe === 0 && Math.hypot(player.vx, player.vz) > 6 ? 0.03 : 0);
            const ddx = ax / al + (Math.random() - 0.5) * spread;
            const ddy = ay / al + (Math.random() - 0.5) * spread;
            const ddz = az / al + (Math.random() - 0.5) * spread;
            const dl = Math.hypot(ddx, ddy, ddz) || 1;
            const hit = queryShot(ox, oy, oz, ddx / dl, ddy / dl, ddz / dl, g.range, a.id);
            if (p === 0) spawnTracer(ox, oy, oz, ox + (ddx / dl) * (hit ? hit.t : 30), oy + (ddy / dl) * (hit ? hit.t : 30), oz + (ddz / dl) * (hit ? hit.t : 30));
            if (hit?.kind === "actor" && hit.id === 0) hurtPlayer(g.dmg * mult * (hit.head ? 1.5 : 1), a.name, a);
            else if (hit?.kind === "actor") {
              const o = actors.find((x) => x.id === hit.id);
              if (o) hurtActor(o, g.dmg * mult * (hit.head ? 1.5 : 1), hit.head, false, a.name);
            } else if (hit?.kind === "build") {
              const piece = pieces[hit.index];
              if (piece && piece.owner !== a.id) hitPiece(piece, g.dmg, hit.x, hit.y, hit.z);
            } else if (hit?.kind === "ground" && hit.veh != null) damageVehicle(vehicles[hit.veh]!, g.dmg, hit.x, hit.y, hit.z);
            else if (hit?.kind === "ground") shatter(hit.box);
          }
        }
      }
      // panic wall when hurt
      if (a.hp + a.shield < 70 && a.coverCd <= 0 && a.mats >= 10 && d > 5) {
        const fx = (foeObj.x - a.x) / (d || 1);
        const fz = (foeObj.z - a.z) / (d || 1);
        const ix = Math.floor((a.x + fx * 2.4) / CELL);
        const iz = Math.floor((a.z + fz * 2.4) / CELL);
        const rot = Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 1 : 3) : fz > 0 ? 0 : 2;
        const base = Math.max(surfaceAt((ix + 0.5) * CELL, (iz + 0.5) * CELL, a.y + 1), groundFit("wall", ix, iz, (rot + 2) & 3));
        const botMat: BuildMat = a.id % 5 === 0 ? "metal" : a.id % 3 === 0 ? "brick" : "wood";
        if (tryPlace("wall", ix, iz, (rot + 2) & 3, a.id, a.team, base, false, botMat)) {
          a.coverCd = 3 + Math.random() * 2;
        } else a.coverCd = 1;
      }
    } else if (!foeObj && a.hp < 60 && (a.heals ?? 0) > 0 && Math.random() < dt * 0.4) {
      a.heals = (a.heals ?? 0) - 1;
      a.hp = Math.min(100, a.hp + 35);
    }
  }

  if (island) addRoyaleBots(Math.max(0, Math.min(15, opts.bots ?? 15)));
  if (island && preT > 0) {
    // everyone waits on the spawn island with the player until the drop ship leaves
    const pts = spawnPoints(16);
    actors.forEach((a, i) => {
      if (a.target) return;
      const [x, z, yaw] = pts[(i + 1) % pts.length]!;
      a.drop = null;
      a.x = x;
      a.z = z;
      a.y = groundHeight(x, z);
      a.vx = a.vy = a.vz = 0;
      a.grounded = true;
      a.yaw = yaw;
      a.goalX = x;
      a.goalZ = z;
      a.goalT = 1 + Math.random() * 5;
    });
  }

  /** Spawn island warm-up for a bot: wander about, hop around, wait for the ship. */
  function warmupBot(a: Actor, dt: number) {
    a.goalT = (a.goalT ?? 0) - dt;
    if (a.goalT <= 0) {
      a.goalT = 3 + Math.random() * 6;
      if (Math.random() < 0.35) {
        a.goalX = a.x;
        a.goalZ = a.z;
      } else {
        const ang = Math.random() * Math.PI * 2;
        const r = 4 + Math.random() * 30;
        a.goalX = SPAWN_ISLE.x + Math.cos(ang) * r;
        a.goalZ = SPAWN_ISLE.z + Math.sin(ang) * r;
      }
    }
    const dx = (a.goalX ?? a.x) - a.x;
    const dz = (a.goalZ ?? a.z) - a.z;
    const d = Math.hypot(dx, dz);
    let mx = 0;
    let mz = 0;
    let speed = 0;
    if (d > 1.2) {
      [mx, mz] = botSteer(a, dx / d, dz / d);
      speed = 5.5;
    }
    a.vx += (mx * speed - a.vx) * Math.min(1, dt * 10);
    a.vz += (mz * speed - a.vz) * Math.min(1, dt * 10);
    if (speed > 0) a.yaw = Math.atan2(-a.vx, -a.vz);
    if (a.grounded && Math.random() < dt * 0.25) a.vy = 8.6;
    const body = { x: a.x, y: a.y, z: a.z, vx: a.vx, vy: a.vy, vz: a.vz, grounded: a.grounded, crouch: false };
    moveBody(body, dt);
    a.x = body.x;
    a.y = body.y;
    a.z = body.z;
    a.vy = body.vy;
    a.grounded = body.grounded;
  }

  /** Warm-up over: clear the spawn island builds and put everyone on the drop ship. */
  function launchBus() {
    preT = 0;
    if (spawnIsle) {
      scene.remove(spawnIsle.group);
      spawnIsle.group.visible = false;
    }
    pieces.length = 0;
    piecesVer++;
    if (editPiece >= 0) leaveEdit();
    buildKind = null;
    dirty = true;
    slot = 0;
    drop = "bus";
    bus.t = 0;
    player.vx = player.vy = player.vz = 0;
    for (const a of actors) {
      if (a.target || !a.alive) continue;
      a.drop = "bus";
      a.vx = a.vy = a.vz = 0;
      a.grounded = false;
      a.y = bus.y;
      a.goalT = 0;
      a.foe = -1;
    }
    say("All aboard! The drop ship is leaving");
    audio.play("ui");
  }


  /** Pickaxe health of world boxes (house wall sections, fences, props), set on the first hit. */
  const worldHp = new WeakMap<StaticBox, number>();
  function worldMaxHp(b: StaticBox) {
    return b.mat === "metal" ? 240 : b.mat === "brick" ? 180 : b.mat === "wood" ? 120 : 100;
  }
  /** Upright things break; flat walkable things (floors, roofs, foundations, docks) don't. */
  function breakable(b: StaticBox) {
    if (b.dead || b.glass || b.door !== undefined) return false;
    const h = b.maxY - b.minY;
    const thin = Math.min(b.maxX - b.minX, b.maxZ - b.minZ);
    return h >= 0.35 && h >= thin * 0.6 && b.maxY > groundHeight((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2) + 0.3;
  }

  /** Shatter a window pane: hide it, spray shards, tinkle. */
  function shatter(box: StaticBox | null | undefined) {
    if (!island || !box?.glass) return false;
    const c = island.breakGlass(box);
    if (!c) return false;
    spawnChunks("metal", c[0], c[1], c[2], 10, 2.4, false, ["#cfeeff", "#9fd4f2", "#ffffff", "#bfe6ff"]);
    if (Math.hypot(c[0] - player.x, c[2] - player.z) < 45) audio.play("glass");
    return true;
  }

  let lootPrompt = "";

  /* ---------- drivable cars ---------- */
  const vehEnv: VehicleEnv = {
    ground: (x, z, feet) => surfaceAt(x, z, feet, false),
    blocked: (x, z, y0, y1, r, self) => {
      if (blockedRange(x, z, y0, y1, r, true)) return true;
      for (const o of vehicles) if (o !== self && vehicleTouches(o, x, z, y0, y1, r)) return true;
      return false;
    },
    wet: (x, z) => groundHeight(x, z) < -0.5,
  };

  function enterVehicle(v: Vehicle) {
    if (!v.alive || v.driver >= 0) return;
    driving = v;
    v.driver = 0;
    buildKind = null;
    if (editPiece >= 0) leaveEdit();
    reloadT = 0;
    player.vx = player.vy = player.vz = 0;
    camYaw = v.yaw + Math.PI;
    lookIdle = 0;
    audio.play("ui");
    say("Hop in! W/S drive · A/D steer · Space brake");
  }

  function exitVehicle() {
    const v = driving;
    if (!v) return;
    driving = null;
    v.driver = -1;
    audio.engine(0);
    for (const side of [1, -1] as const) {
      const [x, z] = doorPos(v, side);
      const g = surfaceAt(x, z, v.y + 1);
      if (!blocked(x, z, g, false)) {
        player.x = x;
        player.z = z;
        player.y = g;
        break;
      }
      if (side === -1) {
        // both doors blocked: climb out onto the roof
        player.x = v.x;
        player.z = v.z;
        player.y = vehicleRoof(v, v.x, v.z);
      }
    }
    player.crouch = false;
    player.vx = Math.sin(v.yaw) * v.speed * 0.5;
    player.vz = Math.cos(v.yaw) * v.speed * 0.5;
    player.vy = 2;
  }

  function damageVehicle(v: Vehicle, dmg: number, x: number, y: number, z: number) {
    if (!v.alive) return;
    v.hp -= dmg;
    v.hurtT = 0.12;
    spawnChunks("metal", x, y, z, 3, 3, false);
    if (v.hp > 0) return;
    // boom
    v.alive = false;
    v.group.visible = false;
    spawnChunks("metal", v.x, v.y + 0.8, v.z, 26, 9, true, ["#2b2b2b", "#ff8a2a", "#ffd34a", "#555"]);
    audio.play("break");
    shake = Math.min(0.6, shake + 0.35);
    const near = (px: number, py: number, pz: number) => Math.hypot(px - v.x, py - v.y, pz - v.z);
    if (driving === v) {
      exitVehicle();
      hurtPlayer(40, "an exploding car");
    } else if (near(player.x, player.y, player.z) < 6) hurtPlayer(Math.round(50 * (1 - near(player.x, player.y, player.z) / 6)), "an exploding car");
    for (const a of actors) {
      if (!a.alive) continue;
      const d = near(a.x, a.y, a.z);
      if (d < 6) hurtActor(a, Math.round(60 * (1 - d / 6)), false, true, "car");
    }
  }

  function updateDriving(dt: number) {
    const v = driving!;
    const st = opts.getSettings();
    const wish = readMove();
    const brake = isDown("Space") || isDown(st.binds.jump) || !!opts.pad.jump;
    const before = v.speed;
    const impact = driveVehicle(v, dt, Math.max(-1, Math.min(1, wish.z)), Math.max(-1, Math.min(1, -wish.x)), brake, vehEnv);
    if (impact > 9) {
      damageVehicle(v, (impact - 9) * 6, v.x + Math.sin(v.yaw) * v.hl, v.y + 0.6, v.z + Math.cos(v.yaw) * v.hl);
      if (impact > 16) hurtPlayer(Math.round((impact - 16) * 2.5), "a crash");
      shake = Math.min(0.5, shake + impact * 0.015);
      audio.play("hit");
    }
    if (!driving) return; // exploded
    if (vehEnv.wet(v.x, v.z) && v.y < -0.4) {
      // drove into the sea: the engine floods
      v.speed *= 1 - Math.min(1, dt * 3);
      damageVehicle(v, 25 * dt, v.x, v.y, v.z);
      if (!driving) return;
    }
    const [sx, sy, sz] = seatPos(v);
    player.x = sx;
    player.y = sy;
    player.z = sz;
    player.vx = player.vy = player.vz = 0;
    player.yaw = v.yaw + Math.PI;
    player.crouch = true;
    player.grounded = true;
    // the chase camera swings back behind the car when you stop looking around
    lookIdle += dt;
    if (lookIdle > 0.8 && Math.abs(v.speed) > 3) {
      const want = v.yaw + Math.PI + (v.speed < 0 ? Math.PI : 0);
      let d = want - camYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      camYaw += d * Math.min(1, dt * 2.2);
      camPitch += (0.18 - camPitch) * Math.min(1, dt * 1.5);
    }
    // running people over
    for (const [a, t] of runOverCd) if (t - dt <= 0) runOverCd.delete(a);
    else runOverCd.set(a, t - dt);
    if (Math.abs(v.speed) > 6)
      for (const a of actors) {
        if (!a.alive || runOverCd.has(a)) continue;
        if (!vehicleTouches(v, a.x, a.z, a.y + 0.2, a.y + 1.6, 0.45)) continue;
        runOverCd.set(a, 0.8);
        hurtActor(a, Math.round(Math.abs(v.speed) * 2.2), false, true, "car");
        a.vx += Math.sin(v.yaw) * v.speed * 0.6;
        a.vz += Math.cos(v.yaw) * v.speed * 0.6;
        a.vy = 6;
        v.speed *= 0.75;
        shake = Math.min(0.4, shake + 0.1);
      }
    audio.engine(Math.min(1, 0.15 + Math.abs(v.speed) / 26 + (Math.abs(before) < Math.abs(v.speed) ? 0.15 : 0)));
  }


  /** Doors in edited walls (anyone's builds): X opens/closes them, swinging away from you. Works in every mode. */
  let doorPrompt = "";
  let doorUseWas = false;
  function updateBuildDoors() {
    doorPrompt = "";
    const st2 = opts.getSettings();
    const use2 = isDown(st2.binds.interact) || !!opts.pad.interact;
    const pressed = use2 && !doorUseWas;
    doorUseWas = use2;
    if (!player.alive || drop || driving) return false;
    let best: { p: Piece; d: NonNullable<Piece["doors"]>[number] } | null = null;
    let bd = 2.3;
    for (const pc of pieces) {
      if (!pc.doors || Math.abs(pc.base + 1 - player.y) > 2.2) continue;
      for (const d of pc.doors) {
        const r = doorRect(d.col, pc.mask);
        piecePoint(pc, (r.x0 + r.x1) / 2, 1, -CELL / 2 + TH / 2, _v1);
        const dist = Math.hypot(_v1.x - player.x, _v1.z - player.z);
        if (dist < bd) {
          bd = dist;
          best = { p: pc, d };
        }
      }
    }
    if (!best) return false;
    doorPrompt = best.d.open ? "Close door" : "Open door";
    if (pressed) {
      const pc = best.p;
      const yaw = pc.rot * (Math.PI / 2);
      const lzp = (player.x - (pc.ix + 0.5) * CELL) * Math.sin(yaw) + (player.z - (pc.iz + 0.5) * CELL) * Math.cos(yaw);
      if (!best.d.open) best.d.dir = lzp > -CELL / 2 + TH / 2 ? 1 : -1;
      best.d.open = !best.d.open;
      dirty = true;
      audio.play("edit");
    }
    return true;
  }

  function updateIdleVehicles(dt: number) {
    for (const v of vehicles) if (v.alive && v !== driving) idleVehicle(v, dt, vehEnv);
  }

  let useWas = false;
  function updateLootPlayer() {
    lootPrompt = "";
    if (!island || !player.alive || drop) return;
    const stI = opts.getSettings();
    const useI = isDown(stI.binds.interact) || !!opts.pad.interact;
    if (driving) {
      lootPrompt = "Exit car";
      if (useI && !useWas) exitVehicle();
      useWas = useI;
      return;
    }
    // a car within reach of a door beats chests and doors further away
    let car: Vehicle | null = null;
    let cd = 1.4;
    for (const v of vehicles) {
      if (!v.alive || v.driver >= 0 || Math.abs(v.y - player.y) > 2) continue;
      // distance from the player to the car's footprint
      const ex = player.x - v.x;
      const ez = player.z - v.z;
      const cu = Math.abs(ex * Math.cos(v.yaw) - ez * Math.sin(v.yaw)) - v.hw;
      const cw = Math.abs(ex * Math.sin(v.yaw) + ez * Math.cos(v.yaw)) - v.hl;
      const d = Math.hypot(Math.max(0, cu), Math.max(0, cw));
      if (d < cd) {
        cd = d;
        car = v;
      }
    }
    if (car) {
      lootPrompt = "Drive";
      if (useI && !useWas) enterVehicle(car);
      useWas = useI;
      return;
    }
    let best: LootItem | null = null;
    let bd = 2.6;
    for (const li of lootItems) {
      if (li.open) continue;
      const dy = li.spot.y - player.y;
      if (dy > 1.8 || dy < -1.8) continue;
      const d = Math.hypot(li.spot.x - player.x, li.spot.z - player.z);
      if (isBox(li.spot)) {
        if (d < bd) {
          bd = d;
          best = li;
        }
      } else if (d < 1.5 && li.item && lootReady(li)) {
        const msg = grantPlayer(li.item);
        if (msg) {
          li.open = true;
          say(msg);
          audio.play("pickup");
        }
      }
    }
    // doors: pick the nearest door if it is closer than any chest
    let door = -1;
    let dd = 2.1;
    island.doors.forEach((d, i) => {
      if (Math.abs(player.y - d.y) > 1.6) return;
      const dist = Math.hypot(d.cx - player.x, d.cz - player.z);
      if (dist < dd && dist < bd) {
        dd = dist;
        door = i;
      }
    });
    if (door >= 0) lootPrompt = island.doors[door]!.open ? "Close door" : "Open door";
    else if (best) lootPrompt = best.spot.kind === "ammo" ? "Open ammo box" : "Open chest";
    const st = opts.getSettings();
    const use = isDown(st.binds.interact) || !!opts.pad.interact;
    if (use && !useWas) {
      if (door >= 0) {
        island.toggleDoor(door);
        audio.play("edit");
      } else if (best) openChest(best, null);
    }
    useWas = use;
  }
  const sunOffset = skyParts.sunDisc.position.clone();

  function updateActor(a: Actor, dt: number) {
    if (island) {
      updateBotBR(a, dt);
      return;
    }
    if (duel && a.duelAI) {
      updateDuelBot(a, a.duelAI, dt);
      return;
    }
    if (!a.alive) {
      a.respawn -= dt;
      a.rig.group.rotation.x += (1.3 - a.rig.group.rotation.x) * Math.min(1, dt * 4);
      a.rig.group.position.y -= dt * 0.4;
      a.label.visible = false;
      if (a.respawn <= 0 && (mode.respawn || a.target)) {
        a.alive = true;
        a.hp = a.target ? 45 : 100;
        a.shield = a.target ? 0 : 0;
        a.x = a.homeX + (Math.random() - 0.5) * 2;
        a.z = a.homeZ;
        a.y = Math.max(0, groundHeight(a.x, a.z));
        a.rig.group.rotation.x = 0;
        a.label.visible = true;
      }
      return;
    }
    a.flash = Math.max(0, a.flash - dt);
    a.shootCd -= dt;
    a.think -= dt;
    a.coverCd -= dt;
    if (a.target) {
      a.patrol += dt;
      a.x = a.homeX + Math.sin(a.patrol * (0.7 + (a.id % 3) * 0.25)) * (3.5 + (a.id % 4));
      a.z = a.homeZ;
      a.y = 0;
      a.yaw += dt * 0.4;
      return;
    }
    let tx = player.x;
    let tz = player.z;
    let threat = { x: player.x, y: player.y, z: player.z, alive: player.alive, team: player.team, id: 0 };
    if (!player.alive || (mode.teams && player.team === a.team)) {
      const foe = actors.find((o) => o.alive && o.id !== a.id && (mode.teams ? o.team !== a.team : true) && !o.target);
      if (foe) {
        tx = foe.x;
        tz = foe.z;
        threat = foe;
      } else if (mode.storm) {
        tx = stormX;
        tz = stormZ;
      }
    }
    if (mode.passive && a.aggro <= 0) {
      a.patrol += dt;
      tx = a.homeX + Math.cos(a.patrol * 0.25) * 8;
      tz = a.homeZ + Math.sin(a.patrol * 0.22) * 8;
    } else a.aggro = Math.max(0, a.aggro - dt);
    if (mode.storm && Math.hypot(a.x - stormX, a.z - stormZ) > stormR - 2) {
      tx = stormX;
      tz = stormZ;
    }
    const dx = tx - a.x;
    const dz = tz - a.z;
    const dist = Math.hypot(dx, dz) || 1;
    let mx = dx / dist;
    let mz = dz / dist;
    if (a.think <= 0) {
      a.think = 0.35 + Math.random() * 0.4;
      if (Math.random() < 0.4) a.strafe = -a.strafe;
    }
    if (dist < 5.6) {
      mx = (-dz / dist) * a.strafe;
      mz = (dx / dist) * a.strafe;
    } else if (dist < 16 && a.aggro > 0) {
      mx += (-dz / dist) * a.strafe * 0.85;
      mz += (dx / dist) * a.strafe * 0.85;
    }
    const ml = Math.hypot(mx, mz) || 1;
    const sp = dist > 6 ? 8.2 : 5.4;
    a.vx = (mx / ml) * sp;
    a.vz = (mz / ml) * sp;
    a.yaw = Math.atan2(-dx, -dz);
    if (Math.random() < dt * 0.4 && a.grounded && blocked(a.x + a.vx * 0.2, a.z, a.y, false)) a.vy = 8;
    const body = { x: a.x, y: a.y, z: a.z, vx: a.vx, vy: a.vy, vz: a.vz, grounded: true, crouch: false };
    moveBody(body, dt);
    a.x = body.x;
    a.y = body.y;
    a.z = body.z;
    a.vy = body.vy;
    a.grounded = body.grounded;
    if (a.y < -20) {
      a.hp = 0;
      a.alive = false;
      a.respawn = mode.respawn ? 2.5 : 999;
    }
    const canSee = matchT > 3 && dist < 34 && a.aggro > 0 && threat.alive !== false;
    if (canSee && a.shootCd <= 0 && dist < 30) {
      a.shootCd = 0.32 + Math.random() * 0.45;
      kickWeapon(a.rig, 0.6);
      const ox = a.x;
      const oy = a.y + 1.45;
      const oz = a.z;
      const aimX = threat.x - ox;
      const aimY = threat.y + 1.1 - oy;
      const aimZ = threat.z - oz;
      const al = Math.hypot(aimX, aimY, aimZ) || 1;
      const spread = 0.07 + dist * 0.002;
      const ddx = aimX / al + (Math.random() - 0.5) * spread;
      const ddy = aimY / al + (Math.random() - 0.5) * spread;
      const ddz = aimZ / al + (Math.random() - 0.5) * spread;
      const dl = Math.hypot(ddx, ddy, ddz) || 1;
      const hear = Math.hypot(a.x - player.x, a.z - player.z);
      audio.play(a.id % 2 ? "shotgun" : "shot", Math.max(0.12, Math.min(0.65, 1.05 - hear / 34)));
      const hit = queryShot(ox, oy, oz, ddx / dl, ddy / dl, ddz / dl, 48, a.id);
      spawnTracer(ox, oy, oz, ox + (ddx / dl) * (hit ? hit.t : 20), oy + (ddy / dl) * (hit ? hit.t : 20), oz + (ddz / dl) * (hit ? hit.t : 20));
      if (hit?.kind === "actor" && hit.id === 0) hurtPlayer(6, a.name);
      else if (hit?.kind === "actor") {
        const o = actors.find((x) => x.id === hit.id);
        if (o) hurtActor(o, 9, hit.head, false);
      } else if (hit?.kind === "build") {
        const piece = pieces[hit.index];
        if (piece && piece.owner !== a.id) {
          hitPiece(piece, 12, hit.x, hit.y, hit.z);
        }
      }
      if (a.hp < 55 && a.coverCd <= 0 && a.mats >= 10) {
        const ix = Math.floor((a.x - Math.sin(a.yaw) * 2.2) / CELL);
        const iz = Math.floor((a.z - Math.cos(a.yaw) * 2.2) / CELL);
        const rot = Math.abs(Math.sin(a.yaw)) > Math.abs(Math.cos(a.yaw)) ? 1 : 0;
        const g = groundFit("wall", ix, iz, rot);
        const base = g > -5 ? g + 0.04 : a.y;
        const botMat: BuildMat = a.id % 5 === 0 ? "metal" : a.id % 3 === 0 ? "brick" : "wood";
        if (g > -5 && tryPlace("wall", ix, iz, rot, a.id, a.team, base, false, botMat)) a.coverCd = 2.4;
      }
    }
  }

  function updateCamera(dt: number) {
    let tx = player.x;
    let ty = player.y;
    let tz = player.z;
    let yaw = camYaw;
    if (!player.alive) {
      const mate = actors.find((a) => a.alive && mode.teams && a.team === player.team);
      if (mate) {
        tx = mate.x;
        ty = mate.y;
        tz = mate.z;
        yaw = mate.yaw;
      }
    }
    const gk = adsKey();
    const scopeGun = scopedGun();
    const adsDist = ADS_DIST[gk] ?? 2.6;
    // a close over-the-shoulder camera like 1v1.LOL's
    const CAM_DIST = 3.15;
    const dist = drop === "bus" ? 44 : drop ? 6.5 : driving ? 7.2 : emote ? 4.4 : CAM_DIST + (adsDist - CAM_DIST) * adsT;
    const cp = Math.cos(camPitch);
    const sp = Math.sin(camPitch);
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    // over the right shoulder; aiming in pulls the camera closer and further over the shoulder
    const side = 0.55 + adsT * (scopeGun ? -0.55 : 0.2);
    const lift = 1.72 - adsT * (scopeGun ? 0.12 : 0.1);
    const desired = _v2.set(tx - fx * dist * cp + Math.cos(yaw) * side, ty + lift - sp * dist * 0.7, tz - fz * dist * cp - Math.sin(yaw) * side);
    // pitch > 0 looks up: camera drops and the look target rises.
    const look = _v3.set(tx + fx * 2.4 * cp, ty + 1.32 + sp * 1.5, tz + fz * 2.4 * cp);
    if (dirty && collisionSignature() !== collSig) rebuild();
    const head = _v1.set(tx, ty + 1.5, tz);
    const delta = desired.clone().sub(head);
    const len = delta.length();
    if (len > 0.2) {
      delta.multiplyScalar(1 / len);
      raycaster.set(head, delta);
      raycaster.far = len;
      const block = raycaster.intersectObjects(buildMeshes.filter((m) => m.count > 0), false)[0];
      if (block && block.distance < len - 0.25) {
        desired.copy(head).addScaledVector(delta, Math.max(0.7, block.distance - 0.3));
      }
      if (island) {
        const sh = rayStatic(head.x, head.y, head.z, delta.x, delta.y, delta.z, len, true);
        if (sh) {
          const want = Math.max(0.6, sh.t - 0.35);
          if (want < desired.distanceTo(head)) desired.copy(head).addScaledVector(delta, want);
        }
      }
    }
    for (const a of actors) {
      if (!a.alive) continue;
      const ax = desired.x - a.x;
      const ay = desired.y - (a.y + 1);
      const az = desired.z - a.z;
      const d = Math.hypot(ax, ay, az);
      if (d < 1.5 && d > 0.001) {
        const push = (1.5 - d) / d;
        desired.x += ax * push;
        desired.y += ay * push;
        desired.z += az * push;
      }
    }
    const lerp = scoped() ? 1 : 1 - Math.exp(-(10 + adsT * 14) * dt);
    camera.position.lerp(desired, lerp);
    if (scoped()) {
      // a little scope sway: more while moving or in the air
      const t = performance.now() / 1000;
      const sway = (Math.hypot(player.vx, player.vz) > 1 || !player.grounded ? 3.2 : 1) * 0.0022;
      const sy = Math.sin(t * 1.3) * sway;
      const spt = Math.sin(t * 1.9 + 1) * sway * 0.8;
      const yy = yaw + sy;
      const pp = camPitch + spt;
      camera.lookAt(_v1.copy(camera.position).add(_v2.set(-Math.sin(yy) * Math.cos(pp), Math.sin(pp), -Math.cos(yy) * Math.cos(pp))));
    }
    else camera.lookAt(look);
    if (shake > 0.001) {
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake;
      shake *= Math.exp(-8 * dt);
    }
    const targetFov = 74 + ((ADS_FOV[gk] ?? 52) - 74) * (scopeGun ? Math.max(0, (adsT - 0.6) / 0.4) : adsT);
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 16);
    camera.updateProjectionMatrix();
  }

  function syncVisuals(dt: number, time: number) {
    playerRig.group.rotation.order = "YXZ";
    if (drop === "fall" || drop === "glide") {
      // turn about the hips, not the feet, so the body tips forward in place
      const pitch = drop === "fall" ? skyPitch : Math.min(0.25, skyPitch);
      _skyE.set(pitch, player.yaw + Math.PI, skyRoll, "YXZ");
      playerRig.group.rotation.copy(_skyE);
      _skyQ.setFromEuler(_skyE);
      _skyV.set(0, 1, 0).applyQuaternion(_skyQ);
      playerRig.group.position.set(player.x - _skyV.x, player.y + 1 - _skyV.y, player.z - _skyV.z);
    } else {
      playerRig.group.rotation.set(0, player.yaw + Math.PI, 0);
      playerRig.group.position.set(player.x, player.y, player.z);
    }
    playerRig.group.visible = player.alive && drop !== "bus" && !stageHidePlayer;
    playerGlider.update(dt, time, { active: player.alive && drop === "glide", x: player.x, y: player.y, z: player.z, yaw: player.yaw, speed: Math.hypot(player.vx, player.vz) });
    playerRig.group.visible = playerRig.group.visible && !driving && !scoped();
    const speed = Math.hypot(player.vx, player.vz);
    animateRig(playerRig, time, {
      glide: drop === "glide" && playerGlider.open > 0.15,
      sky: drop === "fall" ? skyDive : undefined,
      speed,
      swing: swing > 0 && slot === 0,
      shoot: muzzle > 0,
      air: !player.grounded || !!drop,
      crouch: player.crouch,
      sprint: sprinting,
      hit: hurtT > 0.08,
      yaw: player.yaw,
      vx: player.vx,
      vz: player.vz,
      emote: emote && player.alive ? { id: emote.id, t: emote.t } : undefined,
    });
    syncWeapon(playerRig, weaponKind(), pick.primary, (island || duel) && slot >= 1 && slot <= 4 ? invRarity[slot]! : 0, pick.id);
    // skydiving and gliding: hands are free (on the glider), the pickaxe is stowed
    playerRig.weapon.visible = !driving && drop !== "glide" && drop !== "fall" && !emote;
    playerRig.fx.swing = swing > 0 ? 1 - swing / SWING : -1;
    animateWeapon(playerRig, dt, reloadT > 0 ? 1 - reloadT / reloadDur : -1);
    for (const a of actors) {
      if (!a.alive && a.respawn > 90) {
        a.rig.group.visible = false;
        continue;
      }
      if (island && a.drop === "bus") {
        a.rig.group.visible = false;
        a.label.visible = false;
        continue;
      }
      if (a.glider) {
        const near = Math.hypot(a.x - player.x, a.z - player.z) < 260;
        a.glider.update(dt, time, { active: a.alive && a.drop === "glide" && near, x: a.x, y: a.y, z: a.z, yaw: a.yaw, speed: Math.hypot(a.vx, a.vz) });
      }
      a.rig.group.visible = true;
      a.rig.group.position.set(a.x, a.y, a.z);
      a.rig.group.rotation.order = "YXZ";
      if (a.alive && a.drop === "fall") {
        _skyE.set(1.05, a.yaw + Math.PI, 0, "YXZ");
        a.rig.group.rotation.copy(_skyE);
        _skyQ.setFromEuler(_skyE);
        _skyV.set(0, 1, 0).applyQuaternion(_skyQ);
        a.rig.group.position.set(a.x - _skyV.x, a.y + 1 - _skyV.y, a.z - _skyV.z);
      } else if (a.alive) a.rig.group.rotation.set(0, a.yaw + Math.PI, 0);
      animateRig(a.rig, time + a.id, {
        glide: a.alive && a.drop === "glide" && !!a.glider && a.glider.open > 0.15,
        sky: a.alive && a.drop === "fall" ? 0.3 : undefined,
        speed: a.alive ? Math.hypot(a.vx, a.vz) : 0,
        air: a.alive && (!a.grounded || !!a.drop),
        hit: a.flash > 0.05,
        shoot: a.alive && !a.target && a.shootCd > 0.22 && a.shootCd < 0.55,
        yaw: a.yaw,
        vx: a.vx,
        vz: a.vz,
      });
      const botKind = island || duel ? (a.gun ? (["pick", "ar", "shotgun", "smg", "sniper"] as const)[a.gun]! : "pick") : a.target ? "pick" : a.id % 2 ? "shotgun" : "ar";
      syncWeapon(a.rig, botKind, undefined, island || duel ? (a.rarity ?? 0) : 0);
      animateWeapon(a.rig, dt);
      const airborne = a.drop === "glide" || a.drop === "fall";
      a.rig.weapon.visible = !airborne;
      if (a.alive && a.drop === "glide" && a.glider && a.glider.open > 0.15) {
        a.glider.gripWorld(_gripA, _gripB);
        a.glider.hang = Math.max(-1.5, Math.min(0.6, a.glider.hang + gliderReachOffset(a.rig, _gripA, _gripB) * 0.5));
        holdGlider(a.rig, _gripA, _gripB);
      } else if (a.alive && !airborne) holdWeapon(a.rig, botKind, _gunDir.set(-Math.sin(a.yaw), 0.04, -Math.cos(a.yaw)));
      a.label.position.set(a.x, a.y + 2.15, a.z);
      a.label.visible = a.alive && (!island || Math.hypot(a.x - player.x, a.z - player.z) < 26);
    }
    for (const d of drops) {
      d.life -= dt;
      d.mesh.rotation.y += dt * 2;
      d.mesh.position.y = d.y + Math.sin(time * 3) * 0.1;
    }
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i]!;
      if (player.alive && Math.hypot(d.x - player.x, d.z - player.z) < 1.6 && Math.abs(d.y - player.y) < 2) {
        if (d.kind === "shield") player.shield = Math.min(100, player.shield + 50);
        else {
          gain("wood", 30);
          gain("brick", 20);
          gain("metal", 12);
        }
        audio.play("pickup");
        scene.remove(d.mesh);
        drops.splice(i, 1);
      } else if (d.life <= 0) {
        scene.remove(d.mesh);
        drops.splice(i, 1);
      }
    }
    for (const t of tracers) {
      if (t.life > 0) {
        t.life -= dt;
        if (t.life <= 0) t.mesh.visible = false;
      }
    }
    for (let i = decals.length - 1; i >= 0; i--) {
      const d = decals[i]!;
      d.life -= dt;
      if (d.life <= 0) {
        scene.remove(d.mesh);
        (d.mesh.material as THREE.Material).dispose();
        decals.splice(i, 1);
      }
    }
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i]!;
      f.life -= dt;
      f.y += dt * 0.8;
      if (f.life <= 0) floaters.splice(i, 1);
    }
    for (const f of feed) f.life -= dt;
    while (feed.length && feed[feed.length - 1]!.life <= 0) feed.pop();
    for (const p of pieces) {
      if (p.age < 0.2) {
        p.age += dt;
        dirty = true;
      }
      if (p.hitT > 0) {
        p.hitT = Math.max(0, p.hitT - dt);
        dirty = true;
      }
      if (p.buildT > 0) {
        // Fortnite builds start at 10% HP and climb to full while the frame fills in
        p.buildT = Math.max(0, p.buildT - dt);
        p.hp = Math.min(p.max, p.hp + ((p.max * 0.9) / p.buildDur) * dt);
        if (p.buildT === 0) {
          p.hp = Math.max(p.hp, 1);
          if (p.owner === 0) audio.play("built");
        }
        // builds look finished straight away, so the filling health needs no redraw
      }
    }
    if (pieces.some((p) => p.hp <= 0 || p.mask === 0)) {
      // remove broken pieces first, then drop anything they were holding up
      for (let i = pieces.length - 1; i >= 0; i--) {
        const p = pieces[i]!;
        if (p.hp <= 0 || p.mask === 0) {
          if (p.hp <= 0) {
            pieceCenter(p, _v3);
            spawnChunks(p.mat, _v3.x, _v3.y, _v3.z, p.kind === "floor" ? 10 : 14, 3.2, true);
          }
          pieces.splice(i, 1);
          piecesVer++;
          dirty = true;
          if (editPiece === i) editPiece = -1;
          else if (editPiece > i) editPiece--;
        }
      }
      if (collapseUnsupported() > 0) audio.play("break");
    }
    for (let i = pieces.length - 1; i >= 0; i--) {
      const p = pieces[i]!;
      if (p.hp <= 0 || p.mask === 0) {
        if (p.hp <= 0) {
          pieceCenter(p, _v3);
          spawnChunks(p.mat, _v3.x, _v3.y, _v3.z, p.kind === "floor" ? 10 : 14, 3.2, true);
        }
        pieces.splice(i, 1);
        piecesVer++;
        dirty = true;
        if (editPiece === i) editPiece = -1;
        else if (editPiece > i) editPiece--;
      }
    }
    maybeRebuild(dt);
    updateChunks(dt);
  }

  function assist(dt: number) {
    const st = opts.getSettings();
    if (!st.aimAssist) return;
    const usingPad = Math.abs(opts.pad.moveX) + Math.abs(opts.pad.moveY) > 0.2 || opts.pad.fire;
    if (!usingPad && !opts.pad.aim) return;
    let best = 0.18;
    let dyaw = 0;
    for (const a of actors) {
      if (!a.alive || a.drop) continue;
      if (mode.teams && a.team === player.team) continue;
      const dx = a.x - player.x;
      const dz = a.z - player.z;
      const desired = Math.atan2(-dx, -dz);
      const d = angDelta(camYaw, desired);
      if (Math.abs(d) < best) {
        best = Math.abs(d);
        dyaw = d;
      }
    }
    if (best < 0.18) camYaw += dyaw * Math.min(1, dt * 4);
  }

  function sampleHud(): HudState {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    const proj = floaters
      .map((f) => {
        _v1.set(f.x, f.y, f.z).project(camera);
        if (_v1.z > 1) return null;
        return { x: (_v1.x * 0.5 + 0.5) * w, y: (-_v1.y * 0.5 + 0.5) * h, text: f.text, crit: f.crit, life: f.life };
      })
      .filter((v): v is Floater => !!v);
    const gun = currentGun();
    const bounds = island ? island.mapHalf : ARENA_HALF + 6;
    const counted = actors.filter((a) => !a.target);
    const alive = (player.alive ? 1 : 0) + counted.filter((a) => a.alive).length;
    let buildInfo: HudState["buildInfo"] = null;
    camera.getWorldDirection(_v1);
    const origin = camera.position.clone();
    const hit = queryShot(origin.x, origin.y, origin.z, _v1.x, _v1.y, _v1.z, 20, 0);
    if (hit?.kind === "build") {
      const p = pieces[hit.index];
      if (p) buildInfo = { hp: Math.max(0, Math.ceil(p.hp)), max: p.max, building: p.buildT > 0, mat: p.mat };
    }
    const st = opts.getSettings();
    return {
      hp: Math.max(0, player.hp),
      shield: player.shield,
      wood: infinite ? 999 : mats.wood,
      infiniteWood: infinite || preT > 0,
      mat: curMat,
      mats: { ...mats },
      slot,
      build: buildKind,
      rot: userRot,
      mag: gun ? mag[gun.mag] : 0,
      reserve: gun ? reserve[gun.mag] : 0,
      reloading: reloadT > 0,
      weapon: (island || duel) && !buildKind ? (slot > 0 && slot < 5 ? gunName({ slot, r: invRarity[slot]! }) : slot === 5 ? medsName() : SLOT_NAMES[slot]!) : buildKind ? `${{ wall: "Wall", floor: "Floor", ramp: "Stairs", pyramid: "Cone" }[buildKind]} · ${curMat[0]!.toUpperCase()}${curMat.slice(1)}` : ["Pickaxe", "Rifle", "Shotgun", "SMG", "Sniper", "Bandage"][slot] ?? "",
      elims,
      alive,
      total: counted.length + 1,
      inStorm: mode.storm && !drop && preT <= 0 && Math.hypot(player.x - stormX, player.z - stormZ) > stormR,
      stormDps: island ? stormDps() : (stormPhases[Math.min(phaseI, Math.max(0, stormPhases.length - 1))]?.dps ?? 0),
      stormEta: island
        ? brStage === "pre"
          ? Math.max(0, bus.dur - bus.t) + BR_PHASES[0]!.wait + preT
          : brStage === "done"
            ? -1
            : Math.max(0, brT)
        : mode.storm
          ? Math.max(0, phaseT)
          : -1,
      hit: hitT,
      head: hitHead,
      hurt: hurtT,
      gap: (6 + bloom * 16) * (1 - adsT * 0.55),
      ads: Math.round(adsT * 100) / 100,
      scope: scoped() ? (weaponKind() === "sniper" ? "sniper" : "ar") : null,
      prompt: doorPrompt,
      banner,
      edit: editPiece >= 0,
      fps: Math.round(fpsSmoothed),
      phase: ended ? "end" : duel && duel.freeze > 0 && duel.over <= 0 ? "countdown" : "live",
      countdown: duel ? Math.max(1, Math.ceil(duel.freeze)) : 0,
      duel: duel ? { you: duel.you, them: duel.them, round: duel.round, limit: mode.scoreLimit } : null,
      pregame: preT > 0 ? { t: preT } : null,
      inv: {
        owned: [...invOwned],
        rarity: island || duel ? [...invRarity] : [0, 1, 1, 1, 1, 0],
        colors: RARITY_COLORS,
        ammo: [null, mag.ar, mag.shotgun, mag.smg, mag.sniper, heals + medkits],
      },
      bag: { open: bagOpen, order: [...hotOrder], reserve: { ...reserve }, bandages: heals, medkits },
      hurtDirs: hurtDirs.map((d) => {
        const dx = d.x - player.x;
        const dz = d.z - player.z;
        const fw = dx * -Math.sin(camYaw) + dz * -Math.cos(camYaw);
        const rt = dx * Math.cos(camYaw) + dz * -Math.sin(camYaw);
        return { ang: Math.atan2(rt, fw), a: Math.min(1, d.life * 1.6) };
      }),
      elimPop: elimPop ? { name: elimPop.name, t: elimPop.life } : null,
      heading: ((((-camYaw * 180) / Math.PI) % 360) + 360) % 360,
      scoreBlue,
      scoreRed,
      teams: mode.teams && mode.scoreLimit > 0,
      healing: healT > 0 ? Math.min(1, healT / healDur) : 0,
      heals,
      floaters: proj,
      feed: feed.map((f) => f.text),
      aimScore,
      aimStreak,
      pointerLocked,
      minimap: {
        px: player.x,
        pz: player.z,
        yaw: camYaw,
        bounds,
        storm: mode.storm ? { x: stormX, z: stormZ, r: stormR } : null,
        dots: island ? [] : actors.filter((a) => a.alive).map((a) => ({ x: a.x, z: a.z, team: a.target ? 3 : mode.teams ? a.team : 2 })),
        next: island && brStage !== "done" ? { x: toX, z: toZ, r: toR } : null,
        bg: island ? island.minimap : null,
        isle: preT > 0 ? { x: SPAWN_ISLE.x, z: SPAWN_ISLE.z, r: SPAWN_BEACH_R } : null,
      },
      vehicle: driving ? { speed: Math.round(Math.abs(driving.speed) * 3.6), hp: Math.max(0, Math.round(driving.hp)), max: driving.maxHp } : null,
      royale: island
        ? {
            stage: drop ?? "ground",
            canJump: drop === "bus" && bus.t > 1.2,
            busLeft: Math.max(0, bus.dur * 0.9 - bus.t),
            bus: drop === "bus" || bigMap ? { x0: bus.x0, z0: bus.z0, x1: bus.x1, z1: bus.z1, x: busXZ()[0], z: busXZ()[1] } : null,
            prompt: lootPrompt,
            owned: [...invOwned],
            rarity: [...invRarity],
            rarityColors: RARITY_COLORS,
            bigMap: bigMap || drop === "bus",
            stormStage: brStage,
          }
        : null,
      buildInfo,
      paused,
    };
  }

  /** One fixed slice of game simulation (input, AI, storm, combat). Rendering lives in frame(). */
  function simulate(dt: number, st: Settings) {
    matchT += dt;
    lootClock += dt;
    updateDuel(dt);
    const atDoor = updateBuildDoors();
    if (island) {
      if (preT > 0) {
        preT -= dt;
        if (preT <= 0) launchBus();
      } else bus.t += dt;
      invOwned[5] = heals > 0 || medkits > 0;
      if (!invOwned[slot]) slot = 0;
      if (atDoor) {
        lootPrompt = doorPrompt;
        useWas = isDown(opts.getSettings().binds.interact) || !!opts.pad.interact;
      } else updateLootPlayer();
    }
    if (driving && !player.alive) exitVehicle();
    const wantAds = adsWanted();
    adsT = wantAds ? Math.min(1, adsT + dt / 0.18) : Math.max(0, adsT - dt / 0.14);
    updatePlayer(dt);
    updateIdleVehicles(dt);
    // build doors swing open / shut
    for (const pc of pieces) {
      if (!pc.doors) continue;
      for (const d of pc.doors) {
        const want = d.open ? 1 : 0;
        if (d.t === want) continue;
        d.t = want > d.t ? Math.min(1, d.t + dt * 4) : Math.max(0, d.t - dt * 4);
        dirty = true;
      }
    }
    if (!driving) audio.engine(0);
    assist(dt);
    if (!botsFrozen) for (const a of actors) updateActor(a, dt);
    updateStorm(dt);
    shootCd = Math.max(0, shootCd - dt);
    swing = Math.max(0, swing - dt);
    muzzle = Math.max(0, muzzle - dt);
    bloom *= Math.exp(-2.4 * dt);
    hitT = Math.max(0, hitT - dt);
    hurtT = Math.max(0, hurtT - dt);
    for (let i = hurtDirs.length - 1; i >= 0; i--) {
      hurtDirs[i]!.life -= dt / 1.4;
      if (hurtDirs[i]!.life <= 0) hurtDirs.splice(i, 1);
    }
    if (elimPop && (elimPop.life -= dt) <= 0) elimPop = null;
    bannerT -= dt;
    if (bannerT <= 0) banner = "";
    if (reloadT > 0) {
      reloadT -= dt;
      if (reloadT <= 0) finishReload();
    }
    // building and editing own the trigger: the pickaxe / gun only fires on a fresh press after them, so
    // placing or confirming an edit never punches (or shoots) the piece you just made
    const trigger = mouse.l || opts.pad.fire;
    if (buildKind || editPiece >= 0) fireLatch = trigger;
    else if (!trigger) fireLatch = false;
    const fire = trigger && !fireLatch && !buildKind && editPiece < 0 && !drop && !driving;
    if (editPiece >= 0 && (mouse.l || opts.pad.fire)) {
      editDrag = true;
      editClick();
    } else if (editDrag) {
      confirmEdit(true);
    }
    const gun = currentGun();
    if (driving || (duel && (duel.freeze > 0 || duel.over > 0))) buildKind = buildKind && duel && !driving ? buildKind : null;
    const buildLocked = !!duel && (duel.freeze > 0 || duel.over > 0);
    if (buildKind && editPiece < 0 && !buildLocked && (mouse.l || opts.pad.fire)) {
      placeHold += dt;
      // Fortnite-like turbo building: place immediately, then repeat at a stable 10 builds/second.
      if (placeHold === dt || placeHold >= 0.1) {
        placePlayerBuild();
        if (placeHold >= 0.1) placeHold %= 0.1;
      }
    } else placeHold = 0;
    // hold to keep swinging, like Fortnite
    if (slot === 0 && fire && swing <= 0) melee();
    else if (slot === 5 && !buildKind && trigger && !fireLatch && healKind() !== null) {
      // Fortnite rules: bandages heal 15 up to 75; a med kit heals to full but takes longer
      const kind = healKind()!;
      healDur = kind === "bandage" ? 2.6 : 5;
      healT += dt;
      if (healT >= healDur) {
        if (kind === "bandage") {
          player.hp = Math.min(75, player.hp + 15);
          heals--;
        } else {
          player.hp = 100;
          medkits--;
        }
        healT = 0;
        audio.play("pickup");
      }
    } else healT = 0;
    if (gun && fire && (gun.auto || !prevFire)) shoot();
    prevFire = fire;
    if (opts.pad.wall && !wasPad.wall) buildKind = buildKind === "wall" ? null : "wall";
    if (opts.pad.floor && !wasPad.floor) buildKind = buildKind === "floor" ? null : "floor";
    if (opts.pad.ramp && !wasPad.ramp) buildKind = buildKind === "ramp" ? null : "ramp";
    if (opts.pad.roof && !wasPad.roof) buildKind = buildKind === "pyramid" ? null : "pyramid";
    if (opts.pad.edit && !wasPad.edit) toggleEdit();
    if (opts.pad.material && !wasPad.material) cycleMat();
    if (opts.pad.slot !== undefined) {
      const s = hotOrder[opts.pad.slot] ?? -1;
      opts.pad.slot = undefined;
      if (s >= 0 && s <= 5 && (!island || invOwned[s])) {
        slot = s;
        buildKind = null;
      }
    }
    wasPad.material = !!opts.pad.material;
    wasPad.wall = opts.pad.wall;
    wasPad.floor = opts.pad.floor;
    wasPad.ramp = opts.pad.ramp;
    wasPad.roof = opts.pad.roof;
    wasPad.edit = opts.pad.edit;
    if (isDown("Tab") || isDown(st.binds.reload) || opts.pad.reload) {
      if (!prevReload) startReload();
      prevReload = true;
    } else prevReload = false;
    checkRound();
  }

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    // Don't simulate/render a hidden tab. Reset the clock so returning to the game never causes a hitch.
    if (document.hidden) {
      last = now;
      return;
    }
    // rAF timestamps can predate the end of a long mount (island generation), so never go negative
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    const limit = opts.getSettings().fpsLimit;
    if (limit > 0) {
      fpsAcc += dt;
      if (fpsAcc < 1 / limit) return;
      fpsAcc = 0;
    }
    fpsSmoothed = fpsSmoothed * 0.9 + (1 / Math.max(0.001, dt)) * 0.1;
    // Dynamically reduce GPU fill-rate on struggling machines, then gently recover when stable.
    // Only adapt when the player hasn't explicitly capped FPS.
    if (limit === 0 && settings0.quality !== "low") {
      adaptiveTimer += dt;
      if (adaptiveTimer >= 2) {
        adaptiveTimer = 0;
        if (fpsSmoothed < 48) {
          lowFpsTimer += 2;
          highFpsTimer = 0;
        } else if (fpsSmoothed > 58) {
          highFpsTimer += 2;
          lowFpsTimer = 0;
        } else {
          lowFpsTimer = Math.max(0, lowFpsTimer - 1);
          highFpsTimer = 0;
        }
        let nextRatio = currentPixelRatio;
        if (lowFpsTimer >= 2 && currentPixelRatio > 0.65) {
          nextRatio = Math.max(0.65, currentPixelRatio - 0.1);
          lowFpsTimer = 0;
        } else if (highFpsTimer >= 6 && currentPixelRatio < Math.min(window.devicePixelRatio || 1, maxPixelRatio)) {
          nextRatio = Math.min(Math.min(window.devicePixelRatio || 1, maxPixelRatio), currentPixelRatio + 0.05);
          highFpsTimer = 0;
        }
        if (Math.abs(nextRatio - currentPixelRatio) > 0.01) {
          currentPixelRatio = nextRatio;
          renderer.setPixelRatio(currentPixelRatio);
          renderer.setSize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight, false);
        }
      }
    }
    const st = opts.getSettings();
    audio.setVolumes(st.master, island ? 0 : st.music, st.sfx);
    if (!paused && !ended && !testHold) simulate(dt, st);
    else {
      prevFire = mouse.l || opts.pad.fire;
    }
    const time = now / 1000;
    if (island) {
      // see the whole island from the drop ship, then tighten the fog once on the ground
      const fog = scene.fog as THREE.Fog;
      // inside the storm the world turns purple and hazy, like Fortnite
      const inStormNow = mode.storm && !drop && preT <= 0 && player.alive && Math.hypot(player.x - stormX, player.z - stormZ) > stormR;
      stormFogK += ((inStormNow ? 1 : 0) - stormFogK) * Math.min(1, dt * 2.5);
      const want = drop ? 720 : preT > 0 ? Math.max(islandFog, 760) : islandFog * (1 - stormFogK * 0.82);
      fog.far += (want - fog.far) * Math.min(1, dt * (stormFogK > 0.01 ? 4 : 1.2));
      fog.near = fog.far * (0.4 - stormFogK * 0.38);
      fog.color.copy(skyFogColor).lerp(stormFogColor, stormFogK);
      island.update(dt, time);
      const [bx, bz] = busXZ();
      busModel.position.set(bx, bus.y + Math.sin(time * 0.8) * 0.6, bz);
      busModel.visible = preT <= 0 && bus.t < bus.dur + 3;
      if (spawnIsle && preT > 0) spawnIsle.update(time, preT, 1 + actors.filter((a) => !a.target).length, 1 + actors.filter((a) => !a.target).length);
      if (stageFerry) {
        busModel.position.set(stageFerry[0], stageFerry[1] + Math.sin(time * 0.8) * 0.6, stageFerry[2]);
        busModel.rotation.y = stageFerry[3];
        busModel.visible = true;
      }
      if (busModel.visible) ferry.update(dt, time);
      drawLoot(time);
    }
    arena?.update(time);
    syncVisuals(dt, time);
    updateWeak(dt, time);
    updateCamera(dt);
    // hold the weapon on the gameplay camera's aim (before any test camera override)
    camera.getWorldDirection(_gunDir);
    _aimPt.copy(camera.position).addScaledVector(_gunDir, 48);
    if (player.alive && !driving && !emote && drop !== "glide" && drop !== "fall") holdWeapon(playerRig, weaponKind(), _gunDir, { ads: adsT, reload: reloadT > 0 ? 1 - reloadT / reloadDur : -1, aimPoint: _aimPt });
    else if (player.alive && drop === "glide" && playerGlider.open > 0.15) {
      playerGlider.gripWorld(_gripA, _gripB);
      playerGlider.hang = Math.max(-1.5, Math.min(0.6, playerGlider.hang + gliderReachOffset(playerRig, _gripA, _gripB) * 0.5));
      holdGlider(playerRig, _gripA, _gripB);
    }
    if (debugCam) {
      camera.position.set(debugCam[0], debugCam[1], debugCam[2]);
      camera.lookAt(debugCam[3], debugCam[4], debugCam[5]);
    }
    showGhost();
    syncEditChrome();
    if (island || arena) {
      skyParts.sky.position.copy(camera.position);
      skyParts.sunDisc.position.copy(camera.position).add(sunOffset);
    }
    sun.position.set(player.x + 34, 72, player.z + 18);
    sun.target.position.set(player.x, player.y, player.z);
    renderer.render(scene, camera);
    hudAcc += dt;
    if (hudAcc > 0.08) {
      hudAcc = 0;
      opts.onHud(sampleHud());
    }
  }

  let prevReload = false;
  let placeHold = 0;
  let fpsAcc = 0;
  let adaptiveTimer = 0;
  let lowFpsTimer = 0;
  let highFpsTimer = 0;
  let last = performance.now();
  let raf = 0;

  let currentPixelRatio = 0;
  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, maxPixelRatio);
    if (Math.abs(pr - currentPixelRatio) > 0.01) {
      currentPixelRatio = pr;
      renderer.setPixelRatio(pr);
    }
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    keys.add(e.code);
    const block = ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab", "KeyR", "KeyF", "KeyE", "KeyC", "KeyQ"];
    if (block.includes(e.code)) e.preventDefault();
    const st = opts.getSettings();
    if (e.code === "Escape") {
      if (bagOpen) {
        setBag(false);
        return;
      }
      if (emoteWheel) {
        setEmoteWheel(false);
        return;
      }
      paused = true;
      opts.onPause();
    }
    if (paused || ended) return;
    if (e.code === (st.binds.inventory ?? "KeyI")) {
      setEmoteWheel(false);
      setBag(!bagOpen);
      return;
    }
    if (e.code === (st.binds.emote ?? "KeyB") && !bagOpen) {
      setEmoteWheel(!emoteWheel);
      return;
    }
    if (emoteWheel) {
      // number keys pick from the wheel
      const n = e.code.startsWith("Digit") ? Number(e.code.slice(5)) : -1;
      const mine = EMOTES.filter((em) => (opts.ownedEmotes?.() ?? []).includes(em.id));
      if (n >= 1 && n <= mine.length) {
        playEmote(mine[n - 1]!.id);
        setEmoteWheel(false);
      }
      return;
    }
    if (bagOpen) return;
    if (e.code === st.binds.wall) {
      buildKind = buildKind === "wall" ? null : "wall";
      editPiece = -1;
    }
    if (e.code === st.binds.floor) {
      buildKind = buildKind === "floor" ? null : "floor";
      editPiece = -1;
    }
    if (e.code === st.binds.ramp) {
      buildKind = buildKind === "ramp" ? null : "ramp";
      editPiece = -1;
    }
    if (e.code === st.binds.roof) {
      buildKind = buildKind === "pyramid" ? null : "pyramid";
      editPiece = -1;
    }
    const slots: [string, number][] = [
      [st.binds.slot1, 0],
      [st.binds.slot2, 1],
      [st.binds.slot3, 2],
      [st.binds.slot4, 3],
      [st.binds.slot5, 4],
      [st.binds.slot6, 5],
    ];
    if (e.code === "KeyM" && island) bigMap = !bigMap;
    for (const [code, pos] of slots) {
      if (e.code === code) {
        const s = hotOrder[pos]!;
        if (island && !invOwned[s]) continue;
        slot = s;
        buildKind = null;
      }
    }
    if (e.code === st.binds.edit || e.code === "KeyQ") toggleEdit();
    if (e.code === st.binds.resetEdit) {
      if (editPiece >= 0) {
        // reset the piece being edited and leave edit mode
        const p = pieces[editPiece];
        leaveEdit();
        if (p) restoreFull(p);
      } else resetAimedEdit();
    }
    if (e.code === (st.binds.material ?? "KeyV")) cycleMat();
  };
  function cycleMat() {
    curMat = MAT_ORDER[(MAT_ORDER.indexOf(curMat) + 1) % MAT_ORDER.length]!;
    audio.play("material");
  }
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
  const onBlur = () => keys.clear();
  const onMouseDown = (e: MouseEvent) => {
    if (bagOpen || emoteWheel) return;
    if (e.button === 0) mouse.l = true;
    // reset edit can be bound to a mouse button (middle or the side buttons)
    const btn = e.button === 1 ? "Mouse3" : e.button === 3 ? "Mouse4" : e.button === 4 ? "Mouse5" : "";
    if (btn && btn === opts.getSettings().binds.resetEdit && !paused && !ended) {
      e.preventDefault();
      if (editPiece >= 0) {
        const p = pieces[editPiece];
        leaveEdit();
        if (p) restoreFull(p);
      } else resetAimedEdit();
      if (e.button === 1) mouse.m = true;
      return;
    }
    if (e.button === 1) {
      mouse.m = true;
      userRot = (userRot + 1) & 3;
      e.preventDefault();
    }
    if (e.button === 2) {
      mouse.r = true;
      // right click: reset the edit (Fortnite default) or swap material while building
      if (editPiece >= 0 && !paused && !ended) resetEdit();
      else if (buildKind && !paused && !ended) cycleMat();
    }
  };
  const onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) mouse.l = false;
    if (e.button === 1) mouse.m = false;
    if (e.button === 2) mouse.r = false;
  };
  const onMove = (e: MouseEvent) => {
    if (e.movementX || e.movementY) lookIdle = 0;
    mouse.cx = e.clientX;
    mouse.cy = e.clientY;
    mouse.have = true;
    if (document.pointerLockElement !== canvas) return;
    const st = opts.getSettings();
    const sens = 0.00045 + (st.mouseSens / 100) * 0.0045;
    const ads = adsT > 0.5 ? (st.adsSens / 100) * (scoped() ? 0.45 : 1) : 1;
    camYaw -= e.movementX * sens * ads;
    const my = st.invertY ? -e.movementY : e.movementY;
    camPitch -= my * sens * ads;
    camPitch = Math.max(-0.85, Math.min(1.15, camPitch));
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const down = e.deltaY > 0;
    const wheelReset = opts.getSettings().binds.resetEdit === "MouseWheel";
    if (editPiece >= 0) {
      resetEdit();
      return;
    }
    // 1v1.LOL-style quick reset: scroll down (back) while looking at your edited build puts it back to normal.
    // Scrolling down never turns the held build; scroll up turns it.
    if (wheelReset && (down || !buildKind) && resetAimedEdit()) return;
    if (buildKind) {
      if (!down) userRot = (userRot + 1) & 3;
      return;
    }
    {
      // the wheel walks the hotbar in its (rearrangeable) order
      const dir = e.deltaY > 0 ? 1 : -1;
      let pos = Math.max(0, hotOrder.indexOf(slot));
      for (let i = 0; i < 6; i++) {
        pos = (pos + dir + 6) % 6;
        if (!island || invOwned[hotOrder[pos]!]) break;
      }
      slot = hotOrder[pos]!;
      buildKind = null;
    }
  };
  const onContext = (e: Event) => e.preventDefault();
  const onLockClick = () => {
    audio.unlock();
    if (matchMedia("(pointer: coarse)").matches) return;
    if (document.pointerLockElement !== canvas && !paused) {
      const p = canvas.requestPointerLock?.();
      if (p && typeof (p as Promise<void>).catch === "function") (p as Promise<void>).catch(() => undefined);
    }
  };
  const onLockChange = () => {
    pointerLocked = document.pointerLockElement === canvas;
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mouseup", onMouseUp);
  window.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("contextmenu", onContext);
  canvas.addEventListener("click", onLockClick);
  document.addEventListener("pointerlockchange", onLockChange);

  const prevProbe = window.__controlsTest;
  window.__controlsTest = {
    cam: (v) => {
      debugCam = v;
    },
    stage: (o: {
      freeze?: boolean;
      hidePlayer?: boolean;
      ferry?: [number, number, number, number] | null;
      bots?: { i: number; x: number; z: number; y?: number; yaw: number; gun: number; rarity: number; glide?: boolean }[];
      openNearestChest?: boolean;
    }) => {
      if (o.freeze !== undefined) stageFreeze = o.freeze;
      if (o.hidePlayer !== undefined) stageHidePlayer = o.hidePlayer;
      if (o.ferry !== undefined) stageFerry = o.ferry;
      for (const b of o.bots ?? []) {
        const a = actors[b.i];
        if (!a) continue;
        a.alive = true;
        a.hp = 100;
        a.drop = b.glide ? "glide" : undefined;
        a.x = b.x;
        a.z = b.z;
        a.y = b.y ?? surfaceAt(b.x, b.z, 200);
        a.vx = a.vy = a.vz = 0;
        a.yaw = b.yaw;
        a.gun = b.gun || undefined;
        a.rarity = b.rarity;
        a.rig.group.rotation.x = 0;
        if (a.glider && !b.glide) {
          a.glider.open = 0;
          a.glider.group.visible = false;
        }
      }
      if (o.openNearestChest) {
        let best: LootItem | null = null;
        let bd = 1e9;
        for (const li of lootItems) {
          if (li.open || li.spot.kind !== "chest") continue;
          const d = Math.hypot(li.spot.x - player.x, li.spot.z - player.z);
          if (d < bd) {
            bd = d;
            best = li;
          }
        }
        if (best) openChest(best, null);
      }
    },
    addChest: (x: number, z: number, yaw: number, kind: "chest" | "ammo" = "chest") => {
      if (!island || (kind === "chest" ? lvUsed.chestBase >= LV.chestBase.instanceMatrix.count : lvUsed.ammoBoxBase >= LV.ammoBoxBase.instanceMatrix.count)) return;
      const li: LootItem = { spot: { kind, x, y: groundHeight(x, z), z, yaw }, open: false, item: null, vis: -1, ring: -1, bob: 0 };
      assignVis(li);
      lootItems.push(li);
    },
    getYaw: () => player.yaw,
    getSpeed: () => Math.hypot(player.vx, player.vz),
    setKeys: (codes: string[]) => {
      injected = codes.length ? new Set(codes) : null;
    },
    setLook: (yaw: number, pitch: number) => {
      camYaw = yaw;
      camPitch = pitch;
    },
    setFire: (down: boolean) => {
      mouse.l = down;
    },
    setAim: (down: boolean) => {
      mouse.r = down;
    },
    setSlot: (n: number) => {
      slot = Math.max(0, Math.min(5, n));
      buildKind = null;
    },
    swing: () => {
      swing = SWING;
      playerRig.fx.combo++;
    },
    hold: (on: boolean) => {
      testHold = on;
    },
    /** Test-only: select these tiles (in order) on the piece being edited and confirm. */
    editWith: (bits: number[]) => {
      if (editPiece < 0) return false;
      for (const b of bits) {
        if (!(editMask & (1 << b))) editOrder.push(b);
        editMask |= 1 << b;
      }
      confirmEdit(true);
      return true;
    },
    edit: () => toggleEdit(),
    /** Select edit tiles without confirming (to look at the edit grid). */
    editSel: (bits: number[]) => {
      if (editPiece < 0) return false;
      for (const b of bits) {
        if (!(editMask & (1 << b))) editOrder.push(b);
        editMask |= 1 << b;
      }
      dirty = true;
      return true;
    },
    wheelReset: () => resetAimedEdit(),
    emote: (id: string) => playEmote(id),
    stairRamps: () => (island ? island.ramps.filter((r) => !r.seg && r.y1 - r.y0 > 2 && Math.min(r.maxX - r.minX, r.maxZ - r.minZ) < 1.8) : []),
    wallPanels: () => {
      if (!island) return [];
      const seen = new Set<unknown>();
      const out: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number; dead: number; parts: number }[] = [];
      for (const b of island.boxes) {
        const g = b.wall;
        if (!g || seen.has(g)) continue;
        seen.add(g);
        out.push({ minX: g.minX, minY: g.minY, minZ: g.minZ, maxX: g.maxX, maxY: g.maxY, maxZ: g.maxZ, dead: g.parts.filter((q) => q.dead).length, parts: g.parts.length });
        if (out.length > 4000) break;
      }
      return out;
    },
    bridges: () => (island ? island.ramps.filter((r) => r.seg).map((r) => ({ ...r.seg!, y0: r.y0, y1: r.y1 })) : []),
    placeCar: (i: number, x: number, z: number, yaw: number) => {
      const v = vehicles[i];
      if (!v) return false;
      v.x = x;
      v.z = z;
      v.yaw = yaw;
      v.y = surfaceAt(x, z, 50, false);
      v.speed = 0;
      v.vy = 0;
      return true;
    },
    surf: (x: number, z: number, feet: number) => surfaceAt(x, z, feet, false),
    carInfo: (i: number) => {
      const v = vehicles[i];
      return v ? { x: v.x, y: v.y, z: v.z, speed: v.speed, g: surfaceAt(v.x, v.z, v.y + 1.1, false) } : null;
    },
    editTarget: () => {
      const i = pieceAimed(true);
      return i >= 0 ? pieces[i]!.kind : null;
    },
    place: (kind?: BuildKind) => {
      if (kind) buildKind = kind;
      const sp = placement();
      return sp ? { ix: sp.ix, iz: sp.iz, base: sp.base, rot: sp.rot, ok: sp.ok, why: sp.why } : null;
    },
    advance: (seconds: number) => {
      const st = opts.getSettings();
      let t = performance.now() / 1000;
      for (let i = 0; i < Math.round(seconds / 0.05); i++) {
        if (paused || ended) break;
        simulate(0.05, st);
        t += 0.05;
        syncVisuals(0.05, t);
        updateCamera(0.05);
      }
    },
    teleport: (x: number, z: number, y?: number) => {
      drop = null;
      player.x = x;
      player.z = z;
      player.y = surfaceAt(x, z, y ?? 200);
      player.vy = 0;
    },
    god: (on: boolean) => {
      godMode = on;
    },
    freezeBots: (on: boolean) => {
      botsFrozen = on;
    },
    /** HUD test helper: fill the hotbar, show a hit from a direction, an elimination pop and feed lines. */
    hudFx: (o: { give?: number[]; hurtFrom?: [number, number]; elim?: string; feed?: string[]; mats?: number }) => {
      if (o.mats !== undefined) mats.wood = mats.brick = mats.metal = o.mats;
      if (o.give) o.give.forEach((r, i) => {
        if (i > 0 && i < 6 && r >= 0) {
          invOwned[i] = true;
          invRarity[i] = r;
        }
      });
      if (o.hurtFrom) {
        const g = godMode;
        godMode = false;
        hurtPlayer(12, "test", { x: player.x + o.hurtFrom[0], z: player.z + o.hurtFrom[1] });
        godMode = g;
      }
      if (o.elim) {
        elims++;
        elimPop = { name: o.elim, life: 2.6 };
        pushFeed(`You eliminated ${o.elim}`);
      }
      for (const f of o.feed ?? []) pushFeed(f);
    },
    heightAt: (x: number, z: number) => groundHeight(x, z),
    /** Tests: break piece i (as if shot to pieces). */
    breakPiece: (i: number) => {
      const pc = pieces[i];
      if (pc) hitPiece(pc, pc.hp + 1);
    },
    /** Tests: lay one of each item out in front of the player; returns the nearest ammo box. */
    lootShowcase: () => {
      const items: Item[] = [
        { t: "shield", n: 50 },
        { t: "shield", n: 25 },
        { t: "medkit", n: 1 },
        { t: "heal", n: 3 },
        { t: "ammo", ammo: "ar", n: 30 },
        { t: "ammo", ammo: "smg", n: 30 },
        { t: "ammo", ammo: "shotgun", n: 10 },
        { t: "ammo", ammo: "sniper", n: 6 },
      ];
      const fx = -Math.sin(camYaw);
      const fz = -Math.cos(camYaw);
      const rx = Math.cos(camYaw);
      const rz = -Math.sin(camYaw);
      items.forEach((it, i) => {
        const u = (i % 4) - 1.5;
        const w = 3 + Math.floor(i / 4) * 1.4;
        const x = player.x + fx * w + rx * u * 1.1;
        const z = player.z + fz * w + rz * u * 1.1;
        spillItem(x, surfaceAt(x, z, player.y + 1), z, it);
      });
      let best: LootItem | null = null;
      let bd = 1e9;
      for (const li of lootItems) {
        if (li.spot.kind !== "ammo" || li.open) continue;
        const d = Math.hypot(li.spot.x - player.x, li.spot.z - player.z);
        if (d < bd) {
          bd = d;
          best = li;
        }
      }
      return best ? { x: best.spot.x, y: best.spot.y, z: best.spot.z, yaw: best.spot.yaw } : null;
    },
    /** Tests: what a pickaxe swing would hit (box size, health, whether it can break). */
    meleeProbe: () => {
      const fx = -Math.sin(camYaw);
      const fz = -Math.cos(camYaw);
      const h = queryShot(player.x, player.y + 1.2, player.z, fx, 0, fz, 2.6, 0);
      if (!h) return null;
      const b = h.kind === "ground" ? h.box : null;
      return { kind: h.kind, t: Math.round(h.t * 10) / 10, box: b ? { w: +(b.maxX - b.minX).toFixed(2), h: +(b.maxY - b.minY).toFixed(2), d: +(b.maxZ - b.minZ).toFixed(2), mat: b.mat, dead: !!b.dead, hp: worldHp.get(b) ?? null, breakable: breakable(b) } : null };
    },
    /** Tests: what a shot straight down the crosshair would hit first. */
    aimHit: () => {
      camera.getWorldDirection(_v1);
      const o = camera.position.clone();
      o.addScaledVector(_v1, Math.max(0, o.distanceTo(_v3.set(player.x, player.y + 1.4, player.z)) - 0.2));
      const h = queryShot(o.x, o.y, o.z, _v1.x, _v1.y, _v1.z, 120, 0);
      return h ? { kind: h.kind, t: Math.round(h.t * 10) / 10, index: h.kind === "build" ? h.index : -1 } : null;
    },
    /** Tests: leave the spawn island now. */
    skipPregame: () => {
      if (preT > 0) launchBus();
    },
    /** Build ground test: how far the terrain rises above each piece's base inside its footprint. */
    /** Fill an area with builds and time the build pipeline (ms per call). */
    perfBuild: (n = 200) => {
      const kinds: BuildKind[] = ["wall", "floor", "ramp", "pyramid"];
      const px = Math.floor(player.x / CELL);
      const pz = Math.floor(player.z / CELL);
      let k = 0;
      for (let r = 1; r < 12 && pieces.length < n; r++)
        for (let i = -r; i <= r && pieces.length < n; i++)
          for (const [x, z] of [
            [px + i, pz - r],
            [px + i, pz + r],
          ] as const) {
            const kind = kinds[k++ % 4]!;
            const g = Math.max(0, groundFit(kind, x, z, k & 3));
            tryPlace(kind, x, z, k & 3, 0, player.team, g, true);
            const pc = pieces[pieces.length - 1];
            if (pc) pc.buildT = 0;
          }
      const t0 = performance.now();
      for (let i = 0; i < 20; i++) {
        dirty = true;
        collSig = NaN;
        rebuild();
      }
      const t1 = performance.now();
      for (let i = 0; i < 20; i++) {
        dirty = true;
        rebuild();
      }
      const t2 = performance.now();
      const was = buildKind;
      buildKind = "wall";
      for (let i = 0; i < 50; i++) placement();
      const t3 = performance.now();
      for (let i = 0; i < 50; i++) surfaceAt(player.x + (i % 7), player.z, player.y + 1);
      const t4 = performance.now();
      buildKind = was;
      return { pieces: pieces.length, rebuildColl: (t1 - t0) / 20, rebuild: (t2 - t1) / 20, placement: (t3 - t2) / 50, surface: (t4 - t3) / 50 };
    },
    buildProbe: () =>
      pieces.map((p) => {
        let hi = -Infinity;
        for (let i = 0; i <= 4; i++)
          for (let j = 0; j <= 4; j++) {
            let x = (p.ix + 0.04 + (i / 4) * 0.92) * CELL;
            let z = (p.iz + 0.04 + (j / 4) * 0.92) * CELL;
            if (p.kind === "wall") {
              const yaw = p.rot * (Math.PI / 2);
              const lz = -CELL / 2 + TH / 2;
              const lx = (i / 4 - 0.5) * CELL * 0.92;
              x = (p.ix + 0.5) * CELL + lz * Math.sin(yaw) + lx * Math.cos(yaw);
              z = (p.iz + 0.5) * CELL + lz * Math.cos(yaw) - lx * Math.sin(yaw);
            }
            hi = Math.max(hi, groundHeight(x, z));
          }
        return { k: p.kind, ix: p.ix, iz: p.iz, rot: p.rot, m: p.mask, st: p.stair?.map((q) => q.t), base: Math.round(p.base * 100) / 100, pen: Math.round((hi - p.base) * 100) / 100 };
      }),
    /** Car ground test: how far the ground pokes above each car's tyre plane anywhere under the car. */
    vehProbe: () =>
      vehicles.map((v) => {
        const tp = Math.tan(v.pitch);
        const tr = Math.tan(v.roll);
        const fx = Math.sin(v.yaw);
        const fz = Math.cos(v.yaw);
        const rx = Math.cos(v.yaw);
        const rz = -Math.sin(v.yaw);
        let pen = -9;
        let penG = -9;
        for (let i = -4; i <= 4; i++)
          for (let k = -6; k <= 6; k++) {
            const u = (i / 4) * v.hw * 0.9;
            const w = (k / 6) * v.hl * 0.97;
            const px = v.x + rx * u + fx * w;
            const pz = v.z + rz * u + fz * w;
            const gy = surfaceAt(px, pz, v.y + 1.1, false);
            pen = Math.max(pen, gy - (v.y + w * tp + u * tr));
            penG = Math.max(penG, groundHeight(px, pz) - (v.y + w * tp + u * tr));
          }
        return { m: v.model, x: Math.round(v.x), z: Math.round(v.z), pen: Math.round(pen * 100) / 100, penG: Math.round(penG * 100) / 100, pitch: Math.round(v.pitch * 100) / 100, roll: Math.round(v.roll * 100) / 100 };
      }),
    drive: (i: number | null) => {
      if (i == null) exitVehicle();
      else if (vehicles[i]) enterVehicle(vehicles[i]!);
    },
    royale: () => ({
      drop,
      driving: driving ? { i: vehicles.indexOf(driving), x: Math.round(driving.x * 10) / 10, y: Math.round(driving.y * 10) / 10, z: Math.round(driving.z * 10) / 10, yaw: Math.round(driving.yaw * 100) / 100, speed: Math.round(driving.speed * 10) / 10, hp: Math.round(driving.hp) } : null,
      vehicles: vehicles.map((v) => ({ m: v.model, x: Math.round(v.x * 10) / 10, y: Math.round(v.y * 10) / 10, z: Math.round(v.z * 10) / 10, yaw: Math.round(v.yaw * 100) / 100, alive: v.alive, hp: Math.round(v.hp), d: Math.round(Math.hypot(v.x - player.x, v.z - player.z)) })),
      busT: Math.round(bus.t * 10) / 10,
      busDur: Math.round(bus.dur * 10) / 10,
      storm: { stage: brStage, phase: brPhase, r: Math.round(stormR), x: Math.round(stormX), z: Math.round(stormZ), next: [Math.round(toX), Math.round(toZ), toR] },
      player: { x: Math.round(player.x), y: Math.round(player.y * 10) / 10, z: Math.round(player.z), hp: Math.round(player.hp), shield: player.shield, owned: [...invOwned], rarity: [...invRarity], slot, heals, mats: { ...mats }, reserve: { ...reserve }, mag: { ...mag } },
      bots: actors.map((a) => ({ n: a.name, alive: a.alive, drop: a.drop ?? null, x: Math.round(a.x), y: Math.round(a.y), z: Math.round(a.z), hp: Math.round(a.hp), sh: a.shield, gun: a.gun ?? null, r: a.rarity ?? 0, foe: a.foe ?? -1, loot: a.lootI ?? -1 })),
      nearChest: lootItems
        .filter((l) => !l.open && l.spot.kind === "chest")
        .map((l) => ({ x: Math.round(l.spot.x * 10) / 10, y: Math.round(l.spot.y * 10) / 10, z: Math.round(l.spot.z * 10) / 10, yaw: l.spot.yaw, out: !l.spot.inside, d: Math.round(Math.hypot(l.spot.x - player.x, l.spot.z - player.z)) }))
        .sort((p, q) => p.d - q.d)
        .slice(0, 3),
      nearHarvest: (island?.harvest ?? [])
        .filter((h) => h.alive)
        .map((h) => ({ kind: h.kind, x: h.x, y: h.y, z: h.z, r: h.r, hp: h.hp, d: Math.hypot(h.x - player.x, h.z - player.z) }))
        .sort((p, q) => p.d - q.d)
        .slice(0, 4),
      weak: weak.key ? { x: weak.x, y: weak.y, z: weak.z, aim: aimOnWeak(weak.key), life: weak.life, alive: (weak.key as { alive?: boolean }).alive } : null,
      outChest: lootItems
        .filter((l) => !l.open && l.spot.kind === "chest" && !l.spot.inside)
        .map((l) => ({ x: l.spot.x, y: l.spot.y, z: l.spot.z, yaw: l.spot.yaw }))
        .slice(0, 3),
      floorGuns: lootItems
        .filter((l) => !l.open && l.item?.t === "gun")
        .map((l) => ({ x: l.spot.x, y: l.spot.y, z: l.spot.z, r: (l.item as { r: number }).r, slot: (l.item as { slot: number }).slot }))
        .slice(0, 40),
      doors: (island?.doors ?? [])
        .map((d, i) => ({ i, x: Math.round(d.cx * 10) / 10, y: Math.round(d.y * 10) / 10, z: Math.round(d.cz * 10) / 10, open: d.open, d: Math.round(Math.hypot(d.cx - player.x, d.cz - player.z)) }))
        .sort((p, q) => p.d - q.d)
        .slice(0, 3),
      glassBroken: island ? island.boxes.filter((b) => b.glass && b.dead).length : 0,
      lootOpen: lootItems.filter((l) => l.open).length,
      lootTotal: lootItems.length,
      elims,
      ended,
      feed: feed.map((f) => f.text),
    }),
    getDebug: () => ({
      cam: camera.position.toArray().map((v) => Math.round(v * 100) / 100),
      hp: Math.round(player.hp),
      duel: duel ? { ...duel, rival: actors.filter((a) => a.duelAI).map((a) => ({ x: Math.round(a.x), y: Math.round(a.y * 10) / 10, z: Math.round(a.z), hp: Math.round(a.hp), sh: Math.round(a.shield), gun: a.gun, climbing: a.duelAI!.climbing, box: Math.round(a.duelAI!.boxT * 10) / 10 })) } : null,
      x: player.x,
      y: player.y,
      z: player.z,
      camYaw,
      camPitch,
      wood: mats.wood,
      mats: { ...mats },
      curMat,
      buildKind,
      pieces: pieces.map((p) => ({ k: p.kind, ix: p.ix, iy: p.iy, iz: p.iz, rot: p.rot, base: Math.round(p.base * 100) / 100, mask: p.mask, mat: p.mat, hp: Math.round(p.hp), max: p.max, buildT: Math.round(p.buildT * 100) / 100 })),
    }),
    getAnim: () => {
      const leg = playerRig.bones.legL;
      const e = leg ? new THREE.Euler().setFromQuaternion(leg.quaternion, leg.rotation.order) : null;
      const act = playerRig.actions[playerRig.current];
      return {
        clip: playerRig.current,
        armed: playerRig.armed,
        speed: Math.hypot(player.vx, player.vz),
        grounded: player.grounded,
        legX: e ? Math.round((e.x * 180) / Math.PI) : null,
        weight: act ? Math.round(act.getEffectiveWeight() * 100) / 100 : null,
        clips: Object.keys(playerRig.actions),
      };
    },
    build(kind: "wall" | "floor" | "ramp" | "pyramid" | null) {
      buildKind = kind;
      editPiece = -1;
      if (!kind) return null;
      const spot = placement();
      placePlayerBuild();
      return spot;
    },
    getGun: () => {
      const w = playerRig.weapon;
      w.updateWorldMatrix(true, false);
      const q = new THREE.Quaternion();
      w.getWorldQuaternion(q);
      const basis = new THREE.Matrix4().makeRotationFromQuaternion(q);
      const barrel = new THREE.Vector3();
      const up = new THREE.Vector3();
      const side = new THREE.Vector3();
      basis.extractBasis(side, up, barrel);
      const pos = new THREE.Vector3();
      w.getWorldPosition(pos);
      const sc = new THREE.Vector3();
      w.getWorldScale(sc);
      camera.getWorldDirection(_gunDir);
      const aim = camera.position.clone().addScaledVector(_gunDir, 48).sub(pos);
      if (aim.lengthSq() > 1e-6) aim.normalize();
      const flip = weaponKind() === "pick";
      const pointed = flip ? barrel.clone().negate() : barrel;
      return {
        pos: pos.toArray().map((n) => Math.round(n * 100) / 100),
        barrel: pointed.toArray().map((n) => Math.round(n * 100) / 100),
        up: up.toArray().map((n) => Math.round(n * 100) / 100),
        aim: aim.toArray().map((n) => Math.round(n * 100) / 100),
        dot: Math.round(pointed.dot(aim) * 1000) / 1000,
        scale: Math.round(sc.x * 1000) / 1000,
        clip: playerRig.current,
      };
    },
  };

  rebuild();
  opts.onHud(sampleHud());
  raf = requestAnimationFrame(frame);

  const wasPad = { wall: false, floor: false, ramp: false, roof: false, edit: false, material: false };

  return {
    /** Backpack: swap two hotbar positions (1..5; the pickaxe stays put). */
    swapSlots(a: number, b: number) {
      if (a < 1 || b < 1 || a > 5 || b > 5 || a === b) return;
      const t = hotOrder[a]!;
      hotOrder[a] = hotOrder[b]!;
      hotOrder[b] = t;
      audio.play("ui");
    },
    setEmotes(open: boolean) {
      setEmoteWheel(open);
      if (!open && !matchMedia("(pointer: coarse)").matches) {
        const p = canvas.requestPointerLock?.();
        if (p && typeof (p as Promise<void>).catch === "function") (p as Promise<void>).catch(() => undefined);
      }
    },
    playEmote(id: string) {
      playEmote(id);
    },
    setBag(open: boolean) {
      setBag(open);
      if (!open && !matchMedia("(pointer: coarse)").matches) {
        const p = canvas.requestPointerLock?.();
        if (p && typeof (p as Promise<void>).catch === "function") (p as Promise<void>).catch(() => undefined);
      }
    },
    setPaused(p: boolean) {
      paused = p;
      if (!p) {
        last = performance.now();
        keys.clear();
      }
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContext);
      canvas.removeEventListener("click", onLockClick);
      document.removeEventListener("pointerlockchange", onLockChange);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      audio.dispose();
      woodMap.dispose();
      island?.dispose();
      for (const m of buildMeshes) {
        const mt = m.material as THREE.MeshLambertMaterial;
        mt.map?.dispose();
        mt.dispose();
      }
      grassMap.dispose();
      sandMap.dispose();
      renderer.dispose();
      if (window.__controlsTest && window.__controlsTest.getYaw === prevProbe?.getYaw) {
        /* keep */
      }
      if (prevProbe) window.__controlsTest = prevProbe;
      else delete window.__controlsTest;
    },
  };
}

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      setKeys: (codes: string[]) => void;
      setLook?: (yaw: number, pitch: number) => void;
      setFire?: (down: boolean) => void;
      setAim?: (down: boolean) => void;
      setSlot?: (n: number) => void;
      swing?: () => void;
      heightAt?: (x: number, z: number) => number;
      skipPregame?: () => void;
      perfBuild?: (n?: number) => Record<string, number>;
      editSel?: (bits: number[]) => boolean;
      wheelReset?: () => boolean;
      emote?: (id: string) => boolean;
      bridges?: () => unknown[];
      wallPanels?: () => { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number; dead: number; parts: number }[];
      stairRamps?: () => unknown[];
      placeCar?: (i: number, x: number, z: number, yaw: number) => boolean;
      carInfo?: (i: number) => unknown;
      surf?: (x: number, z: number, feet: number) => number;
      editTarget?: () => string | null;
      place?: (kind?: BuildKind) => unknown;
      buildProbe?: () => { k: string; ix: number; iz: number; rot: number; m: number; st?: number[]; base: number; pen: number }[];
      breakPiece?: (i: number) => void;
      freezeBots?: (on: boolean) => void;
      meleeProbe?: () => unknown;
      lootShowcase?: () => unknown;
      aimHit?: () => unknown;
      vehProbe?: () => { m: string; x: number; z: number; pen: number; penG: number; pitch: number; roll: number }[];
      hudFx?: (o: { give?: number[]; hurtFrom?: [number, number]; elim?: string; feed?: string[]; mats?: number }) => void;
      hold?: (on: boolean) => void;
      editWith?: (bits: number[]) => boolean;
      edit?: () => void;
      getDebug?: () => unknown;
      getAnim?: () => unknown;
      getGun?: () => unknown;
      build?: (kind: "wall" | "floor" | "ramp" | "pyramid" | null) => unknown;
      /** Test-only: run the simulation forward without rendering. */
      advance?: (seconds: number) => void;
      royale?: () => unknown;
      drive?: (i: number | null) => void;
      teleport?: (x: number, z: number, y?: number) => void;
      god?: (on: boolean) => void;
      /** Test-only: pin the camera (screenshots); pass null to release. */
      cam?: (v: [number, number, number, number, number, number] | null) => void;
      addChest?: (x: number, z: number, yaw: number, kind?: "chest" | "ammo") => void;
      stage?: (o: {
        freeze?: boolean;
        hidePlayer?: boolean;
        ferry?: [number, number, number, number] | null;
        bots?: { i: number; x: number; z: number; y?: number; yaw: number; gun: number; rarity: number; glide?: boolean }[];
        openNearestChest?: boolean;
      }) => void;
    };
  }
}
