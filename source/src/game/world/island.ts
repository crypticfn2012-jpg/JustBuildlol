import * as THREE from "three";
import type { BuildMat } from "@/game/world/scenery";
import { hasCars, treeModel, CAR_MODELS, type TreeModel } from "@/game/world/assets";

/**
 * "Driftwood Isle" — the 16-player battle royale island.
 *
 * Everything is generated in code (no external art): terrain heightfield, sea, roads,
 * named locations with enterable buildings, and instanced props. Static geometry is
 * merged per location and material to keep draw calls low enough for Chromebooks.
 *
 * Collision is data, not meshes: axis-aligned boxes (walls, floors, crates, cars...) and
 * sloped ramps (stairs, roofs). The engine queries them through a spatial grid.
 */

export type StaticBox = {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  /** What hitting it with a pickaxe gives (null = nothing). */
  mat: BuildMat | null;
  /** Set when a harvestable prop is destroyed. */
  dead?: boolean;
  /** Harvestable prop that owns this box, if any. */
  prop?: Harvestable;
  /** Window glass: see-through, blocks movement, shatters when shot or hit. */
  glass?: boolean;
  pane?: number;
  /** Door collider (dead while the door is open). */
  door?: number;
  /** Panel of a house wall this section belongs to: pickaxing it brings down that panel only. */
  wall?: WallGroup;
};

/** A panel of a building's side wall (about 3.5 m wide, one storey tall): its extent and collider sections. */
export type WallGroup = { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number; parts: StaticBox[] };

export type DoorView = { cx: number; cz: number; y: number; open: boolean };

/** Sloped walkable surface: height rises linearly along one world axis inside the rectangle. */
export type StaticRamp = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  axis: "x" | "z";
  /** +1: rises toward +axis, -1: rises toward -axis. */
  dir: 1 | -1;
  y0: number;
  y1: number;
  /** An oriented deck strip (bridges): from (ax, az) at y0 to (bx, bz) at y1, hw wide each side. */
  seg?: { ax: number; az: number; bx: number; bz: number; hw: number };
};

export type LootKind = "chest" | "floor" | "ammo";
export type LootSpot = {
  kind: LootKind;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Walking route for bots to reach indoor loot: outside the door, inside the door, then stairs if upstairs. */
  path?: [number, number, number][];
  /** World-space footprint of the building the loot is in. */
  inside?: [number, number, number, number];
};

export type Harvestable = {
  kind: "tree" | "rock" | "car" | "crate" | "hay";
  x: number;
  y: number;
  z: number;
  /** Reach radius for the pickaxe. */
  r: number;
  height: number;
  mat: BuildMat;
  hp: number;
  /** Materials per hit. */
  give: number;
  alive: boolean;
  boxes: StaticBox[];
  hide: () => void;
  /** Wobble from a pickaxe hit coming from direction (dx, dz). */
  hit: (dx: number, dz: number) => void;
};

export type Poi = { name: string; x: number; z: number; r: number };

/** Where a drivable car starts the match (car model, body paint). */
export type VehicleSpawn = { x: number; y: number; z: number; yaw: number; model: string; paint: string };

export type Island = {
  height: (x: number, z: number) => number;
  /** True where the ground sits under the sea surface (wading). */
  wet: (x: number, z: number) => boolean;
  group: THREE.Group;
  boxes: StaticBox[];
  ramps: StaticRamp[];
  loot: LootSpot[];
  /** Chest spots inside the shipping containers; each match fills a few random ones. */
  containerSpots: LootSpot[];
  harvest: Harvestable[];
  doors: DoorView[];
  toggleDoor: (i: number, open?: boolean) => void;
  /** Shatter a glass pane; returns its centre for effects, or null if it was already broken. */
  breakGlass: (box: StaticBox) => [number, number, number] | null;
  /**
   * Smash a solid world box (a house wall section, fence, prop...): its collision goes away and every
   * triangle of the merged world geometry inside it, plus any instanced prop standing in it, disappears.
   * Returns the box centre, or null if it was already gone.
   */
  breakBox: (box: StaticBox) => [number, number, number] | null;
  pois: Poi[];
  /** Out-of-bounds radius. */
  radius: number;
  /** Storm-safe land radius (final circles stay inside). */
  landRadius: number;
  /** Top-down map image (PNG data URL) covering [-MAP_HALF, MAP_HALF] on both axes. */
  minimap: string;
  mapHalf: number;
  update: (dt: number, time: number) => void;
  dispose: () => void;
  /** Drivable cars (empty when the car models are unavailable; then cars are static props). */
  vehicles: VehicleSpawn[];
};

export const MAP_HALF = 360;

/**
 * Extra build data kept for exporting the island to other engines (the Unity port bakes it from here):
 * which instanced props belong to each harvestable, and the door leaves.
 */
export const islandBake: {
  harvestParts: Map<Harvestable, [{ mesh: THREE.InstancedMesh | null }, number][]>;
  doors: { leaves: { hx: number; hz: number; yaw: number; w: number; swing: number }[]; y: number; h: number; box: StaticBox; cx: number; cz: number; color: string }[];
} = { harvestParts: new Map(), doors: [] };
const SEA = 0;
const QX = 122;
const QZ = 56;
const WADE = -0.85;

function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function smooth(a: number, b: number, t: number) {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}

/* ------------------------------------------------------------------ textures */

function tex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  if (g) draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function noise(g: CanvasRenderingContext2D, s: number, n: number, a: number, seed: number) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const v = Math.floor(r() * 255);
    g.fillStyle = `rgba(${v},${v},${v},${a})`;
    g.fillRect(r() * s, r() * s, 1 + r() * 3, 1 + r() * 3);
  }
}

type MatKey =
  | "siding"
  | "shingle"
  | "brick"
  | "concrete"
  | "plank"
  | "metal"
  | "log"
  | "glass"
  | "plain"
  | "glow"
  | "stone"
  | "wallpaper"
  | "wallpaper2"
  | "leaf"
  // interior furniture (scale 0 = texture fitted to each face of the box)
  | "fabric"
  | "wood"
  | "tile"
  | "hay"
  | "books"
  | "quilt"
  | "rug"
  | "cabinet"
  | "drawers"
  | "screen"
  | "painting"
  | "painting2"
  | "fridge"
  | "oven"
  | "products";

const TEX_SCALE: Record<MatKey, number> = {
  siding: 2.4,
  shingle: 2,
  brick: 2.2,
  concrete: 4,
  plank: 2.4,
  metal: 2.4,
  log: 2.2,
  glass: 1,
  plain: 1,
  glow: 1,
  stone: 2.6,
  wallpaper: 2,
  wallpaper2: 1.4,
  leaf: 1.6,
  fabric: 0.7,
  wood: 1.4,
  tile: 0.9,
  hay: 1.2,
  books: 0,
  quilt: 0,
  rug: 0,
  cabinet: 0,
  drawers: 0,
  screen: 0,
  painting: 0,
  painting2: 0,
  fridge: 0,
  oven: 0,
  products: 0,
};

