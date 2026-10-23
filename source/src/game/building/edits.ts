import * as THREE from "three";
import { CELL, CELL_H } from "@/game/core/content";
import { LOL_WALLS, lolDoorRect, lolWallRects } from "@/game/building/lolBuilds";

/**
 * Fortnite-style edit shapes for player builds. Edits that 1v1.LOL has a piece for are drawn with
 * that piece (see lolBuilds.ts); the shapes here cover the rest and give walls their collision.
 *
 * Walls edit on a 3x3 grid (bit = row * 3 + col, row 0 at the bottom). Removed tiles become holes,
 * and some patterns turn into Fortnite's named edits:
 *  - door: the bottom two tiles of one column (with the top tile kept) get a real, openable door
 *  - arch: the bottom two rows across two or three columns get a rounded top
 *  - triangle: an L of three tiles at a corner becomes one diagonal cut-out
 * Stairs edit on a 2x2 grid by dragging a path (bit = row * 2 + col; row climbs toward local +z):
 *  - two tiles: half-width stairs along the drag
 *  - three tiles: L stairs with a landing at the turn
 *  - four tiles in a loop: U stairs (up, across a landing, back up)
 *  - four tiles not in a loop: full stairs turned to face the first drag
 * Cones edit on a 2x2 grid of corners (bit = qz * 2 + qx). Selected corners rise to the full wall height:
 * one corner makes a tall angled triangle, two along a side make a ramp, two opposite make a tent, three
 * make the inverted triangle.
 */

export const TH = 0.28;
/** Cone peak height: the 1v1.LOL cone (1.82 m on its 3.5 m walls), scaled to this grid. */
export const PYR_H = CELL_H * 0.52;
const TS = CELL / 3;
const TSY = CELL_H / 3;
const HALF = CELL / 2;

type P2 = [number, number];

/* ---------------------------------------------------------------- shared mesh helpers */

class GeoBuf {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  tri(a: number[], b: number[], c: number[], ua: number[], ub: number[], uc: number[], inside?: number[]) {
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
        this.tri(a, c, b, ua, uc, ub);
        return;
      }
    }
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    for (const [p, u] of [
      [a, ua],
      [b, ub],
      [c, uc],
    ] as const) {
      this.pos.push(p[0]!, p[1]!, p[2]!);
      this.nor.push(nx, ny, nz);
      this.uv.push(u[0]!, u[1]!);
    }
  }
  quad(a: number[], b: number[], c: number[], d: number[], inside: number[], ua: number[], ub: number[], uc: number[], ud: number[]) {
    this.tri(a, b, c, ua, ub, uc, inside);
    this.tri(a, c, d, ua, uc, ud, inside);
  }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
const TRIM = [0.02, 0.5];

/* ---------------------------------------------------------------- walls */

export type WallShape = {
  /** Solid regions as polygons in wall space (x across -2..2, y up 0..4). */
  polys: P2[][];
  /** Columns that hold a door. */
  doors: number[];
  /** Collision rectangles in wall space. */
  rects: { x0: number; x1: number; y0: number; y1: number }[];
  /** Tiles that are part of a polygon edit (triangles, arch fillets): not plain squares. */
  label: string;
};

const wallCache = new Map<number, WallShape>();

