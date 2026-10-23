import * as THREE from "three";
import { palmFrondGeo, palmTrunkGeo } from "@/game/world/island";

/**
 * Spawn island: the warm-up island everyone waits on before the drop ship leaves, like Fortnite's.
 * A small grassy island off the coast of Driftwood Isle with a sandy beach, palms, a pier pointing at
 * the main island, a launch pad and a big countdown board. No damage here; building is free.
 */
// far out to sea off the south-east coast, well beyond the edge of the map (and the storm)
export const SPAWN_ISLE = { x: 440, z: 660, top: 3.2 };
/** Size of the island: 1 was the first, small version; the coast of Driftwood Isle is ~98 m away. */
const K = 3.6;
/** Walkable radius (an invisible wall stands in the shallows just past it). */
export const SPAWN_WALK_R = 36 * K;
const OUTER = 48 * K;
/** Where the grass ends and the beach begins, and where the beach meets the water. */
export const SPAWN_GRASS_R = 25 * K;
export const SPAWN_BEACH_R = 33 * K;

function smooth(a: number, b: number, t: number) {
  const u = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return u * u * (3 - 2 * u);
}

/** Ground height on the spawn island, or null outside it (the sea and main island take over). */
export function spawnHeight(x: number, z: number): number | null {
  const dx = x - SPAWN_ISLE.x;
  const dz = z - SPAWN_ISLE.z;
  const r = Math.hypot(dx, dz);
  if (r > OUTER) return null;
  const bumps = 0.45 * Math.sin(dx * 0.16) * Math.cos(dz * 0.13) + 0.25 * Math.sin((dx + dz) * 0.09);
  const pad = 1 - smooth(9, 14, r); // the launch pad area in the middle is flat
  const top = SPAWN_ISLE.top + bumps * (1 - pad);
  const beach = 0.35;
  if (r < SPAWN_GRASS_R) return top;
  if (r < SPAWN_BEACH_R) return top + (beach - top) * smooth(SPAWN_GRASS_R, SPAWN_BEACH_R, r);
  return beach + (-3.2 - beach) * smooth(SPAWN_BEACH_R, OUTER, r);
}

/** Where players appear: a ring around the launch pad, facing the countdown board. */
export function spawnPoints(n: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.3;
    const r = 7 + (i % 3) * 3.5;
    const x = SPAWN_ISLE.x + Math.cos(a) * r;
    const z = SPAWN_ISLE.z + Math.sin(a) * r;
    // face the board (north side of the pad)
    const yaw = Math.atan2(-(SPAWN_ISLE.x - x), -(SPAWN_ISLE.z - 16 - z));
    out.push([x, z, yaw]);
  }
  return out;
}

function boardTexture() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  let last = "";
  const draw = (secs: number, players: number, total: number) => {
    const key = `${secs}|${players}|${total}`;
    if (key === last) return;
    last = key;
    const g = c.getContext("2d")!;
    const grd = g.createLinearGradient(0, 0, 0, 512);
    grd.addColorStop(0, "#1b5fd1");
    grd.addColorStop(1, "#0a2a72");
    g.fillStyle = grd;
    g.fillRect(0, 0, 1024, 512);
    g.strokeStyle = "rgba(140,220,255,0.9)";
    g.lineWidth = 14;
    g.strokeRect(7, 7, 1010, 498);
    g.textAlign = "center";
    g.fillStyle = "#ffffff";
    g.font = "italic 800 64px 'Barlow Condensed', 'Arial Narrow', sans-serif";
    g.fillText(secs > 0 ? "DROP SHIP DEPARTS IN" : "ALL ABOARD!", 512, 112);
    g.font = "800 220px 'Barlow Condensed', 'Arial Narrow', sans-serif";
    g.fillStyle = "#ffd84a";
    const m = Math.floor(secs / 60);
    const sStr = String(secs % 60).padStart(2, "0");
    g.fillText(`${m}:${sStr}`, 512, 330);
    g.font = "700 48px 'Barlow Condensed', 'Arial Narrow', sans-serif";
    g.fillStyle = "#cfe6ff";
    g.fillText(`PLAYERS ${players} / ${total}  ·  WARM-UP: NO DAMAGE  ·  FREE BUILDING`, 512, 440);
    tex.needsUpdate = true;
  };
  return { tex, draw };
}

