import * as THREE from "three";
import { createAudio, type AudioBus } from "@/game/audio";
import { aimWeapon, animateRig, createCharacter, fillWeapon, type Rig } from "@/game/character";
import { addSky, dressHills, makeBuildMap, makeGrassMap, makeSandMap, makeWoodMap } from "@/game/scenery";
import {
  CELL,
  gearById,
  modeById,
  skinById,
  type ModeDef,
  type Settings,
} from "@/game/content";

export type PadInput = {
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
};

export type Floater = { x: number; y: number; text: string; crit: boolean; life: number };
export type Feed = { text: string; life: number };

export type HudState = {
  hp: number;
  shield: number;
  wood: number;
  infiniteWood: boolean;
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
    dots: { x: number; z: number; team: number }[];
  };
  buildHp: number | null;
  paused: boolean;
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
};

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
  patrol: number;
  homeX: number;
  homeZ: number;
};

type Drop = { kind: "shield" | "wood"; x: number; y: number; z: number; mesh: THREE.Mesh; life: number };

const MAX_W = 3600;
const MAX_F = 1800;
const MAX_R = 900;
const MAX_P = 400;
const TH = 0.28;
const PYR_H = CELL * 0.6;
const PYR_T = 0.34;

function fullMask(kind: BuildKind) {
  return kind === "ramp" || kind === "pyramid" ? 0b1111 : 0b111111111;
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

function hillsHeight(x: number, z: number) {
  const hill = Math.exp(-((x - 8) ** 2) / 2600 - ((z + 60) ** 2) / 1600) * 24;
  const hill2 = Math.exp(-((x - 72) ** 2) / 900 - ((z + 8) ** 2) / 800) * 9;
  const roll = Math.sin(x * 0.02) * Math.cos(z * 0.017) * 3.4 + Math.sin((x + z) * 0.0085) * 1.8;
  const f = smoothstep(26, 56, Math.hypot(x, z));
  return roll * f + hill + hill2;
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

/** One quarter of a stair piece. Tile bit = row * 2 + col; row climbs toward +z, col runs across the width. */
function rampTile(col: number, row: number) {
  const hw = CELL / 2;
  const x0 = -CELL / 2 + col * hw;
  const x1 = x0 + hw;
  const z0 = -CELL / 2 + row * hw;
  const z1 = z0 + hw;
  const h0 = Math.max(0.04, z0 + CELL / 2);
  const h1 = z1 + CELL / 2;
  const yb = 0.02;
  const bl: number[] = [x0, yb, z0];
  const br: number[] = [x1, yb, z0];
  const fr: number[] = [x1, yb, z1];
  const fl: number[] = [x0, yb, z1];
  const tl: number[] = [x0, h0, z0];
  const tr: number[] = [x1, h0, z0];
  const sr: number[] = [x1, h1, z1];
  const sl: number[] = [x0, h1, z1];
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const inside = [(x0 + x1) / 2, (h0 + h1) * 0.3, (z0 + z1) / 2];
  const plank = (u: number, v: number) => [0.2 + u * 0.74, 0.06 + v * 0.88];
  const trim = [0.05, 0.5];
  const tri = (a: number[], b: number[], c: number[], ua: number[], ub: number[], uc: number[]) =>
    pushTri(pos, nor, uv, a, b, c, ua, ub, uc, inside);
  tri(tl, tr, sr, plank(0, 0), plank(1, 0), plank(1, 1));
  tri(tl, sr, sl, plank(0, 0), plank(1, 1), plank(0, 1));
  tri(bl, fl, fr, trim, trim, trim);
  tri(bl, fr, br, trim, trim, trim);
  tri(br, fr, sr, plank(0, 0), plank(0, 1), plank(1, 1));
  tri(br, sr, tr, plank(0, 0), plank(1, 1), plank(1, 0));
  tri(bl, tl, sl, plank(1, 0), plank(1, 1), plank(0, 1));
  tri(bl, sl, fl, plank(1, 0), plank(0, 1), plank(0, 0));
  tri(fl, sl, sr, plank(0, 0), plank(0, 1), plank(1, 1));
  tri(fl, sr, fr, plank(0, 0), plank(1, 1), plank(1, 0));
  if (h0 > 0.1) {
    tri(bl, tr, tl, trim, trim, trim);
    tri(bl, br, tr, trim, trim, trim);
  }
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
    getSettings: () => Settings;
    pad: PadInput;
    onHud: (h: HudState) => void;
    onEnd: (r: MatchResult) => void;
    onPause: () => void;
  },
) {
  const mode: ModeDef = modeById(opts.modeId);
  const audio: AudioBus = createAudio();
  const settings0 = opts.getSettings();
  audio.setVolumes(settings0.master, settings0.music, settings0.sfx);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: settings0.quality !== "low",
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = settings0.shadows && settings0.quality !== "low";
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x8ec8f2);

  const scene = new THREE.Scene();
  const fogFar = settings0.renderDistance === "low" ? 90 : settings0.renderDistance === "high" ? 210 : 150;
  scene.fog = new THREE.Fog(0x7ec8f6, fogFar * 0.72, fogFar);
  scene.background = new THREE.Color(0x4aa4f0);
  addSky(scene);

  const camera = new THREE.PerspectiveCamera(72, 1, 0.08, 280);
  scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x4e9a40, 1.05));
  const sun = new THREE.DirectionalLight(0xfff6dc, 1.45);
  sun.position.set(48, 90, 26);
  sun.castShadow = renderer.shadowMap.enabled;
  sun.shadow.mapSize.set(settings0.quality === "high" ? 2048 : 1024, settings0.quality === "high" ? 2048 : 1024);
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

  function groundHeight(x: number, z: number) {
    if (map === "hills") {
      if (Math.abs(x) > 108 || Math.abs(z) > 108) return -50;
      return hillsHeight(x, z);
    }
    if (map === "arena") return Math.hypot(x, z) > 22 ? -50 : 0;
    if (map === "box") return Math.abs(x) > 16 || Math.abs(z) > 16 ? -50 : 0;
    if (map === "split") return Math.abs(x) > 46 || Math.abs(z) > 28 ? -50 : 0;
    if (map === "aim") return Math.abs(x) > 42 || Math.abs(z) > 34 ? -50 : 0;
    return 0;
  }

  const groundMeshes: THREE.Object3D[] = [];
  if (map === "hills") {
    const geo = new THREE.PlaneGeometry(220, 220, 80, 80);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    const base = new THREE.Color("#ffffff");
    const high = new THREE.Color("#efe2a4");
    const dark = new THREE.Color("#d7ebc8");
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = hillsHeight(x, z);
      pos.setY(i, y);
      const t = THREE.MathUtils.clamp(y / 20, 0, 1);
      tmp.copy(base).lerp(high, t);
      const n = (Math.sin(x * 0.23) * Math.cos(z * 0.19) + 1) / 2;
      tmp.lerp(dark, n * 0.18);
      cols[i * 3] = tmp.r;
      cols[i * 3 + 1] = tmp.g;
      cols[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, pos.getX(i) / 7, pos.getZ(i) / 7);
    }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: grassMap, vertexColors: true }));
    mesh.receiveShadow = true;
    scene.add(mesh);
    groundMeshes.push(mesh);
  } else {
    const color = map === "aim" ? "#3f9a45" : map === "split" ? "#3e8f48" : "#d8d2c4";
    let mesh: THREE.Mesh;
    if (map === "arena") {
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(22, 23, 2, 40), new THREE.MeshLambertMaterial({ color }));
      mesh.position.y = -1;
    } else if (map === "box") {
      sandMap.repeat.set(4, 4);
      mesh = new THREE.Mesh(new THREE.BoxGeometry(32, 1.2, 32), new THREE.MeshLambertMaterial({ map: sandMap, color: "#f0e2c8" }));
      mesh.position.y = -0.6;
    } else if (map === "split") {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(92, 1, 56), new THREE.MeshLambertMaterial({ map: grassMap, color: "#d8f0c8" }));
      mesh.position.y = -0.5;
      const red = new THREE.Mesh(new THREE.PlaneGeometry(46, 56), new THREE.MeshLambertMaterial({ color: "#d05555" }));
      red.rotation.x = -Math.PI / 2;
      red.position.set(23, 0.04, 0);
      const blue = new THREE.Mesh(new THREE.PlaneGeometry(46, 56), new THREE.MeshLambertMaterial({ color: "#3d78d8" }));
      blue.rotation.x = -Math.PI / 2;
      blue.position.set(-23, 0.04, 0);
      scene.add(red, blue);
    } else {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(84, 1, 68), new THREE.MeshLambertMaterial({ map: grassMap, color: "#d8f0c8" }));
      mesh.position.y = -0.5;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 1), new THREE.MeshLambertMaterial({ map: woodMap, color: "#ffe0b8" }));
      wall.position.set(-18, 5, -16);
      const lines = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(20, 10, 1)), new THREE.LineBasicMaterial({ color: "#f0b429" }));
      lines.position.copy(wall.position);
      scene.add(wall, lines);
    }
    mesh.receiveShadow = true;
    scene.add(mesh);
    groundMeshes.push(mesh);
    const grid = new THREE.GridHelper(map === "box" ? 32 : map === "arena" ? 44 : 60, map === "box" ? 8 : 16, 0xffffff, 0xffffff);
    (grid.material as THREE.Material).opacity = 0.18;
    (grid.material as THREE.Material).transparent = true;
    grid.position.y = 0.03;
    scene.add(grid);
  }

  const skin = skinById(opts.skinId);
  const pick = gearById(opts.pickaxeId);
  const pack = gearById(opts.backpackId);
  const playerRig = createCharacter(skin, pack, pick);
  scene.add(playerRig.group);

  const trees: { x: number; y: number; z: number; hp: number; mesh: { visible: boolean } }[] = [];
  if (map === "hills") {
    for (const t of dressHills(scene, groundHeight, woodMap)) {
      const node = { visible: true, hide: t.hide };
      trees.push({
        x: t.x,
        y: t.y,
        z: t.z,
        hp: 4,
        mesh: {
          get visible() {
            return node.visible;
          },
          set visible(v: boolean) {
            node.visible = v;
            if (!v) node.hide();
          },
        },
      });
    }
  }

  const SLOT = 280;
  const buildMap = makeBuildMap();
  const woodMat = new THREE.MeshLambertMaterial({ map: buildMap, color: "#ffffff" });
  const wallGeos = Array.from({ length: 9 }, (_, bit) => {
    const tx = bit % 3;
    const ty = Math.floor(bit / 3);
    return tileBox("z", tx / 3, ty / 3, (tx + 1) / 3, (ty + 1) / 3);
  });
  const floorGeos = Array.from({ length: 9 }, (_, bit) => {
    const tx = bit % 3;
    const tz = Math.floor(bit / 3);
    return tileBox("y", tx / 3, tz / 3, (tx + 1) / 3, (tz + 1) / 3);
  });
  const wallSolid = new THREE.InstancedMesh(tileBox("z", 0, 0, 1, 1), woodMat, SLOT);
  const floorSolid = new THREE.InstancedMesh(tileBox("y", 0, 0, 1, 1), woodMat, SLOT);
  const wallMeshes = wallGeos.map((g) => new THREE.InstancedMesh(g, woodMat, SLOT));
  const floorMeshes = floorGeos.map((g) => new THREE.InstancedMesh(g, woodMat, SLOT));
  const rampGeos = [rampTile(0, 0), rampTile(1, 0), rampTile(0, 1), rampTile(1, 1)];
  const rampMeshes = rampGeos.map((g) => new THREE.InstancedMesh(g, woodMat, MAX_R));
  const pyrGeo = pyramidGeo(0b1111);
  const pyrGeos = [0, 1, 2, 3].map((q) => pyramidGeo(1 << q));
  const pyrMeshes = pyrGeos.map((g) => new THREE.InstancedMesh(g, woodMat, MAX_P));
  const buildMeshes = [wallSolid, floorSolid, ...wallMeshes, ...floorMeshes, ...rampMeshes, ...pyrMeshes];
  for (const m of buildMeshes) {
    m.count = 0;
    m.frustumCulled = false;
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  }

  const ghostMat = new THREE.MeshBasicMaterial({
    color: 0x49d2ff,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ghostEdge = new THREE.MeshBasicMaterial({ color: 0xf4fbff, transparent: true, opacity: 0.95, depthWrite: false });
  const ghostWall = new THREE.Mesh(new THREE.BoxGeometry(CELL, CELL, TH), ghostMat);
  const ghostFloor = new THREE.Mesh(new THREE.BoxGeometry(CELL, TH, CELL), ghostMat);
  const ghostPyr = new THREE.Mesh(pyrGeo, ghostMat);
  const addBlueprint = (parent: THREE.Object3D, floor = false) => {
    const ts = CELL / 3;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i <= 3; i++) {
      const a = new THREE.Mesh(geo, ghostEdge);
      const b = new THREE.Mesh(geo, ghostEdge);
      if (floor) {
        a.position.set(-CELL / 2 + i * ts, TH / 2 + 0.03, 0);
        a.scale.set(0.07, 0.04, CELL);
        b.position.set(0, TH / 2 + 0.03, -CELL / 2 + i * ts);
        b.scale.set(CELL, 0.04, 0.07);
      } else {
        a.position.set(-CELL / 2 + i * ts, 0, TH / 2 + 0.03);
        a.scale.set(0.07, CELL, 0.035);
        b.position.set(0, -CELL / 2 + i * ts, TH / 2 + 0.03);
        b.scale.set(CELL, 0.07, 0.035);
      }
      parent.add(a, b);
    }
  };
  addBlueprint(ghostWall);
  addBlueprint(ghostFloor, true);
  ghostPyr.add(new THREE.LineSegments(new THREE.EdgesGeometry(pyrGeo, 18), new THREE.LineBasicMaterial({ color: 0xf4fbff })));
  ghostWall.visible = ghostFloor.visible = ghostPyr.visible = false;
  scene.add(ghostWall, ghostFloor, ghostPyr);

  const rampGhost = new THREE.Group();
  const rampGhostParts = rampGeos.map((g) => new THREE.Mesh(g, ghostMat));
  rampGhostParts.forEach((p) => rampGhost.add(p));
  rampGhost.visible = false;
  scene.add(rampGhost);

  const editRoot = new THREE.Group();
  scene.add(editRoot);
  const barGeo = new THREE.BoxGeometry(1, 1, 1);
  const barMat = new THREE.MeshBasicMaterial({ color: 0xf7fbff, depthTest: true });
  const editBars: THREE.Mesh[] = [];
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(barGeo, barMat);
    m.visible = false;
    m.frustumCulled = false;
    m.renderOrder = 4;
    editRoot.add(m);
    editBars.push(m);
  }
  const cellGeo = new THREE.PlaneGeometry(1, 1);
  const editCells: THREE.Mesh[] = [];
  for (let i = 0; i < 18; i++) {
    const m = new THREE.Mesh(
      cellGeo,
      new THREE.MeshBasicMaterial({
        color: 0xffd23a,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      }),
    );
    m.visible = false;
    m.frustumCulled = false;
    m.renderOrder = 3;
    m.rotation.order = "YXZ";
    editRoot.add(m);
    editCells.push(m);
  }
  const pyrCells: THREE.Mesh[] = [0, 1, 2, 3].map((q) => {
    const m = new THREE.Mesh(
      pyramidCellGeo(q),
      new THREE.MeshBasicMaterial({
        color: 0xffd23a,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      }),
    );
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
  let wallRefs: { piece: number; tile: number }[][] = Array.from({ length: 9 }, () => []);
  let floorRefs: { piece: number; tile: number }[][] = Array.from({ length: 9 }, () => []);
  let wallSolidRefs: { piece: number }[] = [];
  let floorSolidRefs: { piece: number }[] = [];
  let rampRefs: { piece: number; tile: number }[][] = [[], [], [], []];
  let pyrRefs: { piece: number }[][] = [[], [], [], []];
  const buckets = new Map<string, AABB[]>();
  let dirty = true;

  const ownColor = new THREE.Color("#ffffff");
  const enemyColor = new THREE.Color("#f0c9a2");
  const blueColor = new THREE.Color("#b9dcff");
  const redColor = new THREE.Color("#ffc1b4");

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

  function rebuild() {
    dirty = false;
    let solidW = 0;
    let solidF = 0;
    const wc = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    const fc = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    wallRefs = Array.from({ length: 9 }, () => []);
    floorRefs = Array.from({ length: 9 }, () => []);
    wallSolidRefs = [];
    floorSolidRefs = [];
    rampRefs = [[], [], [], []];
    pyrRefs = [[], [], [], []];
    buckets.clear();
    const rc = [0, 0, 0, 0];
    const pc = [0, 0, 0, 0];
    for (let pi = 0; pi < pieces.length; pi++) {
      const p = pieces[pi]!;
      const cx = (p.ix + 0.5) * CELL;
      const cz = (p.iz + 0.5) * CELL;
      const yaw = p.rot * (Math.PI / 2);
      const col = pieceColor(p);
      if (p.kind === "wall") {
        const c = Math.cos(yaw);
        const s = Math.sin(yaw);
        const lz = -CELL / 2 + TH / 2;
        if (p.mask === 0b111111111 && solidW < SLOT) {
          _mw.makeTranslation(cx, p.base, cz);
          _mr.makeRotationY(yaw);
          _ml.makeTranslation(0, CELL / 2, lz);
          _ms.makeScale(CELL, CELL, TH);
          _m.copy(_mw).multiply(_mr).multiply(_ml).multiply(_ms);
          wallSolid.setMatrixAt(solidW, _m);
          wallSolid.setColorAt(solidW, col);
          wallSolidRefs.push({ piece: pi });
          solidW++;
          const wx = lz * s + cx;
          const wz = lz * c + cz;
          const hx = (Math.abs(c) * CELL + Math.abs(s) * TH) / 2;
          const hz = (Math.abs(s) * CELL + Math.abs(c) * TH) / 2;
          pushBucket(p.ix, p.iz, {
            minX: wx - hx,
            maxX: wx + hx,
            minY: p.base,
            maxY: p.base + CELL,
            minZ: wz - hz,
            maxZ: wz + hz,
          });
        } else {
          const ts = CELL / 3;
          for (let ty = 0; ty < 3; ty++) {
            for (let tx = 0; tx < 3; tx++) {
              const bit = ty * 3 + tx;
              if ((p.mask & (1 << bit)) === 0) continue;
              const idx = wc[bit]!;
              if (idx >= SLOT) continue;
              const lx = -CELL / 2 + (tx + 0.5) * ts;
              const ly = (ty + 0.5) * ts;
              _mw.makeTranslation(cx, p.base, cz);
              _mr.makeRotationY(yaw);
              _ml.makeTranslation(lx, ly, lz);
              _ms.makeScale(ts, ts, TH);
              _m.copy(_mw).multiply(_mr).multiply(_ml).multiply(_ms);
              wallMeshes[bit]!.setMatrixAt(idx, _m);
              wallMeshes[bit]!.setColorAt(idx, col);
              wallRefs[bit]!.push({ piece: pi, tile: bit });
              wc[bit] = idx + 1;
              const wx = lx * c + lz * s + cx;
              const wz = -lx * s + lz * c + cz;
              const wy = p.base + ly;
              const hx = (Math.abs(c) * ts + Math.abs(s) * TH) / 2;
              const hz = (Math.abs(s) * ts + Math.abs(c) * TH) / 2;
              pushBucket(p.ix, p.iz, {
                minX: wx - hx,
                maxX: wx + hx,
                minY: wy - ts / 2,
                maxY: wy + ts / 2,
                minZ: wz - hz,
                maxZ: wz + hz,
              });
            }
          }
        }
      } else if (p.kind === "floor") {
        if (p.mask === 0b111111111 && solidF < SLOT) {
          _m.compose(_v1.set(cx, p.base + TH / 2, cz), _q.identity(), _v2.set(CELL, TH, CELL));
          floorSolid.setMatrixAt(solidF, _m);
          floorSolid.setColorAt(solidF, col);
          floorSolidRefs.push({ piece: pi });
          solidF++;
        } else {
          const ts = CELL / 3;
          for (let tz = 0; tz < 3; tz++) {
            for (let tx = 0; tx < 3; tx++) {
              const bit = tz * 3 + tx;
              if ((p.mask & (1 << bit)) === 0) continue;
              const idx = fc[bit]!;
              if (idx >= SLOT) continue;
              const lx = -CELL / 2 + (tx + 0.5) * ts;
              const lz = -CELL / 2 + (tz + 0.5) * ts;
              _m.compose(_v1.set(cx + lx, p.base + TH / 2, cz + lz), _q.identity(), _v2.set(ts, TH, ts));
              floorMeshes[bit]!.setMatrixAt(idx, _m);
              floorMeshes[bit]!.setColorAt(idx, col);
              floorRefs[bit]!.push({ piece: pi, tile: bit });
              fc[bit] = idx + 1;
            }
          }
        }
      } else if (p.kind === "ramp") {
        _v1.set(cx, p.base, cz);
        _q.setFromAxisAngle(_up, yaw);
        _m.compose(_v1, _q, _v2.set(1, 1, 1));
        for (let s = 0; s < 4; s++) {
          if ((p.mask & (1 << s)) === 0) continue;
          const mesh = rampMeshes[s]!;
          const idx = rc[s]!;
          if (idx >= MAX_R) continue;
          mesh.setMatrixAt(idx, _m);
          mesh.setColorAt(idx, col);
          rampRefs[s]!.push({ piece: pi, tile: s });
          rc[s] = idx + 1;
        }
      } else if (p.kind === "pyramid") {
        _m.compose(_v1.set(cx, p.base, cz), _q.identity(), _v2.set(1, 1, 1));
        for (let q = 0; q < 4; q++) {
          if ((p.mask & (1 << q)) === 0 || pc[q]! >= MAX_P) continue;
          pyrMeshes[q]!.setMatrixAt(pc[q]!, _m);
          pyrMeshes[q]!.setColorAt(pc[q]!, col);
          pyrRefs[q]!.push({ piece: pi });
          pc[q] = pc[q]! + 1;
        }
      }
    }
    wallSolid.count = solidW;
    floorSolid.count = solidF;
    for (let i = 0; i < 9; i++) {
      wallMeshes[i]!.count = wc[i]!;
      floorMeshes[i]!.count = fc[i]!;
    }
    for (let i = 0; i < 4; i++) {
      rampMeshes[i]!.count = rc[i]!;
      pyrMeshes[i]!.count = pc[i]!;
    }
    for (const m of buildMeshes) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  function cellKey(ix: number, iz: number) {
    return `${ix},${iz}`;
  }

  function snapBase(y: number) {
    return Math.floor((y + CELL * 0.35) / CELL) * CELL;
  }

  function hasBuildSupport(ix: number, iz: number, base: number) {
    const g = groundHeight((ix + 0.5) * CELL, (iz + 0.5) * CELL);
    if (g > -8 && base <= g + 0.9 && base >= g - (CELL - 0.05)) return true;
    for (const p of pieces) {
      if (Math.abs(p.ix - ix) + Math.abs(p.iz - iz) > 1) continue;
      if (Math.abs(p.base - base) <= 0.05) return true;
      if (p.ix === ix && p.iz === iz && Math.abs(p.base + CELL - base) <= 0.05) return true;
    }
    return false;
  }

  function duplicate(kind: BuildKind, ix: number, iz: number, rot: number, base: number) {
    return pieces.some(
      (p) =>
        p.kind === kind &&
        p.ix === ix &&
        p.iz === iz &&
        Math.abs(p.base - base) < 0.05 &&
        (kind === "floor" || kind === "pyramid" || p.rot === rot),
    );
  }

  const player = {
    x: 0,
    y: 2,
    z: map === "hills" ? 18 : map === "aim" ? 10 : 10,
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
  if (map === "split") player.x = -24;
  if (map === "box" || map === "arena") player.z = map === "arena" ? 12 : 8;
  player.y = Math.max(0, groundHeight(player.x, player.z));

  let wood = mode.mats;
  const infinite = mode.infiniteMats;
  let slot = 1;
  let buildKind: BuildKind | null = null;
  let userRot = 0;
  let editPiece = -1;
  let editDrag = false;
  let editMask = 0;
  let editHover = -1;
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
  let healT = 0;
  let heals = 3;
  let shootCd = 0;
  let reloadT = 0;
  let bloom = 0;
  let recoil = 0;
  let swing = 0;
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

  function spend(n: number) {
    if (infinite) return true;
    if (wood < n) {
      say("Need wood");
      return false;
    }
    wood -= n;
    return true;
  }

  function tryPlace(kind: BuildKind, ix: number, iz: number, rot: number, owner: number, team: number, base: number, free = false) {
    if (pieces.length > 220) {
      if (owner === 0) say("Too many builds");
      return false;
    }
    if (duplicate(kind, ix, iz, rot, base)) return false;
    if (!hasBuildSupport(ix, iz, base)) {
      if (owner === 0) say("No support");
      return false;
    }
    if (!free && owner === 0 && !spend(10)) return false;
    if (!free && owner !== 0) {
      const bot = actors.find((a) => a.id === owner);
      if (!bot || bot.mats < 10) return false;
      bot.mats -= 10;
    }
    const max = kind === "wall" ? 160 : kind === "floor" ? 120 : kind === "ramp" ? 140 : 180;
    pieces.push({
      kind,
      ix,
      iy: Math.round(base / CELL),
      iz,
      rot,
      base,
      mask: fullMask(kind),
      hp: max,
      max,
      owner,
      team,
    });
    dirty = true;
    if (owner === 0) audio.play("build");
    return true;
  }

  function surfaceAt(x: number, z: number, feet: number) {
    let best = groundHeight(x, z);
    const ix = Math.floor(x / CELL);
    const iz = Math.floor(z / CELL);
    for (const p of pieces) {
      if (Math.abs(p.ix - ix) > 1 || Math.abs(p.iz - iz) > 1) continue;
      let h: number | null = null;
      if (p.kind === "floor") {
        const lx = x - (p.ix + 0.5) * CELL;
        const lz = z - (p.iz + 0.5) * CELL;
        if (Math.abs(lx) <= CELL / 2 && Math.abs(lz) <= CELL / 2) {
          const tx = Math.min(2, Math.max(0, Math.floor((lx + CELL / 2) / (CELL / 3))));
          const tz = Math.min(2, Math.max(0, Math.floor((lz + CELL / 2) / (CELL / 3))));
          if (p.mask & (1 << (tz * 3 + tx))) h = p.base + TH;
        }
      } else if (p.kind === "ramp") {
        const dx = x - (p.ix + 0.5) * CELL;
        const dz = z - (p.iz + 0.5) * CELL;
        const yaw = p.rot * (Math.PI / 2);
        const lx = dx * Math.cos(yaw) - dz * Math.sin(yaw);
        const lz = dx * Math.sin(yaw) + dz * Math.cos(yaw);
        if (Math.abs(lx) <= CELL / 2 && Math.abs(lz) <= CELL / 2) {
          const t = (lz + CELL / 2) / CELL;
          const bit = (t < 0.5 ? 0 : 2) + (lx < 0 ? 0 : 1);
          if (p.mask & (1 << bit)) h = p.base + THREE.MathUtils.clamp(t, 0, 1) * CELL;
        }
      } else if (p.kind === "pyramid") {
        const sx = x - (p.ix + 0.5) * CELL;
        const sz = z - (p.iz + 0.5) * CELL;
        const d = Math.max(Math.abs(sx), Math.abs(sz));
        const rad = CELL / 2;
        const bit = (sx < 0 ? 0 : 1) + (sz < 0 ? 0 : 2);
        if (d <= rad && p.mask & (1 << bit)) h = p.base + PYR_H * (1 - d / rad);
      }
      if (h == null) continue;
      if (h <= feet + 0.6 && h >= feet - 4 && h > best) best = h;
    }
    return best;
  }

  function blocked(x: number, z: number, feet: number, crouch: boolean) {
    const y0 = feet + 0.3;
    const y1 = feet + (crouch ? 1.05 : 1.62);
    const r = 0.36;
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
    | { kind: "ground"; t: number; x: number; y: number; z: number };

  function pieceFromIntersect(h: THREE.Intersection) {
    const id = h.instanceId ?? -1;
    if (id < 0) return -1;
    if (h.object === wallSolid) return wallSolidRefs[id]?.piece ?? -1;
    if (h.object === floorSolid) return floorSolidRefs[id]?.piece ?? -1;
    const wi = wallMeshes.findIndex((m) => m === h.object);
    if (wi >= 0) return wallRefs[wi]?.[id]?.piece ?? -1;
    const fi = floorMeshes.findIndex((m) => m === h.object);
    if (fi >= 0) return floorRefs[fi]?.[id]?.piece ?? -1;
    const pi = pyrMeshes.findIndex((m) => m === h.object);
    if (pi >= 0) return pyrRefs[pi]?.[id]?.piece ?? -1;
    const ri = rampMeshes.findIndex((m) => m === h.object);
    if (ri >= 0) return rampRefs[ri]?.[id]?.piece ?? -1;
    return -1;
  }

  function queryShot(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, range: number, skip: number): ShotHit | null {
    if (dirty) rebuild();
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
    const gHits = raycaster.intersectObjects(groundMeshes, false);
    if (gHits[0] && (!best || gHits[0].distance < best.t)) {
      best = { kind: "ground", t: gHits[0].distance, x: gHits[0].point.x, y: gHits[0].point.y, z: gHits[0].point.z };
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

  function hurtActor(a: Actor, dmg: number, head: boolean, byPlayer: boolean) {
    if (!a.alive) return;
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
      if (byPlayer && !a.target) {
        elims++;
        wood = Math.min(999, wood + (infinite ? 0 : 20));
        audio.play("elim");
        pushFeed(`Eliminated ${a.name}`);
        if (mode.teams) {
          if (player.team === 1) scoreBlue++;
          else scoreRed++;
        }
        spawnDrop(a.x, a.y, a.z);
      } else if (!a.target && !byPlayer) {
        pushFeed(`${a.name} down`);
      }
      if (a.target) {
        a.respawn = 0.4;
      }
    }
  }

  function hurtPlayer(dmg: number, src: string) {
    if (!player.alive || ended) return;
    if (matchT < 3 && src !== "the void") return;
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
      if (mode.aim || mode.id === "free") {
        player.alive = true;
        player.hp = 100;
        player.x = map === "split" ? -24 : 0;
        player.z = map === "hills" ? 18 : 8;
        player.y = Math.max(0, groundHeight(player.x, player.z));
        say("Respawned");
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
    if (ended || mode.aim || mode.id === "free") return;
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

  function syncWeapon(rig: Rig, kind: "pick" | "ar" | "shotgun" | "smg" | "sniper" | "heal" | "build", color?: string) {
    const key = `${kind}:${color ?? ""}`;
    if (rig.weapon.userData.vis === key) return;
    rig.weapon.userData.vis = key;
    fillWeapon(rig.weapon, kind, color);
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
    if (!gun || !player.alive || ended) return;
    if (matchT < 2.4 && !mode.aim && mode.id !== "free") return;
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
    shake = Math.min(0.25, shake + kick);
    audio.play(gun.id === "shotgun" ? "shotgun" : gun.id === "sniper" ? "sniper" : gun.id === "smg" ? "smg" : "shot");
    muzzle = 0.22;
    const spread = gun.spread * (1 + bloom * 2) * (mouse.r || opts.pad.aim ? 0.5 : 1);
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
        if (a) hurtActor(a, gun.dmg * mult, hit.head, true);
      } else if (hit.kind === "build") {
        const piece = pieces[hit.index];
        if (piece && (piece.owner !== 0 || slot === 0)) {
          piece.hp -= gun.id === "shotgun" ? 18 : gun.dmg;
          dirty = true;
          if (piece.hp <= 0) {
            audio.play("break");
            if (piece.owner === 0 && !infinite) wood = Math.min(999, wood + 4);
          }
        }
      } else spawnDecal(hit.x, hit.y, hit.z);
    }
    if (mag[gun.mag] <= 0 && reserve[gun.mag] > 0) startReload();
    checkRound();
  }

  function startReload() {
    const gun = currentGun();
    if (!gun || reloadT > 0 || mag[gun.mag] >= (gun.mag === "ar" ? 30 : gun.mag === "shotgun" ? 5 : gun.mag === "smg" ? 25 : 1)) return;
    if (reserve[gun.mag] <= 0) return;
    reloadT = gun.id === "sniper" ? 2.1 : gun.id === "shotgun" ? 1.7 : gun.id === "smg" ? 1.3 : 1.5;
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

  function melee() {
    if (swing > 0 || !player.alive) return;
    swing = 0.32;
    audio.play("swing");
    const fx = -Math.sin(camYaw);
    const fz = -Math.cos(camYaw);
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
          if (!infinite) wood = Math.min(999, wood + 35);
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
        piece.hp -= 55;
        dirty = true;
        audio.play("hit");
        if (piece.hp <= 0) {
          audio.play("break");
          if (!infinite) wood = Math.min(999, wood + 8);
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
    const sens = (0.0004 + (st.mouseSens / 100) * 0.0042) * (mouse.r || opts.pad.aim ? st.adsSens / 100 : 1);
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
    const crouch = isDown("ShiftLeft") || isDown(st.binds.crouch) || opts.pad.crouch || player.slide > 0;
    if ((isDown(st.binds.slide) || (crouch && sprint)) && player.grounded && player.slide <= 0 && len > 0.4) player.slide = 0.45;
    if (player.slide > 0) player.slide -= dt;
    player.crouch = crouch || player.slide > 0;
    const speed = player.slide > 0 ? 15 : player.crouch ? 4.3 : sprint ? 11.6 : 7.5;
    const slow = healT > 0 ? 0.45 : 1;
    const tx = mx * speed * slow;
    const tz = mz * speed * slow;
    const accel = player.grounded ? 16 : 3.2;
    const k = 1 - Math.exp(-accel * dt);
    player.vx += (tx - player.vx) * k;
    player.vz += (tz - player.vz) * k;

    const moving = Math.hypot(tx, tz) > 0.4;
    const aiming = mouse.r || opts.pad.aim || mouse.l || buildKind != null;
    if (aiming || !moving) {
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
    if (player.jumpBuf > 0 && player.coyote > 0 && player.slide <= 0) {
      player.vy = 9.4;
      player.grounded = false;
      player.coyote = 0;
      player.jumpBuf = 0;
      audio.play("jump");
    }
    moveBody(player, dt);
    if (player.y < -8 && player.alive && !ended) {
      if (mode.aim || mode.id === "free") {
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
      const cx = (p.ix + 0.5) * CELL;
      const cy = p.base + (p.kind === "floor" ? 0.2 : CELL * 0.45);
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
    const center = groundHeight(cx, cz);
    if (center < -8) return center;
    const dx = player.x - cx;
    const dz = player.z - cz;
    const len = Math.hypot(dx, dz) || 1;
    const edge = groundHeight(cx + (dx / len) * CELL * 0.42, cz + (dz / len) * CELL * 0.42);
    return Math.max(Math.min(center, edge), center - 0.9);
  }

  function facingRot(ix: number, iz: number) {
    const dx = (ix + 0.5) * CELL - player.x;
    const dz = (iz + 0.5) * CELL - player.z;
    if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 1 : 3;
    return dz > 0 ? 0 : 2;
  }

  function connectBase(ix: number, iz: number, hint: number) {
    let base = snapBase(hint);
    let best = Math.abs(base - hint);
    for (const p of pieces) {
      const manh = Math.abs(p.ix - ix) + Math.abs(p.iz - iz);
      if (manh === 0 || manh > 1) continue;
      const d = Math.abs(p.base - hint);
      if (d <= CELL * 0.85 && d <= best + 0.25) {
        base = p.base;
        best = d;
      }
    }
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
    const y1 = base + CELL;
    if (player.y + 1.6 < y0 || player.y + 0.2 > y1) return false;
    const nx = Math.max(cx - hx, Math.min(player.x, cx + hx));
    const nz = Math.max(cz - hz, Math.min(player.z, cz + hz));
    return (nx - player.x) ** 2 + (nz - player.z) ** 2 < 0.42 ** 2;
  }

  function overlapsPlayer(kind: BuildKind, ix: number, iz: number, base: number, rot: number) {
    if (kind === "floor") return false;
    if (kind === "wall") return wallHitsPlayer(ix, iz, base, rot);
    const head = player.y + (player.crouch ? 1.05 : 1.62);
    if (head < base + 0.25 || player.y > base + CELL - 0.05) return false;
    return inFootprint(ix, iz);
  }

  function placement(): { ix: number; iy: number; iz: number; rot: number; base: number; ok: boolean; why: string } | null {
    if (!buildKind) return null;
    const REACH = CELL * 1.9;
    viewRay(_rayO, _rayD);
    const ox = _rayO.x;
    const oy = _rayO.y;
    const oz = _rayO.z;
    const dx = _rayD.x;
    const dy = _rayD.y;
    const dz = _rayD.z;

    let ix = 0;
    let iz = 0;
    let base = player.y;
    let anchored = false;
    let why = "free";

    let prevIx = 0;
    let prevIz = 0;
    let prevOk = false;
    let curIx = 0x7fffffff;
    let curIz = 0x7fffffff;
    let landed = false;
    for (let t = 0.3; t < 18 && !landed; t += 0.18) {
      const x = ox + dx * t;
      const y = oy + dy * t;
      const z = oz + dz * t;
      const cx = Math.floor(x / CELL);
      const cz = Math.floor(z / CELL);
      const dist = Math.hypot((cx + 0.5) * CELL - player.x, (cz + 0.5) * CELL - player.z);
      if (dist > REACH + CELL) break;
      if (cx !== curIx || cz !== curIz) {
        if (curIx !== 0x7fffffff && dist > 0.8) {
          prevIx = curIx;
          prevIz = curIz;
          prevOk = true;
        }
        curIx = cx;
        curIz = cz;
      }
      if (dist < 0.85) continue;
      const column = pieces.filter((p) => p.ix === cx && p.iz === cz);
      const spanOf = (p: (typeof pieces)[number]) => (p.kind === "floor" ? 1 : CELL);
      const inside = column.find((p) => y >= p.base - 0.05 && y <= p.base + spanOf(p) + 0.05);
      const below = column.filter((p) => p.base + spanOf(p) < y + 0.2).sort((a, b) => b.base - a.base)[0];
      if (inside || (below && y < below.base + spanOf(below) + CELL * 0.95)) {
        const piece = inside ?? below!;
        const span = spanOf(piece);
        const rel = (y - piece.base) / span;
        const over = !inside && !!below;
        ix = piece.ix;
        iz = piece.iz;
        if (piece.kind === "floor" && buildKind !== "floor" && y < piece.base + CELL * 0.55) {
          base = piece.base;
          why = "on-floor";
        } else if (over || rel > 0.46) {
          base = piece.base + CELL;
          why = over ? "over-top" : "upper";
        } else if (prevOk && (prevIx !== piece.ix || prevIz !== piece.iz)) {
          ix = prevIx;
          iz = prevIz;
          base = piece.base;
          why = "side";
        } else {
          base = piece.base + CELL;
          why = "climb";
        }
        anchored = true;
        landed = true;
        break;
      }
      const g = groundHeight(x, z);
      if (g > -8 && y <= g + 0.45) {
        ix = cx;
        iz = cz;
        why = "ground";
        landed = true;
        break;
      }
    }
    if (!landed) {
      const t = 4.2;
      ix = Math.floor((ox + dx * t) / CELL);
      iz = Math.floor((oz + dz * t) / CELL);
      why = "ahead";
    }

    if (!anchored) {
      let guard = 5;
      while (guard-- > 0 && Math.hypot((ix + 0.5) * CELL - player.x, (iz + 0.5) * CELL - player.z) > REACH) {
        const ddx = player.x - (ix + 0.5) * CELL;
        const ddz = player.z - (iz + 0.5) * CELL;
        if (Math.abs(ddx) >= Math.abs(ddz)) ix += Math.sign(ddx) || 0;
        else iz += Math.sign(ddz) || 0;
      }
      const g = cellGround(ix, iz);
      const hint = g > -8 ? Math.max(g, 0) : player.y;
      base = connectBase(ix, iz, hint);
    }

    let rot = buildKind === "wall" || buildKind === "ramp" ? facingRot(ix, iz) : 0;
    rot = (rot + userRot) & 3;
    if (overlapsPlayer(buildKind, ix, iz, base, rot)) {
      const fx = -Math.sin(camYaw);
      const fz = -Math.cos(camYaw);
      if (Math.abs(fx) > Math.abs(fz)) ix += Math.sign(fx) || 1;
      else iz += Math.sign(fz) || 1;
      if (!anchored) {
        const g = cellGround(ix, iz);
        const hint = g > -8 ? Math.max(g, 0) : base;
        base = connectBase(ix, iz, hint);
      }
      rot = ((buildKind === "wall" || buildKind === "ramp" ? facingRot(ix, iz) : 0) + userRot) & 3;
      why += "-nudge";
    }

    const dist = Math.hypot((ix + 0.5) * CELL - player.x, (iz + 0.5) * CELL - player.z);
    const iy = Math.round(base / CELL);
    const ok =
      dist <= REACH + CELL * 0.35 &&
      hasBuildSupport(ix, iz, base) &&
      !duplicate(buildKind, ix, iz, rot, base) &&
      (infinite || wood >= 10) &&
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
    const col = spot.ok ? 0x3ec6ff : 0xef4444;
    ghostMat.color.setHex(col);
    const cx = (spot.ix + 0.5) * CELL;
    const cz = (spot.iz + 0.5) * CELL;
    const yaw = spot.rot * (Math.PI / 2);
    const y = spot.base;
    if (buildKind === "wall") {
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      const lz = -CELL / 2 + TH / 2;
      ghostWall.position.set(cx + lz * s, y + CELL / 2, cz + lz * c);
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

  function paintCell(mesh: THREE.Mesh, bit: number, exists: boolean) {
    const mat = mesh.material as THREE.MeshBasicMaterial;
    const on = (editMask & (1 << bit)) !== 0;
    if (on) {
      mat.color.setHex(0xffd23a);
      mat.opacity = 0.86;
    } else if (bit === editHover) {
      mat.color.setHex(0xffffff);
      mat.opacity = 0.55;
    } else if (!exists) {
      mat.color.setHex(0x8fd8ff);
      mat.opacity = 0.2;
    } else {
      mat.color.setHex(0x071422);
      mat.opacity = 0.2;
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
    const ts = CELL / 3;
    if (p.kind === "wall") {
      const faces = [-CELL / 2 + TH + 0.05, -CELL / 2 - 0.05];
      let bar = 0;
      for (const z of faces) {
        for (let i = 0; i <= 3; i++) {
          const v = editBars[bar++]!;
          piecePoint(p, -CELL / 2 + i * ts, CELL / 2, z, v.position);
          v.rotation.set(0, yaw, 0);
          v.scale.set(0.08, CELL, 0.045);
          v.visible = true;
          const h = editBars[bar++]!;
          piecePoint(p, 0, i * ts, z, h.position);
          h.rotation.set(0, yaw, 0);
          h.scale.set(CELL, 0.08, 0.045);
          h.visible = true;
        }
      }
      for (let side = 0; side < 2; side++) {
        const z = faces[side]!;
        for (let bit = 0; bit < 9; bit++) {
          const tx = bit % 3;
          const ty = Math.floor(bit / 3);
          const mesh = editCells[side * 9 + bit]!;
          piecePoint(p, -CELL / 2 + (tx + 0.5) * ts, (ty + 0.5) * ts, z, mesh.position);
          mesh.rotation.set(0, yaw, 0);
          mesh.scale.set(ts * 0.82, ts * 0.82, 1);
          paintCell(mesh, bit, (p.mask & (1 << bit)) !== 0);
        }
      }
      return;
    }
    if (p.kind === "floor") {
      const y = TH + 0.06;
      let bar = 0;
      for (let i = 0; i <= 3; i++) {
        const a = editBars[bar++]!;
        piecePoint(p, -CELL / 2 + i * ts, y, 0, a.position);
        a.rotation.set(0, 0, 0);
        a.scale.set(0.08, 0.045, CELL);
        a.visible = true;
        const b = editBars[bar++]!;
        piecePoint(p, 0, y, -CELL / 2 + i * ts, b.position);
        b.rotation.set(0, 0, 0);
        b.scale.set(CELL, 0.045, 0.08);
        b.visible = true;
      }
      for (let bit = 0; bit < 9; bit++) {
        const tx = bit % 3;
        const tz = Math.floor(bit / 3);
        const mesh = editCells[bit]!;
        mesh.position.set((p.ix + 0.5) * CELL + -CELL / 2 + (tx + 0.5) * ts, p.base + y, (p.iz + 0.5) * CELL + -CELL / 2 + (tz + 0.5) * ts);
        mesh.rotation.set(-Math.PI / 2, 0, 0);
        mesh.scale.set(ts * 0.82, ts * 0.82, 1);
        paintCell(mesh, bit, (p.mask & (1 << bit)) !== 0);
      }
      return;
    }
    if (p.kind === "ramp") {
      const hw = CELL / 2;
      const lift = 0.1;
      for (let bit = 0; bit < 4; bit++) {
        const col = bit % 2;
        const row = bit >> 1;
        const mesh = editCells[bit]!;
        const lx = -CELL / 2 + (col + 0.5) * hw;
        const lz = -CELL / 2 + (row + 0.5) * hw;
        piecePoint(p, lx, lz + CELL / 2 + lift, lz - lift * 0.5, mesh.position);
        mesh.rotation.set((-3 * Math.PI) / 4, yaw, 0);
        mesh.scale.set(hw * 0.9, hw * Math.SQRT2 * 0.9, 1);
        paintCell(mesh, bit, (p.mask & (1 << bit)) !== 0);
      }
      let bar = 0;
      for (let i = 0; i <= 2; i++) {
        const lz = -CELL / 2 + i * hw;
        piecePoint(p, -CELL / 2, lz + CELL / 2 + lift, lz, _bA);
        piecePoint(p, CELL / 2, lz + CELL / 2 + lift, lz, _bB);
        barBetween(editBars[bar++]!, _bA, _bB);
        const lx = -CELL / 2 + i * hw;
        piecePoint(p, lx, lift, -CELL / 2, _bA);
        piecePoint(p, lx, CELL + lift, CELL / 2, _bB);
        barBetween(editBars[bar++]!, _bA, _bB);
      }
      return;
    }
    const cx = (p.ix + 0.5) * CELL;
    const cz = (p.iz + 0.5) * CELL;
    const half = CELL / 2;
    for (let q = 0; q < 4; q++) {
      const mesh = pyrCells[q]!;
      mesh.position.set(cx, p.base, cz);
      paintCell(mesh, q, (p.mask & (1 << q)) !== 0);
    }
    let bar = 0;
    const apexY = PYR_H + 0.1;
    for (const [ex, ez] of [
      [half, 0],
      [-half, 0],
      [0, half],
      [0, -half],
    ] as const) {
      _bA.set(cx, p.base + apexY, cz);
      _bB.set(cx + ex, p.base + 0.12, cz + ez);
      barBetween(editBars[bar++]!, _bA, _bB);
    }
    for (const [x0, z0, x1, z1] of [
      [-half, -half, half, -half],
      [half, -half, half, half],
      [half, half, -half, half],
      [-half, half, -half, -half],
    ] as const) {
      _bA.set(cx + x0, p.base + 0.1, cz + z0);
      _bB.set(cx + x1, p.base + 0.1, cz + z1);
      barBetween(editBars[bar++]!, _bA, _bB);
    }
  }

  function placePlayerBuild() {
    const spot = placement();
    if (!spot || !buildKind || !spot.ok) {
      if (buildKind && spot && !spot.ok) audio.play("empty");
      return;
    }
    tryPlace(buildKind, spot.ix, spot.iz, spot.rot, 0, player.team, spot.base);
  }

  function pieceAimed(ownOnly: boolean) {
    viewRay(_rayO, _rayD);
    const ox = _rayO.x;
    const oy = _rayO.y;
    const oz = _rayO.z;
    const dx = _rayD.x;
    const dy = _rayD.y;
    const dz = _rayD.z;
    let best = -1;
    let bestT = 1e9;
    const pad = 0.75;
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i]!;
      if (ownOnly && p.owner !== 0) continue;
      const top = p.base + (p.kind === "floor" ? 1.1 : CELL);
      const hit = rayAabb(
        ox,
        oy,
        oz,
        dx,
        dy,
        dz,
        p.ix * CELL - pad,
        p.base - pad * 0.25,
        p.iz * CELL - pad,
        (p.ix + 1) * CELL + pad,
        top + pad,
        (p.iz + 1) * CELL + pad,
      );
      if (hit && hit.t < bestT && hit.t < 18) {
        bestT = hit.t;
        best = i;
      }
    }
    if (best >= 0) return best;
    return ownOnly ? closestOwnPiece(ox, oy, oz, dx, dy, dz) : -1;
  }

  function toggleEdit() {
    if (editPiece >= 0) {
      if (editMask) confirmEdit();
      editPiece = -1;
      editDrag = false;
      editMask = 0;
      dirty = true;
      audio.play("edit");
      return;
    }
    const own = pieceAimed(true);
    if (own >= 0) {
      editPiece = own;
      editDrag = false;
      editMask = 0;
      buildKind = null;
      dirty = true;
      audio.play("edit");
      say("Hold click and drag across it · scroll to reset");
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
      const half = CELL / 2;
      let prev: number | null = null;
      for (let t = 0.3; t < 28; t += 0.08) {
        const x = ox + dx * t - cx;
        const z = oz + dz * t - cz;
        if (Math.abs(x) > half || Math.abs(z) > half) {
          prev = null;
          continue;
        }
        const surf = PYR_H * (1 - Math.max(Math.abs(x), Math.abs(z)) / half);
        const diff = oy + dy * t - p.base - surf;
        if (prev !== null && (prev > 0) !== (diff > 0)) return (x < 0 ? 0 : 1) + (z < 0 ? 0 : 2);
        prev = diff;
      }
      return -1;
    }
    if (p.kind === "floor") {
      if (Math.abs(dy) < 0.04) return -1;
      const t = (p.base + 0.2 - oy) / dy;
      if (t < 0.05 || t > 28) return -1;
      const lx = ox + dx * t - p.ix * CELL;
      const lz = oz + dz * t - p.iz * CELL;
      if (lx < -0.7 || lz < -0.7 || lx > CELL + 0.7 || lz > CELL + 0.7) return -1;
      const tx = Math.max(0, Math.min(2, Math.floor(lx / ts)));
      const tz = Math.max(0, Math.min(2, Math.floor(lz / ts)));
      return tz * 3 + tx;
    }
    if (p.kind === "ramp") {
      const rhs0 = oy - p.base - CELL / 2 - (ox - cx) * s - (oz - cz) * c;
      const rhs1 = dx * s + dz * c - dy;
      if (Math.abs(rhs1) < 1e-4) return -1;
      const t = rhs0 / rhs1;
      if (t < 0.05 || t > 28) return -1;
      const x = ox + dx * t;
      const z = oz + dz * t;
      const localZ = (x - cx) * s + (z - cz) * c;
      const localX = (x - cx) * c - (z - cz) * s;
      if (Math.abs(localX) > CELL * 0.8) return -1;
      if (localZ < -CELL / 2 - 0.55 || localZ > CELL / 2 + 0.55) return -1;
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
    if (localY < -0.55 || localY > CELL + 0.55) return -1;
    if (Math.abs(localX) > CELL / 2 + 0.55) return -1;
    const tx = Math.max(0, Math.min(2, Math.floor((localX + CELL / 2) / ts)));
    const ty = Math.max(0, Math.min(2, Math.floor(localY / ts)));
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
        consider(q, cx + (q % 2 === 0 ? -1 : 1) * CELL * 0.25, p.base + PYR_H * 0.35, cz + (q < 2 ? -1 : 1) * CELL * 0.25);
      }
      return best;
    }
    const ts = CELL / 3;
    if (p.kind === "ramp") {
      const hw = CELL / 2;
      for (let bit = 0; bit < 4; bit++) {
        const lx = -CELL / 2 + ((bit % 2) + 0.5) * hw;
        const lz = -CELL / 2 + ((bit >> 1) + 0.5) * hw;
        consider(bit, cx + lx * c + lz * s, p.base + lz + CELL / 2, cz - lx * s + lz * c);
      }
      return best;
    }
    if (p.kind === "wall") {
      for (let ty = 0; ty < 3; ty++) {
        for (let tx = 0; tx < 3; tx++) {
          const lx = -CELL / 2 + (tx + 0.5) * ts;
          const ly = (ty + 0.5) * ts;
          const lz = -CELL / 2 + TH / 2;
          consider(ty * 3 + tx, cx + lx * c + lz * s, p.base + ly, cz - lx * s + lz * c);
        }
      }
      return best;
    }
    for (let tz = 0; tz < 3; tz++) {
      for (let tx = 0; tx < 3; tx++) {
        const lx = -CELL / 2 + (tx + 0.5) * ts;
        const lz = -CELL / 2 + (tz + 0.5) * ts;
        consider(tz * 3 + tx, cx + lx, p.base + TH / 2, cz + lz);
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
      dirty = true;
    }
  }

  function confirmEdit(exitAfter = false) {
    const p = pieces[editPiece];
    editDrag = false;
    if (!p || editMask === 0) {
      editMask = 0;
      dirty = true;
      return;
    }
    const index = editPiece;
    p.mask ^= editMask;
    editMask = 0;
    if (p.mask === 0) {
      pieces.splice(index, 1);
      editPiece = -1;
      if (!infinite) wood = Math.min(999, wood + 5);
    } else if (exitAfter) {
      editPiece = -1;
    }
    dirty = true;
    audio.play("edit");
  }

  /** Scroll wheel while editing: first clears the pending selection, then stages a restore of the original full shape. */
  function resetEdit() {
    const p = editPiece >= 0 ? pieces[editPiece] : undefined;
    if (!p) return;
    const full = fullMask(p.kind);
    if (editMask !== 0) editMask = 0;
    else if (p.mask !== full) editMask = full ^ p.mask;
    else return;
    dirty = true;
    audio.play("edit");
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

  let stormX = map === "split" ? 0 : 4;
  let stormZ = map === "hills" ? 6 : 0;
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
  const stormMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 50, 48, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x7eb6ff, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
  );
  stormMesh.position.y = 22;
  stormMesh.visible = mode.storm;
  scene.add(stormMesh);

  function updateStorm(dt: number) {
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

  function updateActor(a: Actor, dt: number) {
    if (!a.alive) {
      a.respawn -= dt;
      a.rig.group.rotation.x += (1.3 - a.rig.group.rotation.x) * Math.min(1, dt * 4);
      a.rig.group.position.y -= dt * 0.4;
      a.label.visible = false;
      if (a.respawn <= 0 && (mode.respawn || a.target || mode.id === "free")) {
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
          piece.hp -= 12;
          dirty = true;
        }
      }
      if (a.hp < 55 && a.coverCd <= 0 && a.mats >= 10) {
        const ix = Math.floor((a.x - Math.sin(a.yaw) * 2.2) / CELL);
        const iz = Math.floor((a.z - Math.cos(a.yaw) * 2.2) / CELL);
        const g = groundHeight((ix + 0.5) * CELL, (iz + 0.5) * CELL);
        const rot = Math.abs(Math.sin(a.yaw)) > Math.abs(Math.cos(a.yaw)) ? 1 : 0;
        const base = g > -5 ? g + 0.04 : a.y;
        if (g > -5 && tryPlace("wall", ix, iz, rot, a.id, a.team, base)) a.coverCd = 2.4;
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
    const dist = mouse.r || opts.pad.aim ? 3.35 : 5.05;
    const cp = Math.cos(camPitch);
    const sp = Math.sin(camPitch);
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const desired = _v2.set(tx - fx * dist * cp + Math.cos(yaw) * 0.42, ty + 1.72 - sp * dist * 0.7, tz - fz * dist * cp - Math.sin(yaw) * 0.42);
    // pitch > 0 looks up: camera drops and the look target rises.
    const look = _v3.set(tx + fx * 2.4 * cp, ty + 1.32 + sp * 1.5, tz + fz * 2.4 * cp);
    if (dirty) rebuild();
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
    const lerp = 1 - Math.exp(-10 * dt);
    camera.position.lerp(desired, lerp);
    camera.lookAt(look);
    if (shake > 0.001) {
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake;
      shake *= Math.exp(-8 * dt);
    }
    const ads = mouse.r || opts.pad.aim;
    const targetFov = ads ? 52 : 74;
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 10);
    camera.updateProjectionMatrix();
  }

  function syncVisuals(dt: number, time: number) {
    playerRig.group.position.set(player.x, player.y, player.z);
    playerRig.group.rotation.y = player.yaw + Math.PI;
    playerRig.group.visible = player.alive;
    const speed = Math.hypot(player.vx, player.vz);
    animateRig(playerRig, time, {
      speed,
      swing: swing > 0 && slot === 0,
      shoot: muzzle > 0,
      air: !player.grounded,
      crouch: player.crouch && player.slide <= 0,
      hit: hurtT > 0.08,
      slide: player.slide > 0,
      yaw: player.yaw,
      vx: player.vx,
      vz: player.vz,
    });
    syncWeapon(playerRig, weaponKind(), pick.primary);
    for (const a of actors) {
      if (!a.alive && a.respawn > 90) {
        a.rig.group.visible = false;
        continue;
      }
      a.rig.group.visible = true;
      a.rig.group.position.set(a.x, a.y, a.z);
      if (a.alive) a.rig.group.rotation.set(0, a.yaw + Math.PI, 0);
      animateRig(a.rig, time + a.id, {
        speed: a.alive ? Math.hypot(a.vx, a.vz) : 0,
        air: a.alive && !a.grounded,
        hit: a.flash > 0.05,
        shoot: a.alive && !a.target && a.shootCd > 0.22 && a.shootCd < 0.55,
        yaw: a.yaw,
        vx: a.vx,
        vz: a.vz,
      });
      syncWeapon(a.rig, a.target ? "pick" : a.id % 2 ? "shotgun" : "ar");
      aimWeapon(a.rig, _gunDir.set(-Math.sin(a.yaw), 0.08, -Math.cos(a.yaw)), a.target);
      a.label.position.set(a.x, a.y + 2.15, a.z);
      a.label.visible = a.alive;
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
        else if (!infinite) wood = Math.min(999, wood + 30);
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
    for (let i = pieces.length - 1; i >= 0; i--) {
      const p = pieces[i]!;
      if (p.hp <= 0 || p.mask === 0) {
        pieces.splice(i, 1);
        dirty = true;
        if (editPiece === i) editPiece = -1;
        else if (editPiece > i) editPiece--;
      }
    }
    if (dirty) rebuild();
  }

  function assist(dt: number) {
    const st = opts.getSettings();
    if (!st.aimAssist) return;
    const usingPad = Math.abs(opts.pad.moveX) + Math.abs(opts.pad.moveY) > 0.2 || opts.pad.fire;
    if (!usingPad && !opts.pad.aim) return;
    let best = 0.18;
    let dyaw = 0;
    for (const a of actors) {
      if (!a.alive || a.target && false) continue;
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
    const bounds = map === "hills" ? 90 : map === "box" ? 20 : map === "arena" ? 26 : 50;
    const counted = actors.filter((a) => !a.target);
    const alive = (player.alive ? 1 : 0) + counted.filter((a) => a.alive).length;
    let buildHp: number | null = null;
    camera.getWorldDirection(_v1);
    const origin = camera.position.clone();
    const hit = queryShot(origin.x, origin.y, origin.z, _v1.x, _v1.y, _v1.z, 20, 0);
    if (hit?.kind === "build") {
      const p = pieces[hit.index];
      if (p) buildHp = p.hp / p.max;
    }
    const st = opts.getSettings();
    return {
      hp: Math.max(0, player.hp),
      shield: player.shield,
      wood: infinite ? 999 : wood,
      infiniteWood: infinite,
      slot,
      build: buildKind,
      rot: userRot,
      mag: gun ? mag[gun.mag] : 0,
      reserve: gun ? reserve[gun.mag] : 0,
      reloading: reloadT > 0,
      weapon: buildKind ? buildKind : ["Pickaxe", "Rifle", "Shotgun", "SMG", "Sniper", "Bandage"][slot] ?? "",
      elims,
      alive,
      total: counted.length + 1,
      inStorm: mode.storm && Math.hypot(player.x - stormX, player.z - stormZ) > stormR,
      stormDps: stormPhases[Math.min(phaseI, Math.max(0, stormPhases.length - 1))]?.dps ?? 0,
      stormEta: mode.storm ? Math.max(0, phaseT) : -1,
      hit: hitT,
      head: hitHead,
      hurt: hurtT,
      gap: 6 + bloom * 16,
      banner,
      edit: editPiece >= 0,
      fps: Math.round(fpsSmoothed),
      phase: ended ? "end" : matchT < 2.4 && !mode.aim && mode.id !== "free" ? "countdown" : "live",
      countdown: Math.max(1, Math.ceil(2.4 - matchT)),
      scoreBlue,
      scoreRed,
      teams: mode.teams && mode.scoreLimit > 0,
      healing: healT > 0 ? 1 - healT / 2.6 : 0,
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
        dots: actors.filter((a) => a.alive).map((a) => ({ x: a.x, z: a.z, team: a.target ? 3 : mode.teams ? a.team : 2 })),
      },
      buildHp,
      paused,
    };
  }

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const limit = opts.getSettings().fpsLimit;
    if (limit > 0) {
      fpsAcc += dt;
      if (fpsAcc < 1 / limit) return;
      fpsAcc = 0;
    }
    fpsSmoothed = fpsSmoothed * 0.9 + (1 / Math.max(0.001, dt)) * 0.1;
    const st = opts.getSettings();
    audio.setVolumes(st.master, st.music, st.sfx);
    if (!paused && !ended) {
      matchT += dt;
      updatePlayer(dt);
      assist(dt);
      for (const a of actors) updateActor(a, dt);
      updateStorm(dt);
      shootCd = Math.max(0, shootCd - dt);
      swing = Math.max(0, swing - dt);
      muzzle = Math.max(0, muzzle - dt);
      bloom *= Math.exp(-2.4 * dt);
      hitT = Math.max(0, hitT - dt);
      hurtT = Math.max(0, hurtT - dt);
      bannerT -= dt;
      if (bannerT <= 0) banner = "";
      if (reloadT > 0) {
        reloadT -= dt;
        if (reloadT <= 0) finishReload();
      }
      const fire = (mouse.l || opts.pad.fire) && editPiece < 0;
      if (editPiece >= 0 && (mouse.l || opts.pad.fire)) {
        editDrag = true;
        editClick();
      } else if (editDrag) {
        confirmEdit(true);
      }
      const gun = currentGun();
      if (buildKind && editPiece < 0 && (mouse.l || opts.pad.fire)) {
        placeHold += dt;
        if (placeHold === dt || placeHold > 0.16) {
          placePlayerBuild();
          if (placeHold > 0.16) placeHold = 0.02;
        }
      } else placeHold = 0;
      if (slot === 0 && fire && !prevFire) melee();
      else if (slot === 5 && !buildKind && (mouse.l || opts.pad.fire) && heals > 0 && player.hp < 100) {
        healT += dt;
        if (healT >= 2.6) {
          player.hp = Math.min(100, player.hp + 35);
          heals--;
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
    } else {
      prevFire = mouse.l || opts.pad.fire;
    }
    const time = now / 1000;
    syncVisuals(dt, time);
    updateCamera(dt);
    camera.getWorldDirection(_gunDir);
    _aimPt.copy(camera.position).addScaledVector(_gunDir, 48);
    playerRig.weapon.getWorldPosition(_v3);
    _gunDir.copy(_aimPt).sub(_v3);
    aimWeapon(playerRig, _gunDir, weaponKind() === "pick", _aimPt);
    showGhost();
    syncEditChrome();
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
  let last = performance.now();
  let raf = 0;

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    const pr = settings0.quality === "low" ? 1 : Math.min(window.devicePixelRatio || 1, settings0.quality === "high" ? 1.6 : 1.25);
    renderer.setPixelRatio(pr);
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
      paused = true;
      opts.onPause();
    }
    if (paused || ended) return;
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
    for (const [code, s] of slots) {
      if (e.code === code) {
        slot = s;
        buildKind = null;
      }
    }
    if (e.code === st.binds.edit || e.code === "KeyQ") toggleEdit();
  };
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
  const onBlur = () => keys.clear();
  const onMouseDown = (e: MouseEvent) => {
    if (e.button === 0) mouse.l = true;
    if (e.button === 1) {
      mouse.m = true;
      userRot = (userRot + 1) & 3;
      e.preventDefault();
    }
    if (e.button === 2) mouse.r = true;
  };
  const onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) mouse.l = false;
    if (e.button === 1) mouse.m = false;
    if (e.button === 2) mouse.r = false;
  };
  const onMove = (e: MouseEvent) => {
    mouse.cx = e.clientX;
    mouse.cy = e.clientY;
    mouse.have = true;
    if (document.pointerLockElement !== canvas) return;
    const st = opts.getSettings();
    const sens = 0.00045 + (st.mouseSens / 100) * 0.0045;
    const ads = mouse.r ? st.adsSens / 100 : 1;
    camYaw -= e.movementX * sens * ads;
    const my = st.invertY ? -e.movementY : e.movementY;
    camPitch -= my * sens * ads;
    camPitch = Math.max(-0.85, Math.min(1.15, camPitch));
  };
  const onWheel = (e: WheelEvent) => {
    if (buildKind) userRot = (userRot + (e.deltaY > 0 ? 1 : 3)) & 3;
    else if (editPiece >= 0) resetEdit();
    else {
      const dir = e.deltaY > 0 ? 1 : -1;
      slot = (slot + dir + 6) % 6;
      buildKind = null;
    }
    e.preventDefault();
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
    edit: () => toggleEdit(),
    getDebug: () => ({
      x: player.x,
      y: player.y,
      z: player.z,
      camYaw,
      camPitch,
      wood,
      buildKind,
      pieces: pieces.map((p) => ({ k: p.kind, ix: p.ix, iy: p.iy, iz: p.iz, rot: p.rot, base: Math.round(p.base * 100) / 100, mask: p.mask })),
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

  const wasPad = { wall: false, floor: false, ramp: false, roof: false, edit: false };

  return {
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
      buildMap.dispose();
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
      edit?: () => void;
      getDebug?: () => unknown;
      getAnim?: () => unknown;
      getGun?: () => unknown;
      build?: (kind: "wall" | "floor" | "ramp" | "pyramid" | null) => unknown;
    };
  }
}