export function wallShape(mask: number): WallShape {
  const hit = wallCache.get(mask);
  if (hit) return hit;
  // edits that have a 1v1.LOL piece take its exact outline for collision
  const lol = LOL_WALLS[mask];
  if (lol) {
    const sh: WallShape = { polys: [], doors: lol.door != null ? [lol.door] : [], rects: lolWallRects(lol), label: `${mask}` };
    wallCache.set(mask, sh);
    return sh;
  }
  const solid = (r: number, c: number) => r >= 0 && r < 3 && c >= 0 && c < 3 && (mask & (1 << (r * 3 + c))) !== 0;
  const gone = (r: number, c: number) => r >= 0 && r < 3 && c >= 0 && c < 3 && !solid(r, c);
  const xOf = (c: number) => -HALF + c * TS;
  const polys: P2[][] = [];
  const rects: WallShape["rects"] = [];
  // tiles taken over by a diagonal triangle edit (drawn as partial triangles instead of squares)
  const partial = new Set<number>();
  const extra: P2[][] = [];
  const corners: [number, number, number, number][] = [
    [0, 0, 1, 1],
    [0, 2, 1, -1],
    [2, 0, -1, 1],
    [2, 2, -1, -1],
  ];
  const used = new Set<number>();
  for (const [r, c, dr, dc] of corners) {
    const arm1: [number, number] = [r, c + dc];
    const arm2: [number, number] = [r + dr, c];
    const far1: [number, number] = [r, c + 2 * dc];
    const far2: [number, number] = [r + 2 * dr, c];
    if (!gone(r, c) || !gone(...arm1) || !gone(...arm2)) continue;
    if (!solid(r + dr, c + dc) || !solid(...far1) || !solid(...far2)) continue;
    const ids = [r * 3 + c, arm1[0] * 3 + arm1[1], arm2[0] * 3 + arm2[1]];
    if (ids.some((i) => used.has(i))) continue;
    ids.forEach((i) => used.add(i));
    // the hole is the triangle with two-tile legs from the corner; the arms keep their outer halves
    const X = (u: number) => (dc > 0 ? -HALF + u * TS : HALF - u * TS);
    const Y = (v: number) => (dr > 0 ? v * TSY : CELL_H - v * TSY);
    extra.push([
      [X(2), Y(0)],
      [X(2), Y(1)],
      [X(1), Y(1)],
    ]);
    extra.push([
      [X(0), Y(2)],
      [X(1), Y(2)],
      [X(1), Y(1)],
    ]);
    partial.add(ids[1]!).add(ids[2]!);
  }
  // squares
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) {
      if (!solid(r, c)) continue;
      const x0 = xOf(c);
      const y0 = r * TSY;
      polys.push([
        [x0, y0],
        [x0 + TS, y0],
        [x0 + TS, y0 + TSY],
        [x0, y0 + TSY],
      ]);
      rects.push({ x0, x1: x0 + TS, y0, y1: y0 + TSY });
    }
  polys.push(...extra);
  // doors: the bottom two tiles of one column, nothing removed beside them at those rows
  const doors: number[] = [];
  for (let c = 0; c < 3; c++) {
    if (!gone(0, c) || !gone(1, c) || !solid(2, c)) continue;
    if (gone(0, c - 1) || gone(1, c - 1) || gone(0, c + 1) || gone(1, c + 1)) continue;
    if (used.has(c) || used.has(3 + c)) continue;
    doors.push(c);
  }
  // arches: the bottom two rows of two or three neighbouring columns, with the top row kept above
  let c0 = -1;
  for (let c = 0; c <= 3; c++) {
    const open = c < 3 && gone(0, c) && gone(1, c) && solid(2, c) && !used.has(c) && !used.has(3 + c);
    if (open && c0 < 0) c0 = c;
    if (!open && c0 >= 0) {
      const c1 = c - 1;
      if (c1 - c0 >= 1) {
        let xa = xOf(c0);
        let xb = xOf(c1 + 1);
        const yt = 2 * TSY;
        const full = c0 === 0 && c1 === 2;
        // Fortnite: the full-width arch keeps slim posts at both ends and a wide round top; a two-tile
        // arch against the wall's edge stays open on that side and curves down only on the inner side
        if (full) {
          const PW = 0.3;
          for (const [x0, x1] of [
            [-HALF, -HALF + PW],
            [HALF - PW, HALF],
          ] as const) {
            polys.push([
              [x0, 0],
              [x1, 0],
              [x1, yt],
              [x0, yt],
            ]);
            rects.push({ x0, x1, y0: 0, y1: yt });
          }
          xa = -HALF + PW;
          xb = HALF - PW;
        }
        const leftEdge = !full && c0 === 0;
        const rightEdge = !full && c1 === 2;
        const sides = leftEdge ? [-1] : rightEdge ? [1] : [1, -1];
        const R = sides.length === 1 ? Math.min(2.0, xb - xa - 0.2) : Math.min(full ? 1.55 : 1.05, (xb - xa) / 2 - 0.05);
        for (const side of sides) {
          const cx = side > 0 ? xa + R : xb - R;
          const cy = yt - R;
          const corner: P2 = [side > 0 ? xa : xb, yt];
          const pts: P2[] = [corner];
          const N = 10;
          for (let i = 0; i <= N; i++) {
            const a = (i / N) * (Math.PI / 2);
            // from the side point (on the jamb) round to the top point (on the lintel)
            pts.push([cx - side * R * Math.cos(a), cy + R * Math.sin(a)]);
          }
          polys.push(pts);
        }
      }
      c0 = -1;
    }
  }
  const shape: WallShape = { polys, doors, rects, label: `${mask}` };
  wallCache.set(mask, shape);
  return shape;
}