function makeMaterials() {
  // lap siding: chunky boards with a lit lip and a shadow line, like Fortnite's houses
  const siding = tex(256, (g, s) => {
    g.fillStyle = "#ececec";
    g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 32) {
      const gr = g.createLinearGradient(0, y, 0, y + 32);
      gr.addColorStop(0, "#ffffff");
      gr.addColorStop(0.18, "#f4f4f4");
      gr.addColorStop(0.85, "#dcdcdc");
      gr.addColorStop(1, "#bdbdbd");
      g.fillStyle = gr;
      g.fillRect(0, y, s, 32);
      g.fillStyle = "rgba(0,0,0,0.32)";
      g.fillRect(0, y + 29, s, 3);
      const r = rng(y + 3);
      g.fillStyle = "rgba(0,0,0,0.12)";
      for (let k = 0; k < 2; k++) g.fillRect(Math.floor(r() * s), y + 2, 2, 27);
    }
    noise(g, s, 900, 0.05, 3);
  });
  // shingles: overlapping rounded tabs with tone variation
  const shingle = tex(256, (g, s) => {
    g.fillStyle = "#9a9a9a";
    g.fillRect(0, 0, s, s);
    for (let row = 0; row < 9; row++) {
      const off = row % 2 ? 16 : 0;
      for (let x = -32; x < s + 32; x += 32) {
        const r = rng(row * 31 + x + 7)();
        const v = 190 + Math.floor(r * 65);
        g.fillStyle = `rgb(${v},${v},${v})`;
        const y = row * 30 - 4;
        g.beginPath();
        g.moveTo(x + off + 1, y);
        g.lineTo(x + off + 31, y);
        g.lineTo(x + off + 31, y + 26);
        g.quadraticCurveTo(x + off + 16, y + 34, x + off + 1, y + 26);
        g.closePath();
        g.fill();
        g.fillStyle = "rgba(0,0,0,0.28)";
        g.fillRect(x + off + 1, y + 26, 30, 3);
      }
    }
  });
  const stone = tex(256, (g, s) => {
    g.fillStyle = "#8d877e";
    g.fillRect(0, 0, s, s);
    const r = rng(41);
    for (let row = 0; row < 7; row++) {
      let x = row % 2 ? -18 : 0;
      const y = row * 37;
      while (x < s) {
        const w = 34 + r() * 30;
        const v = 175 + Math.floor(r() * 70);
        g.fillStyle = `rgb(${v},${v - 6},${v - 14})`;
        g.beginPath();
        g.roundRect(x + 3, y + 3, w - 6, 31, 9);
        g.fill();
        g.fillStyle = "rgba(255,255,255,0.18)";
        g.fillRect(x + 8, y + 6, w - 18, 4);
        x += w;
      }
    }
    noise(g, s, 1500, 0.08, 42);
  });
  const wallpaper = tex(256, (g, s) => {
    g.fillStyle = "#f4f1ea";
    g.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 32) {
      g.fillStyle = "rgba(0,0,0,0.06)";
      g.fillRect(x, 0, 12, s);
    }
    g.fillStyle = "rgba(255,255,255,0.5)";
    for (let y = 16; y < s; y += 48) for (let x = 22; x < s; x += 32) g.fillRect(x, y, 4, 4);
  });
  const leaf = tex(256, (g, s) => {
    g.fillStyle = "#cfcfcf";
    g.fillRect(0, 0, s, s);
    const r = rng(17);
    for (let i = 0; i < 900; i++) {
      const v = 150 + Math.floor(r() * 105);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.beginPath();
      g.ellipse(r() * s, r() * s, 4 + r() * 6, 2.5 + r() * 3, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
  });
  const brick = tex(256, (g, s) => {
    g.fillStyle = "#b9b0a8";
    g.fillRect(0, 0, s, s);
    for (let row = 0; row < 8; row++) {
      const off = row % 2 ? -32 : 0;
      for (let x = off; x < s; x += 64) {
        const v = 200 + Math.floor(rng(row * 17 + x + 99)() * 55);
        g.fillStyle = `rgb(${v},${Math.floor(v * 0.92)},${Math.floor(v * 0.88)})`;
        g.fillRect(x + 3, row * 32 + 3, 58, 26);
      }
    }
  });
  const concrete = tex(256, (g, s) => {
    g.fillStyle = "#dcdcdc";
    g.fillRect(0, 0, s, s);
    noise(g, s, 4000, 0.08, 11);
    g.strokeStyle = "rgba(0,0,0,0.12)";
    g.lineWidth = 2;
    g.strokeRect(1, 1, s - 2, s - 2);
  });
  const plank = tex(256, (g, s) => {
    g.fillStyle = "#e6e6e6";
    g.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 32) {
      const v = 205 + Math.floor(rng(x + 5)() * 50);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x + 2, 0, 28, s);
      g.fillStyle = "rgba(0,0,0,0.12)";
      for (let k = 0; k < 3; k++) g.fillRect(x + 6 + k * 8, 0, 1, s);
      g.fillStyle = "rgba(0,0,0,0.35)";
      g.fillRect(x, 0, 2, s);
    }
  });
  const metal = tex(256, (g, s) => {
    for (let x = 0; x < s; x += 32) {
      const gr = g.createLinearGradient(x, 0, x + 32, 0);
      gr.addColorStop(0, "#9a9a9a");
      gr.addColorStop(0.4, "#f4f4f4");
      gr.addColorStop(0.6, "#d0d0d0");
      gr.addColorStop(1, "#8c8c8c");
      g.fillStyle = gr;
      g.fillRect(x, 0, 32, s);
    }
    noise(g, s, 600, 0.06, 23);
  });
  const log = tex(256, (g, s) => {
    for (let y = 0; y < s; y += 32) {
      const gr = g.createLinearGradient(0, y, 0, y + 32);
      gr.addColorStop(0, "#c8c8c8");
      gr.addColorStop(0.5, "#ffffff");
      gr.addColorStop(1, "#8f8f8f");
      g.fillStyle = gr;
      g.fillRect(0, y, s, 32);
    }
    noise(g, s, 900, 0.07, 31);
  });
  /* ---------- interior textures ---------- */
  const wallpaper2 = tex(256, (g, s) => {
    g.fillStyle = "#f5efe2";
    g.fillRect(0, 0, s, s);
    // diamond trellis with little flowers
    g.strokeStyle = "rgba(120,100,70,0.16)";
    g.lineWidth = 3;
    for (let i = -s; i < s * 2; i += 64) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + s, s);
      g.moveTo(i + s, 0);
      g.lineTo(i, s);
      g.stroke();
    }
    for (let y = 0; y < s; y += 64)
      for (let x = 0; x < s; x += 64) {
        g.fillStyle = "rgba(200,90,90,0.35)";
        for (let k = 0; k < 4; k++) {
          g.beginPath();
          g.arc(x + 32 + Math.cos((k * Math.PI) / 2) * 5, y + 32 + Math.sin((k * Math.PI) / 2) * 5, 4.5, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = "rgba(240,200,90,0.8)";
        g.beginPath();
        g.arc(x + 32, y + 32, 3, 0, Math.PI * 2);
        g.fill();
      }
  });
  const fabric = tex(128, (g, s) => {
    g.fillStyle = "#e8e8e8";
    g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 4) {
      g.fillStyle = y % 8 ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.35)";
      g.fillRect(0, y, s, 2);
    }
    for (let x = 0; x < s; x += 4) {
      g.fillStyle = "rgba(0,0,0,0.04)";
      g.fillRect(x, 0, 2, s);
    }
    noise(g, s, 400, 0.05, 61);
  });
  const wood = tex(256, (g, s) => {
    g.fillStyle = "#e9c99c";
    g.fillRect(0, 0, s, s);
    const r = rng(77);
    for (let i = 0; i < 70; i++) {
      const y = r() * s;
      g.strokeStyle = `rgba(120,70,30,${0.08 + r() * 0.14})`;
      g.lineWidth = 1 + r() * 2.5;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= s; x += 32) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 3);
      g.stroke();
    }
  });
  const tile = tex(128, (g, s) => {
    const h = s / 2;
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 2; x++) {
        g.fillStyle = (x + y) % 2 ? "#3d4a5c" : "#f2f0ea";
        g.fillRect(x * h, y * h, h, h);
      }
    g.strokeStyle = "rgba(0,0,0,0.18)";
    g.lineWidth = 2;
    g.strokeRect(1, 1, s - 2, s - 2);
    g.beginPath();
    g.moveTo(h, 0);
    g.lineTo(h, s);
    g.moveTo(0, h);
    g.lineTo(s, h);
    g.stroke();
  });
  const hay = tex(128, (g, s) => {
    g.fillStyle = "#e6c25a";
    g.fillRect(0, 0, s, s);
    const r = rng(19);
    for (let i = 0; i < 400; i++) {
      g.strokeStyle = r() > 0.5 ? "rgba(255,240,170,0.6)" : "rgba(150,110,30,0.4)";
      g.lineWidth = 1;
      const x = r() * s;
      const y = r() * s;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 18, y + (r() - 0.5) * 6);
      g.stroke();
    }
  });
  const books = tex(256, (g, s) => {
    g.fillStyle = "#3a2618";
    g.fillRect(0, 0, s, s);
    const r = rng(5);
    const cols = ["#c0392b", "#2e86c1", "#27ae60", "#f1c40f", "#8e44ad", "#e67e22", "#16a085", "#ecf0f1", "#34495e", "#d35400"];
    let x = 4;
    while (x < s - 8) {
      const w = 10 + Math.floor(r() * 16);
      const h = s * (0.62 + r() * 0.34);
      const c = cols[Math.floor(r() * cols.length)]!;
      if (r() < 0.12) {
        // a leaning book
        g.save();
        g.translate(x + w, s);
        g.rotate(-0.25);
        g.fillStyle = c;
        g.fillRect(-w, -h, w, h);
        g.restore();
        x += w + 14;
        continue;
      }
      g.fillStyle = c;
      g.fillRect(x, s - h, w, h);
      g.fillStyle = "rgba(255,255,255,0.35)";
      g.fillRect(x + 2, s - h + 10, w - 4, 3);
      g.fillRect(x + 2, s - 18, w - 4, 3);
      g.fillStyle = "rgba(0,0,0,0.25)";
      g.fillRect(x + w - 2, s - h, 2, h);
      x += w + 1;
    }
  });
  const quilt = tex(256, (g, s) => {
    const cols = ["#f4d35e", "#ee964b", "#7fc8a9", "#5f97d6", "#f2f2f2", "#e56b6f"];
    const n = 6;
    const c = s / n;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        g.fillStyle = cols[(x * 3 + y * 5) % cols.length]!;
        g.fillRect(x * c, y * c, c, c);
        if ((x + y) % 2) {
          g.fillStyle = "rgba(255,255,255,0.45)";
          g.beginPath();
          g.moveTo(x * c + c / 2, y * c + 6);
          g.lineTo(x * c + c - 6, y * c + c / 2);
          g.lineTo(x * c + c / 2, y * c + c - 6);
          g.lineTo(x * c + 6, y * c + c / 2);
          g.fill();
        }
      }
    g.strokeStyle = "rgba(255,255,255,0.7)";
    g.setLineDash([5, 4]);
    g.lineWidth = 2;
    for (let i = 1; i < n; i++) {
      g.beginPath();
      g.moveTo(i * c, 0);
      g.lineTo(i * c, s);
      g.moveTo(0, i * c);
      g.lineTo(s, i * c);
      g.stroke();
    }
  });
  const rug = tex(256, (g, s) => {
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, s, s);
    g.fillStyle = "rgba(0,0,0,0.28)";
    g.fillRect(10, 10, s - 20, s - 20);
    g.fillStyle = "#ffffff";
    g.fillRect(22, 22, s - 44, s - 44);
    g.fillStyle = "rgba(0,0,0,0.12)";
    g.fillRect(32, 32, s - 64, s - 64);
    g.fillStyle = "rgba(255,255,255,0.9)";
    g.beginPath();
    g.ellipse(s / 2, s / 2, s * 0.26, s * 0.2, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(0,0,0,0.3)";
    g.beginPath();
    g.ellipse(s / 2, s / 2, s * 0.12, s * 0.09, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(0,0,0,0.2)";
    for (let i = 0; i < 12; i++) {
      g.fillRect(14 + i * ((s - 28) / 12), 4, 4, 6);
      g.fillRect(14 + i * ((s - 28) / 12), s - 10, 4, 6);
    }
  });
  const cabinet = tex(128, (g, s) => {
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, s, s);
    for (const x0 of [4, s / 2 + 2]) {
      g.fillStyle = "rgba(0,0,0,0.12)";
      g.fillRect(x0, 4, s / 2 - 6, s - 8);
      g.fillStyle = "#ffffff";
      g.fillRect(x0 + 8, 12, s / 2 - 22, s - 24);
      g.fillStyle = "rgba(0,0,0,0.06)";
      g.fillRect(x0 + 8, 12, s / 2 - 22, 4);
    }
    g.fillStyle = "#b8b8b8";
    g.fillRect(s / 2 - 12, s * 0.42, 5, 18);
    g.fillRect(s / 2 + 7, s * 0.42, 5, 18);
  });
  const drawers = tex(128, (g, s) => {
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 3; i++) {
      const y = 6 + i * ((s - 12) / 3);
      const h = (s - 12) / 3 - 6;
      g.fillStyle = "rgba(0,0,0,0.14)";
      g.fillRect(6, y, s - 12, h);
      g.fillStyle = "#ffffff";
      g.fillRect(10, y + 4, s - 20, h - 8);
      g.fillStyle = "#c9a24a";
      g.beginPath();
      g.arc(s / 2, y + h / 2, 5, 0, Math.PI * 2);
      g.fill();
    }
  });
  const screen = tex(256, (g, s) => {
    const sky = g.createLinearGradient(0, 0, 0, s);
    sky.addColorStop(0, "#3aa7ff");
    sky.addColorStop(0.62, "#b8e6ff");
    sky.addColorStop(0.62, "#5cc46a");
    sky.addColorStop(1, "#2f8f45");
    g.fillStyle = sky;
    g.fillRect(0, 0, s, s);
    g.fillStyle = "#ffe36b";
    g.beginPath();
    g.arc(s * 0.76, s * 0.22, s * 0.09, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#ffffff";
    for (const [x, y, r] of [
      [0.25, 0.2, 0.07],
      [0.33, 0.18, 0.09],
      [0.41, 0.21, 0.06],
    ])
      g.beginPath(), g.arc(s * x, s * y, s * r, 0, Math.PI * 2), g.fill();
    // a little cartoon llama-free hero: a blue blob with eyes
    g.fillStyle = "#6a5acd";
    g.beginPath();
    g.ellipse(s * 0.45, s * 0.62, s * 0.11, s * 0.14, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.arc(s * 0.42, s * 0.56, s * 0.03, 0, Math.PI * 2);
    g.arc(s * 0.49, s * 0.56, s * 0.03, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.18)";
    g.fillRect(0, 0, s, s * 0.08);
    g.fillStyle = "#111111";
    g.lineWidth = 10;
    g.strokeStyle = "#111";
    g.strokeRect(0, 0, s, s);
  });
  const paintingTex = (variant: number) =>
    tex(256, (g, s) => {
      g.fillStyle = "#6b4a2b";
      g.fillRect(0, 0, s, s);
      g.fillStyle = "#e9d8a6";
      g.fillRect(14, 14, s - 28, s - 28);
      const x0 = 26;
      const w = s - 52;
      const sky = g.createLinearGradient(0, x0, 0, x0 + w);
      if (variant === 0) {
        sky.addColorStop(0, "#ffb36b");
        sky.addColorStop(0.55, "#ff7b6b");
        sky.addColorStop(0.56, "#3b6fb6");
        sky.addColorStop(1, "#1e3f73");
      } else {
        sky.addColorStop(0, "#8fd3ff");
        sky.addColorStop(0.6, "#e5f6ff");
        sky.addColorStop(0.61, "#6abf69");
        sky.addColorStop(1, "#3b8c45");
      }
      g.fillStyle = sky;
      g.fillRect(x0, x0, w, w);
      if (variant === 0) {
        g.fillStyle = "#ffe08a";
        g.beginPath();
        g.arc(s / 2, x0 + w * 0.55, w * 0.16, Math.PI, 0);
        g.fill();
        g.fillStyle = "#2a1d2e";
        g.beginPath();
        g.moveTo(x0, x0 + w * 0.75);
        g.lineTo(x0 + w * 0.3, x0 + w * 0.68);
        g.lineTo(x0 + w * 0.3, x0 + w);
        g.lineTo(x0, x0 + w);
        g.fill();
      } else {
        g.fillStyle = "#7d8fa3";
        g.beginPath();
        g.moveTo(x0, x0 + w * 0.61);
        g.lineTo(x0 + w * 0.35, x0 + w * 0.22);
        g.lineTo(x0 + w * 0.6, x0 + w * 0.61);
        g.fill();
        g.fillStyle = "#ffffff";
        g.beginPath();
        g.moveTo(x0 + w * 0.27, x0 + w * 0.31);
        g.lineTo(x0 + w * 0.35, x0 + w * 0.22);
        g.lineTo(x0 + w * 0.43, x0 + w * 0.31);
        g.fill();
        g.fillStyle = "#2f7d3a";
        for (const tx of [0.68, 0.78, 0.88]) {
          g.beginPath();
          g.moveTo(x0 + w * tx, x0 + w * 0.42);
          g.lineTo(x0 + w * (tx + 0.06), x0 + w * 0.66);
          g.lineTo(x0 + w * (tx - 0.06), x0 + w * 0.66);
          g.fill();
        }
      }
    });
  const fridge = tex(128, (g, s) => {
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, s, s);
    g.fillStyle = "rgba(0,0,0,0.18)";
    g.fillRect(0, s * 0.34, s, 3);
    g.fillStyle = "#9aa3ad";
    g.fillRect(s * 0.12, s * 0.12, 6, s * 0.16);
    g.fillRect(s * 0.12, s * 0.42, 6, s * 0.3);
    g.fillStyle = "#f6c544";
    g.beginPath();
    g.arc(s * 0.62, s * 0.55, 6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#e56b6f";
    g.fillRect(s * 0.66, s * 0.6, 14, 18);
  });
  const oven = tex(128, (g, s) => {
    g.fillStyle = "#f2f2f2";
    g.fillRect(0, 0, s, s);
    g.fillStyle = "#30363d";
    g.fillRect(0, 0, s, s * 0.18);
    g.fillStyle = "#c9ced4";
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.arc(s * (0.2 + i * 0.2), s * 0.09, 6, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = "#262b31";
    g.fillRect(s * 0.12, s * 0.3, s * 0.76, s * 0.5);
    g.fillStyle = "rgba(255,170,80,0.35)";
    g.fillRect(s * 0.18, s * 0.36, s * 0.64, s * 0.38);
    g.fillStyle = "#9aa3ad";
    g.fillRect(s * 0.15, s * 0.24, s * 0.7, 5);
  });
  const products = tex(256, (g, s) => {
    g.fillStyle = "#d9dde2";
    g.fillRect(0, 0, s, s);
    const r = rng(13);
    const cols = ["#e74c3c", "#3498db", "#f1c40f", "#2ecc71", "#9b59b6", "#e67e22", "#1abc9c", "#ffffff"];
    for (let row = 0; row < 4; row++) {
      const y1 = (row + 1) * (s / 4) - 6;
      g.fillStyle = "#8a9099";
      g.fillRect(0, y1, s, 6);
      let x = 3;
      while (x < s - 10) {
        const w = 12 + Math.floor(r() * 16);
        const h = s / 4 - 14 - Math.floor(r() * 14);
        const c = cols[Math.floor(r() * cols.length)]!;
        if (r() < 0.4) {
          // cans
          g.fillStyle = c;
          g.fillRect(x, y1 - h * 0.6, w * 0.8, h * 0.6);
          g.fillStyle = "rgba(255,255,255,0.5)";
          g.fillRect(x, y1 - h * 0.45, w * 0.8, 4);
        } else {
          g.fillStyle = c;
          g.fillRect(x, y1 - h, w, h);
          g.fillStyle = "rgba(255,255,255,0.55)";
          g.fillRect(x + 3, y1 - h * 0.7, w - 6, h * 0.25);
        }
        x += w + 3;
      }
    }
  });
  const mk = (map: THREE.Texture | null, extra: Partial<THREE.MeshLambertMaterialParameters> = {}) =>
    new THREE.MeshLambertMaterial({ map, vertexColors: true, ...extra });
  const mats: Record<MatKey, THREE.MeshLambertMaterial> = {
    siding: mk(siding),
    shingle: mk(shingle),
    brick: mk(brick),
    concrete: mk(concrete),
    plank: mk(plank),
    metal: mk(metal),
    log: mk(log),
    glass: mk(null, { emissive: new THREE.Color("#1d3550") }),
    plain: mk(null),
    glow: mk(null, { emissive: new THREE.Color("#fff1b0"), emissiveIntensity: 0.9 }),
    stone: mk(stone),
    wallpaper: mk(wallpaper),
    wallpaper2: mk(wallpaper2),
    leaf: mk(leaf),
    fabric: mk(fabric),
    wood: mk(wood),
    tile: mk(tile),
    hay: mk(hay),
    books: mk(books),
    quilt: mk(quilt),
    rug: mk(rug),
    cabinet: mk(cabinet),
    drawers: mk(drawers),
    screen: mk(screen, { emissive: new THREE.Color("#ffffff"), emissiveMap: screen, emissiveIntensity: 0.55 }),
    painting: mk(paintingTex(0)),
    painting2: mk(paintingTex(1)),
    fridge: mk(fridge),
    oven: mk(oven),
    products: mk(products),
  };
  return mats;
}

/* ------------------------------------------------------------------ geometry kit */

type Buf = { p: number[]; n: number[]; u: number[]; c: number[] };
type Collide = false | true | BuildMat;
type Up = "+x" | "-x" | "+z" | "-z";

/**
 * Collects merged geometry in a local frame (origin + 90° rotation steps), so buildings
 * can be authored once in local coordinates and dropped anywhere.
 */
class Kit {
  bufs = new Map<string, Map<MatKey, Buf>>();
  group = "world";
  boxes: StaticBox[] = [];
  ramps: StaticRamp[] = [];
  loot: LootSpot[] = [];
  containerSpots: LootSpot[] = [];
  glass: StaticBox[] = [];
  doors: { leaves: { hx: number; hz: number; yaw: number; w: number; swing: number }[]; y: number; h: number; box: StaticBox; cx: number; cz: number; color: string }[] = [];
  /** World y of the floor of the building being authored; vertical faces darken toward it (cheap baked AO). */
  aoFloor: number | null = null;
  ox = 0;
  oy = 0;
  oz = 0;
  r = 0;
  private col = new THREE.Color();

  at(x: number, y: number, z: number, r = 0) {
    this.ox = x;
    this.oy = y;
    this.oz = z;
    this.r = ((r % 4) + 4) % 4;
    return this;
  }

  /** local (x, z) -> world (x, z) */
  w(lx: number, lz: number): [number, number] {
    switch (this.r) {
      case 1:
        return [this.ox + lz, this.oz - lx];
      case 2:
        return [this.ox - lx, this.oz - lz];
      case 3:
        return [this.ox - lz, this.oz + lx];
      default:
        return [this.ox + lx, this.oz + lz];
    }
  }

  private buf(m: MatKey) {
    let g = this.bufs.get(this.group);
    if (!g) {
      g = new Map();
      this.bufs.set(this.group, g);
    }
    let b = g.get(m);
    if (!b) {
      b = { p: [], n: [], u: [], c: [] };
      g.set(m, b);
    }
    return b;
  }

  /** One flat quad in world space; winding is fixed up to face `nrm`. */
  quadW(m: MatKey, a: number[], b: number[], c: number[], d: number[], nrm: number[], uv: number[][], color: string) {
    const buf = this.buf(m);
    const ux = b[0]! - a[0]!;
    const uy = b[1]! - a[1]!;
    const uz = b[2]! - a[2]!;
    const vx = c[0]! - a[0]!;
    const vy = c[1]! - a[1]!;
    const vz = c[2]! - a[2]!;
    const cx = uy * vz - uz * vy;
    const cy = uz * vx - ux * vz;
    const cz = ux * vy - uy * vx;
    let pts = [a, b, c, d];
    let uvs = uv;
    if (cx * nrm[0]! + cy * nrm[1]! + cz * nrm[2]! < 0) {
      pts = [a, d, c, b];
      uvs = [uv[0]!, uv[3]!, uv[2]!, uv[1]!];
    }
    this.col.set(color);
    const order = [0, 1, 2, 0, 2, 3];
    const ao = this.aoFloor !== null && Math.abs(nrm[1]!) < 0.5 ? this.aoFloor : null;
    for (const i of order) {
      const p = pts[i]!;
      const k = ao === null ? 1 : 0.7 + 0.3 * smooth(ao - 0.2, ao + 1.7, p[1]!);
      buf.p.push(p[0]!, p[1]!, p[2]!);
      buf.n.push(nrm[0]!, nrm[1]!, nrm[2]!);
      buf.u.push(uvs[i]![0]!, uvs[i]![1]!);
      buf.c.push(this.col.r * k, this.col.g * k, this.col.b * k);
    }
  }

  triW(m: MatKey, a: number[], b: number[], c: number[], nrm: number[], uv: number[][], color: string) {
    const buf = this.buf(m);
    const ux = b[0]! - a[0]!;
    const uy = b[1]! - a[1]!;
    const uz = b[2]! - a[2]!;
    const vx = c[0]! - a[0]!;
    const vy = c[1]! - a[1]!;
    const vz = c[2]! - a[2]!;
    const flip = (uy * vz - uz * vy) * nrm[0]! + (uz * vx - ux * vz) * nrm[1]! + (ux * vy - uy * vx) * nrm[2]! < 0;
    const pts = flip ? [a, c, b] : [a, b, c];
    const uvs = flip ? [uv[0]!, uv[2]!, uv[1]!] : uv;
    this.col.set(color);
    for (let i = 0; i < 3; i++) {
      buf.p.push(pts[i]![0]!, pts[i]![1]!, pts[i]![2]!);
      buf.n.push(nrm[0]!, nrm[1]!, nrm[2]!);
      buf.u.push(uvs[i]![0]!, uvs[i]![1]!);
      buf.c.push(this.col.r, this.col.g, this.col.b);
    }
  }

  /** Axis-aligned box from local corners (y relative to the frame origin). */
  box(lx0: number, ly0: number, lz0: number, lx1: number, ly1: number, lz1: number, m: MatKey, color: string, collide: Collide = true) {
    const [ax, az] = this.w(lx0, lz0);
    const [bx, bz] = this.w(lx1, lz1);
    return this.boxW(Math.min(ax, bx), this.oy + Math.min(ly0, ly1), Math.min(az, bz), Math.max(ax, bx), this.oy + Math.max(ly0, ly1), Math.max(az, bz), m, color, collide);
  }

  boxW(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, m: MatKey, color: string, collide: Collide = true, faces = 0b111111) {
    const s = TEX_SCALE[m];
    if (s === 0) {
      // fitted: each face shows the whole texture once (pictures, screens, book rows, cabinet fronts)
      const fx = (v: number) => (v - x0) / Math.max(1e-4, x1 - x0);
      const fy = (v: number) => (v - y0) / Math.max(1e-4, y1 - y0);
      const fz = (v: number) => (v - z0) / Math.max(1e-4, z1 - z0);
      if (faces & 1) this.quadW(m, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], color);
      if (faces & 2) this.quadW(m, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], color);
      if (faces & 4) this.quadW(m, [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], [[fx(x0), 1 - fz(z0)], [fx(x1), 1 - fz(z0)], [fx(x1), 1 - fz(z1)], [fx(x0), 1 - fz(z1)]], color);
      if (faces & 8) this.quadW(m, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], color);
      if (faces & 16) this.quadW(m, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [[0, 0], [1, 0], [1, 1], [0, 1]], color);
      if (faces & 32) this.quadW(m, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [[0, 0], [1, 0], [1, 1], [0, 1]], color);
      void fy;
      if (collide === false) return null;
      const b: StaticBox = { minX: x0, minY: y0, minZ: z0, maxX: x1, maxY: y1, maxZ: z1, mat: collide === true ? null : collide };
      this.boxes.push(b);
      return b;
    }
    const U = (a: number, b: number) => [a / s, b / s];
    // +x / -x
    if (faces & 1) this.quadW(m, [x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0], [U(z0, y0), U(z1, y0), U(z1, y1), U(z0, y1)], color);
    if (faces & 2) this.quadW(m, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [U(z0, y0), U(z1, y0), U(z1, y1), U(z0, y1)], color);
    // +y / -y
    if (faces & 4) this.quadW(m, [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], [U(x0, z0), U(x1, z0), U(x1, z1), U(x0, z1)], color);
    if (faces & 8) this.quadW(m, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [U(x0, z0), U(x1, z0), U(x1, z1), U(x0, z1)], color);
    // +z / -z
    if (faces & 16) this.quadW(m, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [U(x0, y0), U(x1, y0), U(x1, y1), U(x0, y1)], color);
    if (faces & 32) this.quadW(m, [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1], [U(x0, y0), U(x1, y0), U(x1, y1), U(x0, y1)], color);
    if (collide === false) return null;
    const b: StaticBox = { minX: x0, minY: y0, minZ: z0, maxX: x1, maxY: y1, maxZ: z1, mat: collide === true ? null : collide };
    this.boxes.push(b);
    return b;
  }

  /** Vertical cylinder (flat-shaded, low poly). */
  cyl(lx: number, ly: number, lz: number, r: number, h: number, seg: number, m: MatKey, color: string, collide: Collide = true, cap = true, r2 = r) {
    const [x, z] = this.w(lx, lz);
    const y0 = this.oy + ly;
    const y1 = y0 + h;
    const s = TEX_SCALE[m];
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const am = (a0 + a1) / 2;
      const p0 = [x + Math.cos(a0) * r, y0, z + Math.sin(a0) * r];
      const p1 = [x + Math.cos(a1) * r, y0, z + Math.sin(a1) * r];
      const p2 = [x + Math.cos(a1) * r2, y1, z + Math.sin(a1) * r2];
      const p3 = [x + Math.cos(a0) * r2, y1, z + Math.sin(a0) * r2];
      const u0 = (a0 * r) / s;
      const u1 = (a1 * r) / s;
      this.quadW(m, p0, p1, p2, p3, [Math.cos(am), (r - r2) / Math.max(0.01, h), Math.sin(am)], [[u0, y0 / s], [u1, y0 / s], [u1, y1 / s], [u0, y1 / s]], color);
      if (cap) this.triW(m, [x, y1, z], p3, p2, [0, 1, 0], [[0.5, 0.5], [0, 0], [1, 0]], color);
    }
    if (collide === false) return null;
    const rr = Math.max(r, r2) * 0.85;
    const b: StaticBox = { minX: x - rr, minY: y0, minZ: z - rr, maxX: x + rr, maxY: y1, maxZ: z + rr, mat: collide === true ? null : collide };
    this.boxes.push(b);
    return b;
  }

  /** Sloped surface collider in local coordinates, rising toward `up`. */
  ramp(lx0: number, lz0: number, lx1: number, lz1: number, yLow: number, yHigh: number, up: Up) {
    const [ax, az] = this.w(lx0, lz0);
    const [bx, bz] = this.w(lx1, lz1);
    const v = up === "+x" ? [1, 0] : up === "-x" ? [-1, 0] : up === "+z" ? [0, 1] : [0, -1];
    const [wx, wz] = this.w(v[0]!, v[1]!);
    const dx = wx - this.ox;
    const dz = wz - this.oz;
    this.ramps.push({
      minX: Math.min(ax, bx),
      maxX: Math.max(ax, bx),
      minZ: Math.min(az, bz),
      maxZ: Math.max(az, bz),
      axis: Math.abs(dx) > 0.5 ? "x" : "z",
      dir: (Math.abs(dx) > 0.5 ? dx : dz) > 0 ? 1 : -1,
      y0: this.oy + yLow,
      y1: this.oy + yHigh,
    });
  }

  /** Visible stair steps plus the ramp collider that players actually walk on. */
  stairs(lx0: number, lz0: number, lx1: number, lz1: number, yLow: number, yHigh: number, up: Up, color: string, m: MatKey = "plank") {
    const steps = Math.max(4, Math.round((yHigh - yLow) / 0.32));
    const alongX = up === "+x" || up === "-x";
    const a0 = alongX ? lx0 : lz0;
    const a1 = alongX ? lx1 : lz1;
    const forward = up === "+x" || up === "+z";
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const s0 = forward ? a0 + (a1 - a0) * t0 : a1 - (a1 - a0) * t1;
      const s1 = forward ? a0 + (a1 - a0) * t1 : a1 - (a1 - a0) * t0;
      const top = yLow + (yHigh - yLow) * ((i + 0.5) / steps);
      if (alongX) this.box(s0, yLow, lz0, s1, top, lz1, m, color, false);
      else this.box(lx0, yLow, s0, lx1, top, s1, m, color, false);
    }
    this.ramp(lx0, lz0, lx1, lz1, yLow, yHigh, up);
  }

  /**
   * Gable roof over the local rectangle with its ridge along local x (or z), plus gable
   * end walls and ramp colliders for both slopes.
   */
  gable(x0: number, z0: number, x1: number, z1: number, yb: number, rise: number, ridgeZ: boolean, roofColor: string, wallMat: MatKey, wallColor: string, over = 0.5) {
    // work in (u along ridge, v across ridge) and map back to local x/z
    const L = (u: number, v: number): [number, number] => (ridgeZ ? [v, u] : [u, v]);
    const u0 = ridgeZ ? z0 : x0;
    const u1 = ridgeZ ? z1 : x1;
    const v0 = ridgeZ ? x0 : z0;
    const v1 = ridgeZ ? x1 : z1;
    const vm = (v0 + v1) / 2;
    const half = (v1 - v0) / 2;
    const slope = rise / half;
    const drop = over * slope;
    const P = (u: number, v: number, y: number) => {
      const [lx, lz] = L(u, v);
      const [x, z] = this.w(lx, lz);
      return [x, this.oy + y, z];
    };
    const s = TEX_SCALE.shingle;
    const run = Math.hypot(half + over, rise + drop);
    for (const side of [-1, 1]) {
      const ve = side < 0 ? v0 - over : v1 + over;
      const a = P(u0 - over, ve, yb - drop);
      const b = P(u1 + over, ve, yb - drop);
      const c = P(u1 + over, vm, yb + rise);
      const d = P(u0 - over, vm, yb + rise);
      // outward normal: up and toward this side
      const [nlx, nlz] = L(0, side);
      const [nwx, nwz] = this.w(nlx, nlz);
      const nx = (nwx - this.ox) * slope;
      const nz = (nwz - this.oz) * slope;
      const nl = Math.hypot(nx, 1, nz);
      const len = (u1 - u0 + over * 2) / s;
      const uv = [
        [0, 0],
        [len, 0],
        [len, run / s],
        [0, run / s],
      ];
      this.quadW("shingle", a, b, c, d, [nx / nl, 1 / nl, nz / nl], uv, roofColor);
      // underside (eaves seen from below)
      const dn = 0.18;
      this.quadW("plain", [a[0]!, a[1]! - dn, a[2]!], [b[0]!, b[1]! - dn, b[2]!], [c[0]!, c[1]! - dn, c[2]!], [d[0]!, d[1]! - dn, d[2]!], [-nx / nl, -1 / nl, -nz / nl], uv, "#5b4a3c");
      // slope collider
      const upDir = side < 0 ? (ridgeZ ? "+x" : "+z") : ridgeZ ? "-x" : "-z";
      const [rx0, rz0] = L(u0 - over, side < 0 ? v0 - over : vm);
      const [rx1, rz1] = L(u1 + over, side < 0 ? vm : v1 + over);
      this.ramp(rx0, rz0, rx1, rz1, yb - drop, yb + rise, upDir as Up);
    }
    // gable end triangles
    const ws = TEX_SCALE[wallMat];
    for (const u of [u0, u1]) {
      const a = P(u, v0, yb);
      const b = P(u, v1, yb);
      const c = P(u, vm, yb + rise);
      const [nlx, nlz] = L(u === u0 ? -1 : 1, 0);
      const [nwx, nwz] = this.w(nlx, nlz);
      this.triW(wallMat, a, b, c, [nwx - this.ox, 0, nwz - this.oz], [[v0 / ws, yb / ws], [v1 / ws, yb / ws], [vm / ws, (yb + rise) / ws]], wallColor);
    }
  }

  /** Set while authoring a building so its loot gets a bot route through the door (local coords). */
  route: { door: [number, number]; stairs?: [number, number, number, number, number]; floorY: number; hw: number; hd: number } | null = null;
  /** Interior skin used by wall(): plain stripes or the floral trellis. */
  inMat: MatKey = "wallpaper";

  /** Invisible collider (local corners). */
  solid(lx0: number, ly0: number, lz0: number, lx1: number, ly1: number, lz1: number, mat: BuildMat | null = "wood") {
    const [ax, az] = this.w(lx0, lz0);
    const [bx, bz] = this.w(lx1, lz1);
    this.boxes.push({ minX: Math.min(ax, bx), minY: this.oy + Math.min(ly0, ly1), minZ: Math.min(az, bz), maxX: Math.max(ax, bx), maxY: this.oy + Math.max(ly0, ly1), maxZ: Math.max(az, bz), mat });
  }

  /** See-through glass pane (local corners). Rendered later as one instanced, transparent mesh. */
  addGlass(lx0: number, ly0: number, lz0: number, lx1: number, ly1: number, lz1: number) {
    const [ax, az] = this.w(lx0, lz0);
    const [bx, bz] = this.w(lx1, lz1);
    const b: StaticBox = { minX: Math.min(ax, bx), minY: this.oy + Math.min(ly0, ly1), minZ: Math.min(az, bz), maxX: Math.max(ax, bx), maxY: this.oy + Math.max(ly0, ly1), maxZ: Math.max(az, bz), mat: null, glass: true, pane: this.glass.length };
    this.glass.push(b);
    this.boxes.push(b);
  }

  /**
   * Hinged door filling the local opening x0..x1 (in the wall plane z), bottom y. Wide openings get
   * double doors. Doors swing inward (toward local -z).
   */
  addDoor(x0: number, x1: number, z: number, y: number, h: number, zT: number, color: string) {
    const width = x1 - x0;
    const base = this.r * (Math.PI / 2);
    const leaves: { hx: number; hz: number; yaw: number; w: number; swing: number }[] = [];
    if (width > 2.2) {
      const [ax, az] = this.w(x0, z);
      const [bx, bz] = this.w(x1, z);
      leaves.push({ hx: ax, hz: az, yaw: base, w: width / 2, swing: 1 });
      leaves.push({ hx: bx, hz: bz, yaw: base + Math.PI, w: width / 2, swing: -1 });
    } else {
      const [ax, az] = this.w(x0, z);
      leaves.push({ hx: ax, hz: az, yaw: base, w: width, swing: 1 });
    }
    const [cx0, cz0] = this.w(x0, z - zT / 2);
    const [cx1, cz1] = this.w(x1, z + zT / 2);
    const box: StaticBox = { minX: Math.min(cx0, cx1), minY: this.oy + y, minZ: Math.min(cz0, cz1), maxX: Math.max(cx0, cx1), maxY: this.oy + y + h, maxZ: Math.max(cz0, cz1), mat: "wood", door: this.doors.length };
    this.boxes.push(box);
    const [cx, cz] = this.w((x0 + x1) / 2, z);
    this.doors.push({ leaves, y: this.oy + y, h, box, cx, cz, color });
  }

  /**
   * A wall with real openings. Runs along local x (alongX) from a0 to a1, occupying f0..f1 on the
   * other axis, from y0 to y1. `holes` are openings {a0, a1, y0, y1}. Builds an exterior skin
   * (ext material) on the `outer` side and an interior skin (wallpaper) on the inside, plus one
   * full-thickness collider per solid piece.
   */
  wall(alongX: boolean, a0: number, a1: number, f0: number, f1: number, y0: number, y1: number, holes: { a0: number; a1: number; y0: number; y1: number }[], outer: 1 | -1, ext: MatKey, extColor: string, inColor: string, harvest: BuildMat) {
    const cuts = new Set<number>([a0, a1]);
    for (const h of holes) {
      cuts.add(Math.max(a0, Math.min(a1, h.a0)));
      cuts.add(Math.max(a0, Math.min(a1, h.a1)));
    }
    // the wall breaks in panels about 3.5 m wide and one storey tall, not all at once
    const nA = Math.max(1, Math.round((a1 - a0) / 3.5));
    const nY = Math.max(1, Math.round((y1 - y0) / 3.4));
    const chunkA = (a1 - a0) / nA;
    const rowY = (y1 - y0) / nY;
    for (let i = 1; i < nA; i++) cuts.add(a0 + i * chunkA);
    const xs = [...cuts].sort((p, q) => p - q);
    const T = f1 - f0;
    const groups = new Map<number, WallGroup>();
    const groupAt = (a: number, y: number) => {
      const ci = Math.min(nA - 1, Math.max(0, Math.floor((a - a0) / chunkA)));
      const ri = Math.min(nY - 1, Math.max(0, Math.floor((y - y0) / rowY)));
      const key = ci * 64 + ri;
      let g = groups.get(key);
      if (!g) {
        const ca0 = a0 + ci * chunkA;
        const ca1 = ca0 + chunkA;
        const [gx0, gz0] = alongX ? this.w(ca0, f0) : this.w(f0, ca0);
        const [gx1, gz1] = alongX ? this.w(ca1, f1) : this.w(f1, ca1);
        g = { minX: Math.min(gx0, gx1), minY: this.oy + y0 + ri * rowY, minZ: Math.min(gz0, gz1), maxX: Math.max(gx0, gx1), maxY: this.oy + y0 + (ri + 1) * rowY, maxZ: Math.max(gz0, gz1), parts: [] };
        groups.set(key, g);
      }
      return g;
    };
    const split = outer > 0 ? f1 - T * 0.58 : f0 + T * 0.58;
    for (let i = 0; i < xs.length - 1; i++) {
      const p = xs[i]!;
      const q = xs[i + 1]!;
      if (q - p < 0.005) continue;
      const over = holes.filter((h) => h.a0 <= p + 1e-4 && h.a1 >= q - 1e-4).sort((m, n) => m.y0 - n.y0);
      let cur = y0;
      const segs: [number, number][] = [];
      for (const h of over) {
        if (h.y0 > cur + 0.005) segs.push([cur, h.y0]);
        cur = Math.max(cur, h.y1);
      }
      if (cur < y1 - 0.005) segs.push([cur, y1]);
      // split each solid run at the panel rows too, so every collider belongs to exactly one panel
      const runs: [number, number][] = [];
      for (const [r0, r1] of segs) {
        let lo = r0;
        for (let j = 1; j < nY; j++) {
          const yb = y0 + j * rowY;
          if (yb > lo + 0.005 && yb < r1 - 0.005) {
            runs.push([lo, yb]);
            lo = yb;
          }
        }
        runs.push([lo, r1]);
      }
      for (const [s0, s1] of runs) {
        const B = (ff0: number, ff1: number, m: MatKey, c: string, col: Collide) =>
          alongX ? this.box(p, s0, ff0, q, s1, ff1, m, c, col) : this.box(ff0, s0, p, ff1, s1, q, m, c, col);
        if (outer > 0) {
          B(split, f1, ext, extColor, false);
          B(f0, split, this.inMat, inColor, false);
        } else {
          B(f0, split, ext, extColor, false);
          B(split, f1, this.inMat, inColor, false);
        }
        const [ax, az] = alongX ? this.w(p, f0) : this.w(f0, p);
        const [bx, bz] = alongX ? this.w(q, f1) : this.w(f1, q);
        const group = groupAt((p + q) / 2, (s0 + s1) / 2);
        const part: StaticBox = { minX: Math.min(ax, bx), minY: this.oy + s0, minZ: Math.min(az, bz), maxX: Math.max(ax, bx), maxY: this.oy + s1, maxZ: Math.max(az, bz), mat: harvest, wall: group };
        group.parts.push(part);
        this.boxes.push(part);
      }
    }
  }

  /** Flat-shaded face with an automatic upward normal (roof slopes). */
  slope(m: MatKey, pts: number[][], color: string, down = false) {
    const a = pts[0]!;
    const b = pts[1]!;
    const c = pts[2]!;
    let nx = (b[1]! - a[1]!) * (c[2]! - a[2]!) - (b[2]! - a[2]!) * (c[1]! - a[1]!);
    let ny = (b[2]! - a[2]!) * (c[0]! - a[0]!) - (b[0]! - a[0]!) * (c[2]! - a[2]!);
    let nz = (b[0]! - a[0]!) * (c[1]! - a[1]!) - (b[1]! - a[1]!) * (c[0]! - a[0]!);
    if ((ny < 0) !== down) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    const l = Math.hypot(nx, ny, nz) || 1;
    const n = [nx / l, ny / l, nz / l];
    // planar UVs: along the eave and up the slope
    const hl = Math.hypot(n[0]!, n[2]!) || 1;
    const dx = n[0]! / hl;
    const dz = n[2]! / hl;
    const k = 1 / Math.max(0.2, Math.abs(n[1]!));
    const sc = TEX_SCALE[m];
    const uv = pts.map((p) => [(p[0]! * -dz + p[2]! * dx) / sc, ((p[0]! * dx + p[2]! * dz) * -k * Math.abs(n[1]!) + p[1]! * hl * k) / sc]);
    if (pts.length === 4) this.quadW(m, a, b, c, pts[3]!, n, uv, color);
    else this.triW(m, a, b, c, n, uv, color);
  }

  /** Fortnite-style hip roof: four slopes, thick fascia, dark underside; ramp colliders on the long slopes. */
  hip(x0: number, z0: number, x1: number, z1: number, yb: number, rise: number, color: string, over = 0.6, fascia = "#4a3a30") {
    const ridgeX = x1 - x0 >= z1 - z0;
    const ex0 = x0 - over;
    const ex1 = x1 + over;
    const ez0 = z0 - over;
    const ez1 = z1 + over;
    const half = (ridgeX ? ez1 - ez0 : ex1 - ex0) / 2;
    const drop = over * (rise / ((ridgeX ? z1 - z0 : x1 - x0) / 2));
    const ye = yb - drop;
    const yr = yb + rise;
    const P = (lx: number, y: number, lz: number) => {
      const [x, z] = this.w(lx, lz);
      return [x, this.oy + y, z];
    };
    const mz = (ez0 + ez1) / 2;
    const mx = (ex0 + ex1) / 2;
    const r0 = ridgeX ? Math.min(mx, ex0 + half) : Math.min(mz, ez0 + half);
    const r1 = ridgeX ? Math.max(mx, ex1 - half) : Math.max(mz, ez1 - half);
    const A = P(ex0, ye, ez0);
    const Bc = P(ex1, ye, ez0);
    const C = P(ex1, ye, ez1);
    const D = P(ex0, ye, ez1);
    const R0 = ridgeX ? P(r0, yr, mz) : P(mx, yr, r0);
    const R1 = ridgeX ? P(r1, yr, mz) : P(mx, yr, r1);
    const faces = ridgeX
      ? [
          [A, Bc, R1, R0],
          [C, D, R0, R1],
          [D, A, R0],
          [Bc, C, R1],
        ]
      : [
          [A, Bc, R0],
          [D, C, R1],
          [Bc, C, R1, R0],
          [D, A, R0, R1],
        ];
    for (const f of faces) {
      this.slope("shingle", f, color);
      this.slope("plain", f.map((p) => [p[0]!, p[1]! - 0.2, p[2]!]), "#5a4636", true);
    }
    // fascia boards around the eaves
    const t = 0.16;
    this.box(ex0, ye - 0.32, ez0 - t, ex1, ye, ez0, "plain", fascia, false);
    this.box(ex0, ye - 0.32, ez1, ex1, ye, ez1 + t, "plain", fascia, false);
    this.box(ex0 - t, ye - 0.32, ez0 - t, ex0, ye, ez1 + t, "plain", fascia, false);
    this.box(ex1, ye - 0.32, ez0 - t, ex1 + t, ye, ez1 + t, "plain", fascia, false);
    // walkable long slopes
    if (ridgeX) {
      this.ramp(ex0, ez0, ex1, mz, ye, yr, "+z");
      this.ramp(ex0, mz, ex1, ez1, ye, yr, "-z");
    } else {
      this.ramp(ex0, ez0, mx, ez1, ye, yr, "+x");
      this.ramp(mx, ez0, ex1, ez1, ye, yr, "-x");
    }
  }

  addLoot(kind: LootKind, lx: number, ly: number, lz: number, yaw = 0) {
    const [x, z] = this.w(lx, lz);
    const spot: LootSpot = { kind, x, y: this.oy + ly, z, yaw: yaw + this.r * (Math.PI / 2) };
    const rt = this.route;
    if (rt) {
      const P = (px: number, py: number, pz: number): [number, number, number] => {
        const [wx, wz] = this.w(px, pz);
        return [wx, this.oy + py, wz];
      };
      const path = [P(rt.door[0], 0, rt.door[1] + 2.2), P(rt.door[0], 0, rt.door[1] - 1.4)];
      if (rt.stairs && ly > rt.floorY + 1) {
        const [sx, sz0, sz1, y0, y1] = rt.stairs;
        path.push(P(sx, y0, sz0), P(sx, y1, sz1));
      }
      spot.path = path;
      const [ax, az] = this.w(-rt.hw, -rt.hd);
      const [bx, bz] = this.w(rt.hw, rt.hd);
      spot.inside = [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)];
    }
    this.loot.push(spot);
  }

  build(mats: Record<MatKey, THREE.Material>) {
    const out = new THREE.Group();
    for (const [name, group] of this.bufs) {
      for (const [m, b] of group) {
        if (!b.p.length) continue;
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(b.p, 3));
        g.setAttribute("normal", new THREE.Float32BufferAttribute(b.n, 3));
        g.setAttribute("uv", new THREE.Float32BufferAttribute(b.u, 2));
        g.setAttribute("color", new THREE.Float32BufferAttribute(b.c, 3));
        g.computeBoundingSphere();
        const mesh = new THREE.Mesh(g, mats[m]);
        mesh.name = `${name}:${m}`;
        mesh.castShadow = m !== "glass" && m !== "glow";
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        out.add(mesh);
      }
    }
    return out;
  }
}

/* ------------------------------------------------------------------ instanced props */