/** Solid things on the spawn island (house walls, the tower) for collision while warming up. */
export const spawnColliders: { minX: number; minZ: number; maxX: number; maxZ: number; maxY: number }[] = [];

function sidingTex(color: string) {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = color;
  g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 16) {
    g.fillStyle = "rgba(0,0,0,0.12)";
    g.fillRect(0, y + 13, 128, 3);
    g.fillStyle = "rgba(255,255,255,0.12)";
    g.fillRect(0, y, 128, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * Beach cottages in a ring round the plaza (doors facing it), with windows, a door, a pitched roof and a
 * chimney; plus a lifeguard tower on the sand and a few picnic tables. Returns the colliders.
 */
function buildVillage(SX: number, SZ: number, toMain: number) {
  const group = new THREE.Group();
  const boxes: { minX: number; minZ: number; maxX: number; maxZ: number; maxY: number }[] = [];
  const wallCols = ["#f1e4c8", "#cfe3ee", "#f3d2c5", "#d9ead0", "#efe7a8", "#e0d6f0", "#f6f1e7", "#bfe0d9"];
  const roofCols = ["#b5523f", "#4a6ea8", "#5d6b5f", "#8a4b8a", "#a8673c", "#3f5878", "#c0563a"];
  const trim = new THREE.MeshLambertMaterial({ color: "#f7f4ee" });
  const glass = new THREE.MeshLambertMaterial({ color: "#8fc8ea", emissive: new THREE.Color("#2a5c80"), emissiveIntensity: 0.3 });
  const doorMat = new THREE.MeshLambertMaterial({ color: "#8a5a32" });
  const brick = new THREE.MeshLambertMaterial({ color: "#9a5a46" });
  const N = 11;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + 0.15;
    // keep the countdown board (north of the plaza) and the pier view toward the main island clear
    const toBoard = Math.abs(Math.atan2(Math.sin(a + Math.PI / 2), Math.cos(a + Math.PI / 2)));
    const toPier = Math.abs(Math.atan2(Math.sin(a - (Math.PI / 2 - toMain)), Math.cos(a - (Math.PI / 2 - toMain))));
    if (toBoard < 0.38 || toPier < 0.3) continue;
    const r = 46 + (i % 3) * 7;
    const x = SX + Math.cos(a) * r;
    const z = SZ + Math.sin(a) * r;
    const y = (spawnHeight(x, z) ?? SPAWN_ISLE.top) - 0.05;
    // face the plaza, snapped to a quarter turn so the collider stays a simple box
    const face = Math.round(Math.atan2(SX - x, SZ - z) / (Math.PI / 2)) * (Math.PI / 2);
    const w = 7 + (i % 2) * 2;
    const d = 6 + ((i + 1) % 2);
    const H = 3.2 + (i % 3 === 0 ? 0.6 : 0);
    const house = new THREE.Group();
    const tex = sidingTex(wallCols[i % wallCols.length]!);
    tex.repeat.set(w / 3, H / 3);
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), new THREE.MeshLambertMaterial({ map: tex }));
    walls.position.y = H / 2;
    walls.castShadow = walls.receiveShadow = true;
    house.add(walls);
    // foundation
    const base = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.5, d + 0.4), new THREE.MeshLambertMaterial({ color: "#b7b0a6" }));
    base.position.y = 0.05;
    house.add(base);
    // pitched roof: a triangular prism with eaves
    const rh = 1.9;
    const tri = new THREE.Shape();
    tri.moveTo(-d / 2 - 0.5, 0);
    tri.lineTo(d / 2 + 0.5, 0);
    tri.lineTo(0, rh);
    tri.closePath();
    const L = w + 0.8;
    const roofGeo = new THREE.ExtrudeGeometry(tri, { depth: L, bevelEnabled: false });
    roofGeo.translate(0, 0, -L / 2);
    roofGeo.rotateY(Math.PI / 2);
    const roof = new THREE.Mesh(roofGeo, new THREE.MeshLambertMaterial({ color: roofCols[i % roofCols.length], flatShading: true }));
    roof.position.y = H - 0.05;
    roof.castShadow = true;
    house.add(roof);
    // chimney
    const ch = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2, 0.7), brick);
    ch.position.set(w * 0.28, H + 1.3, -d * 0.18);
    house.add(ch);
    // front: door with a frame, two windows; windows on the back too
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.12), doorMat);
    door.position.set(0, 1.1, d / 2 + 0.03);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.45, 0.08), trim);
    frame.position.set(0, 1.2, d / 2 + 0.01);
    house.add(frame, door);
    for (const [wx, wz, ry] of [
      [-w * 0.3, d / 2 + 0.03, 0],
      [w * 0.3, d / 2 + 0.03, 0],
      [-w * 0.25, -d / 2 - 0.03, 0],
      [w * 0.25, -d / 2 - 0.03, 0],
    ] as const) {
      const wf = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.3, 0.08), trim);
      wf.position.set(wx, 1.75, wz);
      wf.rotation.y = ry;
      const wg = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 0.1), glass);
      wg.position.set(wx, 1.75, wz);
      house.add(wf, wg);
    }
    // porch step and a little fence
    const step = new THREE.Mesh(new THREE.BoxGeometry(2, 0.3, 1), new THREE.MeshLambertMaterial({ color: "#c9c5bd" }));
    step.position.set(0, 0.15, d / 2 + 0.6);
    house.add(step);
    house.position.set(x, y, z);
    house.rotation.y = face;
    group.add(house);
    const quarter = Math.round(face / (Math.PI / 2)) & 1;
    const ex = (quarter ? d : w) / 2 + 0.2;
    const ez = (quarter ? w : d) / 2 + 0.2;
    boxes.push({ minX: x - ex, maxX: x + ex, minZ: z - ez, maxZ: z + ez, maxY: y + H + rh });
  }
  // lifeguard tower on the beach, facing the sea away from the main island
  {
    const a = toMain + Math.PI * 0.85;
    const r = SPAWN_GRASS_R + 10;
    const x = SX + Math.sin(a) * r;
    const z = SZ + Math.cos(a) * r;
    const y = spawnHeight(x, z) ?? 0.4;
    const t = new THREE.Group();
    const wood = new THREE.MeshLambertMaterial({ color: "#f2f2f2" });
    for (const [lx, lz] of [
      [-1.2, -1.2],
      [1.2, -1.2],
      [-1.2, 1.2],
      [1.2, 1.2],
    ] as const) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.4, 0.25), wood);
      leg.position.set(lx, 1.7, lz);
      t.add(leg);
    }
    const cab = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.2, 3.2), new THREE.MeshLambertMaterial({ color: "#e8453c" }));
    cab.position.y = 4.5;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.25, 3.8), wood);
    roof.position.y = 5.75;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.2, 3.6), wood);
    deck.position.y = 3.4;
    t.add(cab, roof, deck);
    t.position.set(x, y, z);
    t.rotation.y = a;
    group.add(t);
    boxes.push({ minX: x - 1.6, maxX: x + 1.6, minZ: z - 1.6, maxZ: z + 1.6, maxY: y + 6 });
  }
  // picnic tables round the plaza
  const tableMat = new THREE.MeshLambertMaterial({ color: "#a8784a" });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.6;
    const x = SX + Math.cos(a) * 33;
    const z = SZ + Math.sin(a) * 33;
    const y = spawnHeight(x, z) ?? SPAWN_ISLE.top;
    const tb = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 1), tableMat);
    top.position.y = 0.8;
    tb.add(top);
    for (const sz of [-0.85, 0.85]) {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 0.35), tableMat);
      bench.position.set(0, 0.45, sz);
      tb.add(bench);
    }
    const legs = new THREE.Mesh(new THREE.BoxGeometry(2, 0.75, 0.15), tableMat);
    legs.position.y = 0.4;
    tb.add(legs);
    tb.position.set(x, y, z);
    tb.rotation.y = -a;
    group.add(tb);
  }
  return { group, boxes };
}