/** Wall geometry in piece space: the wall plane sits at z = lz (the cell's -z edge), thickness TH. */
export function wallGeo(mask: number, lz: number) {
  const sh = wallShape(mask);
  const b = new GeoBuf();
  const z1 = lz + TH / 2;
  const z0 = lz - TH / 2;
  const uvF = (x: number, y: number) => [(x + HALF) / CELL, y / CELL_H];
  const uvB = (x: number, y: number) => [(HALF - x) / CELL, y / CELL_H];
  // edges shared by two solid squares are inside the wall: skip their side faces
  const key = (a: P2, c: P2) => {
    const k1 = `${a[0].toFixed(3)},${a[1].toFixed(3)}`;
    const k2 = `${c[0].toFixed(3)},${c[1].toFixed(3)}`;
    return k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
  };
  const edgeCount = new Map<string, number>();
  for (const poly of sh.polys)
    for (let i = 0; i < poly.length; i++) {
      const k = key(poly[i]!, poly[(i + 1) % poly.length]!);
      edgeCount.set(k, (edgeCount.get(k) ?? 0) + 1);
    }
  // Fortnite-style frame: a wooden beam runs round every cut edge (door, window, arch, triangle)
  const inPoly = (poly: P2[], x: number, y: number) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i]!;
      const [xj, yj] = poly[j]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  const solidAt = (x: number, y: number) => sh.polys.some((poly) => inPoly(poly, x, y));
  const BW = 0.17;
  const bz0 = z0 - 0.045;
  const bz1 = z1 + 0.045;
  const beamUv = [0.5, 0.975];
  for (const poly of sh.polys) {
    let cx = 0;
    let cy = 0;
    for (const p of poly) {
      cx += p[0];
      cy += p[1];
    }
    cx /= poly.length;
    cy /= poly.length;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      const ex = q[0] - p[0];
      const ey = q[1] - p[1];
      const len = Math.hypot(ex, ey);
      if (len < 1e-3) continue;
      // normal pointing into this polygon
      let nx = -ey / len;
      let ny = ex / len;
      const mx = (p[0] + q[0]) / 2;
      const my = (p[1] + q[1]) / 2;
      if ((cx - mx) * nx + (cy - my) * ny < 0) {
        nx = -nx;
        ny = -ny;
      }
      // only edges facing open space inside the wall's square get a beam
      const ox = mx - nx * 0.06;
      const oy = my - ny * 0.06;
      if (ox <= -HALF + 0.01 || ox >= HALF - 0.01 || oy <= 0.01 || oy >= CELL_H - 0.01) continue;
      if (solidAt(ox, oy)) continue;
      const a: P2 = [p[0], p[1]];
      const c2: P2 = [q[0], q[1]];
      const a2: P2 = [p[0] + nx * BW, p[1] + ny * BW];
      const d2: P2 = [q[0] + nx * BW, q[1] + ny * BW];
      const ins = [(a[0] + c2[0]) / 2 + nx * BW * 0.5, (a[1] + c2[1]) / 2 + ny * BW * 0.5, lz];
      // front, back and the exposed underside of the beam
      b.quad([a[0], a[1], bz1], [c2[0], c2[1], bz1], [d2[0], d2[1], bz1], [a2[0], a2[1], bz1], ins, beamUv, beamUv, beamUv, beamUv);
      b.quad([a[0], a[1], bz0], [c2[0], c2[1], bz0], [d2[0], d2[1], bz0], [a2[0], a2[1], bz0], ins, beamUv, beamUv, beamUv, beamUv);
      b.quad([a[0], a[1], bz0], [c2[0], c2[1], bz0], [c2[0], c2[1], bz1], [a[0], a[1], bz1], ins, beamUv, beamUv, beamUv, beamUv);
    }
  }
  for (const poly of sh.polys) {
    let mx = 0;
    let my = 0;
    for (const p of poly) {
      mx += p[0];
      my += p[1];
    }
    mx /= poly.length;
    my /= poly.length;
    const inside = [mx, my, lz];
    for (let i = 1; i < poly.length - 1; i++) {
      const a = poly[0]!;
      const p = poly[i]!;
      const q = poly[i + 1]!;
      b.tri([a[0], a[1], z1], [p[0], p[1], z1], [q[0], q[1], z1], uvF(a[0], a[1]), uvF(p[0], p[1]), uvF(q[0], q[1]), inside);
      b.tri([a[0], a[1], z0], [p[0], p[1], z0], [q[0], q[1], z0], uvB(a[0], a[1]), uvB(p[0], p[1]), uvB(q[0], q[1]), inside);
    }
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      if ((edgeCount.get(key(p, q)) ?? 0) > 1) continue;
      b.quad([p[0], p[1], z0], [q[0], q[1], z0], [q[0], q[1], z1], [p[0], p[1], z1], inside, TRIM, TRIM, TRIM, TRIM);
    }
  }
  return b.geo();
}