class Batch {
  mats: THREE.Matrix4[] = [];
  cols: THREE.Color[] = [];
  mesh: THREE.InstancedMesh | null = null;
  constructor(
    public geo: THREE.BufferGeometry,
    public mat: THREE.Material,
    public shadow = true,
  ) {}
  add(m: THREE.Matrix4, color: string) {
    this.mats.push(m.clone());
    this.cols.push(new THREE.Color(color));
    return this.mats.length - 1;
  }
  build() {
    const mesh = new THREE.InstancedMesh(this.geo, this.mat, Math.max(1, this.mats.length));
    mesh.count = this.mats.length;
    this.mats.forEach((m, i) => mesh.setMatrixAt(i, m));
    this.cols.forEach((c, i) => mesh.setColorAt(i, c));
    mesh.castShadow = this.shadow;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.mesh = mesh;
    return mesh;
  }
  hide(i: number) {
    if (!this.mesh) return;
    this.mesh.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

const _m4 = new THREE.Matrix4();
const _q4 = new THREE.Quaternion();
const _p4 = new THREE.Vector3();
const _s4 = new THREE.Vector3();
const _e4 = new THREE.Euler();
function mtx(x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, rx = 0, rz = 0) {
  _e4.set(rx, ry, rz, "YXZ");
  _q4.setFromEuler(_e4);
  return _m4.compose(_p4.set(x, y, z), _q4, _s4.set(sx, sy, sz));
}

/* ------------------------------------------------------------------ prop models */

const _gc = new THREE.Color();
/** Non-indexed copy with a baked vertex colour; optional vertical gradient (lo..hi brightness over y0..y1). */
function painted(g: THREE.BufferGeometry, color: string, grad?: [number, number, number, number]) {
  const f = g.index ? g.toNonIndexed() : g;
  f.deleteAttribute("uv");
  const pos = f.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  _gc.set(color);
  for (let i = 0; i < pos.count; i++) {
    let k = 1;
    if (grad) k = grad[2] + (grad[3] - grad[2]) * smooth(grad[0], grad[1], pos.getY(i));
    col[i * 3] = _gc.r * k;
    col[i * 3 + 1] = _gc.g * k;
    col[i * 3 + 2] = _gc.b * k;
  }
  f.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return f;
}
function merged(parts: THREE.BufferGeometry[]) {
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
}

/** Deterministic 3D hash noise in [-1, 1] (keeps shared vertices together when jittering). */
function hash3(x: number, y: number, z: number) {
  const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return (h - Math.floor(h)) * 2 - 1;
}
/**
 * A puffy foliage clump: a jittered icosphere with smooth (pre-jitter) normals, a light top and
 * shaded underside, and its own brightness so canopies read as many clumps, Fortnite style.
 */
function clump(x: number, y: number, z: number, r: number, bright: number, grad: [number, number, number, number], squash = 0.86) {
  const g = new THREE.IcosahedronGeometry(r, 1);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i);
    const py = p.getY(i);
    const pz = p.getZ(i);
    const k = 1 + hash3(Math.round(px * 100) + x * 7, Math.round(py * 100) + y * 3, Math.round(pz * 100) + z * 5) * 0.13;
    p.setXYZ(i, px * k, py * k * squash, pz * k);
  }
  g.translate(x, y, z);
  const f = painted(g, "#ffffff", grad);
  const col = f.attributes.color as THREE.BufferAttribute;
  for (let i = 0; i < col.count; i++) col.setXYZ(i, col.getX(i) * bright, col.getY(i) * bright * 1.02, col.getZ(i) * bright * 0.95);
  return f;
}
function taperedLimb(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r0: number, r1: number, color: string, seg = 6) {
  const a = new THREE.Vector3(x0, y0, z0);
  const b = new THREE.Vector3(x1, y1, z1);
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, seg).translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q).translate(x0, y0, z0);
  return painted(g, color, [y0, y1, 0.8, 1.05]);
}
/** Broad, cartoon oak: flared trunk that splits into three limbs reaching into the canopy. */
function oakTrunkGeo() {
  const bark = "#7a4a2a";
  return merged([
    painted(new THREE.CylinderGeometry(0.3, 0.5, 3.3, 9).translate(0, 1.65, 0), bark, [0, 3.3, 0.72, 1.02]),
    painted(new THREE.CylinderGeometry(0.52, 0.8, 0.55, 9).translate(0, 0.22, 0), "#6a3f22"),
    taperedLimb(0, 3.0, 0, 1.5, 4.6, 0.3, 0.26, 0.12, bark),
    taperedLimb(0, 3.1, 0, -1.2, 4.7, 0.9, 0.24, 0.11, bark),
    taperedLimb(0, 3.1, 0, -0.3, 4.9, -1.4, 0.24, 0.11, bark),
    taperedLimb(0, 3.2, 0, 0.1, 5.6, 0.1, 0.22, 0.12, bark),
  ]);
}
/** Clustered, puffy canopy: a big core with satellite clumps, light top and shaded underside. */
function oakCanopyGeo() {
  const grad: [number, number, number, number] = [3.0, 7.6, 0.5, 1.2];
  const blobs: [number, number, number, number, number][] = [
    [0, 5.2, 0, 2.3, 1],
    [1.9, 4.7, 0.4, 1.7, 1.06],
    [-1.7, 4.8, 1.0, 1.7, 0.94],
    [-0.4, 4.9, -1.9, 1.7, 1.02],
    [0.9, 4.5, 1.9, 1.5, 0.92],
    [-2.1, 4.4, -0.9, 1.4, 1.05],
    [1.6, 4.6, -1.6, 1.4, 0.97],
    [0.3, 6.5, 0.2, 1.7, 1.1],
    [-1.1, 6.0, -0.6, 1.3, 1.04],
    [1.2, 6.0, 0.9, 1.3, 1.12],
    [-0.6, 6.1, 1.3, 1.1, 0.98],
  ];
  return merged(blobs.map(([x, y, z, r, b]) => clump(x, y, z, r, b, grad)));
}
/** Birch: slim white trunk with dark marks. */
function birchTrunkGeo() {
  const g = new THREE.CylinderGeometry(0.17, 0.26, 5.6, 8, 8).translate(0, 2.8, 0);
  const f = painted(g, "#efeae0");
  const p = f.attributes.position as THREE.BufferAttribute;
  const c = f.attributes.color as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i += 3) {
    const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const a = Math.atan2(p.getZ(i), p.getX(i));
    if (Math.sin(y * 5.3 + a * 2) > 0.72 || y < 0.35) for (let k = 0; k < 3; k++) c.setXYZ(i + k, 0.2, 0.19, 0.18);
  }
  return merged([f, taperedLimb(0, 3.6, 0, 0.9, 4.6, 0.2, 0.1, 0.05, "#e7e2d6", 5), taperedLimb(0, 4.1, 0, -0.8, 5.0, -0.3, 0.1, 0.05, "#e7e2d6", 5)]);
}
function birchCanopyGeo() {
  const grad: [number, number, number, number] = [3.8, 7.4, 0.62, 1.2];
  const blobs: [number, number, number, number, number][] = [
    [0, 5.6, 0, 1.6, 1],
    [0.9, 4.9, 0.3, 1.2, 1.05],
    [-0.8, 5.0, 0.6, 1.2, 0.95],
    [-0.2, 5.1, -1.0, 1.15, 1.02],
    [0.2, 6.6, 0.1, 1.2, 1.1],
    [0.8, 6.0, -0.6, 0.95, 1.08],
  ];
  return merged(blobs.map(([x, y, z, r, b]) => clump(x, y, z, r, b, grad, 1.05)));
}
function pineTrunkGeo() {
  return painted(new THREE.CylinderGeometry(0.15, 0.32, 3.2, 7).translate(0, 1.6, 0), "#6e4324", [0, 3.2, 0.8, 1.05]);
}
/** One drooping pine tier: star-shaped rim (needle tips), a concave darker underside. */
function pineTier(r: number, h: number, y: number, seed: number) {
  const N = 14;
  const pos: number[] = [];
  const col: number[] = [];
  const rim: [number, number, number][] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + seed;
    const out = i % 2 === 0;
    const rr = r * (out ? 1 : 0.74) * (1 + hash3(i, seed, r) * 0.06);
    rim.push([Math.cos(a) * rr, y + (out ? -h * 0.18 : h * 0.02), Math.sin(a) * rr]);
  }
  const top: [number, number, number] = [0, y + h, 0];
  const under: [number, number, number] = [0, y + h * 0.35, 0];
  for (let i = 0; i < N; i++) {
    const a = rim[i]!;
    const b = rim[(i + 1) % N]!;
    pos.push(...top, ...b, ...a);
    const lo = 0.66;
    col.push(1.12, 1.12, 1.12, lo, lo, lo, lo, lo, lo);
    pos.push(...under, ...a, ...b);
    col.push(0.38, 0.38, 0.38, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
function pineCanopyGeo() {
  const tiers: [number, number, number][] = [
    [2.5, 2.2, 1.9],
    [2.2, 2.1, 3.0],
    [1.9, 2.0, 4.1],
    [1.55, 1.8, 5.15],
    [1.2, 1.6, 6.1],
    [0.8, 1.5, 7.0],
  ];
  return merged(tiers.map(([r, h, y], i) => pineTier(r, h, y, i * 0.7)));
}
/** Palm: a curved, ringed trunk. */
export function palmTrunkGeo() {
  const parts: THREE.BufferGeometry[] = [];
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 9; i++) {
    const t = i / 9;
    pts.push(new THREE.Vector3(Math.pow(t, 1.8) * 1.6, t * 6.4, 0));
  }
  for (let i = 0; i < 9; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const r0 = 0.3 - i * 0.012;
    parts.push(taperedLimb(a.x, a.y, a.z, b.x, b.y + 0.05, b.z, r0, r0 * 0.86, i % 2 ? "#9a7148" : "#87603a", 8));
  }
  const top = pts[9]!;
  for (const [dx, dz] of [
    [0.25, 0.2],
    [-0.2, 0.25],
    [0.05, -0.3],
  ])
    parts.push(painted(new THREE.SphereGeometry(0.24, 8, 6).translate(top.x + dx, top.y - 0.35, top.z + dz), "#6b4a24"));
  return merged(parts);
}
/** Palm fronds: arching, drooping V-section leaves with a lighter midrib. */
export function palmFrondGeo() {
  const parts: THREE.BufferGeometry[] = [];
  const cx = 1.6;
  const cy = 6.45;
  const N = 8;
  for (let f = 0; f < N; f++) {
    const a = (f / N) * Math.PI * 2 + (f % 2) * 0.2;
    const len = 3.6 + (f % 3) * 0.4;
    const pos: number[] = [];
    const col: number[] = [];
    const S = 7;
    let prev: THREE.Vector3[] | null = null;
    for (let i = 0; i <= S; i++) {
      const t = i / S;
      const d = t * len;
      const y = cy + Math.sin(t * Math.PI * 0.7) * 1.0 - t * t * 2.4;
      const w = Math.sin(Math.min(1, t * 1.15) * Math.PI) * 0.62 + 0.05;
      const ux = Math.cos(a);
      const uz = Math.sin(a);
      const mid = new THREE.Vector3(cx + ux * d, y + 0.1, uz * d);
      const l = new THREE.Vector3(cx + ux * d - uz * w, y - 0.18 * w, uz * d + ux * w);
      const r = new THREE.Vector3(cx + ux * d + uz * w, y - 0.18 * w, uz * d - ux * w);
      const cur = [l, mid, r];
      if (prev) {
        for (const [p0, p1, q0, q1] of [
          [prev[0]!, prev[1]!, cur[0]!, cur[1]!],
          [prev[1]!, prev[2]!, cur[1]!, cur[2]!],
        ] as const) {
          pos.push(...p0.toArray(), ...q0.toArray(), ...p1.toArray(), ...p1.toArray(), ...q0.toArray(), ...q1.toArray());
          const k0 = 0.85 + t * 0.25;
          for (const pnt of [p0, q0, p1, p1, q0, q1]) {
            const isMid = pnt === p1 || pnt === q1 ? (p1 === prev[1] ? 1 : 0) : pnt === p0 || pnt === q0 ? (p0 === prev[1] ? 1 : 0) : 0;
            const k = isMid ? k0 * 1.18 : k0;
            col.push(k, k, k);
          }
        }
      }
      prev = cur;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    parts.push(g);
  }
  return merged(parts);
}
function bushGeo() {
  return merged(
    (
      [
        [0, 0.55, 0, 0.75],
        [0.55, 0.45, 0.2, 0.55],
        [-0.5, 0.45, -0.15, 0.6],
      ] as const
    ).map(([x, y, z, r]) => painted(new THREE.IcosahedronGeometry(r, 1).translate(x, y, z), "#ffffff", [0, 1.2, 0.6, 1.15])),
  );
}
function rockGeo() {
  const g = new THREE.DodecahedronGeometry(1, 0);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const r = rng(5);
  for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) * (0.85 + r() * 0.3), pos.getY(i) * (0.8 + r() * 0.3), pos.getZ(i) * (0.85 + r() * 0.3));
  g.computeVertexNormals();
  return painted(g, "#ffffff", [-1, 1, 0.68, 1.12]);
}
/** Car body: extruded side profile (rounded hood, raked windshield, trunk). Length runs along z. */
function carBodyGeo() {
  const sh = new THREE.Shape();
  sh.moveTo(-2.1, 0.32);
  sh.lineTo(2.1, 0.32);
  sh.quadraticCurveTo(2.25, 0.36, 2.22, 0.72);
  sh.quadraticCurveTo(2.1, 0.95, 1.32, 0.97);
  sh.lineTo(0.5, 1.56);
  sh.lineTo(-0.88, 1.56);
  sh.lineTo(-1.62, 1.0);
  sh.quadraticCurveTo(-2.15, 0.98, -2.2, 0.72);
  sh.quadraticCurveTo(-2.22, 0.4, -2.1, 0.32);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 1.74, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.07, bevelSegments: 2, curveSegments: 5 });
  g.translate(0, 0, -0.87);
  g.rotateY(-Math.PI / 2);
  // wheel arches read better with a darker skirt
  return painted(g, "#ffffff", [0.3, 0.75, 0.72, 1]);
}
function carDetailGeo() {
  const gh = new THREE.Shape();
  gh.moveTo(1.36, 0.93);
  gh.lineTo(0.47, 1.55);
  gh.lineTo(-0.86, 1.55);
  gh.lineTo(-1.66, 0.98);
  gh.lineTo(1.36, 0.93);
  const glass = new THREE.ExtrudeGeometry(gh, { depth: 1.9, bevelEnabled: false });
  glass.translate(0, 0, -0.95);
  glass.rotateY(-Math.PI / 2);
  const parts = [painted(glass, "#2c3e57", [0.9, 1.55, 0.8, 1.25])];
  for (const [x, z] of [
    [-0.9, 1.38],
    [0.9, 1.38],
    [-0.9, -1.35],
    [0.9, -1.35],
  ] as const) {
    parts.push(painted(new THREE.CylinderGeometry(0.4, 0.4, 0.34, 14).rotateZ(Math.PI / 2).translate(x, 0.4, z), "#1d1d1f"));
    parts.push(painted(new THREE.CylinderGeometry(0.2, 0.2, 0.36, 10).rotateZ(Math.PI / 2).translate(x, 0.4, z), "#c9ced6"));
  }
  parts.push(painted(new THREE.BoxGeometry(1.9, 0.22, 0.2).translate(0, 0.45, 2.24), "#3a3d42"));
  parts.push(painted(new THREE.BoxGeometry(1.9, 0.22, 0.2).translate(0, 0.45, -2.22), "#3a3d42"));
  for (const x of [-0.65, 0.65]) {
    parts.push(painted(new THREE.BoxGeometry(0.38, 0.16, 0.06).translate(x, 0.78, 2.24), "#fff5c8"));
    parts.push(painted(new THREE.BoxGeometry(0.38, 0.14, 0.06).translate(x, 0.8, -2.25), "#d0302a"));
  }
  return merged(parts);
}
function hydrantGeo() {
  return merged([
    painted(new THREE.CylinderGeometry(0.17, 0.2, 0.75, 10).translate(0, 0.375, 0), "#d63c35"),
    painted(new THREE.SphereGeometry(0.19, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.75, 0), "#d63c35"),
    painted(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 8).rotateZ(Math.PI / 2).translate(0, 0.5, 0), "#b8322c"),
    painted(new THREE.CylinderGeometry(0.24, 0.24, 0.06, 10).translate(0, 0.03, 0), "#8a2420"),
  ]);
}
function trashGeo() {
  return merged([
    painted(new THREE.CylinderGeometry(0.34, 0.3, 0.95, 12).translate(0, 0.475, 0), "#3d6b4a", [0, 1, 0.8, 1.05]),
    painted(new THREE.CylinderGeometry(0.37, 0.37, 0.1, 12).translate(0, 1.0, 0), "#2f5539"),
  ]);
}
function benchGeo() {
  const parts: THREE.BufferGeometry[] = [];
  for (const z of [-0.12, 0.08, 0.28]) parts.push(painted(new THREE.BoxGeometry(1.8, 0.07, 0.16).translate(0, 0.48, z), "#b57a45"));
  for (const y of [0.75, 0.95]) parts.push(painted(new THREE.BoxGeometry(1.8, 0.14, 0.06).translate(0, y, -0.22), "#b57a45"));
  for (const x of [-0.75, 0.75]) parts.push(painted(new THREE.BoxGeometry(0.08, 1.0, 0.6).translate(x, 0.5, 0), "#2f3238"));
  return merged(parts);
}

/* ------------------------------------------------------------------ layout */

type Pad = { x0: number; z0: number; x1: number; z1: number; h: number; margin: number };
type Road = { pts: [number, number][]; w: number; town?: boolean };

const RIVER: [number, number][] = [
  [44, -112],
  [46, -72],
  [33, -30],
  [37, 8],
  [57, 52],
  [61, 98],
  [50, 140],
  [44, 196],
];

const ROADS: Road[] = [
  // Maple Crossing main street, east over the river to Rustbolt Yard, west to the farm
  { pts: [[-108, 28], [-95, 25], [-25, 25], [20, 25], [62, 22], [88, -18], [110, -36]], w: 7, town: true },
  // north–south through town, down to Saltwind Docks
  { pts: [[-25, -25], [-25, 25], [-25, 82], [-2, 128], [24, 152]], w: 7, town: true },
  // to Pinecrest Lodge
  { pts: [[-25, -25], [-58, -58], [-92, -86]], w: 6 },
  // up Radar Peak
  { pts: [[-25, -25], [2, -78], [20, -122]], w: 6 },
  // to Sunken Quarry
  { pts: [[62, 22], [84, 36]], w: 6 },
  // east highway: Rustbolt Yard to Brightwater
  { pts: [[110, -36], [160, -24], [205, -2], [282, 6]], w: 7, town: true },
  // Brightwater cross street
  { pts: [[238, -50], [238, 70]], w: 6, town: true },
  // north-east up to Ironworks
  { pts: [[110, -36], [132, -96], [150, -150], [160, -190]], w: 6 },
  // north from Pinecrest Lodge to Timberline
  { pts: [[-92, -86], [-96, -150], [-78, -214], [-66, -262]], w: 6 },
  // west from the farm out to Mesa Ranch
  { pts: [[-108, 28], [-160, 16], [-200, -8], [-236, -28]], w: 6 },
  // south-west to Coral Cove
  { pts: [[-25, 82], [-74, 116], [-122, 146], [-150, 168]], w: 6 },
];

function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

function lineDist(pts: [number, number][], x: number, z: number) {
  let best = 1e9;
  for (let i = 0; i < pts.length - 1; i++) best = Math.min(best, segDist(x, z, pts[i]![0], pts[i]![1], pts[i + 1]![0], pts[i + 1]![1]));
  return best;
}

/** How far the island was grown outward (it keeps its old south shore, where the docks and lighthouse sit). */
const GROW = 112;
function coastR(ang: number) {
  let d = Math.abs(ang - 1.31) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return 198 + GROW * smooth(0.62, 1.45, d) + 16 * Math.sin(3 * ang + 0.7) + 9 * Math.sin(5 * ang + 2.1) + 5 * Math.sin(9 * ang + 0.3);
}

function baseHeight(x: number, z: number) {
  const r = Math.hypot(x, z);
  const t = r / coastR(Math.atan2(z, x));
  const land = 1 - smooth(0.84, 1.03, t);
  let h = 3.2 + 2.2 * Math.sin(x * 0.027 + 1) * Math.cos(z * 0.023) + 1.4 * Math.sin((x - z) * 0.013) + 0.7 * Math.sin(x * 0.07) * Math.sin(z * 0.061);
  h += 36 * Math.exp(-((x - 25) ** 2 + (z + 142) ** 2) / (2 * 34 * 34));
  h += 9 * Math.exp(-((x + 105) ** 2 + (z + 98) ** 2) / (2 * 55 * 55));
  h += 6 * Math.exp(-((x - 168) ** 2 + (z + 2) ** 2) / (2 * 24 * 24));
  // outer ring: Timberline's wooded ridge, rolling north-east hills, a low eastern bluff
  h += 20 * Math.exp(-((x + 40) ** 2 + (z + 262) ** 2) / (2 * 40 * 40));
  h += 12 * Math.exp(-((x + 150) ** 2 + (z + 210) ** 2) / (2 * 46 * 46));
  h += 9 * Math.exp(-((x - 110) ** 2 + (z + 210) ** 2) / (2 * 40 * 40));
  h += 5 * Math.exp(-((x - 285) ** 2 + (z - 80) ** 2) / (2 * 30 * 30));
  // Mesa Ranch sits on a flat-topped plateau
  const dm = Math.hypot(x + 232, z + 30);
  if (dm < 70) h += 8 * (1 - smooth(36, 62, dm));
  // Sunken Quarry: terraced pit that floods at the bottom
  const dq = Math.hypot(x - QX, z - QZ);
  if (dq < 40) {
    const inner = 1 - smooth(13, 38, dq);
    const target = h - 12 * inner;
    const terr = Math.floor(target / 2.6) * 2.6;
    h = target + (terr - target) * Math.min(1, inner * 1.6);
  }
  h = -7 + (h + 7) * land;
  // river channel
  const dr = lineDist(RIVER, x, z);
  if (dr < 14 && land > 0.2) {
    const rf = 1 - smooth(4, 13, dr);
    h = h + (-1.8 - h) * rf;
  }
  return h;
}

/* ------------------------------------------------------------------ builder */