export function buildSpawnIsland() {
  const group = new THREE.Group();
  const { x: SX, z: SZ } = SPAWN_ISLE;

  // terrain: a displaced disc with grass on top and sand round the edge
  const geo = new THREE.PlaneGeometry(OUTER * 2, OUTER * 2, 170, 170);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const grassA = new THREE.Color("#5fbf4a");
  const grassB = new THREE.Color("#7acb52");
  const sand = new THREE.Color("#e8d29a");
  const wetSand = new THREE.Color("#c9b27a");
  const seaFloor = new THREE.Color("#1d5f9e");
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + SX;
    const z = pos.getZ(i) + SZ;
    const r = Math.hypot(x - SX, z - SZ);
    // past the beach the shelf drops away into deep water, so no square edge shows through the sea
    const h = spawnHeight(x, z) ?? -3.2 - 22 * smooth(OUTER * 0.92, OUTER * 1.25, r);
    pos.setY(i, h);
    const n = 0.5 + 0.5 * Math.sin(x * 0.7) * Math.cos(z * 0.6);
    c.copy(grassA).lerp(grassB, n);
    c.lerp(sand, smooth(SPAWN_GRASS_R - 1, SPAWN_GRASS_R + 3, r));
    c.lerp(wetSand, smooth(SPAWN_BEACH_R - 1, SPAWN_BEACH_R + 3, r));
    c.lerp(seaFloor, smooth(SPAWN_BEACH_R + 6, OUTER, r));
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  // keep only a round disc of triangles: no square corners showing through the sea
  {
    const idx = geo.index!.array;
    const keep: number[] = [];
    const lim = OUTER * 1.02;
    const rOf = (v: number) => Math.hypot(pos.getX(v), pos.getZ(v));
    for (let t = 0; t < idx.length; t += 3) {
      if (rOf(idx[t]!) < lim && rOf(idx[t + 1]!) < lim && rOf(idx[t + 2]!) < lim) keep.push(idx[t]!, idx[t + 1]!, idx[t + 2]!);
    }
    geo.setIndex(keep);
  }
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  ground.position.set(SX, 0, SZ);
  ground.receiveShadow = true;
  group.add(ground);

  // launch pad in the middle
  const padMat = new THREE.MeshLambertMaterial({ color: "#2a6fd6", emissive: new THREE.Color("#0d3a8a"), emissiveIntensity: 0.5 });
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 9, 0.18, 48), padMat);
  pad.position.set(SX, SPAWN_ISLE.top + 0.05, SZ);
  pad.receiveShadow = true;
  group.add(pad);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(7.6, 0.16, 8, 64), new THREE.MeshBasicMaterial({ color: "#8fe0ff" }));
  ring.rotation.x = Math.PI / 2;
  ring.position.set(SX, SPAWN_ISLE.top + 0.17, SZ);
  group.add(ring);
  const ring2 = ring.clone();
  ring2.scale.setScalar(0.55);
  group.add(ring2);

  // countdown board on two posts, north of the pad
  const board = boardTexture();
  const bx = SX;
  const bz = SZ - 16;
  const by = SPAWN_ISLE.top + 4.4;
  const postMat = new THREE.MeshLambertMaterial({ color: "#2b3b57" });
  for (const ox of [-5.4, 5.4]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.45, 7.8, 0.45), postMat);
    post.position.set(bx + ox, SPAWN_ISLE.top + 3.4, bz);
    post.castShadow = true;
    group.add(post);
  }
  const frame = new THREE.Mesh(new THREE.BoxGeometry(11.2, 5.8, 0.35), postMat);
  frame.position.set(bx, by, bz - 0.1);
  group.add(frame);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(10.6, 5.3), new THREE.MeshBasicMaterial({ map: board.tex, toneMapped: false }));
  screen.position.set(bx, by, bz + 0.09);
  group.add(screen);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(10.6, 5.3), new THREE.MeshBasicMaterial({ map: board.tex, toneMapped: false }));
  back.rotation.y = Math.PI;
  back.position.set(bx, by, bz - 0.29);
  group.add(back);

  // pier toward the main island (which lies toward the world origin)
  const toMain = Math.atan2(-SX, -SZ);
  const plank = new THREE.MeshLambertMaterial({ color: "#a8784a" });
  const pier = new THREE.Group();
  for (let i = 0; i < 14; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.18, 0.95), plank);
    p.position.set(0, 0.9, 30 * K - 2 + i * 1.05);
    p.receiveShadow = true;
    pier.add(p);
  }
  for (let i = 0; i < 5; i++)
    for (const ox of [-1.5, 1.5]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 4, 6), new THREE.MeshLambertMaterial({ color: "#6e4b2c" }));
      leg.position.set(ox, -1, 30 * K - 1.5 + i * 3.2);
      pier.add(leg);
    }
  pier.position.set(SX, 0, SZ);
  pier.rotation.y = toMain;
  group.add(pier);

  // palms round the beach
  const trunkMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const leafMat = new THREE.MeshLambertMaterial({ color: "#46b347", vertexColors: true, side: THREE.DoubleSide });
  const tGeo = palmTrunkGeo();
  const fGeo = palmFrondGeo();
  const N = 22;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + 0.2;
    if (Math.abs(Math.atan2(Math.sin(a - (Math.PI / 2 - toMain)), Math.cos(a - (Math.PI / 2 - toMain)))) < 0.3) continue;
    const r = SPAWN_GRASS_R + (i % 3) * 2.6 - 1;
    const x = SX + Math.cos(a) * r;
    const z = SZ + Math.sin(a) * r;
    const y = spawnHeight(x, z) ?? 0;
    const s = 0.85 + (i % 4) * 0.08;
    const tr = new THREE.Mesh(tGeo, trunkMat);
    const lf = new THREE.Mesh(fGeo, leafMat);
    for (const m of [tr, lf]) {
      m.position.set(x, y - 0.1, z);
      m.scale.setScalar(s);
      m.rotation.y = -a; // lean out toward the sea
      m.castShadow = true;
      group.add(m);
    }
  }

  // a grove of palms inland, clear of the pad and the board
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.55;
    const r = 64 + (i % 2) * 14;
    const x = SX + Math.cos(a) * r;
    const z = SZ + Math.sin(a) * r;
    if (Math.abs(x - SX) < 9 && z < SZ) continue;
    const y = spawnHeight(x, z) ?? 0;
    const s = 0.9 + (i % 3) * 0.1;
    for (const geo of [tGeo, fGeo]) {
      const m = new THREE.Mesh(geo, geo === tGeo ? trunkMat : leafMat);
      m.position.set(x, y - 0.1, z);
      m.scale.setScalar(s);
      m.rotation.y = i * 1.3;
      m.castShadow = true;
      group.add(m);
    }
  }

  // flags and a few crates for colour
  const flagCols = ["#ff4f5e", "#ffd84a", "#3fa9ff", "#5fd35a"];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x = SX + Math.cos(a) * 26;
    const z = SZ + Math.sin(a) * 26;
    const y = spawnHeight(x, z) ?? 0;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 5, 6), new THREE.MeshLambertMaterial({ color: "#e8eef6" }));
    pole.position.set(x, y + 2.5, z);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), new THREE.MeshLambertMaterial({ color: flagCols[i % 4], side: THREE.DoubleSide }));
    flag.position.set(x + 0.8, y + 4.45, z);
    group.add(pole, flag);
  }
  const crateMat = new THREE.MeshLambertMaterial({ color: "#b07a42" });
  for (const [ox, oz] of [
    [14, 9],
    [15.2, 10.4],
    [-16, 7],
    [-13, -11],
    [11, -13],
  ] as const) {
    const x = SX + ox * 2.2;
    const z = SZ + oz * 2.2;
    const cr = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), crateMat);
    cr.position.set(x, (spawnHeight(x, z) ?? 0) + 0.6, z);
    cr.rotation.y = ox * 0.3;
    cr.castShadow = true;
    group.add(cr);
  }

  // ---- a little beach village round the plaza: cottages, a lifeguard tower, picnic tables
  const village = buildVillage(SX, SZ, toMain);
  group.add(village.group);
  spawnColliders.length = 0;
  spawnColliders.push(...village.boxes);

  return {
    group,
    /** Animate and refresh the countdown board. */
    update(time: number, secsLeft: number, players: number, total: number) {
      board.draw(Math.max(0, Math.ceil(secsLeft)), players, total);
      ring.scale.setScalar(1 + Math.sin(time * 2.2) * 0.02);
      padMat.emissiveIntensity = 0.45 + Math.sin(time * 2.2) * 0.15;
    },
  };
}