/** Door hole of a column in wall space. */
export function doorRect(col: number, mask = -1) {
  const lol = LOL_WALLS[mask];
  const r = lol && lol.door === col ? lolDoorRect(lol) : null;
  if (r) return r;
  const x0 = -HALF + col * TS;
  return { x0, x1: x0 + TS, y0: 0, y1: 2 * TSY };
}

/* ---------------------------------------------------------------- stairs */

export type StairSeg = { t: number; d: number; h0: number; h1: number };

const tileCenter = (bit: number): P2 => [-HALF / 2 + (bit % 2) * HALF, -HALF / 2 + (bit >> 1) * HALF];
const DIRS: P2[] = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
];
function dirBetween(a: number, b: number) {
  const dc = (b % 2) - (a % 2);
  const dr = (b >> 1) - (a >> 1);
  if (Math.abs(dc) + Math.abs(dr) !== 1) return -1;
  return dr === 1 ? 0 : dc === 1 ? 1 : dr === -1 ? 2 : 3;
}

/**
 * Turn a dragged tile path into a stair shape. Returns segments, or a direction to turn full stairs
 * toward (`redirect`, in piece space: 0 +z, 1 +x, 2 -z, 3 -x), or null when the selection isn't a stair.
 */
export function stairFromPath(order: number[]): { segs: StairSeg[] } | { redirect: number } | null {
  const path = order.filter((v, i) => order.indexOf(v) === i);
  const n = path.length;
  const H = CELL_H;
  if (n < 2) return null;
  const chain = path.every((t, i) => i === 0 || dirBetween(path[i - 1]!, t) >= 0);
  if (n === 4 && !chain) {
    const d = dirBetween(path[0]!, path[1]!);
    return d >= 0 ? { redirect: d } : null;
  }
  if (!chain) return null;
  if (n === 2) {
    const d = dirBetween(path[0]!, path[1]!);
    return { segs: [{ t: path[0]!, d, h0: 0, h1: H / 2 }, { t: path[1]!, d, h0: H / 2, h1: H }] };
  }
  if (n === 3) {
    return {
      segs: [
        { t: path[0]!, d: dirBetween(path[0]!, path[1]!), h0: 0, h1: H / 2 },
        { t: path[1]!, d: dirBetween(path[1]!, path[2]!), h0: H / 2, h1: H / 2 },
        { t: path[2]!, d: dirBetween(path[1]!, path[2]!), h0: H / 2, h1: H },
      ],
    };
  }
  return {
    segs: [
      { t: path[0]!, d: dirBetween(path[0]!, path[1]!), h0: 0, h1: H / 2 },
      { t: path[1]!, d: dirBetween(path[1]!, path[2]!), h0: H / 2, h1: H / 2 },
      { t: path[2]!, d: dirBetween(path[2]!, path[3]!), h0: H / 2, h1: H / 2 },
      { t: path[3]!, d: dirBetween(path[2]!, path[3]!), h0: H / 2, h1: H },
    ],
  };
}

export const stairKey = (segs: StairSeg[]) => segs.map((s) => `${s.t}${s.d}${s.h0}${s.h1}`).join("-");