/** `lite` keeps the original low-poly trees (low graphics quality / weak devices). */
export function buildIsland(opts: { lite?: boolean } = {}): Island {
  islandBake.harvestParts = new Map();
  const rand = rng(424242);
  const mats = makeMaterials();
  const kit = new Kit();
  const pads: Pad[] = [];
  const footprints: { x0: number; z0: number; x1: number; z1: number; color: string }[] = [];
  const pois: Poi[] = [
    { name: "Maple Crossing", x: -30, z: 30, r: 62 },
    { name: "Rustbolt Yard", x: 112, z: -52, r: 44 },
    { name: "Saltwind Docks", x: 14, z: 146, r: 32 },
    { name: "Old Mill Farm", x: -128, z: 50, r: 44 },
    { name: "Pinecrest Lodge", x: -108, z: -104, r: 38 },
    { name: "Radar Peak", x: 27, z: -142, r: 26 },
    { name: "Sunken Quarry", x: QX, z: QZ, r: 36 },
    { name: "Lantern Point", x: 92, z: 176, r: 18 },
    { name: "Brightwater", x: 240, z: 8, r: 52 },
    { name: "Ironworks", x: 152, z: -186, r: 46 },
    { name: "Timberline", x: -72, z: -252, r: 42 },
    { name: "Mesa Ranch", x: -232, z: -30, r: 40 },
    { name: "Coral Cove", x: -150, z: 176, r: 38 },
  ];

  function padHeightAt(x: number, z: number) {
    return baseHeight(x, z);
  }

  /** Flatten the ground under a footprint (world rect) and remember it for the minimap. */
  function pad(cx: number, cz: number, hw: number, hd: number, rot: number, color: string, h?: number, margin = 7) {
    const swap = rot % 2 === 1;
    const ex = swap ? hd : hw;
    const ez = swap ? hw : hd;
    let ph = h;
    if (ph === undefined) {
      let sum = 0;
      for (const [sx, sz] of [
        [0, 0],
        [-ex, -ez],
        [ex, -ez],
        [ex, ez],
        [-ex, ez],
      ] as const)
        sum += padHeightAt(cx + sx, cz + sz);
      ph = Math.max(1.4, sum / 5);
    }
    pads.push({ x0: cx - ex, z0: cz - ez, x1: cx + ex, z1: cz + ez, h: ph, margin });
    footprints.push({ x0: cx - ex, z0: cz - ez, x1: cx + ex, z1: cz + ez, color });
    return ph;
  }

  /* ---------- road profiles: once every building pad is down, roads flatten the ground under them ---------- */
  type Prof = { road: Road; seg: { ax: number; az: number; bx: number; bz: number; s0: number; len: number }[]; hs: number[]; box: [number, number, number, number] };
  const STEP = 2;
  let profiles: Prof[] | null = null;
  const ROAD_LIFT = 0.05;
  /** Nearest road to (x, z): distance from its centreline, its profile height there, and its width. */
  function roadAt(x: number, z: number): { d: number; h: number; w: number } | null {
    if (!profiles) return null;
    let best: { d: number; h: number; w: number } | null = null;
    for (const pr of profiles) {
      const [x0, z0, x1, z1] = pr.box;
      if (x < x0 || x > x1 || z < z0 || z > z1) continue;
      for (const sg of pr.seg) {
        const dx = sg.bx - sg.ax;
        const dz = sg.bz - sg.az;
        const t = Math.max(0, Math.min(1, ((x - sg.ax) * dx + (z - sg.az) * dz) / (sg.len * sg.len)));
        const d = Math.hypot(x - (sg.ax + dx * t), z - (sg.az + dz * t));
        if (best && d >= best.d) continue;
        const f = (sg.s0 + t * sg.len) / STEP;
        const i = Math.min(pr.hs.length - 2, Math.floor(f));
        const k = f - i;
        best = { d, h: pr.hs[i]! + (pr.hs[i + 1]! - pr.hs[i]!) * k, w: pr.road.w };
      }
    }
    return best;
  }
  function insidePad(x: number, z: number) {
    for (const p of pads) if (x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1) return true;
    return false;
  }
  function rawHeight(x: number, z: number) {
    const h = rawHeight0(x, z);
    const r = roadAt(x, z);
    if (!r) return h;
    const inner = r.w / 2 + 1.2;
    const outer = inner + 5;
    if (r.d >= outer) return h;
    let k = 1 - smooth(inner, outer, r.d);
    // rivers and the sea stay open under bridges; building pads keep their own level
    k *= smooth(-0.7, 0.5, baseHeight(x, z));
    if (r.d > r.w / 2 && insidePad(x, z)) k = 0;
    return h + (r.h - h) * k;
  }
  /** Sample every road, smooth its height profile (cut and fill), cap the grade and meet other roads at junctions. */
  function buildProfiles() {
    const out: Prof[] = [];
    for (const road of ROADS) {
      const seg: Prof["seg"] = [];
      let s0 = 0;
      for (let i = 0; i < road.pts.length - 1; i++) {
        const [ax, az] = road.pts[i]!;
        const [bx, bz] = road.pts[i + 1]!;
        const len = Math.hypot(bx - ax, bz - az);
        seg.push({ ax, az, bx, bz, s0, len });
        s0 += len;
      }
      const n = Math.ceil(s0 / STEP) + 1;
      const at = (s: number): [number, number] => {
        for (const sg of seg) if (s <= sg.s0 + sg.len || sg === seg[seg.length - 1]) {
          const t = Math.max(0, Math.min(1, (s - sg.s0) / sg.len));
          return [sg.ax + (sg.bx - sg.ax) * t, sg.az + (sg.bz - sg.az) * t];
        }
        return [seg[0]!.ax, seg[0]!.az];
      };
      let hs: number[] = [];
      const water: boolean[] = [];
      for (let i = 0; i < n; i++) {
        const [x, z] = at(i * STEP);
        const wet = baseHeight(x, z) < 0.3;
        water.push(wet);
        hs.push(wet ? NaN : rawHeight0(x, z));
      }
      // bridges: span the water at the higher bank (and well clear of the waves)
      for (let i = 0; i < n; i++) {
        if (!water[i]) continue;
        let j = i;
        while (j < n && water[j]) j++;
        const left = i > 0 ? hs[i - 1]! : 2.2;
        const right = j < n ? hs[j]! : 2.2;
        const deck = Math.max(2.2, left, right);
        for (let k = i; k < j; k++) hs[k] = deck;
        i = j;
      }
      // smooth twice (a 13-sample window) so the road cuts through bumps instead of following them
      for (let pass = 0; pass < 2; pass++) {
        const next = hs.slice();
        for (let i = 0; i < n; i++) {
          let sum = 0;
          let cnt = 0;
          for (let k = -6; k <= 6; k++) {
            const j = i + k;
            if (j < 0 || j >= n) continue;
            sum += hs[j]!;
            cnt++;
          }
          next[i] = water[i] ? Math.max(hs[i]!, sum / cnt) : sum / cnt;
        }
        hs = next;
      }
      // meet earlier roads at the junction height, blending in over ~20 m
      const pinned: (number | null)[] = hs.map(() => null);
      for (let i = 0; i < n; i++) {
        const [x, z] = at(i * STEP);
        for (const pr of out) {
          if (lineDist(pr.road.pts, x, z) > pr.road.w / 2) continue;
          let bestD = 1e9;
          let bh = hs[i]!;
          for (const sg of pr.seg) {
            const dx = sg.bx - sg.ax;
            const dz = sg.bz - sg.az;
            const t = Math.max(0, Math.min(1, ((x - sg.ax) * dx + (z - sg.az) * dz) / (sg.len * sg.len)));
            const d = Math.hypot(x - (sg.ax + dx * t), z - (sg.az + dz * t));
            if (d < bestD) {
              bestD = d;
              const f = (sg.s0 + t * sg.len) / STEP;
              const ii = Math.min(pr.hs.length - 2, Math.floor(f));
              bh = pr.hs[ii]! + (pr.hs[ii + 1]! - pr.hs[ii]!) * (f - ii);
            }
          }
          pinned[i] = bh;
        }
      }
      const delta = hs.map(() => 0);
      const R = 10;
      for (let i = 0; i < n; i++) {
        const pv = pinned[i];
        if (pv == null) continue;
        const dlt = pv - hs[i]!;
        for (let k = -R; k <= R; k++) {
          const j = i + k;
          if (j < 0 || j >= n) continue;
          const w = pinned[j] != null ? 1 : 1 - Math.abs(k) / (R + 1);
          if (Math.abs(dlt * w) > Math.abs(delta[j]!) || pinned[j] != null) delta[j] = pinned[j] != null ? pinned[j]! - hs[j]! : dlt * w;
        }
      }
      hs = hs.map((h, i) => h + delta[i]!);
      // cap the grade at ~16% both ways (bridges and junction pins stay put)
      const g = 0.16 * STEP;
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 1; i < n; i++) if (pinned[i] == null && !water[i]) hs[i] = Math.max(hs[i - 1]! - g, Math.min(hs[i - 1]! + g, hs[i]!));
        for (let i = n - 2; i >= 0; i--) if (pinned[i] == null && !water[i]) hs[i] = Math.max(hs[i + 1]! - g, Math.min(hs[i + 1]! + g, hs[i]!));
      }
      let x0 = 1e9;
      let z0 = 1e9;
      let x1 = -1e9;
      let z1 = -1e9;
      for (const [x, z] of road.pts) {
        x0 = Math.min(x0, x);
        z0 = Math.min(z0, z);
        x1 = Math.max(x1, x);
        z1 = Math.max(z1, z);
      }
      const m = road.w / 2 + 7;
      out.push({ road, seg, hs, box: [x0 - m, z0 - m, x1 + m, z1 + m] });
    }
    profiles = out;
  }

  function rawHeight0(x: number, z: number) {
    let h = baseHeight(x, z);
    for (const p of pads) {
      const dx = Math.max(p.x0 - x, 0, x - p.x1);
      const dz = Math.max(p.z0 - z, 0, z - p.z1);
      if (dx > p.margin || dz > p.margin) continue;
      const d = Math.hypot(dx, dz);
      if (d >= p.margin) continue;
      const k = smooth(0, p.margin, d);
      h = p.h + (h - p.h) * k;
    }
    return h;
  }
  /** Ground height for gameplay: terrain, with the road surface standing a few cm proud of it. */
  /**
   * Terrain height exactly as the ground mesh draws it: the mesh is a 3 m grid of triangles, and in
   * dips the drawn surface sits above the smooth height function, so feet would sink into the grass.
   * Once the mesh exists, the ground height follows its triangles instead.
   */
  let meshGrid: Float32Array | null = null;
  let meshN = 0;
  let meshStep = 1;
  let meshHalf = 0;
  const meshHeight = (x: number, z: number) => {
    if (!meshGrid) return rawHeight(x, z);
    const fx = (x + meshHalf) / meshStep;
    const fz = (z + meshHalf) / meshStep;
    if (fx < 0 || fz < 0 || fx >= meshN || fz >= meshN) return rawHeight(x, z);
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const u = fx - ix;
    const v = fz - iz;
    const W = meshN + 1;
    const ha = meshGrid[iz * W + ix]!;
    const hb = meshGrid[(iz + 1) * W + ix]!;
    const hc = meshGrid[(iz + 1) * W + ix + 1]!;
    const hd = meshGrid[iz * W + ix + 1]!;
    return u + v <= 1 ? ha + (hd - ha) * u + (hb - ha) * v : hc + (hb - hc) * (1 - u) + (hd - hc) * (1 - v);
  };
  const height = (x: number, z: number) => {
    const h = Math.max(meshHeight(x, z), WADE);
    if (!profiles) return h;
    const r = roadAt(x, z);
    return r && r.d < r.w / 2 && baseHeight(x, z) > -0.7 ? Math.max(h, r.h + ROAD_LIFT) : h;
  };

  /* ---------- building types (local frame: front faces +z, y = 0 at the pad) ---------- */

  type HouseOpts = {
    w: number;
    d: number;
    floors: 1 | 2;
    wallMat: MatKey;
    wall: string;
    trim?: string;
    roof: "gable" | "flat" | "hip";
    roofColor?: string;
    ridgeZ?: boolean;
    harvest: BuildMat;
    H?: number;
    doorW?: number;
    doorH?: number;
    porch?: boolean;
    chimney?: boolean;
    roofStairs?: boolean;
    foundation?: boolean;
    glassFront?: boolean;
    chests?: number;
    shutters?: string;
    inside?: string;
    doorColor?: string;
    sign?: string;
    /** What the rooms are furnished as. Defaults to a home. */
    interior?: "home" | "store" | "office" | "barn";
  };



  /* ---------- room planner: furniture and chests against the walls ---------- */
  type WallId = "back" | "front" | "left" | "right";
  type HoleL = { a0: number; a1: number; y0: number; y1: number };
  type FurnCtx = {
    hw: number;
    hd: number;
    T: number;
    F: number;
    ceil: number;
    floor: number;
    floors: number;
    dw: number;
    holes: Record<WallId, HoleL[]>;
    stairs: { sx0: number; sx1: number; z0: number; zTop: number; holeZ0: number } | null;
    interior: "home" | "store" | "office" | "barn";
    minChests: number;
    trim: string;
  };
  const fabricCols = ["#d9534f", "#4a78c2", "#5aa469", "#e0a32e", "#8a5fbf", "#2f9c95", "#c46d3b", "#6d7a88"];
  const woodCols = ["#8a5a35", "#a8713f", "#6b4a2e", "#c08a52", "#5a3d26"];
  function furnish(c: FurnCtx) {
    const { F } = c;
    const ix0 = -c.hw + c.T;
    const ix1 = c.hw - c.T;
    const iz0 = -c.hd + c.T;
    const iz1 = c.hd - c.T;
    type Rect = [number, number, number, number];
    const placed: Rect[] = [];
    const tallOn: Record<WallId, [number, number][]> = { back: [], front: [], left: [], right: [] };
    const hit = (r: Rect, pad = 0.05) => placed.some((p) => r[0] < p[2] + pad && r[2] > p[0] - pad && r[1] < p[3] + pad && r[3] > p[1] - pad);
    const inRoom = (r: Rect) => r[0] >= ix0 - 1e-3 && r[2] <= ix1 + 1e-3 && r[1] >= iz0 - 1e-3 && r[3] <= iz1 + 1e-3;
    const span = (w: WallId): [number, number] => (w === "back" || w === "front" ? [ix0, ix1] : [iz0, iz1]);
    const P = (w: WallId, a: number, u: number, v: number): [number, number] =>
      w === "back" ? [a + u, iz0 + v] : w === "front" ? [a - u, iz1 - v] : w === "left" ? [ix0 + v, a - u] : [ix1 - v, a + u];
    const rectOf = (w: WallId, a: number, u0: number, u1: number, v0: number, v1: number): Rect => {
      const [ax, az] = P(w, a, u0, v0);
      const [bx, bz] = P(w, a, u1, v1);
      return [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)];
    };
    /** Box in item space: u along the wall (centred on a), v out from the wall, y up from the floor. */
    const ib = (w: WallId, a: number, u0: number, u1: number, v0: number, v1: number, y0: number, y1: number, m: MatKey, col: string, collide: Collide = false) => {
      const r = rectOf(w, a, u0, u1, v0, v1);
      kit.box(r[0], F + y0, r[1], r[2], F + y1, r[3], m, col, collide);
    };
    const solidI = (w: WallId, a: number, u0: number, u1: number, v0: number, v1: number, y1: number, mat: BuildMat = "wood") => {
      const r = rectOf(w, a, u0, u1, v0, v1);
      kit.solid(r[0], F, r[1], r[2], F + y1, r[3], mat);
    };
    const cylI = (w: WallId, a: number, u: number, v: number, y: number, r: number, h: number, seg: number, m: MatKey, col: string, r2 = r) => {
      const [x, z] = P(w, a, u, v);
      kit.cyl(x, F + y, z, r, h, seg, m, col, false, true, r2);
    };
    const windowFree = (w: WallId, a: number, L: number, yTop: number) =>
      !c.holes[w].some((h) => h.a1 > a - L / 2 - 0.05 && h.a0 < a + L / 2 + 0.05 && h.y0 < F + yTop && h.y1 > F + 0.05);
    // keep the doorway, the stairs and their landings clear
    if (c.floor === 0) placed.push([-c.dw - 0.6, iz1 - 1.9, c.dw + 0.6, iz1 + 0.1]);
    const st = c.stairs;
    if (st) {
      if (c.floor === 0) {
        placed.push([st.sx0 - 0.1, st.z0 - 0.1, st.sx1 + 0.1, st.zTop + 0.2]);
        placed.push([st.sx1, st.z0 - 0.1, st.sx1 + 1.1, st.z0 + 1.6]);
      } else {
        placed.push([st.sx0 - 0.1, st.holeZ0 - 0.2, st.sx1 + 0.25, st.zTop + 0.1]);
        placed.push([st.sx0 - 0.1, st.zTop, st.sx1 + 1.2, st.zTop + 1.5]);
      }
    }
    const ORDER: WallId[] = ["back", "right", "left", "front"];
    /** Find a free spot along the preferred walls (random among the first wall that has room). */
    const spot = (walls: WallId[], L: number, D: number, yTop: number, pad = 0.05): [WallId, number] | null => {
      for (const w of walls) {
        const [s0, s1] = span(w);
        const cands: number[] = [];
        for (let a = s0 + L / 2; a <= s1 - L / 2 + 1e-6; a += 0.15) {
          const r = rectOf(w, a, -L / 2, L / 2, 0, D);
          if (!inRoom(r) || hit(r, pad)) continue;
          if (!windowFree(w, a, L, yTop)) continue;
          cands.push(a);
        }
        if (cands.length) return [w, cands[Math.floor(rand() * cands.length)]!];
      }
      return null;
    };
    const take = (w: WallId, a: number, L: number, D: number, tall: boolean) => {
      placed.push(rectOf(w, a, -L / 2, L / 2, 0, D));
      if (tall) tallOn[w].push([a - L / 2, a + L / 2]);
    };
    const place = (walls: WallId[], L: number, D: number, yTop: number, build: (w: WallId, a: number) => void) => {
      const sp = spot(walls, L, D, yTop);
      if (!sp) return null;
      take(sp[0], sp[1], L, D, yTop > 1.0);
      build(sp[0], sp[1]);
      return sp;
    };
    const shuffle = (ws: WallId[]) => [...ws].sort(() => rand() - 0.5);
    const fab = () => pick(fabricCols);
    const wd = () => pick(woodCols);

    /* --- pieces --- */
    const sofa = (w: WallId, a: number, L = 2.3) => {
      const col = fab();
      const light = col;
      const h = L / 2;
      ib(w, a, -h, h, 0, 0.95, 0.08, 0.42, "fabric", col);
      ib(w, a, -h, h, 0, 0.28, 0.42, 0.98, "fabric", col);
      ib(w, a, -h, -h + 0.22, 0, 0.95, 0.42, 0.72, "fabric", col);
      ib(w, a, h - 0.22, h, 0, 0.95, 0.42, 0.72, "fabric", col);
      const seats = L > 1.6 ? 2 : 1;
      const sw = (L - 0.44) / seats;
      for (let k = 0; k < seats; k++) {
        const u0 = -h + 0.22 + k * sw + 0.01;
        ib(w, a, u0, u0 + sw - 0.02, 0.28, 0.93, 0.42, 0.57, "fabric", light);
        ib(w, a, u0, u0 + sw - 0.02, 0.28, 0.46, 0.57, 0.94, "fabric", light);
      }
      ib(w, a, h - 0.6, h - 0.3, 0.3, 0.44, 0.57, 0.82, "fabric", fab());
      for (const u of [-h + 0.08, h - 0.16]) for (const v of [0.06, 0.82]) ib(w, a, u, u + 0.08, v, v + 0.08, 0, 0.08, "plain", "#3a2a1e");
      solidI(w, a, -h, h, 0, 0.95, 0.6);
    };
    const coffeeTable = (w: WallId, a: number, v0: number) => {
      const r = rectOf(w, a, -0.6, 0.6, v0, v0 + 0.65);
      if (!inRoom(r) || hit(r)) return;
      placed.push(r);
      const col = wd();
      ib(w, a, -0.6, 0.6, v0, v0 + 0.65, 0.36, 0.43, "wood", col);
      for (const u of [-0.55, 0.49]) for (const v of [v0 + 0.05, v0 + 0.54]) ib(w, a, u, u + 0.06, v, v + 0.06, 0, 0.36, "wood", col);
      ib(w, a, -0.2, 0.15, v0 + 0.2, v0 + 0.45, 0.43, 0.47, "books", "#ffffff");
      solidI(w, a, -0.6, 0.6, v0, v0 + 0.65, 0.43);
    };
    const rug = (w: WallId, a: number, u0: number, u1: number, v0: number, v1: number) => {
      ib(w, a, u0, u1, v0, v1, 0.012, 0.03, "rug", pick(["#c2584a", "#4f7cc2", "#d8a43c", "#5c9a6a", "#8f6bb8", "#c47f9c"]));
    };
    const tvUnit = (w: WallId, a: number) => {
      ib(w, a, -0.9, 0.9, 0, 0.46, 0, 0.5, "cabinet", "#b8916a", "wood");
      ib(w, a, -0.92, 0.92, 0, 0.48, 0.5, 0.54, "wood", "#6b4a2e");
      ib(w, a, -0.16, 0.16, 0.12, 0.3, 0.54, 0.6, "plain", "#22252b");
      ib(w, a, -0.04, 0.04, 0.16, 0.24, 0.6, 0.72, "plain", "#22252b");
      ib(w, a, -0.78, 0.78, 0.15, 0.22, 0.68, 1.55, "plain", "#17191d");
      ib(w, a, -0.72, 0.72, 0.22, 0.235, 0.73, 1.5, "screen", "#ffffff");
      // little speaker + plant on the cabinet
      ib(w, a, 0.62, 0.82, 0.1, 0.3, 0.54, 0.8, "plain", "#2b2f36");
    };
    const bookshelf = (w: WallId, a: number) => {
      const col = wd();
      ib(w, a, -0.65, 0.65, 0, 0.05, 0, 2.0, "wood", col);
      ib(w, a, -0.65, -0.6, 0, 0.42, 0, 2.0, "wood", col);
      ib(w, a, 0.6, 0.65, 0, 0.42, 0, 2.0, "wood", col);
      ib(w, a, -0.65, 0.65, 0, 0.42, 1.96, 2.02, "wood", col);
      for (let k = 0; k < 4; k++) {
        const y = 0.06 + k * 0.48;
        ib(w, a, -0.6, 0.6, 0.05, 0.42, y, y + 0.04, "wood", col);
        ib(w, a, -0.58, 0.58, 0.06, 0.36, y + 0.04, y + 0.43, "books", "#ffffff");
      }
      solidI(w, a, -0.65, 0.65, 0, 0.42, 2.0);
    };
    const floorLamp = (w: WallId, a: number) => {
      cylI(w, a, 0, 0.22, 0, 0.16, 0.04, 8, "plain", "#2b2f36");
      cylI(w, a, 0, 0.22, 0.04, 0.025, 1.4, 6, "plain", "#2b2f36");
      cylI(w, a, 0, 0.22, 1.32, 0.24, 0.32, 10, "fabric", "#f3e6c8", 0.15);
      cylI(w, a, 0, 0.22, 1.36, 0.1, 0.12, 8, "glow", "#fff4c8");
    };
    const plant = (w: WallId, a: number) => {
      cylI(w, a, 0, 0.3, 0, 0.2, 0.36, 10, "plain", "#c46a3e", 0.24);
      cylI(w, a, 0, 0.3, 0.36, 0.2, 0.03, 10, "plain", "#4a3424");
      const g = pick(["#3f9a4a", "#4fae52", "#2f8a45"]);
      cylI(w, a, 0, 0.3, 0.38, 0.34, 0.5, 9, "leaf", g, 0.18);
      cylI(w, a, 0, 0.3, 0.78, 0.26, 0.42, 9, "leaf", g, 0.02);
    };
    const armchair = (w: WallId, a: number) => sofa(w, a, 1.05);
    const kitchen = (w: WallId, a: number, L: number) => {
      const h = L / 2;
      ib(w, a, -h, h, 0, 0.6, 0, 0.9, "plain", "#efece6", "wood");
      const n = Math.max(1, Math.round(L / 0.8));
      const sec = L / n;
      const stoveK = Math.min(n - 1, Math.floor(n * 0.7));
      for (let k = 0; k < n; k++) {
        const u0 = -h + k * sec + 0.02;
        ib(w, a, u0, u0 + sec - 0.04, 0.6, 0.62, 0.06, 0.86, k === stoveK ? "oven" : "cabinet", "#ffffff");
      }
      ib(w, a, -h - 0.02, h + 0.02, 0, 0.66, 0.9, 0.96, "plain", pick(["#5f5a54", "#8a8f96", "#2f3338", "#d8d2c4"]));
      // sink + faucet
      const su = -h + sec * 0.5;
      ib(w, a, su - 0.3, su + 0.3, 0.12, 0.52, 0.93, 0.965, "plain", "#9aa3ad");
      ib(w, a, su - 0.03, su + 0.03, 0.06, 0.12, 0.96, 1.22, "plain", "#c9ced4");
      ib(w, a, su - 0.03, su + 0.03, 0.06, 0.3, 1.18, 1.22, "plain", "#c9ced4");
      // cooktop burners
      const cu = -h + sec * (stoveK + 0.5);
      ib(w, a, cu - 0.34, cu + 0.34, 0.08, 0.58, 0.96, 0.975, "plain", "#22252b");
      for (const du of [-0.17, 0.17]) for (const dv of [0.2, 0.44]) cylI(w, a, cu + du, dv, 0.975, 0.09, 0.012, 10, "plain", "#55595f");
      // kettle
      cylI(w, a, cu + 0.17, 0.2, 0.987, 0.08, 0.16, 8, "plain", pick(["#d9534f", "#4a78c2", "#e0a32e"]), 0.06);
      // upper cabinets where the wall has no window
      if (windowFree(w, a, L, 2.3)) ib(w, a, -h, h, 0, 0.34, 1.55, 2.25, "cabinet", "#ffffff");
      // kitchen tiles on the floor in front
      ib(w, a, -h - 0.3, h + 0.3, 0, 1.9, 0.006, 0.014, "tile", "#ffffff");
    };
    const fridgeI = (w: WallId, a: number) => {
      ib(w, a, -0.42, 0.42, 0, 0.7, 0, 1.95, "plain", "#eef1f4", "metal");
      ib(w, a, -0.4, 0.4, 0.7, 0.715, 0.03, 1.92, "fridge", "#ffffff");
    };
    const bed = (w: WallId, a: number, L = 1.7, D = 2.25) => {
      const col = wd();
      const h = L / 2;
      ib(w, a, -h, h, 0, 0.1, 0, 1.15, "wood", col);
      ib(w, a, -h, h, 0.1, D, 0.1, 0.36, "wood", col);
      for (const u of [-h, h - 0.08]) ib(w, a, u, u + 0.08, D - 0.08, D, 0, 0.1, "wood", col);
      ib(w, a, -h + 0.05, h - 0.05, 0.1, D - 0.04, 0.36, 0.58, "plain", "#f6f4ef");
      ib(w, a, -h + 0.02, h - 0.02, 0.75, D, 0.42, 0.64, "quilt", pick(["#ffffff", "#ffe9d6", "#e3f0ff", "#e9ffe6"]));
      for (const u0 of L > 1.2 ? [-h + 0.12, 0.04] : [-h + 0.12]) ib(w, a, u0, u0 + (L > 1.2 ? h - 0.2 : L - 0.24), 0.16, 0.52, 0.58, 0.76, "fabric", "#ffffff");
      solidI(w, a, -h, h, 0, D, 0.6);
    };
    const nightstand = (w: WallId, a: number) => {
      ib(w, a, -0.25, 0.25, 0, 0.42, 0, 0.55, "drawers", "#c99a68", "wood");
      ib(w, a, -0.26, 0.26, 0, 0.44, 0.55, 0.59, "wood", "#6b4a2e");
      cylI(w, a, 0, 0.22, 0.59, 0.07, 0.22, 8, "plain", "#d9c9a6");
      cylI(w, a, 0, 0.22, 0.78, 0.16, 0.2, 10, "fabric", "#f3e6c8", 0.1);
      cylI(w, a, 0, 0.22, 0.8, 0.06, 0.1, 8, "glow", "#fff4c8");
    };
    const wardrobe = (w: WallId, a: number) => {
      const col = wd();
      ib(w, a, -0.68, 0.68, 0, 0.6, 0, 2.15, "wood", col, "wood");
      ib(w, a, -0.64, 0.64, 0.6, 0.62, 0.08, 2.08, "cabinet", "#d9b88f");
    };
    const dresser = (w: WallId, a: number) => {
      ib(w, a, -0.62, 0.62, 0, 0.48, 0, 0.86, "wood", wd(), "wood");
      ib(w, a, -0.58, 0.58, 0.48, 0.5, 0.04, 0.82, "drawers", "#e8d2b0");
      ib(w, a, -0.64, 0.64, 0, 0.5, 0.86, 0.9, "wood", "#6b4a2e");
      cylI(w, a, 0.35, 0.22, 0.9, 0.09, 0.18, 8, "plain", pick(["#5f97d6", "#e56b6f", "#7fc8a9"]), 0.06);
    };
    const desk = (w: WallId, a: number) => {
      const col = wd();
      ib(w, a, -0.62, 0.62, 0, 0.62, 0.74, 0.79, "wood", col);
      for (const u of [-0.6, 0.54]) ib(w, a, u, u + 0.06, 0.02, 0.6, 0, 0.74, "wood", col);
      ib(w, a, -0.3, 0.3, 0.08, 0.12, 0.85, 1.2, "plain", "#17191d");
      ib(w, a, -0.27, 0.27, 0.12, 0.125, 0.88, 1.17, "screen", "#ffffff");
      ib(w, a, -0.05, 0.05, 0.05, 0.12, 0.79, 0.85, "plain", "#17191d");
      ib(w, a, -0.25, 0.2, 0.25, 0.42, 0.79, 0.81, "plain", "#2b2f36");
      // chair
      ib(w, a, -0.24, 0.24, 0.75, 1.2, 0.42, 0.48, "fabric", fab());
      ib(w, a, -0.24, 0.24, 1.15, 1.2, 0.48, 0.95, "fabric", fab());
      cylI(w, a, 0, 0.98, 0, 0.04, 0.42, 6, "plain", "#2b2f36");
      solidI(w, a, -0.62, 0.62, 0, 0.62, 0.79);
    };
    const filing = (w: WallId, a: number) => {
      ib(w, a, -0.3, 0.3, 0, 0.6, 0, 1.3, "plain", "#8f98a3", "metal");
      ib(w, a, -0.28, 0.28, 0.6, 0.615, 0.04, 1.26, "drawers", "#c9d1da");
    };
    const painting = () => {
      for (const w of shuffle(ORDER)) {
        const [s0, s1] = span(w);
        for (let tries = 0; tries < 8; tries++) {
          const a = s0 + 0.7 + rand() * Math.max(0, s1 - s0 - 1.4);
          if (!windowFree(w, a, 1.0, 2.45)) continue;
          if (tallOn[w].some(([p, q]) => a + 0.5 > p && a - 0.5 < q)) continue;
          if (w === "front" && c.floor === 0 && Math.abs(a) < c.dw + 0.8) continue;
          if (st && w === "left" && a < st.zTop + 0.6) continue;
          tallOn[w].push([a - 0.5, a + 0.5]);
          ib(w, a, -0.48, 0.48, 0, 0.04, 1.45, 2.2, rand() < 0.5 ? "painting" : "painting2", "#ffffff");
          return;
        }
      }
    };
    const baseboards = () => {
      for (const w of ORDER) {
        const [s0, s1] = span(w);
        const cuts = c.holes[w].filter((h) => h.y0 <= F + 0.15 && h.y1 > F + 0.15);
        let a0 = s0;
        const segs: [number, number][] = [];
        for (const h of [...cuts].sort((p, q) => p.a0 - q.a0)) {
          const lo = w === "front" || w === "right" ? h.a0 : h.a0;
          if (lo > a0) segs.push([a0, lo]);
          a0 = Math.max(a0, h.a1);
        }
        if (a0 < s1) segs.push([a0, s1]);
        for (const [p, q] of segs) {
          const r = rectOf(w, 0, 0, 0, 0, 0);
          void r;
          const m = (p + q) / 2;
          // segment centred at m in wall coordinates: u = 0 means a = m
          ib(w, m, -(q - p) / 2, (q - p) / 2, 0, 0.035, 0, 0.13, "plain", c.trim);
        }
      }
    };
    const ceilingLight = () => {
      const cx = (ix0 + ix1) / 2 + (c.stairs ? 0.7 : 0);
      const cz = (iz0 + iz1) / 2;
      kit.cyl(cx, c.ceil - 0.16, cz, 0.32, 0.12, 12, "glow", "#fff6d8", false, true, 0.36);
      kit.cyl(cx, c.ceil - 0.05, cz, 0.04, 0.05, 6, "plain", "#2b2f36", false);
    };

    /* --- rooms --- */
    const area = (ix1 - ix0) * (iz1 - iz0);
    baseboards();
    ceilingLight();
    if (c.interior === "store") {
      // drinks fridges on the back wall, shelving islands, and a checkout counter by the door
      for (let k = 0; k < 3; k++)
        place(["back"], 1.3, 0.7, 2.1, (w, a) => {
          ib(w, a, -0.65, 0.65, 0, 0.7, 0, 2.1, "plain", "#e9edf1", "metal");
          ib(w, a, -0.6, 0.6, 0.7, 0.715, 0.1, 2.0, "products", "#ffffff");
          ib(w, a, -0.6, 0.6, 0.716, 0.72, 0.1, 2.0, "glow", "#cfe9ff");
        });
      const rows = Math.max(1, Math.floor((ix1 - ix0 - 2) / 2.2));
      for (let k = 0; k < rows; k++) {
        const x = ix0 + 1.6 + k * 2.2;
        if (Math.abs(x) < 0.9) continue;
        const r: Rect = [x - 0.45, iz0 + 1.8, x + 0.45, iz1 - 2.4];
        if (r[3] - r[1] < 1.4 || hit(r)) continue;
        placed.push(r);
        kit.box(r[0], F, r[1], r[2], F + 1.55, r[3], "plain", "#c9ced4", "metal");
        // product facings in ~1 m sections so the shelves read as many items
        const len = r[3] - r[1] - 0.1;
        const nSec = Math.max(1, Math.round(len / 1.0));
        for (let j = 0; j < nSec; j++) {
          const z0 = r[1] + 0.05 + (j * len) / nSec;
          const z1 = z0 + len / nSec - 0.02;
          kit.box(r[0] - 0.015, F + 0.08, z0, r[0], F + 1.5, z1, "products", "#ffffff", false);
          kit.box(r[2], F + 0.08, z0, r[2] + 0.015, F + 1.5, z1, "products", "#ffffff", false);
        }
        kit.box(r[0] - 0.05, F + 1.55, r[1], r[2] + 0.05, F + 1.62, r[3], "plain", "#e74c3c", false);
      }
      place(["right", "left"], 2.2, 0.8, 1.0, (w, a) => {
        ib(w, a, -1.1, 1.1, 0, 0.8, 0, 0.95, "wood", "#8a5a35", "wood");
        ib(w, a, -1.12, 1.12, 0, 0.82, 0.95, 1.0, "plain", "#2f3338");
        ib(w, a, 0.3, 0.75, 0.2, 0.55, 1.0, 1.25, "plain", "#22252b");
        ib(w, a, 0.33, 0.72, 0.55, 0.56, 1.05, 1.22, "screen", "#ffffff");
      });
    } else if (c.interior === "office") {
      for (let k = 0; k < 3; k++) place(shuffle(ORDER), 1.24, 1.25, 1.2, desk);
      for (let k = 0; k < 2; k++) place(shuffle(ORDER), 0.6, 0.62, 1.3, filing);
      place(shuffle(ORDER), 1.3, 0.42, 2.0, bookshelf);
      place(shuffle(ORDER), 0.6, 0.6, 1.2, plant);
      // water cooler
      place(shuffle(ORDER), 0.45, 0.45, 1.4, (w, a) => {
        ib(w, a, -0.2, 0.2, 0, 0.4, 0, 0.95, "plain", "#e9edf1", "metal");
        cylI(w, a, 0, 0.2, 0.95, 0.16, 0.42, 10, "glass", "#8fd3f4");
      });
    } else if (c.interior === "barn") {
      for (let k = 0; k < 6; k++)
        place(shuffle(ORDER), 1.3, 0.75, 1.6, (w, a) => {
          const n = 1 + Math.floor(rand() * 2);
          for (let j = 0; j < n; j++) ib(w, a, -0.62, 0.62, 0.02, 0.72, j * 0.68, j * 0.68 + 0.66, "hay", "#ffffff", "wood");
        });
      place(shuffle(ORDER), 2.0, 0.75, 1.0, (w, a) => {
        ib(w, a, -1.0, 1.0, 0, 0.75, 0.88, 0.96, "wood", "#7a5233", "wood");
        for (const u of [-0.95, 0.89]) ib(w, a, u, u + 0.06, 0.05, 0.7, 0, 0.88, "wood", "#5a3d26");
        ib(w, a, -0.6, -0.1, 0.15, 0.45, 0.96, 1.18, "plain", "#c0392b");
      });
    } else if (c.floor === 0) {
      // living room + kitchen
      const kitchenL = Math.min(3.4, Math.max(1.6, (ix1 - ix0) * 0.4));
      const k = place(c.floors === 2 ? ["back", "right", "front"] : ["back", "left", "right"], kitchenL, 0.68, 0.98, (w, a) => kitchen(w, a, kitchenL));
      if (k && area > 50) {
        // fridge next to the counter if the wall has room
        const [w, a] = k;
        for (const side of [1, -1]) {
          const fa = a + side * (kitchenL / 2 + 0.45);
          const r = rectOf(w, fa, -0.42, 0.42, 0, 0.72);
          if (inRoom(r) && !hit(r) && windowFree(w, fa, 0.84, 1.95)) {
            take(w, fa, 0.84, 0.72, true);
            fridgeI(w, fa);
            break;
          }
        }
      }
      const s1 = place(shuffle(["right", "left", "front", "back"]), 2.3, 1.0, 0.98, (w, a) => sofa(w, a));
      if (s1) {
        coffeeTable(s1[0], s1[1], 1.35);
        rug(s1[0], s1[1], -1.4, 1.4, 1.05, 2.6);
        // TV on the facing wall if possible, otherwise anywhere it fits
        const opp: Record<WallId, WallId> = { back: "front", front: "back", left: "right", right: "left" };
        place([opp[s1[0]], ...shuffle(ORDER)], 1.85, 0.5, 1.6, tvUnit);
      } else place(shuffle(ORDER), 1.85, 0.5, 1.6, tvUnit);
      place(shuffle(ORDER), 1.3, 0.42, 2.0, bookshelf);
      if (area > 60) place(shuffle(ORDER), 1.05, 0.95, 0.98, armchair);
      place(shuffle(ORDER), 0.44, 0.44, 1.75, floorLamp);
      place(shuffle(ORDER), 0.6, 0.6, 1.2, plant);
      if (c.floors === 1) {
        // single storey: bedroom corner
        if (place(shuffle(ORDER), 1.7, 2.25, 1.15, (w, a) => bed(w, a))) place(shuffle(ORDER), 0.52, 0.44, 0.98, nightstand);
        else if (place(shuffle(ORDER), 1.0, 2.1, 1.15, (w, a) => bed(w, a, 1.0, 2.1))) place(shuffle(ORDER), 0.52, 0.44, 0.98, nightstand);
      }
      // dining table in an open spot near the middle of the room
      if (area > 55) {
        for (let tries = 0; tries < 30; tries++) {
          const x = ix0 + 1.6 + rand() * Math.max(0, ix1 - ix0 - 3.2);
          const z = iz0 + 1.6 + rand() * Math.max(0, iz1 - iz0 - 3.2);
          const r: Rect = [x - 1.0, z - 0.85, x + 1.0, z + 0.85];
          if (!inRoom(r) || hit(r, 0.35) || Math.abs(x) < 0.9) continue;
          placed.push(r);
          const col = wd();
          kit.box(x - 0.7, F + 0.72, z - 0.45, x + 0.7, F + 0.78, z + 0.45, "wood", col, false);
          for (const dx of [-0.64, 0.58]) for (const dz of [-0.4, 0.34]) kit.box(x + dx, F, z + dz, x + dx + 0.06, F + 0.72, z + dz + 0.06, "wood", col, false);
          kit.solid(x - 0.7, F, z - 0.45, x + 0.7, F + 0.78, z + 0.45);
          const cc = fab();
          for (const sx of [-0.35, 0.35])
            for (const sz of [-1, 1]) {
              const cz = z + sz * 0.68;
              kit.box(x + sx - 0.2, F + 0.42, cz - 0.2, x + sx + 0.2, F + 0.48, cz + 0.2, "fabric", cc, false);
              kit.box(x + sx - 0.2, F + 0.48, cz + sz * 0.16, x + sx + 0.2, F + 0.98, cz + sz * 0.2, "wood", col, false);
              for (const lx of [-0.18, 0.14]) for (const lz of [-0.18, 0.14]) kit.box(x + sx + lx, F, cz + lz, x + sx + lx + 0.04, F + 0.42, cz + lz + 0.04, "wood", col, false);
            }
          // fruit bowl
          kit.cyl(x, F + 0.78, z, 0.2, 0.08, 10, "plain", "#f2efe8", false, true, 0.24);
          kit.cyl(x - 0.06, F + 0.84, z, 0.07, 0.08, 8, "plain", "#e74c3c", false);
          kit.cyl(x + 0.07, F + 0.84, z + 0.04, 0.07, 0.08, 8, "plain", "#f1c40f", false);
          break;
        }
      }
    } else {
      // upstairs bedroom
      if (!place(shuffle(["back", "right", "front"]), 1.7, 2.25, 1.15, (w, a) => bed(w, a)))
        place(shuffle(ORDER), 1.0, 2.1, 1.15, (w, a) => bed(w, a, 1.0, 2.1));
      place(shuffle(ORDER), 0.52, 0.44, 0.98, nightstand);
      place(shuffle(ORDER), 1.36, 0.62, 2.15, wardrobe);
      place(shuffle(ORDER), 1.28, 0.5, 0.95, dresser);
      if (area > 50) place(shuffle(ORDER), 1.24, 1.25, 1.2, desk);
      place(shuffle(ORDER), 0.6, 0.6, 1.2, plant);
      // bedroom rug in the open middle
      for (let tries = 0; tries < 20; tries++) {
        const x = ix0 + 1.5 + rand() * Math.max(0, ix1 - ix0 - 3);
        const z = iz0 + 1.5 + rand() * Math.max(0, iz1 - iz0 - 3);
        const r: Rect = [x - 1.1, z - 0.8, x + 1.1, z + 0.8];
        if (!inRoom(r) || hit(r)) continue;
        kit.box(r[0], F + 0.012, r[1], r[2], F + 0.03, r[3], "rug", pick(["#c2584a", "#4f7cc2", "#d8a43c", "#5c9a6a", "#8f6bb8"]), false);
        break;
      }
    }
    painting();
    if (area > 40) painting();

    /* --- chests: against a wall, facing into the room, like Fortnite (bedrooms, corners, kitchens) --- */
    const yawOf: Record<WallId, number> = { back: 0, front: Math.PI, left: Math.PI / 2, right: -Math.PI / 2 };
    const want = c.minChests + (rand() < 0.6 ? 1 : 0) + (area > 70 && rand() < 0.3 ? 1 : 0);
    for (let k = 0; k < Math.max(1, want); k++) {
      if (k >= c.minChests && rand() > 0.85 && k > 0) break;
      const sp = spot(shuffle(ORDER), 1.2, 0.9, 0.7, 0.12);
      if (!sp) break;
      take(sp[0], sp[1], 1.2, 0.9, false);
      const [x, z] = P(sp[0], sp[1], 0, 0.42);
      kit.addLoot("chest", x, F, z, yawOf[sp[0]]);
    }
    // a little floor loot in the open
    for (let tries = 0; tries < 12; tries++) {
      const x = ix0 + 1 + rand() * Math.max(0, ix1 - ix0 - 2);
      const z = iz0 + 1 + rand() * Math.max(0, iz1 - iz0 - 2);
      if (hit([x - 0.4, z - 0.4, x + 0.4, z + 0.4])) continue;
      kit.addLoot("floor", x, F, z);
      break;
    }
  }

  function house(o: HouseOpts) {
    const { w, d, floors } = o;
    const T = 0.32;
    const H = o.H ?? 3.3;
    const trim = o.trim ?? "#f7f4ee";
    const hw = w / 2;
    const hd = d / 2;
    const raised = o.foundation !== false;
    const L0 = raised ? 0.5 : 0.15;
    const L1 = L0 + H + 0.25;
    const top = L0 + floors * (H + 0.25) - 0.25;
    const dw = (o.doorW ?? 1.4) / 2;
    const dh = o.doorH ?? 2.4;
    const inside = o.inside ?? (o.interior === "barn" ? "#b98552" : o.wallMat === "metal" ? "#c9d1da" : pick(["#f1e6d2", "#e2ecf2", "#f3e0df", "#e6f0dc", "#efe6c8", "#dfe9f7", "#f6e7c1"]));
    kit.inMat = o.interior === "barn" ? "plank" : o.wallMat === "metal" ? "metal" : rand() < 0.5 ? "wallpaper" : "wallpaper2";
    kit.aoFloor = kit.oy + L0;
    if (raised) {
      kit.box(-hw - 0.25, -1.2, -hd - 0.25, hw + 0.25, L0, hd + 0.25, "stone", "#b7b0a6", true);
      // front steps
      kit.box(-dw - 0.5, -1, hd + 0.25, dw + 0.5, L0 * 0.66, hd + 0.8, "concrete", "#c9c5bd", true);
      kit.box(-dw - 0.5, -1, hd + 0.8, dw + 0.5, L0 * 0.33, hd + 1.35, "concrete", "#c9c5bd", true);
    } else kit.box(-hw - 0.2, -1.2, -hd - 0.2, hw + 0.2, L0, hd + 0.2, "concrete", "#a7a39b", true);
    kit.box(-hw + T, L0, -hd + T, hw - T, L0 + 0.02, hd - T, "plank", "#c48f5a", false);

    // openings
    type Hole = { a0: number; a1: number; y0: number; y1: number };
    const front: Hole[] = [{ a0: -dw, a1: dw, y0: L0, y1: L0 + dh }];
    const back: Hole[] = [];
    const left: Hole[] = [];
    const right: Hole[] = [];
    const winW = 1.3;
    const winH = 1.3;
    for (let f = 0; f < floors; f++) {
      const fy = L0 + f * (H + 0.25);
      const y0 = fy + 0.95;
      const y1 = y0 + winH;
      if (o.glassFront && f === 0) {
        const g0 = fy + 0.55;
        const g1 = fy + Math.min(H - 0.35, 2.75);
        if (hw - dw > 1.6) {
          front.push({ a0: -hw + 0.7, a1: -dw - 0.45, y0: g0, y1: g1 });
          front.push({ a0: dw + 0.45, a1: hw - 0.7, y0: g0, y1: g1 });
        }
      } else if (hw - dw > winW + 0.9) {
        const c = dw + (hw - dw) / 2;
        front.push({ a0: -c - winW / 2, a1: -c + winW / 2, y0, y1 }, { a0: c - winW / 2, a1: c + winW / 2, y0, y1 });
      }
      if (f > 0) front.push({ a0: -winW / 2, a1: winW / 2, y0, y1 });
      if (w >= 6) back.push({ a0: -hw / 2 - winW / 2, a1: -hw / 2 + winW / 2, y0, y1 }, { a0: hw / 2 - winW / 2, a1: hw / 2 + winW / 2, y0, y1 });
      const sideZs = d >= 9 ? [-hd / 2, hd / 2] : [0];
      for (const z of sideZs) {
        // keep the stair wall clear of windows where the stairs run
        if (!(floors === 2 && z < 1)) left.push({ a0: z - winW / 2, a1: z + winW / 2, y0, y1 });
        right.push({ a0: z - winW / 2, a1: z + winW / 2, y0, y1 });
      }
    }
    const wc = o.wall;
    kit.wall(true, -hw, hw, hd - T, hd, L0, top, front, 1, o.wallMat, wc, inside, o.harvest);
    kit.wall(true, -hw, hw, -hd, -hd + T, L0, top, back, -1, o.wallMat, wc, inside, o.harvest);
    kit.wall(false, -hd + T, hd - T, -hw, -hw + T, L0, top, left, -1, o.wallMat, wc, inside, o.harvest);
    kit.wall(false, -hd + T, hd - T, hw - T, hw, L0, top, right, 1, o.wallMat, wc, inside, o.harvest);
    // corner boards
    for (const [cx, cz] of [
      [-hw, -hd],
      [hw, -hd],
      [hw, hd],
      [-hw, hd],
    ] as const)
      kit.box(cx - 0.14, L0, cz - 0.14, cx + 0.14, top, cz + 0.14, "plain", trim, false);
    // band between floors
    if (floors === 2) {
      kit.box(-hw - 0.06, L1 - 0.3, hd - 0.02, hw + 0.06, L1 - 0.12, hd + 0.08, "plain", trim, false);
      kit.box(-hw - 0.06, L1 - 0.3, -hd - 0.08, hw + 0.06, L1 - 0.12, -hd + 0.02, "plain", trim, false);
    }

    // window dressing: jambs, casing, sill, cross mullions, shutters, glass
    const shutter = o.shutters ?? pick(["#f7f4ee", "#3d5a80", "#5f7f4f", "#8c3b3b", "#2f3e46"]);
    const dress = (holes: Hole[], alongX: boolean, f0: number, f1: number, out: 1 | -1, isFront: boolean) => {
      for (const h of holes) {
        if (isFront && h.y0 <= L0 + 0.01) continue; // the door
        const fo = out > 0 ? f1 : f0;
        const ext = (a0: number, a1: number, y0: number, y1: number, depth0: number, depth1: number, color: string) => {
          const z0 = fo + out * depth0;
          const z1 = fo + out * depth1;
          if (alongX) kit.box(a0, y0, Math.min(z0, z1), a1, y1, Math.max(z0, z1), "plain", color, false);
          else kit.box(Math.min(z0, z1), y0, a0, Math.max(z0, z1), y1, a1, "plain", color, false);
        };
        const jt = 0.07;
        // jambs line the opening through the wall
        const J = (a0: number, a1: number, y0: number, y1: number) =>
          alongX ? kit.box(a0, y0, f0, a1, y1, f1, "plain", trim, false) : kit.box(f0, y0, a0, f1, y1, a1, "plain", trim, false);
        J(h.a0, h.a1, h.y0, h.y0 + jt);
        J(h.a0, h.a1, h.y1 - jt, h.y1);
        J(h.a0, h.a0 + jt, h.y0, h.y1);
        J(h.a1 - jt, h.a1, h.y0, h.y1);
        // casing + sill
        ext(h.a0 - 0.16, h.a0, h.y0 - 0.05, h.y1 + 0.16, 0, 0.06, trim);
        ext(h.a1, h.a1 + 0.16, h.y0 - 0.05, h.y1 + 0.16, 0, 0.06, trim);
        ext(h.a0 - 0.16, h.a1 + 0.16, h.y1, h.y1 + 0.18, 0, 0.08, trim);
        ext(h.a0 - 0.24, h.a1 + 0.24, h.y0 - 0.14, h.y0, 0, 0.2, trim);
        // mullions (cross) in the glass plane
        const mid = (f0 + f1) / 2;
        const big = h.a1 - h.a0 > 2;
        const am = (h.a0 + h.a1) / 2;
        const ym = (h.y0 + h.y1) / 2;
        const M = (a0: number, a1: number, y0: number, y1: number) =>
          alongX ? kit.box(a0, y0, mid - 0.04, a1, y1, mid + 0.04, "plain", trim, false) : kit.box(mid - 0.04, y0, a0, mid + 0.04, y1, a1, "plain", trim, false);
        if (big) {
          for (let k = 1; k < 3; k++) {
            const ax = h.a0 + ((h.a1 - h.a0) * k) / 3;
            M(ax - 0.04, ax + 0.04, h.y0, h.y1);
          }
        } else {
          M(am - 0.035, am + 0.035, h.y0, h.y1);
          M(h.a0, h.a1, ym - 0.035, ym + 0.035);
        }
        if (alongX) kit.addGlass(h.a0, h.y0, mid - 0.025, h.a1, h.y1, mid + 0.025);
        else kit.addGlass(mid - 0.025, h.y0, h.a0, mid + 0.025, h.y1, h.a1);
        // shutters on regular windows
        if (!big && o.wallMat !== "brick") {
          const sw = (h.a1 - h.a0) * 0.42;
          for (const [s0, s1] of [
            [h.a0 - 0.2 - sw, h.a0 - 0.2],
            [h.a1 + 0.2, h.a1 + 0.2 + sw],
          ] as const) {
            const z0 = fo + out * 0.02;
            const z1 = fo + out * 0.1;
            if (alongX) kit.box(s0, h.y0, Math.min(z0, z1), s1, h.y1, Math.max(z0, z1), "siding", shutter, false);
            else kit.box(Math.min(z0, z1), h.y0, s0, Math.max(z0, z1), h.y1, s1, "siding", shutter, false);
          }
        }
      }
    };
    dress(front, true, hd - T, hd, 1, true);
    dress(back, true, -hd, -hd + T, -1, false);
    dress(left, false, -hw, -hw + T, -1, false);
    dress(right, false, hw - T, hw, 1, false);

    // door: frame + hinged leaf
    kit.box(-dw - 0.2, L0, hd - 0.02, -dw, L0 + dh + 0.2, hd + 0.1, "plain", trim, false);
    kit.box(dw, L0, hd - 0.02, dw + 0.2, L0 + dh + 0.2, hd + 0.1, "plain", trim, false);
    kit.box(-dw - 0.2, L0 + dh, hd - 0.02, dw + 0.2, L0 + dh + 0.22, hd + 0.1, "plain", trim, false);
    kit.box(-dw, L0 + dh, hd - T, dw, L0 + dh + 0.02, hd, "plain", trim, false);
    kit.addDoor(-dw, dw, hd - T / 2, L0, dh, T, o.doorColor ?? pick(["#8a5a32", "#a8402f", "#2f5f8a", "#3f6a3a", "#f2efe8"]));

    // upper floor with a stairwell
    if (floors === 2) {
      const sx0 = -hw + T;
      const sx1 = sx0 + 1.4;
      const z0 = -hd + T;
      const run = (L1 - L0) / 0.74;
      const zTop = z0 + run;
      // the stairwell opening is long enough that your head clears the upper floor all the way up
      const holeZ0 = zTop - Math.min(run - 0.4, 3.4);
      kit.stairs(sx0, z0, sx1, zTop, L0, L1, "+z", "#9a6a3e");
      kit.box(sx1 + 0.05, L1 - 0.25, -hd + T, hw - T, L1, hd - T, "plank", "#b98552", true);
      kit.box(sx0, L1 - 0.25, -hd + T, sx1 + 0.05, L1, holeZ0, "plank", "#b98552", true);
      kit.box(sx0, L1 - 0.25, zTop, sx1 + 0.05, L1, hd - T, "plank", "#b98552", true);
      // balusters + handrail around the stairwell
      for (let z = holeZ0; z <= zTop; z += 0.5) kit.box(sx1 + 0.05, L1, z - 0.03, sx1 + 0.11, L1 + 0.95, z + 0.03, "plain", trim, false);
      kit.box(sx1 + 0.02, L1 + 0.95, holeZ0, sx1 + 0.16, L1 + 1.05, zTop, "plain", "#6b4a2e", false);
      kit.solid(sx1 + 0.02, L1, holeZ0, sx1 + 0.16, L1 + 1, zTop);
      kit.box(sx0, L1, holeZ0 - 0.1, sx1 + 0.15, L1 + 1, holeZ0, "plain", "#6b4a2e", true);
    }
    // ceiling + roof
    if (o.roof === "flat") {
      kit.box(-hw, top, -hd, hw, top + 0.3, hd, "concrete", "#8f8b84", true);
      const pz = 0.8;
      kit.box(-hw - 0.05, top + 0.3, -hd - 0.05, hw + 0.05, top + 0.3 + pz, -hd + 0.25, o.wallMat, o.wall, o.harvest);
      kit.box(-hw - 0.05, top + 0.3, hd - 0.25, hw + 0.05, top + 0.3 + pz, hd + 0.05, o.wallMat, o.wall, o.harvest);
      kit.box(-hw - 0.05, top + 0.3, -hd + 0.25, -hw + 0.25, top + 0.3 + pz, hd - 0.25, o.wallMat, o.wall, o.harvest);
      kit.box(-hw - 0.1, top + 0.3 + pz, -hd - 0.1, hw + 0.1, top + 0.45 + pz, hd + 0.1, "plain", trim, false);
      if (o.roofStairs) {
        kit.box(hw - 0.25, top + 0.3, -hd + 0.25, hw + 0.05, top + 0.3 + pz, hd - 2.2, o.wallMat, o.wall, o.harvest);
        const run = (top + 0.3) / 0.72;
        kit.stairs(hw, hd - run + 0.2, hw + 1.5, hd + 0.2, 0, top + 0.3, "-z", "#7b7b7b", "concrete");
        kit.box(hw + 1.5, 0, hd - run + 0.2, hw + 1.62, top + 1.3, hd + 0.2, "plain", "#5e5e5e", true);
      } else kit.box(hw - 0.25, top + 0.3, -hd + 0.25, hw + 0.05, top + 0.3 + pz, hd - 0.25, o.wallMat, o.wall, o.harvest);
      if (o.sign) {
        signs.push({ text: o.sign, frame: [kit.ox, kit.oy, kit.oz, kit.r], lx: 0, ly: top + 0.3 + pz + 0.9, lz: hd + 0.12, w: Math.min(w - 1, 7) });
        kit.box(-Math.min(w - 1, 7) / 2 - 0.15, top + 0.3 + pz, hd - 0.05, Math.min(w - 1, 7) / 2 + 0.15, top + 0.3 + pz + 1.8, hd + 0.08, "plain", "#2d3e50", false);
      }
    } else {
      kit.box(-hw, top, -hd, hw, top + 0.25, hd, "plain", "#7a6a5a", true);
      if (o.roof === "hip") kit.hip(-hw, -hd, hw, hd, top + 0.25, Math.min(w, d) * 0.36, o.roofColor ?? "#a0523d");
      else {
        const ridgeZ = !!o.ridgeZ;
        const rise = (ridgeZ ? w : d) * 0.32;
        kit.gable(-hw, -hd, hw, hd, top + 0.25, rise, ridgeZ, o.roofColor ?? "#b5523f", o.wallMat, o.wall);
      }
      if (o.chimney) {
        kit.box(hw * 0.4, top, -hd * 0.35, hw * 0.4 + 0.9, top + Math.min(w, d) * 0.36 + 1.3, -hd * 0.35 + 0.9, "stone", "#b0a79a", true);
        kit.box(hw * 0.4 - 0.08, top + Math.min(w, d) * 0.36 + 1.3, -hd * 0.35 - 0.08, hw * 0.4 + 0.98, top + Math.min(w, d) * 0.36 + 1.45, -hd * 0.35 + 0.98, "plain", "#6b6158", false);
      }
    }
    // porch with railings
    if (o.porch) {
      const py = raised ? L0 : 0.32;
      kit.box(-hw + 0.4, -0.6, hd + 0.25, hw - 0.4, py, hd + 2.6, "plank", "#a8784a", true);
      for (const px of [-hw + 0.55, hw - 0.75]) kit.box(px, py, hd + 2.3, px + 0.22, top - 0.2, hd + 2.52, "plain", trim, true);
      kit.box(-hw + 0.2, top - 0.25, hd, hw - 0.2, top, hd + 2.8, "plain", o.roofColor ?? "#b5523f", true);
      for (const side of [-1, 1]) {
        const xA = side < 0 ? -hw + 0.6 : dw + 0.6;
        const xB = side < 0 ? -dw - 0.6 : hw - 0.6;
        kit.box(xA, py + 0.85, hd + 2.38, xB, py + 0.95, hd + 2.48, "plain", trim, false);
        for (let x = xA; x <= xB; x += 0.35) kit.box(x - 0.03, py, hd + 2.4, x + 0.03, py + 0.85, hd + 2.46, "plain", trim, false);
        kit.solid(xA, py, hd + 2.36, xB, py + 0.95, hd + 2.5);
      }
    }
    // furniture + chests, laid out per floor by the room planner
    kit.route = {
      door: [0, hd],
      floorY: L0,
      hw,
      hd,
      stairs: floors === 2 ? [-hw + T + 0.7, -hd + T + 0.4, -hd + T + (L1 - L0) / 0.74 + 0.8, L0, L1] : undefined,
    };
    const stairsInfo = floors === 2 ? { sx0: -hw + T, sx1: -hw + T + 1.4, z0: -hd + T, zTop: -hd + T + (L1 - L0) / 0.74, holeZ0: -hd + T + (L1 - L0) / 0.74 - Math.min((L1 - L0) / 0.74 - 0.4, 3.4) } : null;
    const holes = { front, back, left, right };
    for (let f = 0; f < floors; f++) {
      const F = f === 0 ? L0 : L1;
      const ceil = f === 0 ? (floors === 2 ? L1 - 0.25 : top) : top;
      furnish({ hw, hd, T, F, ceil, floor: f, floors, dw, holes, stairs: stairsInfo, interior: o.interior ?? "home", minChests: f === 0 ? 1 : 0, trim });
    }
    // an ammo box in about one house in four
    if (rand() < 0.26) kit.addLoot("ammo", hw - 1.0, L0, hd - 1.2);
    kit.route = null;
    kit.aoFloor = null;
  }

  /** Painted shop signs (rendered after the kit as small canvas-textured planes). */
  const signs: { text: string; frame: [number, number, number, number]; lx: number; ly: number; lz: number; w: number }[] = [];

  function warehouse(color: string) {
    const w = 22;
    const d = 16;
    const H = 8;
    const T = 0.4;
    const hw = w / 2;
    const hd = d / 2;
    const dw = 3;
    const dh = 5.5;
    kit.box(-hw - 0.3, -1.2, -hd - 0.3, hw + 0.3, 0.15, hd + 0.3, "concrete", "#9a978f", true);
    for (const side of [-1, 1]) {
      const z0 = side < 0 ? -hd : hd - T;
      kit.box(-hw, 0.15, z0, -dw, H, z0 + T, "metal", color, "metal");
      kit.box(dw, 0.15, z0, hw, H, z0 + T, "metal", color, "metal");
      kit.box(-dw, dh, z0, dw, H, z0 + T, "metal", color, "metal");
      kit.box(-dw - 0.25, 0.15, z0 - 0.05, -dw, dh, z0 + T + 0.05, "plain", "#f0c43a", false);
      kit.box(dw, 0.15, z0 - 0.05, dw + 0.25, dh, z0 + T + 0.05, "plain", "#f0c43a", false);
    }
    kit.box(-hw, 0.15, -hd + T, -hw + T, H, hd - T, "metal", color, "metal");
    kit.box(hw - T, 0.15, -hd + T, hw, H, hd - T, "metal", color, "metal");
    kit.box(-hw - 0.4, H, -hd - 0.4, hw + 0.4, H + 0.35, hd + 0.4, "metal", "#8e949b", true);
    // skylight strip
    kit.box(-hw + 2, H + 0.35, -1, hw - 2, H + 0.45, 1, "glass", "#9fd0ee", false);
    // mezzanine at the back + stairs
    const my = 4;
    kit.box(-hw + T, my - 0.3, -hd + T, hw - T, my, -hd + T + 3.2, "metal", "#6d737a", true);
    kit.box(-hw + T + 1.6, my, -hd + T + 3.1, hw - T, my + 1, -hd + T + 3.2, "plain", "#f0c43a", true);
    kit.stairs(-hw + T, -hd + T + 3.2, -hw + T + 1.5, -hd + T + 3.2 + my / 0.72, 0.15, my, "-z", "#6d737a", "metal");
    // shelving
    for (const sx of [-5, 1, 7]) {
      kit.box(sx - 0.5, 0.15, -1, sx + 0.5, 3.2, 4, "plain", "#37658f", true);
      kit.box(sx - 0.55, 1.4, -1, sx + 0.55, 1.5, 4, "plank", "#b08050", false);
      kit.box(sx - 0.55, 2.5, -1, sx + 0.55, 2.6, 4, "plank", "#b08050", false);
    }
    kit.route = { door: [0, hd], floorY: 0.15, hw, hd, stairs: [-hw + T + 0.75, -hd + T + 3.2 + my / 0.72 + 0.5, -hd + T + 3.2 - 0.9, 0.15, my] };
    kit.addLoot("chest", hw - 1.2, my, -hd + 1.4, Math.PI);
    kit.addLoot("chest", -2, 0.15, 5.5, 0);
    kit.addLoot("floor", 4, 0.15, 5.6);
    kit.addLoot("ammo", -8, 0.15, 6);
    kit.addLoot("floor", -6, my, -hd + 1.5);
    kit.route = null;
  }

  /**
   * An open shipping container you can run in and out of: a steel shell (floor, roof, both long sides and
   * the closed back) with its doors swung wide at the open end. Ground-level ones can hold a chest.
   */
  function container(lx: number, ly: number, lz: number, alongX: boolean, color: string) {
    const L = 6.1;
    const W = 2.45;
    const Hh = 2.6;
    const T = 0.1;
    // work along the container's length (u) and across it (v), then map to x / z
    const B = (u0: number, y0: number, v0: number, u1: number, y1: number, v1: number, m: "metal" | "plain", c: string, collide: false | "metal") => {
      if (alongX) kit.box(lx + u0, ly + y0, lz + v0, lx + u1, ly + y1, lz + v1, m, c, collide);
      else kit.box(lx + v0, ly + y0, lz + u0, lx + v1, ly + y1, lz + u1, m, c, collide);
    };
    const hu = L / 2;
    const hv = W / 2;
    B(-hu, 0, -hv, hu, 0.12, hv, "metal", color, "metal"); // floor
    B(-hu, Hh - T, -hv, hu, Hh, hv, "metal", color, "metal"); // roof
    B(-hu, 0.12, -hv, hu, Hh - T, -hv + T, "metal", color, "metal"); // long sides
    B(-hu, 0.12, hv - T, hu, Hh - T, hv, "metal", color, "metal");
    B(-hu, 0.12, -hv + T, -hu + T, Hh - T, hv - T, "metal", color, "metal"); // closed back end
    // the open end: dark door frame and the two doors swung right back
    B(hu - 0.08, Hh - 0.32, -hv, hu, Hh - T, hv, "plain", "#3d3d3d", false);
    B(hu, 0.12, -hv - 0.06, hu + 0.08, Hh - 0.12, -hv, "plain", "#3d3d3d", false);
    B(hu, 0.12, hv, hu + 0.08, Hh - 0.12, hv + 0.06, "plain", "#3d3d3d", false);
    B(hu - 0.02, 0.15, -hv - W / 2, hu + 0.04, Hh - 0.15, -hv - 0.06, "metal", color, false);
    B(hu - 0.02, 0.15, hv + 0.06, hu + 0.04, Hh - 0.15, hv + W / 2, "metal", color, false);
    if (ly < 0.5) {
      const [x, z] = alongX ? [lx - hu * 0.45, lz] : [lx, lz - hu * 0.45];
      const [wx, wz] = kit.w(x, z);
      kit.containerSpots.push({ kind: "chest", x: wx, y: kit.oy + ly + 0.12, z: wz, yaw: (alongX ? -Math.PI / 2 : Math.PI) + kit.r * (Math.PI / 2) });
    }
  }

  function silo(lx: number, lz: number) {
    kit.cyl(lx, 0, lz, 3, 13, 12, "metal", "#cfd6dc", "metal", false);
    for (let i = 0; i < 4; i++) kit.cyl(lx, 13 + i * 0.7, lz, 3 - i * 0.65, 0.7, 12, "metal", "#b9c2c9", false, true, 2.35 - i * 0.6);
  }

  function lighthouse() {
    kit.cyl(0, -0.5, 0, 4.4, 3.4, 14, "concrete", "#e8e4dc", "brick");
    const segs = 6;
    for (let i = 0; i < segs; i++) {
      const r0 = 3.4 - i * 0.14;
      const r1 = r0 - 0.14;
      kit.cyl(0, 2.9 + i * 3, 0, r0, 3, 14, "plain", i % 2 ? "#d8473b" : "#f6f3ee", i === 0 ? "brick" : false, false, r1);
    }
    const ty = 2.9 + segs * 3;
    kit.box(-3.2, ty, -3.2, 3.2, ty + 0.35, 3.2, "plain", "#3d3d42", true);
    kit.box(-3.2, ty + 0.35, -3.2, 3.2, ty + 1.3, -3.05, "plain", "#3d3d42", true);
    kit.box(-3.2, ty + 0.35, 3.05, 3.2, ty + 1.3, 3.2, "plain", "#3d3d42", true);
    kit.box(-3.2, ty + 0.35, -3.05, -3.05, ty + 1.3, 3.05, "plain", "#3d3d42", true);
    kit.box(3.05, ty + 0.35, -3.05, 3.2, ty + 1.3, 3.05, "plain", "#3d3d42", true);
    kit.cyl(0, ty + 0.35, 0, 1.7, 2.4, 10, "glow", "#fff4c0", true, false);
    kit.cyl(0, ty + 2.75, 0, 2, 1.6, 10, "plain", "#d8473b", true, true, 0.25);
    kit.box(-0.7, 0.15, 4.2, 0.7, 2.4, 4.45, "plain", "#5a3a26", false);
    kit.addLoot("chest", 0, 2.9, 5.4, 0);
    kit.addLoot("floor", 2.5, 2.9, 5.6);
  }

  function waterTower() {
    for (const [x, z] of [
      [-2.2, -2.2],
      [2.2, -2.2],
      [2.2, 2.2],
      [-2.2, 2.2],
    ] as const)
      kit.box(x - 0.2, 0, z - 0.2, x + 0.2, 12, z + 0.2, "metal", "#8a9097", "metal");
    kit.box(-2.4, 5.8, -2.4, 2.4, 6.0, 2.4, "metal", "#8a9097", false);
    kit.box(-3.3, 12, -3.3, 3.3, 12.3, 3.3, "metal", "#8a9097", true);
    kit.cyl(0, 12.3, 0, 3.1, 4.4, 12, "metal", "#3f7cc9", "metal");
    kit.cyl(0, 16.7, 0, 3.2, 1.4, 12, "metal", "#2f5f9b", false, true, 0.2);
  }

  function radar() {
    house({ w: 12, d: 10, floors: 1, wallMat: "concrete", wall: "#d8d6d0", roof: "flat", harvest: "brick", H: 3.6, roofStairs: true, chests: 2, glassFront: true, interior: "office" });
    const ry = 0.15 + 3.6 + 0.3;
    for (let i = 0; i < 5; i++) {
      const a0 = (i / 5) * (Math.PI / 2);
      const a1 = ((i + 1) / 5) * (Math.PI / 2);
      kit.cyl(-2, ry + Math.sin(a0) * 3.4, -1.5, Math.cos(a0) * 3.4 + 0.01, (Math.sin(a1) - Math.sin(a0)) * 3.4, 14, "plain", "#f2f2f2", i === 0, i === 4, Math.cos(a1) * 3.4 + 0.01);
    }
  }

  function radioTower() {
    const h = 28;
    const lv = 7;
    for (let i = 0; i < lv; i++) {
      const y0 = (i / lv) * h;
      const y1 = ((i + 1) / lv) * h;
      const s0 = 2.4 - (i / lv) * 1.9;
      const s1 = 2.4 - ((i + 1) / lv) * 1.9;
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ] as const) {
        const x = sx * (s0 + s1) * 0.5;
        const z = sz * (s0 + s1) * 0.5;
        kit.box(x - 0.13, y0, z - 0.13, x + 0.13, y1, z + 0.13, "metal", i % 2 ? "#e25141" : "#f0f0f0", i < 2 ? "metal" : false);
      }
      kit.box(-s1, y1 - 0.12, -s1, s1, y1, -s1 + 0.12, "metal", "#cfcfcf", false);
      kit.box(-s1, y1 - 0.12, s1 - 0.12, s1, y1, s1, "metal", "#cfcfcf", false);
    }
    kit.box(-0.3, h, -0.3, 0.3, h + 1.6, 0.3, "glow", "#ff5a4a", false);
  }

  function pier(len: number) {
    // local: starts at z=0 on the beach and runs toward +z over the water
    const w = 5;
    const y = 1.8;
    kit.box(-w / 2, y - 0.35, 0, w / 2, y, len, "plank", "#b48a5c", true);
    for (let z = 2; z < len; z += 4) {
      for (const x of [-w / 2 + 0.3, w / 2 - 0.3]) kit.cyl(x, -3, z, 0.22, y + 2.6, 6, "log", "#7a5434", true, true);
    }
    kit.box(-w / 2, y, 0, -w / 2 + 0.12, y + 0.9, len, "plain", "#8a6440", false);
    kit.box(w / 2 - 0.12, y, 0, w / 2, y + 0.9, len, "plain", "#8a6440", false);
    // T-head
    kit.box(-9, y - 0.35, len, 9, y, len + 7, "plank", "#b48a5c", true);
    for (let x = -8; x <= 8; x += 4) kit.cyl(x, -3, len + 3.5, 0.24, y + 2.6, 6, "log", "#7a5434", true, true);
  }

  function boat(lx: number, lz: number, color: string) {
    kit.box(lx - 1.4, -0.4, lz - 3.2, lx + 1.4, 0.9, lz + 3.2, "plain", color, true);
    kit.box(lx - 1.1, 0.9, lz - 3, lx + 1.1, 1.0, lz + 3, "plank", "#c8a476", false);
    kit.box(lx - 0.9, 1.0, lz - 1.6, lx + 0.9, 2.4, lz + 0.4, "plain", "#f2f2f2", true);
    kit.box(lx - 0.92, 1.7, lz + 0.35, lx + 0.92, 2.2, lz + 0.42, "glass", "#8fc4e8", false);
  }

  function crane() {
    const span = 26;
    const h = 15;
    const c = "#e8b22d";
    for (const x of [-span / 2, span / 2]) {
      for (const z of [-4, 4]) kit.box(x - 0.45, 0, z - 0.45, x + 0.45, h, z + 0.45, "metal", c, "metal");
      kit.box(x - 0.45, h - 1, -4.45, x + 0.45, h, 4.45, "metal", c, false);
    }
    for (const z of [-4, 4]) kit.box(-span / 2 - 0.45, h, z - 0.5, span / 2 + 0.45, h + 1.2, z + 0.5, "metal", c, true);
    kit.box(-2, h - 2.6, -2, 2, h, 2, "metal", "#d14b3c", true);
    kit.box(-0.08, 6, -0.08, 0.08, h - 2.6, 0.08, "plain", "#2d2d2d", false);
  }

  function tank(lx: number, lz: number) {
    kit.cyl(lx, 0, lz, 5, 7.5, 16, "metal", "#e9ecef", "metal");
    kit.cyl(lx, 7.5, lz, 5.05, 0.8, 16, "metal", "#cdd2d8", false, true, 3.4);
    kit.box(lx + 4.7, 0, lz - 0.5, lx + 5.3, 8, lz + 0.5, "plain", "#c9473b", false);
  }

  function fence(x0: number, z0: number, x1: number, z1: number, color = "#e9e2d6") {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 2.4));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      const y = height(x, z);
      kit.boxW(x - 0.1, y - 0.2, z - 0.1, x + 0.1, y + 1.15, z + 0.1, "plain", color, false);
      if (i < n) {
        const xb = x0 + (x1 - x0) * ((i + 1) / n);
        const zb = z0 + (z1 - z0) * ((i + 1) / n);
        const yb = height(xb, zb);
        const ym = Math.min(y, yb);
        const lo = (a: number, b: number) => Math.min(a, b);
        const hi = (a: number, b: number) => Math.max(a, b);
        for (const ry of [0.45, 0.9]) kit.boxW(lo(x, xb) - 0.04, ym + ry, lo(z, zb) - 0.04, hi(x, xb) + 0.04, ym + ry + 0.1, hi(z, zb) + 0.04, "plain", color, false);
        kit.boxes.push({ minX: lo(x, xb) - 0.08, minY: ym - 0.2, minZ: lo(z, zb) - 0.08, maxX: hi(x, xb) + 0.08, maxY: ym + 1.1, maxZ: hi(z, zb) + 0.08, mat: "wood" });
      }
    }
  }

  /** Place a building: flatten the ground and author it in its local frame. */
  function place(group: string, x: number, z: number, rot: number, hw: number, hd: number, color: string, fn: () => void, h?: number) {
    const ph = pad(x, z, hw + 1.5, hd + 1.5, rot, color, h);
    kit.group = group;
    kit.at(x, ph, z, rot);
    fn();
  }

  const wallCols = ["#f1e4c8", "#cfe3ee", "#f3d2c5", "#d9ead0", "#efe7a8", "#e0d6f0", "#f6f1e7"];
  const roofCols = ["#b5523f", "#4a6ea8", "#5d6b5f", "#8a4b8a", "#a8673c", "#3f5878"];
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)]!;

  /* ---------- Maple Crossing ---------- */
  const T1 = "Maple Crossing";
  const townHouse = () => {
    const two = rand() < 0.6;
    const stone = rand() < 0.22;
    const hw = (two ? 11 : 10) / 2;
    const hd = 4.5;
    // front yard: walkway, hedges, mailbox
    kit.box(-0.8, -0.3, hd + 1.35, 0.8, 0.06, hd + 3.9, "concrete", "#d9d5cc", false);
    const hedge = pick(["#3f9a3f", "#46a246", "#3a8f3c"]);
    kit.box(-hw - 0.6, -0.3, hd + 3.2, -1.3, 1.05, hd + 3.9, "leaf", hedge, true);
    kit.box(1.3, -0.3, hd + 3.2, hw + 0.6, 1.05, hd + 3.9, "leaf", hedge, true);
    kit.box(-hw - 0.6, -0.3, hd - 1, -hw - 0.1, 1.05, hd + 3.2, "leaf", hedge, true);
    kit.box(1.55, -0.3, hd + 4.05, 1.67, 1.05, hd + 4.17, "plain", "#5a4636", true);
    kit.box(1.4, 1.05, hd + 3.95, 1.82, 1.38, hd + 4.45, "plain", pick(["#2f5f8a", "#c0392b", "#2d2d2d"]), false);
    return house({
      w: two ? 11 : 10,
      d: 9,
      floors: two ? 2 : 1,
      wallMat: stone ? "stone" : "siding",
      wall: stone ? "#e6ddd0" : pick(wallCols),
      roof: rand() < 0.75 ? "hip" : "gable",
      roofColor: pick(roofCols),
      harvest: stone ? "brick" : "wood",
      porch: !two,
      chimney: two || rand() < 0.4,
      chests: two ? 2 : 1,
    });
  };
  for (const x of [-80, -64, -50, -2, 14]) place(T1, x, 11, 0, 5.5, 4.5, "#c9b8a2", townHouse);
  for (const x of [-80, -42, 16]) place(T1, x, 39, 2, 5.5, 4.5, "#c9b8a2", townHouse);
  place(T1, -61, 39, 2, 7, 5, "#a89c90", () =>
    house({ w: 14, d: 10, floors: 1, wallMat: "brick", wall: "#c46a4a", roof: "flat", harvest: "brick", H: 4.2, doorW: 2.4, roofStairs: true, glassFront: true, chests: 2, sign: "MAPLE MART", doorColor: "#2f5f8a", interior: "store" }),
  );
  // gas station: kiosk + canopy + pumps
  place(T1, -3, 41, 2, 9, 7, "#9a9a9a", () => {
    kit.box(-9, -1.2, -7, 9, 0.15, 7, "concrete", "#b9b6ae", true);
    kit.at(kit.ox, kit.oy, kit.oz, 2);
    const ox = kit.ox;
    const oz = kit.oz;
    const oy = kit.oy;
    kit.at(ox + 4, oy, oz - 3, 2);
    house({ w: 8, d: 6, floors: 1, wallMat: "siding", wall: "#f2f2f2", roof: "flat", harvest: "wood", H: 3.4, glassFront: true, foundation: false, sign: "FUEL", doorW: 1.6, interior: "store" });
    kit.at(ox, oy, oz, 2);
    for (const [px, pz] of [
      [-7, 1],
      [-1, 1],
      [-7, 6],
      [-1, 6],
    ] as const)
      kit.box(px - 0.2, 0.15, pz - 0.2, px + 0.2, 4.6, pz + 0.2, "plain", "#e8e8e8", true);
    kit.box(-8, 4.6, 0, 0, 5.1, 7, "plain", "#d63c35", true);
    for (const px of [-5.2, -2.8]) kit.box(px - 0.35, 0.15, 3.1, px + 0.35, 1.7, 3.9, "plain", "#c33a33", true);
    kit.addLoot("ammo", -4, 0.15, 4.8);
  });
  for (const [x, z, r] of [
    [-39, -11, 1],
    [-39, 4, 1],
    [-11, -11, 3],
    [-39, 54, 1],
    [-39, 70, 1],
    [-11, 58, 3],
  ] as const)
    place(T1, x, z, r, 5.5, 4.5, "#c9b8a2", townHouse);
  place(T1, -1, 66, 0, 3.5, 3.5, "#8a9097", () => waterTower());

  /* ---------- Rustbolt Yard ---------- */
  const T2 = "Rustbolt Yard";
  place(T2, 122, -64, 0, 11, 8, "#7d8590", () => warehouse("#7f8f9e"), 3);
  place(T2, 92, -78, 1, 11, 8, "#7d8590", () => warehouse("#a4673f"), 3);
  place(T2, 132, -30, 0, 18, 12, "#8d8a84", () => {
    kit.box(-18, -1.2, -12, 18, 0.12, 12, "concrete", "#a9a59c", true);
    const cols = ["#c0392b", "#2c6fb5", "#2e8b57", "#e67e22", "#16a085", "#8e44ad", "#d35400"];
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 3; j++) {
        const stack = 1 + Math.floor(rand() * 3);
        for (let s = 0; s < stack; s++) container(-12 + i * 7.6, 0.12 + s * 2.6, -7 + j * 5.4, true, pick(cols));
      }
    kit.at(kit.ox, kit.oy, kit.oz, 0);
    crane();
    kit.addLoot("chest", 2, 0.12 + 2.6, -1.6, 0);
    kit.addLoot("floor", -15.5, 0.12, 9);
    kit.addLoot("ammo", 15, 0.12, 9);
  }, 3);
  place(T2, 70, -56, 0, 6, 12, "#8d8a84", () => {
    tank(0, -6);
    tank(0, 6);
    kit.addLoot("floor", 5.5, 0, 0);
  });
  place(T2, 104, -42, 3, 6, 5, "#a89c90", () =>
    house({ w: 12, d: 9, floors: 2, wallMat: "brick", wall: "#9c9c94", roof: "flat", harvest: "brick", chests: 2, interior: "office" }),
  );

  /* ---------- Saltwind Docks + Lantern Point ---------- */
  const T3 = "Saltwind Docks";
  for (const [x, z, r] of [
    [2, 148, 0],
    [-10, 160, 1],
    [42, 150, 3],
  ] as const) {
    place(T3, x, z, r, 4.5, 3.5, "#c9b8a2", () =>
      house({ w: 9, d: 7, floors: 1, wallMat: "plank", wall: pick(["#7fb0c9", "#e8d9b4", "#c96a5a", "#9cc59a"]), roof: "gable", roofColor: pick(roofCols), harvest: "wood", porch: true }),
    );
  }
  kit.group = T3;
  {
    const px = 22;
    let pz = 150;
    while (pz < 210 && rawHeight(px, pz) > 0.4) pz += 1;
    pz -= 4;
    kit.at(px, 0, pz, 0);
    pier(34);
    kit.at(px, 1.8, pz + 37.5, 0);
    house({ w: 8, d: 6, floors: 1, wallMat: "plank", wall: "#d9c9a6", roof: "gable", roofColor: "#4a6ea8", harvest: "wood", foundation: false, chests: 2 });
    kit.at(0, 0, 0, 0);
    boat(px + 7, pz + 18, "#e8e8e8");
    boat(px - 8, pz + 26, "#d84a3d");
    boat(px + 12, pz + 31, "#3f74c4");
    kit.loot.push({ kind: "floor", x: px, y: 1.8, z: pz + 20, yaw: 0 }, { kind: "floor", x: px + 6, y: 1.8, z: pz + 36, yaw: 0 });
  }
  place("Lantern Point", 88, 160, 0, 4.5, 4.5, "#e8e4dc", () => lighthouse(), 3);

  /* ---------- Old Mill Farm ---------- */
  const T4 = "Old Mill Farm";
  place(T4, -112, 14, 0, 6, 4.5, "#c9b8a2", () =>
    house({ w: 12, d: 9, floors: 2, wallMat: "siding", wall: "#f3ead6", roof: "hip", roofColor: "#5d6b5f", harvest: "wood", chimney: true, chests: 2, shutters: "#3f6a3a" }),
  );
  place(T4, -142, 46, 1, 6, 8, "#9a3d2e", () =>
    house({ w: 12, d: 16, floors: 1, wallMat: "plank", wall: "#b53a2c", trim: "#f4efe6", roof: "gable", ridgeZ: true, roofColor: "#6b6b6b", harvest: "wood", H: 5.5, doorW: 4.2, doorH: 4.2, chests: 2, interior: "barn" }),
  );
  place(T4, -156, 30, 0, 3.2, 3.2, "#cfd6dc", () => silo(0, 0));
  let millRotor: THREE.Object3D | null = null;
  let millPos: [number, number, number] = [0, 0, 0];
  place(T4, -118, 78, 0, 2.5, 2.5, "#8a6a4a", () => {
    for (const [x, z] of [
      [-1.6, -1.6],
      [1.6, -1.6],
      [1.6, 1.6],
      [-1.6, 1.6],
    ] as const)
      kit.box(x - 0.18, 0, z - 0.18, x + 0.18, 14, z + 0.18, "plank", "#7a5434", "wood");
    kit.box(-1.8, 13.6, -1.8, 1.8, 15, 1.8, "plank", "#8b5a3a", true);
    const [wx, wz] = kit.w(0, 1.9);
    millPos = [wx, kit.oy + 14.3, wz];
  });
  /* ---------- Pinecrest Lodge ---------- */
  const T5 = "Pinecrest Lodge";
  place(T5, -106, -102, 0, 7, 5, "#8a6a4a", () =>
    house({ w: 14, d: 10, floors: 2, wallMat: "log", wall: "#9a6a42", trim: "#e9dcc4", roof: "gable", roofColor: "#3f5a46", harvest: "wood", porch: true, chimney: true, chests: 2 }),
  );
  for (const [x, z, r] of [
    [-132, -118, 1],
    [-86, -128, 3],
    [-128, -82, 0],
    [-80, -94, 3],
  ] as const) {
    place(T5, x, z, r, 3.5, 3, "#8a6a4a", () =>
      house({ w: 7, d: 6, floors: 1, wallMat: "log", wall: "#8f5f3b", trim: "#e9dcc4", roof: "gable", roofColor: "#4b4038", harvest: "wood", chimney: true }),
    );
  }
  /* ---------- Radar Peak ---------- */
  place("Radar Peak", 27, -142, 0, 6, 5, "#bdbab2", () => radar());
  place("Radar Peak", 41, -150, 0, 2.5, 2.5, "#bdbab2", () => radioTower());
  /* ---------- Sunken Quarry ---------- */
  const T6 = "Sunken Quarry";
  place(T6, 76, 50, 1, 5, 4, "#8d8a84", () =>
    house({ w: 10, d: 8, floors: 1, wallMat: "metal", wall: "#9aa4ad", roof: "flat", harvest: "metal", roofStairs: true, chests: 2, interior: "office" }),
  );
  kit.group = T6;
  {
    // conveyor from the rim down toward the flooded pit
    const x0 = 88;
    const z0 = 44;
    const y0 = height(x0, z0) + 4;
    const x1 = 104;
    const z1 = 52;
    const y1 = height(x1, z1) + 0.3;
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const ax = x0 + (x1 - x0) * t0;
      const az = z0 + (z1 - z0) * t0;
      const bx = x0 + (x1 - x0) * t1;
      const bz = z0 + (z1 - z0) * t1;
      const ya = y0 + (y1 - y0) * t0;
      const yb = y0 + (y1 - y0) * t1;
      kit.boxW(Math.min(ax, bx) - 0.8, Math.min(ya, yb) - 0.2, Math.min(az, bz) - 0.8, Math.max(ax, bx) + 0.8, Math.max(ya, yb), Math.max(az, bz) + 0.8, "plain", "#3a3a3a", false);
      kit.boxW((ax + bx) / 2 - 0.15, height((ax + bx) / 2, (az + bz) / 2), (az + bz) / 2 - 0.15, (ax + bx) / 2 + 0.15, Math.min(ya, yb), (az + bz) / 2 + 0.15, "plain", "#e8b22d", true);
    }
  }

  /* ---------- scattered loners ---------- */
  place("Wilds", -60, -52, 1, 5, 4, "#c9b8a2", () => house({ w: 10, d: 8, floors: 1, wallMat: "siding", wall: "#e9d7b5", roof: "hip", roofColor: "#7a4a3a", harvest: "wood", porch: true }));
  place("Wilds", 72, 108, 3, 5, 4, "#c9b8a2", () => house({ w: 10, d: 9, floors: 2, wallMat: "siding", wall: "#a9c1c9", roof: "hip", roofColor: "#3f5878", harvest: "wood", chests: 2 }));
  place("Wilds", 170, -12, 3, 3.5, 3, "#8a6a4a", () => house({ w: 7, d: 6, floors: 1, wallMat: "log", wall: "#8f5f3b", roof: "gable", roofColor: "#4b4038", harvest: "wood" }));
  place("Wilds", -150, -30, 0, 3.5, 3, "#8a6a4a", () => house({ w: 7, d: 6, floors: 1, wallMat: "log", wall: "#8f5f3b", roof: "gable", roofColor: "#4b4038", harvest: "wood" }));

  /* ---------- Brightwater: the east-coast town on the highway ---------- */
  const T7 = "Brightwater";
  const hwyZ = (x: number) => -2 + ((x - 205) * 8) / 77;
  for (const x of [208, 222, 254]) place(T7, x, hwyZ(x) - 13, 0, 5.5, 4.5, "#c9b8a2", townHouse);
  for (const x of [208, 222]) place(T7, x, hwyZ(x) + 13, 2, 5.5, 4.5, "#c9b8a2", townHouse);
  place(T7, 271, hwyZ(271) - 13, 0, 6, 4.5, "#a89c90", () =>
    house({ w: 12, d: 9, floors: 2, wallMat: "brick", wall: "#b8b2a6", roof: "flat", harvest: "brick", chests: 2, interior: "office", sign: "TOWN HALL" }),
  );
  place(T7, 256, hwyZ(256) + 13, 2, 7, 5, "#a89c90", () =>
    house({ w: 14, d: 10, floors: 1, wallMat: "brick", wall: "#5d86b8", roof: "flat", harvest: "brick", H: 4.2, doorW: 2.4, roofStairs: true, glassFront: true, chests: 2, sign: "BRIGHT MART", doorColor: "#f2c94c", interior: "store" }),
  );
  place(T7, 273, hwyZ(273) + 13, 2, 4.5, 4.5, "#c9b8a2", townHouse);
  for (const z of [-34, 46]) {
    place(T7, 225, z, 1, 5.5, 4.5, "#c9b8a2", townHouse);
    place(T7, 251, z, 3, 5.5, 4.5, "#c9b8a2", townHouse);
  }
  place(T7, 284, -34, 0, 3.5, 3.5, "#8a9097", () => waterTower());

  /* ---------- Ironworks: steel sheds and a container yard in the north-east ---------- */
  const T8 = "Ironworks";
  place(T8, 128, -160, 1, 11, 8, "#7d8590", () => warehouse("#8c6a4f"), 3);
  place(T8, 178, -165, 3, 11, 8, "#7d8590", () => warehouse("#6f8291"), 3);
  place(T8, 140, -200, 0, 14, 10, "#8d8a84", () => {
    kit.box(-14, -1.2, -10, 14, 0.12, 10, "concrete", "#a9a59c", true);
    const cols = ["#c0392b", "#2c6fb5", "#2e8b57", "#e67e22", "#16a085", "#8e44ad"];
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        const stack = 1 + Math.floor(rand() * 3);
        for (let st = 0; st < stack; st++) container(-9 + i * 7.6, 0.12 + st * 2.6, -6 + j * 5.4, true, pick(cols));
      }
    kit.at(kit.ox, kit.oy, kit.oz, 0);
    kit.addLoot("chest", -2, 0.12 + 2.6, 1.2, 0);
    kit.addLoot("floor", 12, 0.12, 8);
  }, 3);
  place(T8, 182, -200, 0, 6, 12, "#8d8a84", () => {
    tank(0, -6);
    tank(0, 6);
    kit.addLoot("ammo", -5.5, 0, 0);
  });
  place(T8, 115, -205, 0, 6, 4.5, "#a89c90", () =>
    house({ w: 12, d: 9, floors: 2, wallMat: "metal", wall: "#9aa4ad", roof: "flat", harvest: "metal", chests: 2, interior: "office" }),
  );

  /* ---------- Timberline: log cabins on the northern ridge ---------- */
  const T9 = "Timberline";
  place(T9, -90, -250, 1, 7, 5, "#8a6a4a", () =>
    house({ w: 14, d: 10, floors: 2, wallMat: "log", wall: "#8a5a36", trim: "#e9dcc4", roof: "gable", roofColor: "#344c3c", harvest: "wood", porch: true, chimney: true, chests: 2 }),
  );
  for (const [x, z, r] of [
    [-100, -226, 1],
    [-50, -238, 3],
    [-52, -272, 3],
    [-96, -282, 0],
  ] as const)
    place(T9, x, z, r, 3.5, 3, "#8a6a4a", () =>
      house({ w: 7, d: 6, floors: 1, wallMat: "log", wall: "#93623c", trim: "#e9dcc4", roof: "gable", roofColor: "#4b4038", harvest: "wood", chimney: true, chests: 1 }),
    );
  place(T9, -30, -262, 0, 2.5, 2.5, "#bdbab2", () => radioTower());

  /* ---------- Mesa Ranch: a ranch up on the western plateau ---------- */
  const T10 = "Mesa Ranch";
  place(T10, -226, -50, 0, 6, 4.5, "#c9b8a2", () =>
    house({ w: 12, d: 9, floors: 2, wallMat: "plank", wall: "#e3c9a0", trim: "#7a4a2a", roof: "gable", roofColor: "#8a4b2a", harvest: "wood", porch: true, chimney: true, chests: 2, shutters: "#7a4a2a" }),
  );
  place(T10, -256, -44, 1, 6, 8, "#9a3d2e", () =>
    house({ w: 12, d: 16, floors: 1, wallMat: "plank", wall: "#a8452f", trim: "#f4efe6", roof: "gable", ridgeZ: true, roofColor: "#5a5a5a", harvest: "wood", H: 5.5, doorW: 4.2, doorH: 4.2, chests: 2, interior: "barn" }),
  );
  place(T10, -262, -16, 0, 3.2, 3.2, "#cfd6dc", () => silo(0, 0));

  /* ---------- Coral Cove: beach houses and a pier on the south-west shore ---------- */
  const T11 = "Coral Cove";
  for (const [x, z, r] of [
    [-170, 186, 0],
    [-144, 192, 0],
    [-178, 160, 1],
  ] as const)
    place(T11, x, z, r, 4.5, 3.5, "#e6d49a", () =>
      house({ w: 9, d: 7, floors: 1, wallMat: "plank", wall: pick(["#f4b6a6", "#a6d9d0", "#f6e3a1", "#bcd4f0"]), roof: "gable", roofColor: pick(["#e07a5f", "#3d9df5", "#2fb8a0"]), harvest: "wood", porch: true, chests: 1 }),
    );
  place(T11, -122, 168, 2, 4, 3, "#e6d49a", () =>
    house({ w: 8, d: 6, floors: 1, wallMat: "siding", wall: "#ffffff", roof: "flat", harvest: "wood", H: 3.4, glassFront: true, foundation: false, sign: "CORAL CAFE", doorW: 1.6, interior: "store" }),
  );
  kit.group = T11;
  {
    const px = -157;
    let pz = 196;
    while (pz < 300 && rawHeight(px, pz) > 0.4) pz += 1;
    pz -= 4;
    kit.at(px, 0, pz, 0);
    pier(26);
    kit.at(0, 0, 0, 0);
    boat(px + 8, pz + 14, "#f2c94c");
    boat(px - 9, pz + 22, "#2fb8a0");
    kit.loot.push({ kind: "floor", x: px, y: 1.8, z: pz + 16, yaw: 0 }, { kind: "chest", x: px + 5, y: 1.8, z: pz + 29, yaw: 0 });
  }

  /* ---------- more loners out in the new wilds ---------- */
  place("Wilds", -196, 96, 0, 5, 4, "#c9b8a2", () => house({ w: 10, d: 8, floors: 1, wallMat: "siding", wall: "#d9e6c9", roof: "hip", roofColor: "#5d6b5f", harvest: "wood", porch: true, chests: 1 }));
  place("Wilds", 206, -92, 1, 3.5, 3, "#8a6a4a", () => house({ w: 7, d: 6, floors: 1, wallMat: "log", wall: "#8f5f3b", roof: "gable", roofColor: "#4b4038", harvest: "wood", chests: 1 }));
  place("Wilds", -176, -150, 0, 3.5, 3, "#8a6a4a", () => house({ w: 7, d: 6, floors: 1, wallMat: "log", wall: "#8f5f3b", roof: "gable", roofColor: "#4b4038", harvest: "wood", chests: 1 }));
  place("Wilds", 60, -228, 0, 5, 4, "#c9b8a2", () => house({ w: 10, d: 9, floors: 2, wallMat: "siding", wall: "#f1e4c8", roof: "hip", roofColor: "#a8673c", harvest: "wood", chests: 2 }));
  place("Wilds", 262, 96, 3, 5, 4, "#c9b8a2", () => house({ w: 10, d: 8, floors: 1, wallMat: "siding", wall: "#cfe3ee", roof: "gable", roofColor: "#4a6ea8", harvest: "wood", porch: true, chests: 1 }));

  /* ---------- farm fences ---------- */
  kit.group = T4;
  kit.at(0, 0, 0, 0);
  fence(-152, 62, -98, 62);
  fence(-98, 62, -98, 98);
  fence(-152, 62, -152, 98);
  fence(-152, 98, -128, 98);
  fence(-120, 98, -98, 98);
  kit.group = "Mesa Ranch";
  fence(-230, 0, -204, 0);
  fence(-204, 0, -204, 22);
  fence(-204, 22, -230, 22);
  fence(-230, 22, -230, 12);

  /* ---------- roads + bridges ---------- */
  const furniture: { x: number; z: number; y: number; kind: "hydrant" | "trash" }[] = [];
  function keepOutBuildings(x: number, z: number) {
    for (const f of footprints) if (x > f.x0 - 1 && x < f.x1 + 1 && z > f.z0 - 1 && z < f.z1 + 1) return true;
    return false;
  }
  const roadGeo: { p: number[]; u: number[] } = { p: [], u: [] };
  kit.group = "roads";
  kit.at(0, 0, 0, 0);
  buildProfiles();
  /** Road surface height along a road: its smoothed profile, a few cm above the flattened ground. */
  const roadY = (x: number, z: number) => (roadAt(x, z)?.h ?? height(x, z)) + ROAD_LIFT;
  for (const road of ROADS) {
    let dist = 0;
    for (let i = 0; i < road.pts.length - 1; i++) {
      const [ax, az] = road.pts[i]!;
      const [bx, bz] = road.pts[i + 1]!;
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.ceil(len / 3));
      const nx = -(bz - az) / len;
      const nz = (bx - ax) / len;
      for (let k = 0; k < n; k++) {
        const t0 = k / n;
        const t1 = (k + 1) / n;
        const x0 = ax + (bx - ax) * t0;
        const z0 = az + (bz - az) * t0;
        const x1 = ax + (bx - ax) * t1;
        const z1 = az + (bz - az) * t1;
        const y0 = roadY(x0, z0);
        const y1 = roadY(x1, z1);
        const bridge = Math.min(baseHeight(x0, z0), baseHeight(x1, z1), baseHeight((x0 + x1) / 2, (z0 + z1) / 2)) < 0.5;
        const hw = road.w / 2;
        // wherever the road surface stands above the ground (bridge approaches, embankments) its own deck is
        // what cars and players drive on, so they never sink below the road or float over a step
        if (!bridge && (y0 > height(x0, z0) + 0.08 || y1 > height(x1, z1) + 0.08))
          kit.ramps.push({ minX: Math.min(x0, x1) - hw, maxX: Math.max(x0, x1) + hw, minZ: Math.min(z0, z1) - hw, maxZ: Math.max(z0, z1) + hw, axis: "x", dir: 1, y0, y1, seg: { ax: x0, az: z0, bx: x1, bz: z1, hw } });
        const v0 = dist / 8;
        dist += len / n;
        const v1 = dist / 8;
        // four strips across the width, each vertex on the road profile so it sits flush on the ground
        const COLS = 4;
        for (let cI = 0; cI < COLS; cI++) {
          const a0 = hw - (2 * hw * cI) / COLS;
          const a1 = hw - (2 * hw * (cI + 1)) / COLS;
          const u0 = cI / COLS;
          const u1 = (cI + 1) / COLS;
          const q = [
            [x0 + nx * a0, y0, z0 + nz * a0, u0, v0],
            [x0 + nx * a1, y0, z0 + nz * a1, u1, v0],
            [x1 + nx * a1, y1, z1 + nz * a1, u1, v1],
            [x1 + nx * a0, y1, z1 + nz * a0, u0, v1],
          ];
          for (const i2 of [0, 2, 1, 0, 3, 2]) {
            roadGeo.p.push(q[i2]![0]!, q[i2]![1]!, q[i2]![2]!);
            roadGeo.u.push(q[i2]![3]!, q[i2]![4]!);
          }
        }
        // sidewalks + curbs along Maple Crossing streets
        const midX = (x0 + x1) / 2;
        const midZ = (z0 + z1) / 2;
        if (!bridge && road.town && (Math.hypot(midX + 30, midZ - 30) < 64 || Math.hypot(midX - 240, midZ - 8) < 50)) {
          for (const sd of [1, -1]) {
            const inner = hw;
            const outer = hw + 1.8;
            const ox0 = x0 + nx * outer * sd;
            const oz0 = z0 + nz * outer * sd;
            const ox1 = x1 + nx * outer * sd;
            const oz1 = z1 + nz * outer * sd;
            const crossing = ROADS.some((r2) => r2 !== road && (lineDist(r2.pts, ox0, oz0) < r2.w / 2 + 2.2 || lineDist(r2.pts, ox1, oz1) < r2.w / 2 + 2.2));
            if (crossing || keepOutBuildings(midX + nx * (hw + 0.9) * sd, midZ + nz * (hw + 0.9) * sd)) continue;
            const ix0 = x0 + nx * inner * sd;
            const iz0 = z0 + nz * inner * sd;
            const ix1 = x1 + nx * inner * sd;
            const iz1 = z1 + nz * inner * sd;
            const sy0 = y0 + 0.14;
            const sy1 = y1 + 0.14;
            kit.quadW("concrete", [ix0, sy0, iz0], [ix1, sy1, iz1], [ox1, sy1, oz1], [ox0, sy0, oz0], [0, 1, 0], [[ix0 / 3, iz0 / 3], [ix1 / 3, iz1 / 3], [ox1 / 3, oz1 / 3], [ox0 / 3, oz0 / 3]], "#dcd8cf");
            kit.quadW("concrete", [ix0, y0 - 0.05, iz0], [ix1, y1 - 0.05, iz1], [ix1, sy1, iz1], [ix0, sy0, iz0], [-nx * sd, 0, -nz * sd], [[0, 0], [1, 0], [1, 0.05], [0, 0.05]], "#b9b5ac");
            kit.quadW("concrete", [ox0, sy0, oz0], [ox1, sy1, oz1], [ox1, sy1 - 0.5, oz1], [ox0, sy0 - 0.5, oz0], [nx * sd, 0, nz * sd], [[0, 0], [1, 0], [1, 0.1], [0, 0.1]], "#b9b5ac");
            if (k % 9 === 4) furniture.push({ x: x0 + nx * (hw + 1.35) * sd, z: z0 + nz * (hw + 1.35) * sd, y: sy0, kind: (k + (sd > 0 ? 1 : 0)) % 2 ? "hydrant" : "trash" });
          }
        }
        if (bridge) {
          const yy = Math.min(y0, y1);
          const minX = Math.min(x0, x1) - hw;
          const maxX = Math.max(x0, x1) + hw;
          const minZ = Math.min(z0, z1) - hw;
          const maxZ = Math.max(z0, z1) + hw;
          for (const sd of [1, -1]) {
            const ex0 = x0 + nx * hw * sd;
            const ez0 = z0 + nz * hw * sd;
            const ex1 = x1 + nx * hw * sd;
            const ez1 = z1 + nz * hw * sd;
            kit.quadW("concrete", [ex0, y0 - 0.02, ez0], [ex1, y1 - 0.02, ez1], [ex1, y1 - 0.8, ez1], [ex0, y0 - 0.8, ez0], [nx * sd, 0, nz * sd], [[0, 0], [1, 0], [1, 0.3], [0, 0.3]], "#b7b2a8");
            // railing: a thin panel that follows the road edge (both faces + cap)
            for (const face of [1, -1]) {
              const o2 = 0.08 * face;
              kit.quadW("plain", [ex0 + nx * sd * o2, y0, ez0 + nz * sd * o2], [ex1 + nx * sd * o2, y1, ez1 + nz * sd * o2], [ex1 + nx * sd * o2, y1 + 0.9, ez1 + nz * sd * o2], [ex0 + nx * sd * o2, y0 + 0.9, ez0 + nz * sd * o2], [nx * sd * face, 0, nz * sd * face], [[0, 0], [1, 0], [1, 1], [0, 1]], "#d9d4c8");
            }
            kit.quadW("plain", [ex0 - nx * sd * 0.08, y0 + 0.9, ez0 - nz * sd * 0.08], [ex1 - nx * sd * 0.08, y1 + 0.9, ez1 - nz * sd * 0.08], [ex1 + nx * sd * 0.08, y1 + 0.9, ez1 + nz * sd * 0.08], [ex0 + nx * sd * 0.08, y0 + 0.9, ez0 + nz * sd * 0.08], [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], "#e8e4da");
          }
          kit.quadW("concrete", [x0 + nx * hw, y0 - 0.8, z0 + nz * hw], [x0 - nx * hw, y0 - 0.8, z0 - nz * hw], [x1 - nx * hw, y1 - 0.8, z1 - nz * hw], [x1 + nx * hw, y1 - 0.8, z1 + nz * hw], [0, -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], "#8f8a80");
          // the deck is a sloped strip that follows this stretch of road exactly (a box would float cars
          // over its high end and leave steps between stretches)
          kit.ramps.push({ minX, maxX, minZ, maxZ, axis: "x", dir: 1, y0, y1, seg: { ax: x0, az: z0, bx: x1, bz: z1, hw } });
          void yy;
          if (k % 3 === 0) kit.boxW((x0 + x1) / 2 - 0.4, -3, (z0 + z1) / 2 - 0.4, (x0 + x1) / 2 + 0.4, yy - 0.8, (z0 + z1) / 2 + 0.4, "concrete", "#a29d93", true);
        }
      }
    }
  }

  /* ---------- terrain ---------- */
  const SIZE = MAP_HALF * 2;
  const SEG = 240;
  const tgeo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  tgeo.rotateX(-Math.PI / 2);
  const tpos = tgeo.attributes.position as THREE.BufferAttribute;
  const tcol = new Float32Array(tpos.count * 3);
  const c = new THREE.Color();
  const grassA = new THREE.Color("#63b548");
  const grassB = new THREE.Color("#4e9e3c");
  const forest = new THREE.Color("#3f8a3a");
  const sand = new THREE.Color("#e6d49a");
  const wetSand = new THREE.Color("#b9a776");
  const rock = new THREE.Color("#9c978c");
  const dirt = new THREE.Color("#b49870");
  const yard = new THREE.Color("#a7a39a");
  const wheat = new THREE.Color("#e2c35e");
  const soil = new THREE.Color("#a77d4f");
  const grid = new Float32Array(tpos.count);
  for (let i = 0; i < tpos.count; i++) {
    const x = tpos.getX(i);
    const z = tpos.getZ(i);
    const rh = rawHeight(x, z);
    grid[Math.round((z + SIZE / 2) / (SIZE / SEG)) * (SEG + 1) + Math.round((x + SIZE / 2) / (SIZE / SEG))] = rh;
    tpos.setY(i, rh);
    const n = (Math.sin(x * 0.21) * Math.cos(z * 0.17) + Math.sin(x * 0.053 + z * 0.041)) * 0.25 + 0.5;
    c.copy(grassA).lerp(grassB, n);
    const fNW = Math.exp(-((x + 108) ** 2 + (z + 100) ** 2) / (2 * 50 * 50)) + Math.exp(-((x + 70) ** 2 + (z + 245) ** 2) / (2 * 60 * 60));
    c.lerp(forest, Math.min(1, fNW * 1.4));
    if (Math.hypot(x - 152, z + 186) < 46) c.lerp(yard, 0.6 * (1 - smooth(34, 46, Math.hypot(x - 152, z + 186))));
    if (x > -232 && x < -202 && z > -2 && z < 24) c.lerp(dirt, 0.75);
    const hh = baseHeight(x, z);
    if (hh > 18) c.lerp(rock, smooth(18, 30, hh));
    if (Math.hypot(x - QX, z - QZ) < 40) c.lerp(dirt, 1 - smooth(30, 40, Math.hypot(x - QX, z - QZ)));
    if (Math.hypot(x - 115, z - 50) < 40 || (x > 60 && x < 160 && z > -95 && z < -10)) c.lerp(yard, 0.7);
    if (x > -152 && x < -98 && z > 62 && z < 98) c.copy(Math.floor((x + 200) / 3) % 2 ? wheat : soil);
    if (hh < 1.6) c.lerp(sand, 1 - smooth(0.6, 1.6, hh));
    if (hh < 0) c.copy(wetSand);
    tcol[i * 3] = c.r;
    tcol[i * 3 + 1] = c.g;
    tcol[i * 3 + 2] = c.b;
  }
  tgeo.setAttribute("color", new THREE.BufferAttribute(tcol, 3));
  tgeo.computeVertexNormals();
  meshGrid = grid;
  meshN = SEG;
  meshStep = SIZE / SEG;
  meshHalf = SIZE / 2;
  const groundTex = tex(256, (g, s) => {
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, s, s);
    const r = rng(77);
    for (let i = 0; i < 2600; i++) {
      const v = 200 + Math.floor(r() * 55);
      g.fillStyle = `rgba(${v},${v},${v},0.55)`;
      g.fillRect(r() * s, r() * s, 2 + r() * 5, 1 + r() * 2);
    }
  });
  const tuv = tgeo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < tpos.count; i++) tuv.setXY(i, tpos.getX(i) / 9, tpos.getZ(i) / 9);
  const terrain = new THREE.Mesh(tgeo, new THREE.MeshLambertMaterial({ map: groundTex, vertexColors: true }));
  terrain.receiveShadow = true;
  terrain.name = "terrain";

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(2400, 2400),
    new THREE.MeshLambertMaterial({ color: "#2f8fd8", transparent: true, opacity: 0.8, depthWrite: false, emissive: new THREE.Color("#0b3a66"), emissiveIntensity: 0.25 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = SEA - 0.02;
  sea.name = "sea";
  sea.renderOrder = 1;

  const roadTex = tex(256, (g, s) => {
    g.fillStyle = "#5b5e63";
    g.fillRect(0, 0, s, s);
    noise(g, s, 3000, 0.12, 5);
    g.fillStyle = "#e9e4d4";
    g.fillRect(6, 0, 6, s);
    g.fillRect(s - 12, 0, 6, s);
    g.fillStyle = "#f2c94c";
    g.fillRect(s / 2 - 4, 0, 8, s * 0.55);
  });
  const rgeo = new THREE.BufferGeometry();
  rgeo.setAttribute("position", new THREE.Float32BufferAttribute(roadGeo.p, 3));
  rgeo.setAttribute("uv", new THREE.Float32BufferAttribute(roadGeo.u, 2));
  rgeo.computeVertexNormals();
  const roads = new THREE.Mesh(rgeo, new THREE.MeshLambertMaterial({ map: roadTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  roads.receiveShadow = true;
  roads.name = "roads";

  /* ---------- instanced props ---------- */
  const harvest: Harvestable[] = [];
  const keepOut = (x: number, z: number, pad0 = 3) => {
    for (const f of footprints) if (x > f.x0 - pad0 && x < f.x1 + pad0 && z > f.z0 - pad0 && z < f.z1 + pad0) return true;
    for (const r of ROADS) if (lineDist(r.pts, x, z) < r.w / 2 + 2.5) return true;
    if (lineDist(RIVER, x, z) < 6) return true;
    return false;
  };
  const plainMat = new THREE.MeshLambertMaterial({ color: "#ffffff" });
  const crateMat = new THREE.MeshLambertMaterial({ map: mats.plank.map });
  const vcMat = new THREE.MeshLambertMaterial({ color: "#ffffff", vertexColors: true });
  // foliage sways in the wind: tops move more than the base, each tree with its own phase
  const windTime = { value: 0 };
  const leafMat = new THREE.MeshLambertMaterial({ color: "#ffffff", vertexColors: true, side: THREE.DoubleSide });
  leafMat.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = windTime;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uWind;").replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float wph = instanceMatrix[3][0] * 0.11 + instanceMatrix[3][2] * 0.07;
      #else
        float wph = 0.0;
      #endif
      float wh = max(0.0, position.y - 1.6);
      transformed.x += sin(uWind * 1.35 + wph) * 0.04 * wh;
      transformed.z += cos(uWind * 1.1 + wph * 1.3) * 0.03 * wh;
      transformed.y += sin(uWind * 2.3 + wph + position.x) * 0.012 * wh;`,
    );
  };
  leafMat.customProgramCacheKey = () => "leaf-wind";
  const B = {
    oakTrunk: new Batch(oakTrunkGeo(), vcMat),
    oakTop: new Batch(oakCanopyGeo(), leafMat),
    birchTrunk: new Batch(birchTrunkGeo(), vcMat),
    birchTop: new Batch(birchCanopyGeo(), leafMat),
    pineTrunk: new Batch(pineTrunkGeo(), vcMat),
    pineTop: new Batch(pineCanopyGeo(), leafMat),
    palmTrunk: new Batch(palmTrunkGeo(), vcMat),
    palmTop: new Batch(palmFrondGeo(), leafMat),
    rock: new Batch(rockGeo(), vcMat),
    bush: new Batch(bushGeo(), leafMat, false),
    carBody: new Batch(carBodyGeo(), vcMat),
    carTop: new Batch(carDetailGeo(), vcMat),
    hydrant: new Batch(hydrantGeo(), vcMat),
    trash: new Batch(trashGeo(), vcMat),
    bench: new Batch(benchGeo(), vcMat),
    crate: new Batch(new THREE.BoxGeometry(1, 1, 1), crateMat),
    hay: new Batch(new THREE.CylinderGeometry(1, 1, 1, 10).rotateZ(Math.PI / 2), plainMat),
    barrel: new Batch(new THREE.CylinderGeometry(1, 1, 1, 10), plainMat),
    pole: new Batch(new THREE.BoxGeometry(1, 1, 1), plainMat),
    lamp: new Batch(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: "#ffffff", emissive: new THREE.Color("#fff2b8"), emissiveIntensity: 0.8 }), false),
  };
  const staticBoxes: StaticBox[] = [];
  // pickaxe hits make props wobble (trees sway hard, rocks and cars jolt)
  const wobbles: { item: Harvestable; parts: [Batch, number][]; t: number; ax: number; az: number; amp: number }[] = [];
  const _wm = new THREE.Matrix4();
  const _wr = new THREE.Matrix4();
  const _wa = new THREE.Vector3();
  function addHarvest(h: Omit<Harvestable, "alive" | "boxes" | "hide" | "hit">, parts: [Batch, number][], boxes: StaticBox[]) {
    const item: Harvestable = {
      ...h,
      alive: true,
      boxes,
      hide() {
        for (const [b, i] of parts) b.hide(i);
        for (const bx of boxes) bx.dead = true;
        const w = wobbles.findIndex((x) => x.item === item);
        if (w >= 0) wobbles.splice(w, 1);
      },
      hit(dx: number, dz: number) {
        const l = Math.hypot(dx, dz) || 1;
        const amp = h.kind === "tree" ? 0.09 : h.kind === "car" ? 0.025 : 0.04;
        const cur = wobbles.find((x) => x.item === item);
        if (cur) cur.t = 0;
        else wobbles.push({ item, parts, t: 0, ax: dz / l, az: -dx / l, amp });
      },
    };
    for (const bx of boxes) bx.prop = item;
    staticBoxes.push(...boxes);
    harvest.push(item);
    islandBake.harvestParts.set(item, parts);
  }
  /* model trees: Quaternius Stylized Nature MegaKit (CC0), instanced, tinted per tree, swaying in the wind */
  const barkMats = new Map<THREE.Texture | null, THREE.MeshLambertMaterial>();
  const leafMats = new Map<THREE.Texture | null, THREE.MeshLambertMaterial>();
  const barkMatFor = (map: THREE.Texture | null) => {
    let m = barkMats.get(map);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ map, vertexColors: true, color: "#ffffff" });
      barkMats.set(map, m);
    }
    return m;
  };
  const leafMatFor = (map: THREE.Texture | null) => {
    let m = leafMats.get(map);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ map, vertexColors: true, color: "#ffffff", alphaTest: 0.42, side: THREE.DoubleSide });
      m.onBeforeCompile = leafMat.onBeforeCompile;
      m.customProgramCacheKey = () => "leaf-wind-tex";
      leafMats.set(map, m);
    }
    return m;
  };
  const MT: Record<string, { m: TreeModel; bark: Batch | null; leaves: Batch | null }> = {};
  for (const n of ["oak1", "oak2", "oak3", "pine1", "pine2", "birch1", "bush1", "bush2"]) {
    const m = treeModel(n);
    if (!m) continue;
    MT[n] = {
      m,
      bark: m.bark ? new Batch(m.bark.geo, barkMatFor(m.bark.map)) : null,
      leaves: m.leaves ? new Batch(m.leaves.geo, leafMatFor(m.leaves.map), m.kind !== "bush") : null,
    };
  }
  const useModels = !opts.lite && !!MT.oak2 && !!MT.pine1;
  const OAK_LEAVES = ["#7cc24a", "#6bb544", "#8fd05a", "#5fae3f", "#9bd458", "#74bd4c"];
  const AUTUMN = ["#e8a33a", "#d9762f", "#f0c24a"];
  function modelTree(name: string, x: number, z: number, s: number, leafCol: string, hp: number, give: number) {
    const t = MT[name]!;
    const y = height(x, z) - 0.15;
    const yaw = rand() * Math.PI * 2;
    const parts: [Batch, number][] = [];
    if (t.bark) parts.push([t.bark, t.bark.add(mtx(x, y, z, s, s, s, yaw), "#ffffff")]);
    if (t.leaves) parts.push([t.leaves, t.leaves.add(mtx(x, y, z, s, s, s, yaw), leafCol)]);
    const H = t.m.height * s;
    const tr = 0.32 * s;
    addHarvest({ kind: "tree", x, y, z, r: 1.25 * s, height: Math.min(H * 0.7, 7), mat: "wood", hp, give }, parts, [{ minX: x - tr, minY: y, minZ: z - tr, maxX: x + tr, maxY: y + H * 0.7, maxZ: z + tr, mat: "wood" }]);
  }
  const leafCols = ["#3cb84a", "#2f9a3a", "#67d15a", "#218a32", "#8ed84a"];
  function oak(x: number, z: number, s: number) {
    if (useModels) {
      const r = rand();
      modelTree(r < 0.22 ? "oak1" : r < 0.6 ? "oak2" : "oak3", x, z, s * 0.9, rand() < 0.07 ? pick(AUTUMN) : pick(OAK_LEAVES), 5, 12);
      return;
    }
    const y = height(x, z) - 0.1;
    const yaw = rand() * Math.PI * 2;
    const parts: [Batch, number][] = [
      [B.oakTrunk, B.oakTrunk.add(mtx(x, y, z, s, s * (0.9 + rand() * 0.25), s, yaw), "#ffffff")],
      [B.oakTop, B.oakTop.add(mtx(x, y, z, s, s * (0.9 + rand() * 0.2), s, yaw), pick(["#4cb848", "#3fa63d", "#5cc24e", "#46ad3f", "#6bc94f"]))],
    ];
    addHarvest({ kind: "tree", x, y, z, r: 1.3 * s, height: 4 * s, mat: "wood", hp: 5, give: 12 }, parts, [{ minX: x - 0.45 * s, minY: y, minZ: z - 0.45 * s, maxX: x + 0.45 * s, maxY: y + 4 * s, maxZ: z + 0.45 * s, mat: "wood" }]);
  }
  function pine(x: number, z: number, s: number) {
    if (useModels) {
      modelTree(rand() < 0.55 ? "pine1" : "pine2", x, z, s * 0.95, pick(["#3f8a3a", "#4a9a45", "#357d38", "#55a34a"]), 5, 12);
      return;
    }
    const y = height(x, z) - 0.1;
    const yaw = rand() * Math.PI * 2;
    const parts: [Batch, number][] = [
      [B.pineTrunk, B.pineTrunk.add(mtx(x, y, z, s, s, s, yaw), "#ffffff")],
      [B.pineTop, B.pineTop.add(mtx(x, y, z, s, s * (0.95 + rand() * 0.25), s, yaw), pick(["#2f8a40", "#277a38", "#3a9a48", "#2c7f45"]))],
    ];
    addHarvest({ kind: "tree", x, y, z, r: 1.1 * s, height: 2.6 * s, mat: "wood", hp: 5, give: 12 }, parts, [{ minX: x - 0.32 * s, minY: y, minZ: z - 0.32 * s, maxX: x + 0.32 * s, maxY: y + 6 * s, maxZ: z + 0.32 * s, mat: "wood" }]);
  }
  function birch(x: number, z: number, s: number) {
    if (useModels) {
      modelTree("birch1", x, z, s * 0.66, pick(["#a6d455", "#b8dc5a", "#93c94e", "#c8d860"]), 4, 10);
      return;
    }
    const y = height(x, z) - 0.1;
    const yaw = rand() * Math.PI * 2;
    const parts: [Batch, number][] = [
      [B.birchTrunk, B.birchTrunk.add(mtx(x, y, z, s, s, s, yaw), "#ffffff")],
      [B.birchTop, B.birchTop.add(mtx(x, y, z, s, s * (0.9 + rand() * 0.2), s, yaw), pick(["#8fcf4a", "#a3d84e", "#7cc444", "#b5dc58"]))],
    ];
    addHarvest({ kind: "tree", x, y, z, r: 1.0 * s, height: 5 * s, mat: "wood", hp: 4, give: 10 }, parts, [{ minX: x - 0.25 * s, minY: y, minZ: z - 0.25 * s, maxX: x + 0.25 * s, maxY: y + 5.6 * s, maxZ: z + 0.25 * s, mat: "wood" }]);
  }
  function palm(x: number, z: number, s: number, yaw: number) {
    const y = height(x, z) - 0.15;
    const parts: [Batch, number][] = [
      [B.palmTrunk, B.palmTrunk.add(mtx(x, y, z, s, s, s, yaw), "#ffffff")],
      [B.palmTop, B.palmTop.add(mtx(x, y, z, s, s, s, yaw), pick(["#3fae45", "#4dba4a", "#36a040", "#5ec24f"]))],
    ];
    addHarvest({ kind: "tree", x, y, z, r: 1.0 * s, height: 4 * s, mat: "wood", hp: 4, give: 10 }, parts, [{ minX: x - 0.3 * s, minY: y, minZ: z - 0.3 * s, maxX: x + 0.3 * s, maxY: y + 4 * s, maxZ: z + 0.3 * s, mat: "wood" }]);
  }
  function boulder(x: number, z: number, s: number) {
    const y = height(x, z);
    const sx = s * (0.9 + rand() * 0.6);
    const sy = s * (0.6 + rand() * 0.3);
    const sz = s * (0.8 + rand() * 0.5);
    const i = B.rock.add(mtx(x, y + sy * 0.4, z, sx, sy, sz, rand() * 6), pick(["#a9a59c", "#9a958a", "#b3ab9c", "#8f8b84"]));
    addHarvest({ kind: "rock", x, y, z, r: Math.max(sx, sz) + 0.6, height: sy * 1.4, mat: "brick", hp: 5, give: 10 }, [[B.rock, i]], [
      { minX: x - sx * 0.75, minY: y - 0.5, minZ: z - sz * 0.75, maxX: x + sx * 0.75, maxY: y + sy * 1.2, maxZ: z + sz * 0.75, mat: "brick" },
    ]);
  }
  function car(x: number, z: number, yaw: number, color: string) {
    const y = height(x, z);
    const c0 = Math.cos(yaw);
    const s0 = Math.sin(yaw);
    const parts: [Batch, number][] = [
      [B.carBody, B.carBody.add(mtx(x, y, z, 1, 1, 1, yaw), color)],
      [B.carTop, B.carTop.add(mtx(x, y, z, 1, 1, 1, yaw), "#ffffff")],
    ];
    const ex = Math.abs(c0) * 0.95 + Math.abs(s0) * 2.2;
    const ez = Math.abs(s0) * 0.95 + Math.abs(c0) * 2.2;
    addHarvest({ kind: "car", x, y, z, r: 2.6, height: 1.6, mat: "metal", hp: 6, give: 10 }, parts, [{ minX: x - ex, minY: y, minZ: z - ez, maxX: x + ex, maxY: y + 1.6, maxZ: z + ez, mat: "metal" }]);
  }
  function crate(x: number, z: number, y?: number) {
    const yy = y ?? height(x, z);
    const s = 1.2;
    const i = B.crate.add(mtx(x, yy + s / 2, z, s, s, s, rand() * 0.4), rand() > 0.5 ? "#e8c89a" : "#d4b080");
    addHarvest({ kind: "crate", x, y: yy, z, r: 1.3, height: s, mat: "wood", hp: 2, give: 8 }, [[B.crate, i]], [{ minX: x - 0.6, minY: yy, minZ: z - 0.6, maxX: x + 0.6, maxY: yy + s, maxZ: z + 0.6, mat: "wood" }]);
  }
  function hay(x: number, z: number) {
    const y = height(x, z);
    const yaw = rand() * Math.PI;
    const i = B.hay.add(mtx(x, y + 0.75, z, 1.3, 0.75, 0.75, yaw), "#e3c25a");
    addHarvest({ kind: "hay", x, y, z, r: 1.4, height: 1.5, mat: "wood", hp: 2, give: 8 }, [[B.hay, i]], [{ minX: x - 0.8, minY: y, minZ: z - 0.8, maxX: x + 0.8, maxY: y + 1.5, maxZ: z + 0.8, mat: "wood" }]);
  }
  function barrel(x: number, z: number, y?: number) {
    const yy = y ?? height(x, z);
    B.barrel.add(mtx(x, yy + 0.55, z, 0.42, 1.1, 0.42), pick(["#c0392b", "#2c6fb5", "#3d8b4f"]));
    staticBoxes.push({ minX: x - 0.42, minY: yy, minZ: z - 0.42, maxX: x + 0.42, maxY: yy + 1.1, maxZ: z + 0.42, mat: "metal" });
  }
  function lamp(x: number, z: number, nx: number, nz: number) {
    const y = height(x, z);
    B.pole.add(mtx(x, y + 3, z, 0.16, 6, 0.16), "#3b3f45");
    const yaw = Math.atan2(nx, nz);
    B.pole.add(mtx(x + nx * 0.7, y + 5.95, z + nz * 0.7, 0.12, 0.12, 1.4, yaw), "#3b3f45");
    B.lamp.add(mtx(x + nx * 1.35, y + 5.8, z + nz * 1.35, 0.5, 0.18, 0.7, yaw), "#ffffff");
    staticBoxes.push({ minX: x - 0.12, minY: y, minZ: z - 0.12, maxX: x + 0.12, maxY: y + 6, maxZ: z + 0.12, mat: "metal" });
  }

  // street lamps along town roads
  for (const road of ROADS.filter((r) => r.town)) {
    for (let i = 0; i < road.pts.length - 1; i++) {
      const [ax, az] = road.pts[i]!;
      const [bx, bz] = road.pts[i + 1]!;
      const len = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / len;
      const nz = (bx - ax) / len;
      for (let d = 10; d < len - 4; d += 24) {
        const x = ax + ((bx - ax) * d) / len + nx * (road.w / 2 + 1.2);
        const z = az + ((bz - az) * d) / len + nz * (road.w / 2 + 1.2);
        if ((Math.hypot(x + 30, z - 30) > 70 && Math.hypot(x - 240, z - 8) > 52) || height(x, z) < 1.2) continue;
        if (keepOutBuildings(x, z)) continue;
        lamp(x, z, -nx, -nz);
      }
    }
  }
  // street furniture along the sidewalks + benches
  for (const f of furniture) {
    if (f.kind === "hydrant") {
      B.hydrant.add(mtx(f.x, f.y, f.z, 1, 1, 1, rand() * 6), "#ffffff");
      staticBoxes.push({ minX: f.x - 0.22, minY: f.y, minZ: f.z - 0.22, maxX: f.x + 0.22, maxY: f.y + 0.9, maxZ: f.z + 0.22, mat: "metal" });
    } else {
      B.trash.add(mtx(f.x, f.y, f.z, 1, 1, 1, rand() * 6), "#ffffff");
      staticBoxes.push({ minX: f.x - 0.36, minY: f.y, minZ: f.z - 0.36, maxX: f.x + 0.36, maxY: f.y + 1.05, maxZ: f.z + 0.36, mat: "metal" });
    }
  }
  for (const [x, z, yaw] of [
    [-55, 31.6, 0],
    [-67, 31.6, 0],
    [16, 156, 2.4],
    [-100, -92, 0.3],
    [30, -136, 0],
  ] as const) {
    const y = height(x, z);
    B.bench.add(mtx(x, y, z, 1, 1, 1, yaw), "#ffffff");
    staticBoxes.push({ minX: x - 0.9, minY: y, minZ: z - 0.35, maxX: x + 0.9, maxY: y + 0.55, maxZ: z + 0.35, mat: "wood" });
  }
  // parked cars: drivable when the car models loaded
  const carCols = ["#d63c35", "#2f6fd1", "#f2f2f2", "#f0c43a", "#2e8b57", "#2d2d2d", "#e67e22", "#7a3fb0", "#19a3b8"];
  const driveable = hasCars();
  const vehicles: VehicleSpawn[] = [];
  for (const [x, z, yaw] of [
    [-70, 20.5, Math.PI / 2],
    [-36, 29.5, -Math.PI / 2],
    [-55, 20.5, Math.PI / 2],
    [6, 29.5, -Math.PI / 2],
    [-20.5, 0, 0],
    [-29.5, 48, Math.PI],
    [-20.5, 66, 0],
    [-8, 36, 0.3],
    [96, -30, 1.2],
    [112, -48, 0.4],
    [80, -66, Math.PI / 2],
    [-104, 26, 0.2],
    [12, 152, 1.1],
    [80, 60, 0.6],
    [-92, -96, 2.2],
    [-48, 25, Math.PI / 2],
    [30, 25, -Math.PI / 2],
    [100, 0, 0.2],
    [-120, 40, 1.4],
    [225, 2.1, 1.67],
    [262, 1.9, -1.47],
    [240.5, 40, 0],
    [235.5, -30, Math.PI],
    [150, -162, 0.3],
    [164, -214, 1.0],
    [-74, -232, 2.9],
    [-214, -30, 0.5],
    [-142, 158, 2.3],
    [196, -8, 1.2],
  ] as const) {
    if (driveable) {
      const model = pick([...CAR_MODELS, "sedan", "hatch", "suv"]);
      vehicles.push({ x, y: height(x, z), z, yaw, model, paint: pick(carCols) });
    } else car(x, z, yaw, pick(carCols));
  }
  // crates & barrels around industrial bits
  for (let i = 0; i < 44; i++) {
    const zone = [
      [112, -48, 26],
      [26, 168, 10],
      [92, 44, 9],
      [-140, 46, 14],
      [152, -186, 24],
      [-246, -30, 14],
    ][i % 6]!;
    const x = zone[0]! + (rand() - 0.5) * zone[2]! * 2;
    const z = zone[1]! + (rand() - 0.5) * zone[2]! * 2;
    if (keepOut(x, z, 1) || height(x, z) < 1) continue;
    if (rand() < 0.65) {
      crate(x, z);
      if (rand() < 0.35) crate(x, z, height(x, z) + 1.2);
    } else barrel(x, z);
  }
  // hay bales in the farm fields and the ranch corral
  for (let i = 0; i < 18; i++) {
    const x = -148 + rand() * 46;
    const z = 66 + rand() * 28;
    hay(x, z);
  }
  for (let i = 0; i < 8; i++) hay(-227 + rand() * 20, 3 + rand() * 16);
  // forests and scattered trees
  const SPAN = 600;
  for (let i = 0; i < 980; i++) {
    let x: number;
    let z: number;
    let type: "pine" | "oak";
    const roll = rand();
    if (roll < 0.15) {
      // Timberline's pine forest
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * 70;
      x = -70 + Math.cos(a) * r;
      z = -245 + Math.sin(a) * r * 0.8;
      type = "pine";
    } else if (roll < 0.35) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * 62;
      x = -108 + Math.cos(a) * r;
      z = -100 + Math.sin(a) * r * 0.9;
      type = "pine";
    } else if (roll < 0.48) {
      const a = rand() * Math.PI * 2;
      const r = 14 + Math.sqrt(rand()) * 40;
      x = 25 + Math.cos(a) * r;
      z = -142 + Math.sin(a) * r;
      type = "pine";
    } else {
      x = (rand() - 0.5) * SPAN;
      z = (rand() - 0.5) * SPAN;
      type = rand() < 0.65 ? "oak" : "pine";
    }
    const h = baseHeight(x, z);
    if (h < 1.6 || keepOut(x, z, 4)) continue;
    if (x > -152 && x < -98 && z > 62 && z < 98) continue;
    if (Math.hypot(x - QX, z - QZ) < 38) continue;
    if (x > 60 && x < 160 && z > -95 && z < -10) continue;
    if (Math.hypot(x + 30, z - 30) < 52 && rand() < 0.8) continue;
    if (Math.hypot(x - 240, z - 8) < 48 && rand() < 0.85) continue;
    if (Math.hypot(x - 152, z + 186) < 40) continue;
    if (Math.hypot(x + 232, z + 30) < 34 && rand() < 0.85) continue;
    const s = 0.9 + rand() * 0.55;
    if (type === "oak") {
      if (rand() < 0.28) birch(x, z, s * 0.95);
      else oak(x, z, s);
    } else pine(x, z, s);
  }
  // palms along the beaches, leaning out toward the sea
  for (let i = 0, placed = 0; i < 1600 && placed < 74; i++) {
    const a = rand() * Math.PI * 2;
    const r = 60 + rand() * 280;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = baseHeight(x, z);
    if (h < 0.35 || h > 1.7 || keepOut(x, z, 3)) continue;
    // lean the trunk downhill (toward the water)
    const gx = baseHeight(x + 1, z) - baseHeight(x - 1, z);
    const gz = baseHeight(x, z + 1) - baseHeight(x, z - 1);
    const yaw = Math.atan2(gz, -gx) + (rand() - 0.5) * 0.8;
    palm(x, z, 0.85 + rand() * 0.35, yaw);
    placed++;
  }
  for (let i = 0; i < 190; i++) {
    const roll = rand();
    let x = (rand() - 0.5) * SPAN;
    let z = (rand() - 0.5) * SPAN;
    let s = 0.6 + rand() * 1.3;
    if (roll < 0.25) {
      const a = rand() * Math.PI * 2;
      const r = 14 + rand() * 22;
      x = QX + Math.cos(a) * r;
      z = QZ + Math.sin(a) * r;
      s = 0.9 + rand() * 1.6;
    } else if (roll < 0.4) {
      const a = rand() * Math.PI * 2;
      const r = 10 + rand() * 40;
      x = 25 + Math.cos(a) * r;
      z = -142 + Math.sin(a) * r;
      s = 1 + rand() * 1.8;
    }
    if (baseHeight(x, z) < 0.4 || keepOut(x, z, 2)) continue;
    boulder(x, z, s);
  }
  for (let i = 0; i < 420; i++) {
    const x = (rand() - 0.5) * SPAN;
    const z = (rand() - 0.5) * SPAN;
    if (baseHeight(x, z) < 1.4 || keepOut(x, z, 1)) continue;
    const s = 0.7 + rand() * 0.7;
    const bc = pick(["#4fa847", "#5cb84e", "#45993f", "#6cc153"]);
    if (useModels && MT.bush1?.leaves && MT.bush2?.leaves) {
      const big = rand() < 0.35;
      (big ? MT.bush2 : MT.bush1).leaves!.add(mtx(x, height(x, z) - 0.15, z, s * (big ? 0.75 : 1.05), s * (big ? 0.7 : 1.0), s * (big ? 0.75 : 1.05), rand() * 6), bc);
    } else B.bush.add(mtx(x, height(x, z) - 0.1, z, s, s * 0.85, s, rand() * 3), bc);
  }
  // outdoor floor loot + ammo near points of interest
  for (const p of pois) {
    for (let i = 0; i < 5; i++) {
      const a = rand() * Math.PI * 2;
      const r = 6 + rand() * p.r * 0.8;
      const x = p.x + Math.cos(a) * r;
      const z = p.z + Math.sin(a) * r;
      if (height(x, z) < 1 || keepOutBuildings(x, z)) continue;
      kit.loot.push({ kind: "floor", x, y: height(x, z), z, yaw: 0 });
    }
  }
  for (let i = 0; i < 60; i++) {
    const x = (rand() - 0.5) * 540;
    const z = (rand() - 0.5) * 540;
    if (baseHeight(x, z) < 1.6 || keepOut(x, z, 2)) continue;
    kit.loot.push({ kind: "floor", x, y: height(x, z), z, yaw: rand() * 6 });
  }

  /* ---------- assemble ---------- */
  const group = new THREE.Group();
  group.name = "island";
  group.add(terrain, sea, roads);
  const kitGroup = kit.build(mats);
  group.add(kitGroup);
  const kitMeshes = kitGroup.children as THREE.Mesh[];
  const _bb = new THREE.Box3();
  const _bb2 = new THREE.Box3();

  // see-through glass: one transparent instanced mesh with a painted shine
  const shine = tex(128, (g, s) => {
    g.fillStyle = "#9fd4f2";
    g.fillRect(0, 0, s, s);
    g.fillStyle = "rgba(255,255,255,0.85)";
    g.beginPath();
    g.moveTo(s * 0.18, s);
    g.lineTo(s * 0.42, s);
    g.lineTo(s * 0.86, 0);
    g.lineTo(s * 0.62, 0);
    g.closePath();
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.55)";
    g.beginPath();
    g.moveTo(s * 0.5, s);
    g.lineTo(s * 0.58, s);
    g.lineTo(s * 1.02, 0);
    g.lineTo(s * 0.94, 0);
    g.closePath();
    g.fill();
  });
  shine.wrapS = shine.wrapT = THREE.ClampToEdgeWrapping;
  const glassMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial({ map: shine, color: "#e8f7ff", emissive: new THREE.Color("#2a5f86"), emissiveIntensity: 0.25, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }),
    Math.max(1, kit.glass.length),
  );
  glassMesh.count = kit.glass.length;
  kit.glass.forEach((b, i) => {
    glassMesh.setMatrixAt(i, mtx((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2, b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ));
  });
  glassMesh.renderOrder = 3;
  glassMesh.frustumCulled = false;
  glassMesh.name = "glass";
  group.add(glassMesh);

  // hinged doors: instanced leaves (pivot at the hinge edge) + knobs
  const doorTex = tex(128, (g, s) => {
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, s, s);
    g.fillStyle = "rgba(0,0,0,0.22)";
    for (const [x, y, w, h] of [
      [14, 10, 42, 46],
      [72, 10, 42, 46],
      [14, 70, 42, 50],
      [72, 70, 42, 50],
    ] as const) {
      g.fillRect(x, y, w, h);
      g.fillStyle = "rgba(255,255,255,0.35)";
      g.fillRect(x + 4, y + 4, w - 8, h - 8);
      g.fillStyle = "rgba(0,0,0,0.22)";
    }
    g.strokeStyle = "rgba(0,0,0,0.35)";
    g.lineWidth = 3;
    g.strokeRect(2, 2, s - 4, s - 4);
  });
  const leafCount = kit.doors.reduce((n, d) => n + d.leaves.length, 0);
  const doorGeo = new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0);
  const doorMesh = new THREE.InstancedMesh(doorGeo, new THREE.MeshLambertMaterial({ map: doorTex }), Math.max(1, leafCount));
  const knobMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshLambertMaterial({ color: "#d9b64a", emissive: new THREE.Color("#3a2a00"), emissiveIntensity: 0.4 }), Math.max(1, leafCount * 2));
  doorMesh.count = leafCount;
  knobMesh.count = leafCount * 2;
  doorMesh.castShadow = true;
  doorMesh.frustumCulled = knobMesh.frustumCulled = false;
  doorMesh.name = "doors";
  const doorState = kit.doors.map(() => ({ open: false, t: 0, gone: false }));
  islandBake.doors = kit.doors;
  const _dm = new THREE.Matrix4();
  const _dq = new THREE.Quaternion();
  const _dp = new THREE.Vector3();
  const _ds = new THREE.Vector3();
  const _dk = new THREE.Vector3();
  function drawDoor(i: number) {
    const d = kit.doors[i]!;
    const st = doorState[i]!;
    let li = kit.doors.slice(0, i).reduce((n, x) => n + x.leaves.length, 0);
    const ease = st.t * st.t * (3 - 2 * st.t);
    if (st.gone) {
      // the wall it was in got smashed: the door goes with it
      _dm.makeScale(0, 0, 0);
      for (let k = 0; k < d.leaves.length; k++, li++) {
        doorMesh.setMatrixAt(li, _dm);
        knobMesh.setMatrixAt(li * 2, _dm);
        knobMesh.setMatrixAt(li * 2 + 1, _dm);
      }
      doorMesh.instanceMatrix.needsUpdate = true;
      knobMesh.instanceMatrix.needsUpdate = true;
      return;
    }
    for (const lf of d.leaves) {
      const yaw = lf.yaw + lf.swing * ease * 1.6;
      _dq.setFromAxisAngle(_dk.set(0, 1, 0), yaw);
      _dm.compose(_dp.set(lf.hx, d.y, lf.hz), _dq, _ds.set(lf.w, d.h - 0.02, 0.09));
      doorMesh.setMatrixAt(li, _dm);
      doorMesh.setColorAt(li, new THREE.Color(d.color));
      const kx = Math.cos(yaw) * (lf.w - 0.14);
      const kz = -Math.sin(yaw) * (lf.w - 0.14);
      for (let side = 0; side < 2; side++) {
        const off = side ? 0.08 : -0.08;
        _dm.compose(_dp.set(lf.hx + kx + Math.sin(yaw) * off, d.y + 1.05, lf.hz + kz + Math.cos(yaw) * off), _dq, _ds.set(0.06, 0.06, 0.06));
        knobMesh.setMatrixAt(li * 2 + side, _dm);
      }
      li++;
    }
    doorMesh.instanceMatrix.needsUpdate = true;
    knobMesh.instanceMatrix.needsUpdate = true;
    if (doorMesh.instanceColor) doorMesh.instanceColor.needsUpdate = true;
  }
  kit.doors.forEach((_, i) => drawDoor(i));
  group.add(doorMesh, knobMesh);

  // shop signs
  for (const sg of signs) {
    const c2 = document.createElement("canvas");
    c2.width = 512;
    c2.height = 128;
    const g2 = c2.getContext("2d");
    if (g2) {
      g2.fillStyle = "#2d3e50";
      g2.fillRect(0, 0, 512, 128);
      g2.strokeStyle = "#f2c94c";
      g2.lineWidth = 8;
      g2.strokeRect(8, 8, 496, 112);
      g2.font = "900 72px 'Lilita One', 'Trebuchet MS', sans-serif";
      g2.textAlign = "center";
      g2.textBaseline = "middle";
      g2.fillStyle = "#ffffff";
      g2.fillText(sg.text, 256, 68);
    }
    const t2 = new THREE.CanvasTexture(c2);
    t2.colorSpace = THREE.SRGBColorSpace;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(sg.w, 1.6), new THREE.MeshLambertMaterial({ map: t2, emissive: new THREE.Color("#222222") }));
    kit.at(sg.frame[0], sg.frame[1], sg.frame[2], sg.frame[3]);
    const [sx, sz] = kit.w(sg.lx, sg.lz);
    plane.position.set(sx, sg.frame[1] + sg.ly, sz);
    plane.rotation.y = sg.frame[3] * (Math.PI / 2);
    group.add(plane);
  }
  for (const b of Object.values(B)) if (b.mats.length) group.add(b.build());
  for (const t of Object.values(MT)) for (const b of [t.bark, t.leaves]) if (b && b.mats.length) group.add(b.build());

  // windmill rotor (animated)
  const rotor = new THREE.Group();
  {
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.6, 8).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: "#5a3a26" }));
    rotor.add(hub);
    const bladeGeo = new THREE.BoxGeometry(0.9, 5.2, 0.08);
    bladeGeo.translate(0, 2.9, 0);
    const bladeMat = new THREE.MeshLambertMaterial({ color: "#efe6d2" });
    for (let i = 0; i < 4; i++) {
      const bl = new THREE.Mesh(bladeGeo, bladeMat);
      bl.rotation.z = (i * Math.PI) / 2;
      bl.castShadow = true;
      rotor.add(bl);
    }
    rotor.position.set(millPos[0], millPos[1], millPos[2]);
    group.add(rotor);
    millRotor = rotor;
  }

  /* ---------- minimap ---------- */
  const MM = 320;
  const mc = document.createElement("canvas");
  mc.width = mc.height = MM;
  const mg = mc.getContext("2d");
  if (mg) {
    const img = mg.createImageData(MM, MM);
    for (let py = 0; py < MM; py++) {
      for (let px = 0; px < MM; px++) {
        const x = (px / MM) * SIZE - MAP_HALF;
        const z = (py / MM) * SIZE - MAP_HALF;
        const h = baseHeight(x, z);
        let r = 0;
        let g = 0;
        let b = 0;
        if (h < -0.2) {
          const deep = smooth(-0.2, -6, h);
          r = 70 - deep * 30;
          g = 160 - deep * 50;
          b = 220 - deep * 30;
        } else if (h < 1.5) {
          r = 228;
          g = 212;
          b = 150;
        } else {
          const t = Math.min(1, Math.max(0, (h - 2) / 34));
          r = 92 + t * 80;
          g = 170 - t * 20;
          b = 76 + t * 70;
          const fNW = Math.exp(-((x + 108) ** 2 + (z + 100) ** 2) / (2 * 50 * 50)) + Math.exp(-((x + 70) ** 2 + (z + 245) ** 2) / (2 * 60 * 60));
          r -= fNW * 30;
          g -= fNW * 30;
          b -= fNW * 20;
          if (x > -152 && x < -98 && z > 62 && z < 98) {
            r = 222;
            g = 190;
            b = 100;
          }
        }
        const o = (py * MM + px) * 4;
        img.data[o] = r;
        img.data[o + 1] = g;
        img.data[o + 2] = b;
        img.data[o + 3] = 255;
      }
    }
    mg.putImageData(img, 0, 0);
    const toPx = (v: number) => ((v + MAP_HALF) / SIZE) * MM;
    mg.strokeStyle = "#e8e2d2";
    mg.lineCap = "round";
    mg.lineJoin = "round";
    for (const road of ROADS) {
      mg.lineWidth = Math.max(2, (road.w / SIZE) * MM);
      mg.beginPath();
      road.pts.forEach(([x, z], i) => (i ? mg.lineTo(toPx(x), toPx(z)) : mg.moveTo(toPx(x), toPx(z))));
      mg.stroke();
    }
    for (const f of footprints) {
      mg.fillStyle = "rgba(60,52,48,0.85)";
      mg.fillRect(toPx(f.x0), toPx(f.z0), Math.max(2, toPx(f.x1) - toPx(f.x0)), Math.max(2, toPx(f.z1) - toPx(f.z0)));
    }
    mg.font = "800 12px Nunito, 'Trebuchet MS', sans-serif";
    mg.textAlign = "center";
    for (const p of pois) {
      const label = p.name.toUpperCase();
      mg.lineWidth = 3;
      mg.strokeStyle = "rgba(0,0,0,0.75)";
      mg.strokeText(label, toPx(p.x), toPx(p.z) - 4);
      mg.fillStyle = "#ffffff";
      mg.fillText(label, toPx(p.x), toPx(p.z) - 4);
    }
  }
  const minimap = mc.toDataURL("image/png");

  const allBoxes = [...kit.boxes, ...staticBoxes];
  let disposed = false;
  return {
    height,
    wet: (x, z) => rawHeight(x, z) < -0.3,
    group,
    boxes: allBoxes,
    ramps: kit.ramps,
    loot: kit.loot,
    containerSpots: kit.containerSpots,
    harvest,
    doors: kit.doors.map((d, i) => ({
      cx: d.cx,
      cz: d.cz,
      y: d.y,
      get open() {
        return doorState[i]!.open;
      },
    })),
    toggleDoor(i, open) {
      const st = doorState[i];
      const d = kit.doors[i];
      if (!st || !d) return;
      st.open = open ?? !st.open;
      if (st.open) d.box.dead = true;
    },
    breakBox(hit) {
      if (hit.dead) return null;
      // a house wall comes down one panel at a time: its sections plus the windows and trim in it
      const box: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number } = hit.wall ?? hit;
      hit.dead = true;
      for (const part of hit.wall?.parts ?? []) part.dead = true;
      if (hit.prop?.alive) hit.prop.hide();
      const w = box.maxX - box.minX;
      const d = box.maxZ - box.minZ;
      // reach a little past thin walls to take the trim, casings and shutters fixed to their faces
      const ex = w < d ? 0.3 : 0.03;
      const ez = d <= w ? 0.3 : 0.03;
      _bb.min.set(box.minX - ex, box.minY - 0.02, box.minZ - ez);
      _bb.max.set(box.maxX + ex, box.maxY + 0.02, box.maxZ + ez);
      for (const mesh of kitMeshes) {
        const g = mesh.geometry;
        if (!g.boundingBox) g.computeBoundingBox();
        if (!g.boundingBox!.intersectsBox(_bb)) continue;
        const pos = g.getAttribute("position") as THREE.BufferAttribute;
        const a = pos.array as Float32Array;
        let changed = false;
        for (let t = 0; t < a.length; t += 9) {
          const cx = (a[t]! + a[t + 3]! + a[t + 6]!) / 3;
          const cy = (a[t + 1]! + a[t + 4]! + a[t + 7]!) / 3;
          const cz = (a[t + 2]! + a[t + 5]! + a[t + 8]!) / 3;
          if (cx < _bb.min.x || cx > _bb.max.x || cy < _bb.min.y || cy > _bb.max.y || cz < _bb.min.z || cz > _bb.max.z) continue;
          // collapse the triangle to a point: it no longer draws
          a[t + 3] = a[t + 6] = a[t]!;
          a[t + 4] = a[t + 7] = a[t + 1]!;
          a[t + 5] = a[t + 8] = a[t + 2]!;
          changed = true;
        }
        if (changed) pos.needsUpdate = true;
      }
      // instanced props (benches, lamps, mailboxes, bins...) standing inside the box
      _bb2.copy(_bb).expandByScalar(0.25);
      for (const b of Object.values(B)) {
        if (!b.mesh) continue;
        for (let i = 0; i < b.mats.length; i++) {
          _p4.setFromMatrixPosition(b.mats[i]!);
          if (_bb2.containsPoint(_p4)) b.hide(i);
        }
      }
      // panes in the broken section shatter with it
      for (const gb of kit.glass) {
        if (gb.dead || gb.pane === undefined) continue;
        if (gb.minX >= _bb2.min.x && gb.maxX <= _bb2.max.x && gb.minY >= _bb2.min.y && gb.maxY <= _bb2.max.y && gb.minZ >= _bb2.min.z && gb.maxZ <= _bb2.max.z) {
          gb.dead = true;
          glassMesh.setMatrixAt(gb.pane, new THREE.Matrix4().makeScale(0, 0, 0));
          glassMesh.instanceMatrix.needsUpdate = true;
        }
      }
      kit.doors.forEach((dd, i) => {
        const st = doorState[i]!;
        if (st.gone || !_bb2.containsPoint(_p4.set(dd.cx, dd.y + 1, dd.cz))) return;
        st.gone = true;
        dd.box.dead = true;
        drawDoor(i);
      });
      return [(box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2, (box.minZ + box.maxZ) / 2];
    },
    breakGlass(box) {
      if (!box.glass || box.dead || box.pane === undefined) return null;
      box.dead = true;
      glassMesh.setMatrixAt(box.pane, new THREE.Matrix4().makeScale(0, 0, 0));
      glassMesh.instanceMatrix.needsUpdate = true;
      return [(box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2, (box.minZ + box.maxZ) / 2];
    },
    pois,
    vehicles,
    radius: 345,
    landRadius: 210,
    minimap,
    mapHalf: MAP_HALF,
    update(dt, time) {
      windTime.value = time;
      if (millRotor) millRotor.rotation.z -= dt * 0.9;
      for (let k = wobbles.length - 1; k >= 0; k--) {
        const w = wobbles[k]!;
        w.t += dt;
        const done = w.t > 1.1;
        const ang = done ? 0 : w.amp * Math.exp(-w.t * 4.5) * Math.sin(w.t * 22);
        const it = w.item;
        _wr.makeTranslation(it.x, it.y, it.z).multiply(_wm.makeRotationAxis(_wa.set(w.ax, 0, w.az), ang)).multiply(_wm.makeTranslation(-it.x, -it.y, -it.z));
        for (const [b, i] of w.parts) {
          if (!b.mesh) continue;
          b.mesh.setMatrixAt(i, _wm.multiplyMatrices(_wr, b.mats[i]!));
          b.mesh.instanceMatrix.needsUpdate = true;
        }
        if (done) wobbles.splice(k, 1);
      }
      for (let i = 0; i < doorState.length; i++) {
        const st = doorState[i]!;
        if (st.gone) continue;
        const want = st.open ? 1 : 0;
        if (st.t === want) continue;
        st.t = want > st.t ? Math.min(1, st.t + dt * 3.2) : Math.max(0, st.t - dt * 3.2);
        if (st.t === 0) kit.doors[i]!.box.dead = false;
        drawDoor(i);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mm = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mm)) mm.forEach((x) => x.dispose());
        else if (mm) {
          const map = (mm as THREE.MeshLambertMaterial).map;
          map?.dispose();
          mm.dispose();
        }
      });
    },
  };
}