/** One 2x2 m stair tile climbing local +z from h0 to h1 (or a landing when h0 == h1), centred at the origin. */
function stairTile(b: GeoBuf, h0: number, h1: number, d: number, cx: number, cz: number) {
  const ang = d * (Math.PI / 2);
  const cs = Math.cos(ang);
  const sn = Math.sin(ang);
  const P = (x: number, y: number, z: number) => [cx + x * cs + z * sn, y, cz - x * sn + z * cs];
  const hw = HALF / 2;
  const x0 = -hw;
  const x1 = hw;
  const z0 = -hw;
  const z1 = hw;
  const u0 = 0.06;
  const u1 = 0.94;
  const xm = 0;
  const q = (a: number[], bb: number[], c: number[], dd: number[], inside: number[], ua: number[], ub: number[], uc: number[], ud: number[]) =>
    b.quad(P(a[0]!, a[1]!, a[2]!), P(bb[0]!, bb[1]!, bb[2]!), P(c[0]!, c[1]!, c[2]!), P(dd[0]!, dd[1]!, dd[2]!), P(inside[0]!, inside[1]!, inside[2]!), ua, ub, uc, ud);
  if (Math.abs(h1 - h0) < 1e-3) {
    // landing slab
    const top = h0;
    const bot = Math.max(0.02, top - 0.4);
    const inside = [0, (top + bot) / 2, 0];
    q([x0, top, z0], [x1, top, z0], [x1, top, z1], [x0, top, z1], inside, [u0, 0.06], [u1, 0.06], [u1, 0.94], [u0, 0.94]);
    q([x0, bot, z0], [x1, bot, z0], [x1, bot, z1], [x0, bot, z1], inside, TRIM, TRIM, TRIM, TRIM);
    q([x0, bot, z0], [x1, bot, z0], [x1, top, z0], [x0, top, z0], inside, TRIM, TRIM, TRIM, TRIM);
    q([x0, bot, z1], [x1, bot, z1], [x1, top, z1], [x0, top, z1], inside, TRIM, TRIM, TRIM, TRIM);
    q([x0, bot, z0], [x0, bot, z1], [x0, top, z1], [x0, top, z0], inside, TRIM, TRIM, TRIM, TRIM);
    q([x1, bot, z0], [x1, bot, z1], [x1, top, z1], [x1, top, z0], inside, TRIM, TRIM, TRIM, TRIM);
    return;
  }
  const STEPS = 4;
  const dz = (z1 - z0) / STEPS;
  const THICK = 0.42;
  const slope = (z: number) => h0 + ((z - z0) / (z1 - z0)) * (h1 - h0);
  const under0 = Math.max(0.02, h0 - THICK);
  const under1 = Math.max(0.02, h1 - THICK);
  const under = (z: number) => under0 + ((z - z0) / (z1 - z0)) * (under1 - under0);
  let prevH = h0;
  for (let k = 0; k < STEPS; k++) {
    const za = z0 + k * dz;
    const zb = za + dz;
    const h = slope((za + zb) / 2);
    const lo = k === 0 && h0 < 0.05 ? 0.02 : Math.max(under(za), Math.min(prevH, h - dz));
    const va = 0.06 + (k / STEPS) * 0.88;
    const vb = 0.06 + ((k + 1) / STEPS) * 0.88 - 0.02;
    q([x0, h, za], [x1, h, za], [x1, h, zb], [x0, h, zb], [xm, h - 1, (za + zb) / 2], [u0, va], [u1, va], [u1, vb], [u0, vb]);
    if (h - lo > 0.01) q([x0, lo, za], [x1, lo, za], [x1, h, za], [x0, h, za], [xm, (lo + h) / 2, za + 1], TRIM, TRIM, TRIM, TRIM);
    const ba = Math.min(under(za), h - 0.04);
    const bb2 = Math.min(under(zb), h - 0.04);
    for (const [x, dir] of [
      [x0, 1],
      [x1, -1],
    ] as const)
      q([x, ba, za], [x, bb2, zb], [x, h, zb], [x, h, za], [x + dir, (ba + h) / 2, (za + zb) / 2], TRIM, TRIM, TRIM, TRIM);
    prevH = h;
  }
  const endLo = under(z1);
  if (prevH - endLo > 0.01) q([x0, endLo, z1], [x1, endLo, z1], [x1, prevH, z1], [x0, prevH, z1], [xm, (endLo + prevH) / 2, z1 - 1], TRIM, TRIM, TRIM, TRIM);
  q([x0, under0, z0], [x1, under0, z0], [x1, under1, z1], [x0, under1, z1], [xm, (under0 + under1) / 2 + 1, 0], TRIM, TRIM, TRIM, TRIM);
}

export function stairGeo(segs: StairSeg[]) {
  const b = new GeoBuf();
  for (const s of segs) {
    const [cx, cz] = tileCenter(s.t);
    stairTile(b, s.h0, s.h1, s.d, cx, cz);
  }
  return b.geo();
}

/** Walkable height of an edited stair in piece space, or null off its tiles. */
export function stairHeight(segs: StairSeg[], lx: number, lz: number) {
  if (Math.abs(lx) > HALF || Math.abs(lz) > HALF) return null;
  const bit = (lz < 0 ? 0 : 2) + (lx < 0 ? 0 : 1);
  const s = segs.find((g) => g.t === bit);
  if (!s) return null;
  const [cx, cz] = tileCenter(bit);
  const [dx, dz] = DIRS[s.d]!;
  const along = ((lx - cx) * dx + (lz - cz) * dz) / (HALF / 2);
  const t = Math.max(0, Math.min(1, (along + 1) / 2));
  return s.h0 + (s.h1 - s.h0) * t;
}

/** Mean height of one stair tile (for the edit grid overlay). */
export function stairTileHeight(segs: StairSeg[] | undefined, bit: number) {
  if (!segs) {
    const row = bit >> 1;
    return (row + 0.5) * (CELL_H / 2);
  }
  const s = segs.find((g) => g.t === bit);
  return s ? (s.h0 + s.h1) / 2 : 0.15;
}

/* ---------------------------------------------------------------- cones */

const CORNERS: P2[] = [
  [-HALF, -HALF],
  [HALF, -HALF],
  [-HALF, HALF],
  [HALF, HALF],
];

/** Corner heights and the diagonal the roof folds along (A: corners 0-3, B: corners 1-2). */
export function roofLayout(mask: number) {
  // raised corners reach the full wall height, like the 1v1.LOL cone edits
  const h = [0, 1, 2, 3].map((q) => (mask & (1 << q) ? 0 : CELL_H));
  const raised = [0, 1, 2, 3].filter((q) => !(mask & (1 << q)));
  let diagA = true;
  if (raised.length === 1) diagA = raised[0] === 0 || raised[0] === 3;
  else if (raised.length === 3) {
    const low = [0, 1, 2, 3].find((q) => mask & (1 << q))!;
    diagA = low === 0 || low === 3;
  } else if (raised.length === 2) diagA = !(raised.includes(1) && raised.includes(2));
  const tris: [number, number, number][] = diagA
    ? [
        [0, 1, 3],
        [0, 3, 2],
      ]
    : [
        [0, 1, 2],
        [1, 3, 2],
      ];
  return { h, tris };
}

export function roofGeo(mask: number) {
  const { h, tris } = roofLayout(mask);
  const b = new GeoBuf();
  const T = 0.3;
  const top = (q: number) => [CORNERS[q]![0], h[q]! + 0.02, CORNERS[q]![1]];
  const bot = (q: number) => [CORNERS[q]![0], Math.max(0.02, h[q]! - T), CORNERS[q]![1]];
  const uvq = (q: number) => [0.06 + ((CORNERS[q]![0] + HALF) / CELL) * 0.88, 0.06 + ((CORNERS[q]![1] + HALF) / CELL) * 0.88];
  const mid = (h[0]! + h[1]! + h[2]! + h[3]!) / 4;
  for (const [a, c, d] of tris) {
    b.tri(top(a), top(c), top(d), uvq(a), uvq(c), uvq(d), [0, -50, 0]);
    b.tri(bot(a), bot(c), bot(d), TRIM, TRIM, TRIM, [0, 50, 0]);
  }
  for (const [a, c] of [
    [0, 1],
    [1, 3],
    [3, 2],
    [2, 0],
  ] as const) {
    if (h[a]! < 0.05 && h[c]! < 0.05) continue;
    b.quad(bot(a), bot(c), top(c), top(a), [0, mid, 0], TRIM, TRIM, TRIM, TRIM);
  }
  return b.geo();
}

/** Walkable height of an edited cone in piece space, or null outside its square. */
export function roofHeight(mask: number, lx: number, lz: number) {
  if (Math.abs(lx) > HALF || Math.abs(lz) > HALF) return null;
  const { h, tris } = roofLayout(mask);
  for (const [a, b, c] of tris) {
    const [ax, az] = CORNERS[a]!;
    const [bx, bz] = CORNERS[b]!;
    const [cx, cz] = CORNERS[c]!;
    const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    const w1 = ((bz - cz) * (lx - cx) + (cx - bx) * (lz - cz)) / den;
    const w2 = ((cz - az) * (lx - cx) + (ax - cx) * (lz - cz)) / den;
    const w3 = 1 - w1 - w2;
    if (w1 >= -1e-4 && w2 >= -1e-4 && w3 >= -1e-4) return h[a]! * w1 + h[b]! * w2 + h[c]! * w3;
  }
  return null;
}
