import * as THREE from "three";
import type { Gear, GliderPattern } from "@/game/core/content";

/**
 * Gliders in the spirit of Fortnite's: a hang-glider delta with a billowing printed sail, a
 * ram-air parafoil, an umbrella and a rigid jet wing. Each one unfolds out of the backpack when
 * deployed, banks into turns, flutters in the wind and leaves contrails off its tips.
 *
 * Local frame: the rider's feet at the origin, forward is -Z (the engine turns the group by yaw).
 */

export type GliderLook = Pick<Gear, "primary" | "secondary"> & { accent?: string; style?: string; pattern?: GliderPattern };

export type GliderRig = {
  group: THREE.Group;
  /** World-space contrail ribbons (add to the scene next to the group). */
  trails: THREE.Mesh[];
  /** 0 closed .. 1 fully open. */
  open: number;
  /** How far the glider frame sits below/above the rider's feet origin; tuned so the hands reach the bar. */
  hang: number;
  /** World positions of the two hand grips (control bar, risers or shaft), valid after update(). */
  gripWorld: (a: THREE.Vector3, b: THREE.Vector3) => void;
  update: (dt: number, time: number, s: { active: boolean; x: number; y: number; z: number; yaw: number; speed: number }) => void;
};

const flutter = { value: 0 };

/* ---------- printed canvas textures ---------- */
const texCache = new Map<string, THREE.Texture>();
function patternTex(look: GliderLook, cells: number) {
  const key = `${look.pattern}|${look.primary}|${look.secondary}|${look.accent}|${cells}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const P = look.primary;
  const S = look.secondary;
  const A = look.accent ?? "#222a33";
  g.fillStyle = P;
  g.fillRect(0, 0, 256, 256);
  // u (x) runs keel -> tip (or around the canopy), v (y) runs leading -> trailing edge
  switch (look.pattern ?? "stripe") {
    case "stripe":
      g.fillStyle = S;
      g.fillRect(0, 70, 256, 40);
      g.fillStyle = A;
      g.fillRect(0, 118, 256, 12);
      break;
    case "chevron":
      g.fillStyle = S;
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        const y = 40 + i * 70;
        g.moveTo(0, y);
        g.lineTo(256, y + 60);
        g.lineTo(256, y + 86);
        g.lineTo(0, y + 26);
        g.fill();
      }
      g.fillStyle = A;
      g.fillRect(0, 0, 256, 14);
      break;
    case "dots":
      g.fillStyle = S;
      for (let y = 0; y < 5; y++)
        for (let x = 0; x < 5; x++) {
          g.beginPath();
          g.arc(x * 56 + (y % 2) * 28 + 14, y * 56 + 20, 15, 0, Math.PI * 2);
          g.fill();
        }
      break;
    case "split":
      g.fillStyle = S;
      for (let i = 0; i < cells; i++) if (i % 2) g.fillRect((i / cells) * 256, 0, 256 / cells + 1, 256);
      break;
    case "stars": {
      const star = (x: number, y: number, r: number) => {
        g.beginPath();
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
          const rr = k % 2 ? r * 0.42 : r;
          g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        g.fill();
      };
      const grd = g.createLinearGradient(0, 0, 0, 256);
      grd.addColorStop(0, P);
      grd.addColorStop(1, S);
      g.fillStyle = grd;
      g.fillRect(0, 0, 256, 256);
      g.fillStyle = A;
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 26; i++) star(rnd() * 256, rnd() * 256, 3 + rnd() * 9);
      break;
    }
    case "flame": {
      g.fillStyle = S;
      g.fillRect(0, 0, 256, 256);
      g.fillStyle = P;
      g.beginPath();
      g.moveTo(0, 256);
      for (let x = 0; x <= 256; x += 32) g.quadraticCurveTo(x + 8, 40 + ((x / 32) % 2) * 50, x + 16, 150 + ((x / 32) % 3) * 20);
      g.lineTo(256, 256);
      g.fill();
      g.fillStyle = A;
      g.fillRect(0, 0, 256, 18);
      break;
    }
    case "waves":
      for (let i = 0; i < 4; i++) {
        g.fillStyle = i % 2 ? S : A;
        g.beginPath();
        g.moveTo(0, 256);
        for (let x = 0; x <= 256; x += 8) g.lineTo(x, 90 + i * 42 + Math.sin(x / 22 + i) * 12);
        g.lineTo(256, 256);
        g.fill();
      }
      break;
    case "check":
      g.fillStyle = S;
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2) g.fillRect(x * 32, y * 32, 32, 32);
      break;
  }
  // stitched seams between the panels
  g.strokeStyle = "rgba(0,0,0,0.22)";
  g.lineWidth = 3;
  for (let i = 1; i < cells; i++) {
    const x = (i / cells) * 256;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 256);
    g.stroke();
  }
  // hemmed trailing edge
  g.fillStyle = "rgba(0,0,0,0.25)";
  g.fillRect(0, 248, 256, 8);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

/** Sail material: printed canvas, double sided, with a wind flutter that grows toward the trailing edge. */
function sailMat(map: THREE.Texture) {
  const m = new THREE.MeshLambertMaterial({ map, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFlutter = flutter;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uFlutter;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_MAP
        float fl = vMapUv.y * vMapUv.y;
        transformed.y += sin(uFlutter * 15.0 + vMapUv.x * 11.0 + position.z * 3.0) * 0.045 * fl;
        #endif`,
      );
  };
  m.customProgramCacheKey = () => "glider-sail";
  return m;
}

const tubeMat = (c: string) => new THREE.MeshLambertMaterial({ color: c });

/** A cylinder between two points. */
function tube(a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material) {
  const len = a.distanceTo(b);
  const geo = new THREE.CylinderGeometry(r, r, len, 6);
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  mesh.castShadow = true;
  return mesh;
}

function lines(pts: number[], color = "#2a2f36", opacity = 0.8) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
}

/** A grid surface from a (u, v) -> point function, with uv = (u, v). */
function surface(nu: number, nv: number, f: (u: number, v: number, out: THREE.Vector3) => void, uMap?: (u: number) => number) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const p = new THREE.Vector3();
  for (let j = 0; j <= nv; j++)
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      const v = j / nv;
      f(u, v, p);
      pos.push(p.x, p.y, p.z);
      uv.push(uMap ? uMap(u) : u, v);
    }
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i;
      const b = a + 1;
      const c = a + nu + 1;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/* ---------- frames ---------- */

/** Hang-glider delta: billowing two-panel sail with battens, keel, leading-edge tubes, A-frame and king post. */
function buildDelta(look: GliderLook, canopy: THREE.Group): THREE.Vector3[] {
  const Y = 2.85;
  const nose = new THREE.Vector3(0, Y + 0.05, -1.55);
  const rear = new THREE.Vector3(0, Y + 0.08, 0.95);
  const BATTENS = 5;
  const map = patternTex(look, BATTENS);
  const sail = sailMat(map);
  const tips: THREE.Vector3[] = [];
  for (const side of [1, -1]) {
    const tip = new THREE.Vector3(side * 2.45, Y - 0.12, 0.55);
    tips.push(tip);
    const geo = surface(18, 8, (u, v, out) => {
      // u: keel -> tip, v: leading edge -> trailing edge
      const le = nose.clone().lerp(tip, u);
      const te = rear.clone().lerp(tip, u);
      // scalloped trailing edge between battens
      const f = (u * BATTENS) % 1;
      te.z -= Math.sin(f * Math.PI) * 0.16 * (1 - u * 0.5);
      out.copy(le).lerp(te, v);
      // billow: the sail bellies up between the tubes
      out.y += Math.sin(Math.PI * v) * 0.24 * Math.sqrt(1 - u * 0.85) + Math.sin(Math.PI * u) * 0.08;
    });
    if (side < 0) {
      // keep front faces on the same side for both halves
      const ix = geo.index!.array as unknown as number[];
      for (let k = 0; k < ix.length; k += 3) [ix[k + 1], ix[k + 2]] = [ix[k + 2]!, ix[k + 1]!];
      geo.computeVertexNormals();
    }
    const m = new THREE.Mesh(geo, sail);
    m.castShadow = true;
    canopy.add(m);
    // leading edge tube and battens
    canopy.add(tube(nose, tip, 0.045, tubeMat("#d8dde3")));
    const bat: number[] = [];
    for (let b = 1; b < BATTENS; b++) {
      const u = b / BATTENS;
      const le = nose.clone().lerp(tip, u);
      const te = rear.clone().lerp(tip, u);
      for (let k = 0; k < 6; k++) {
        const v0 = k / 6;
        const v1 = (k + 1) / 6;
        const p0 = le.clone().lerp(te, v0);
        const p1 = le.clone().lerp(te, v1);
        p0.y += Math.sin(Math.PI * v0) * 0.24 * Math.sqrt(1 - u * 0.85) + Math.sin(Math.PI * u) * 0.08 + 0.012;
        p1.y += Math.sin(Math.PI * v1) * 0.24 * Math.sqrt(1 - u * 0.85) + Math.sin(Math.PI * u) * 0.08 + 0.012;
        bat.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
      }
    }
    canopy.add(lines(bat, look.accent ?? "#2a3340", 0.55));
    // wingtip cap
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), tubeMat(look.accent ?? "#2a3340"));
    cap.position.copy(tip);
    canopy.add(cap);
  }
  const frame = tubeMat("#9aa4ae");
  canopy.add(tube(nose, rear, 0.05, frame));
  // A-frame and control bar
  const hang = new THREE.Vector3(0, Y + 0.02, -0.25);
  const barL = new THREE.Vector3(0.62, 2.36, -0.5);
  const barR = new THREE.Vector3(-0.62, 2.36, -0.5);
  canopy.add(tube(hang, barL, 0.03, frame), tube(hang, barR, 0.03, frame), tube(barL, barR, 0.032, tubeMat("#2a2f36")));
  // king post and rigging wires
  const king = new THREE.Vector3(0, Y + 0.62, -0.25);
  canopy.add(tube(hang, king, 0.028, frame));
  canopy.add(
    lines([...king.toArray(), ...nose.toArray(), ...king.toArray(), ...rear.toArray(), ...king.toArray(), ...tips[0]!.toArray(), ...king.toArray(), ...tips[1]!.toArray(), ...barL.toArray(), ...tips[0]!.toArray(), ...barR.toArray(), ...tips[1]!.toArray(), ...barL.toArray(), ...nose.toArray(), ...barR.toArray(), ...nose.toArray()], "#cfd6de", 0.45),
  );
  return tips;
}

/** Ram-air parafoil: an arched wing of open cells on suspension lines. */
function buildParafoil(look: GliderLook, canopy: THREE.Group): THREE.Vector3[] {
  const CELLS = 9;
  const R = 2.7;
  const CY = 1.55;
  const A = 1.05;
  const map = patternTex(look, CELLS);
  const top = sailMat(map);
  const under = new THREE.MeshLambertMaterial({ color: new THREE.Color(look.primary).multiplyScalar(0.62), side: THREE.DoubleSide });
  const thick = (c: number) => 0.32 * Math.pow(1 - c, 0.8) * (0.4 + Math.sin(Math.PI * Math.min(1, c * 1.6 + 0.2)) * 0.6) + 0.015;
  const at = (a: number, c: number, sideSign: number, out: THREE.Vector3) => {
    const r = R + (sideSign * thick(c)) / 2;
    out.set(Math.sin(a) * r, CY + Math.cos(a) * r, -0.85 + c * 1.55);
  };
  const ga = (u: number) => -A + u * 2 * A;
  canopy.add(new THREE.Mesh(surface(36, 8, (u, v, o) => at(ga(u), v, 1, o)), top));
  canopy.add(new THREE.Mesh(surface(36, 6, (u, v, o) => at(ga(u), v, -1, o)), under));
  // open cell mouths along the leading edge
  const mouth = new THREE.MeshBasicMaterial({ color: new THREE.Color(look.accent ?? "#222").multiplyScalar(0.5), side: THREE.DoubleSide });
  canopy.add(
    new THREE.Mesh(
      surface(36, 1, (u, v, o) => {
        at(ga(u), 0, v * 2 - 1, o);
      }),
      mouth,
    ),
  );
  // cell ribs (dividers) visible at the mouth
  const ribs: number[] = [];
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  for (let i = 0; i <= CELLS; i++) {
    const a = ga(i / CELLS);
    at(a, 0, 1, p);
    at(a, 0, -1, q);
    ribs.push(...p.toArray(), ...q.toArray());
  }
  canopy.add(lines(ribs, "#1b1f24", 0.7));
  // suspension lines to the two risers at the rider's shoulders
  const sus: number[] = [];
  const risers = [new THREE.Vector3(0.24, 1.72, -0.05), new THREE.Vector3(-0.24, 1.72, -0.05)];
  for (let i = 0; i <= 6; i++) {
    const a = ga(i / 6);
    for (const c of [0.15, 0.55, 0.9]) {
      at(a, c, -1, p);
      const r = a >= 0 ? risers[0]! : risers[1]!;
      sus.push(...p.toArray(), ...r.toArray());
    }
  }
  canopy.add(lines(sus, "#e8ecf0", 0.5));
  const t1 = new THREE.Vector3();
  const t2 = new THREE.Vector3();
  at(A, 0.95, 0, t1);
  at(-A, 0.95, 0, t2);
  return [t1, t2];
}

/** Umbrella: an eight-panel scalloped dome on a shaft with a crook handle. */
function buildUmbrella(look: GliderLook, canopy: THREE.Group): THREE.Vector3[] {
  const PANELS = 8;
  const R = 1.55;
  const CY = 2.95;
  const PHI = 1.2;
  const map = patternTex(look, PANELS);
  const dome = sailMat(map);
  canopy.add(
    new THREE.Mesh(
      surface(64, 10, (u, v, out) => {
        const th = u * Math.PI * 2;
        const f = (u * PANELS) % 1;
        // scallops: the rim lifts between ribs
        const phi = v * PHI * (1 - 0.1 * Math.pow(v, 4) * Math.sin(f * Math.PI));
        const r = Math.sin(phi) * R;
        // panels bow outwards between ribs
        const bow = 1 + 0.035 * Math.sin(f * Math.PI) * v;
        out.set(Math.cos(th) * r * bow, CY + Math.cos(phi) * R * 0.62, Math.sin(th) * r * bow);
      }),
      dome,
    ),
  );
  const ribs: number[] = [];
  for (let i = 0; i < PANELS; i++) {
    const th = (i / PANELS) * Math.PI * 2;
    let prev: number[] | null = null;
    for (let k = 0; k <= 8; k++) {
      const phi = (k / 8) * PHI;
      const pt = [Math.cos(th) * Math.sin(phi) * R * 1.004, CY + Math.cos(phi) * R * 0.62 + 0.005, Math.sin(th) * Math.sin(phi) * R * 1.004];
      if (prev) ribs.push(...prev, ...pt);
      prev = pt;
    }
    // stretcher from the shaft to the rib
    const phi = PHI * 0.62;
    ribs.push(0, CY - 0.15, 0, Math.cos(th) * Math.sin(phi) * R, CY + Math.cos(phi) * R * 0.62, Math.sin(th) * Math.sin(phi) * R);
  }
  canopy.add(lines(ribs, look.accent ?? "#2b2b2b", 0.75));
  const shaftTop = new THREE.Vector3(0, CY + R * 0.62 + 0.22, 0);
  const shaftBot = new THREE.Vector3(0, 2.3, 0);
  canopy.add(tube(shaftBot, shaftTop, 0.03, tubeMat("#c9ced4")));
  const ferrule = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), tubeMat(look.accent ?? "#2b2b2b"));
  ferrule.position.copy(shaftTop);
  canopy.add(ferrule);
  const crook = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.035, 6, 12, Math.PI), tubeMat(look.accent ?? "#2b2b2b"));
  crook.position.set(0.11, 2.3, 0);
  crook.rotation.z = Math.PI;
  canopy.add(crook);
  return [new THREE.Vector3(R * 0.93, CY + 0.1, 0.2), new THREE.Vector3(-R * 0.93, CY + 0.1, 0.2)];
}

/** Rigid jet wing: a swept carbon wing with glowing thruster pods at the tips. */
function buildWing(look: GliderLook, canopy: THREE.Group): THREE.Vector3[] {
  const Y = 2.85;
  const sh = new THREE.Shape();
  const half: [number, number][] = [
    [0, -1.45],
    [0.5, -0.95],
    [2.35, 0.25],
    [2.45, 0.7],
    [1.6, 0.55],
    [0.7, 0.85],
    [0, 0.7],
  ];
  sh.moveTo(half[0]![0], half[0]![1]);
  for (const [x, z] of half.slice(1)) sh.lineTo(x, z);
  for (const [x, z] of half.slice(1, -1).reverse()) sh.lineTo(-x, z);
  sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.09, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.04, bevelSegments: 2, curveSegments: 4 });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, Y + 0.07, 0);
  // planar UVs from the top: u across the span, v front to back
  const pos = geo.attributes.position!;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) + 2.5) / 5;
    uv[i * 2 + 1] = (pos.getZ(i) + 1.5) / 2.4;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  const body = new THREE.MeshStandardMaterial({ map: patternTex(look, 2), metalness: 0.55, roughness: 0.35 });
  const w = new THREE.Mesh(geo, body);
  w.castShadow = true;
  canopy.add(w);
  const glowCol = new THREE.Color(look.accent ?? "#ffe9a8");
  const tips: THREE.Vector3[] = [];
  for (const side of [1, -1]) {
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.8, 10).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: look.secondary, metalness: 0.6, roughness: 0.3 }));
    pod.position.set(side * 2.25, Y - 0.02, 0.35);
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.1, 0.55, 10, 1, true).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: glowCol, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    flame.position.set(side * 2.25, Y - 0.02, 1.0);
    flame.name = "flame";
    canopy.add(pod, flame);
    tips.push(new THREE.Vector3(side * 2.25, Y - 0.02, 1.1));
  }
  // fin
  const fin = new THREE.Mesh(
    new THREE.ExtrudeGeometry(
      new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.75, 0), new THREE.Vector2(0.9, 0.45), new THREE.Vector2(0.55, 0.45)]),
      { depth: 0.04, bevelEnabled: false },
    ),
    new THREE.MeshStandardMaterial({ color: look.secondary, metalness: 0.5, roughness: 0.4 }),
  );
  fin.rotation.y = -Math.PI / 2;
  fin.position.set(-0.02, Y + 0.12, -0.05);
  canopy.add(fin);
  const frame = tubeMat("#3a3f46");
  const hang = new THREE.Vector3(0, Y, -0.2);
  const barL = new THREE.Vector3(0.55, 2.36, -0.45);
  const barR = new THREE.Vector3(-0.55, 2.36, -0.45);
  canopy.add(tube(hang, barL, 0.03, frame), tube(hang, barR, 0.03, frame), tube(barL, barR, 0.034, tubeMat(look.secondary)));
  return tips;
}

/* ---------- contrails ---------- */
const TRAIL_N = 26;
function makeTrail() {
  const pos = new Float32Array(TRAIL_N * 2 * 3);
  const col = new Float32Array(TRAIL_N * 2 * 4);
  const idx: number[] = [];
  for (let i = 0; i < TRAIL_N - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  for (let i = 0; i < TRAIL_N; i++) {
    const k = 1 - i / (TRAIL_N - 1);
    for (const s of [0, 1]) {
      const o = (i * 2 + s) * 4;
      col[o] = col[o + 1] = col[o + 2] = 1;
      col[o + 3] = 0.55 * k * k;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 4));
  geo.setIndex(idx);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  m.frustumCulled = false;
  m.visible = false;
  m.userData.pts = [] as THREE.Vector3[];
  return m;
}
function pushTrail(m: THREE.Mesh, p: THREE.Vector3, width: number) {
  const pts = m.userData.pts as THREE.Vector3[];
  pts.unshift(p.clone());
  if (pts.length > TRAIL_N) pts.pop();
  const pos = m.geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < TRAIL_N; i++) {
    const q = pts[Math.min(i, pts.length - 1)]!;
    const w = width * (1 - (i / TRAIL_N) * 0.5);
    pos.setXYZ(i * 2, q.x, q.y + w, q.z);
    pos.setXYZ(i * 2 + 1, q.x, q.y - w, q.z);
  }
  pos.needsUpdate = true;
  m.geometry.computeBoundingSphere();
}

const _tip = new THREE.Vector3();

export function buildGlider(look: GliderLook): GliderRig {
  const group = new THREE.Group();
  const canopy = new THREE.Group();
  group.add(canopy);
  const style = look.style ?? "delta";
  const tips = style === "parafoil" ? buildParafoil(look, canopy) : style === "umbrella" ? buildUmbrella(look, canopy) : style === "wing" ? buildWing(look, canopy) : buildDelta(look, canopy);
  const flames: THREE.Object3D[] = [];
  canopy.traverse((o) => {
    if (o.name === "flame") flames.push(o);
  });
  group.visible = false;
  group.rotation.order = "YXZ";
  const trails = [makeTrail(), makeTrail()];
  // where the rider's hands go on each kind of glider (canopy space; -z is forward)
  const grips: [THREE.Vector3, THREE.Vector3] =
    style === "parafoil"
      ? [new THREE.Vector3(0.26, 1.86, -0.1), new THREE.Vector3(-0.26, 1.86, -0.1)]
      : style === "umbrella"
        ? [new THREE.Vector3(0.04, 2.34, 0), new THREE.Vector3(-0.04, 2.58, 0)]
        : style === "wing"
          ? [new THREE.Vector3(0.26, 2.31, -0.45), new THREE.Vector3(-0.26, 2.31, -0.45)]
          : [new THREE.Vector3(0.27, 2.31, -0.5), new THREE.Vector3(-0.27, 2.31, -0.5)];
  const HANG = style === "parafoil" ? 0 : style === "umbrella" ? -0.3 : -0.3;
  const BACK = style === "delta" ? 0.46 : style === "wing" ? 0.42 : 0;
  let lastYaw = 0;
  let bank = 0;
  let wasActive = false;
  const rig: GliderRig = {
    group,
    trails,
    open: 0,
    hang: HANG,
    gripWorld(a, b) {
      canopy.updateWorldMatrix(true, false);
      a.copy(grips[0]).applyMatrix4(canopy.matrixWorld);
      b.copy(grips[1]).applyMatrix4(canopy.matrixWorld);
    },
    update(dt, time, s) {
      flutter.value = time;
      if (s.active && !wasActive) {
        rig.open = 0;
        lastYaw = s.yaw;
        bank = 0;
        for (const t of trails) (t.userData.pts as THREE.Vector3[]).length = 0;
      }
      wasActive = s.active;
      rig.open = s.active ? Math.min(1, rig.open + dt / 0.55) : Math.max(0, rig.open - dt / 0.22);
      group.visible = rig.open > 0.001;
      for (const t of trails) t.visible = group.visible && s.active && rig.open > 0.6;
      if (!group.visible) return;
      // unfold out of the backpack with a little overshoot
      const o = rig.open;
      const e = s.active ? 1 + 2.2 * Math.pow(o - 1, 3) + 1.2 * Math.pow(o - 1, 2) : o;
      canopy.scale.set(Math.max(0.01, e), Math.max(0.01, 0.35 + 0.65 * e), Math.max(0.01, 0.55 + 0.45 * e));
      canopy.position.y = (1 - Math.min(1, e)) * -1.4;
      // bank into turns, nose down a touch, bob in the air
      let dy = s.yaw - lastYaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      lastYaw = s.yaw;
      const want = Math.max(-0.55, Math.min(0.55, (dy / Math.max(dt, 1e-3)) * 0.32));
      bank += (want - bank) * Math.min(1, dt * 4);
      // hang the rider from the bar: the frame sits low enough that the hands reach the grips
      // the bar sits right above the rider's head (the frame is shifted back over them)
      group.position.set(s.x + Math.sin(s.yaw) * BACK, s.y + rig.hang + Math.sin(time * 2.1) * 0.05, s.z + Math.cos(s.yaw) * BACK);
      group.rotation.set(-0.06 - Math.min(0.12, s.speed * 0.004) + Math.sin(time * 1.3) * 0.02, s.yaw, bank + Math.sin(time * 1.7) * 0.03);
      for (const f of flames) f.scale.set(1, 1, 0.8 + Math.random() * 0.5);
      // contrails off the tips
      group.updateMatrixWorld(true);
      tips.forEach((tp, i) => {
        _tip.copy(tp).applyMatrix4(canopy.matrixWorld);
        pushTrail(trails[i]!, _tip, style === "wing" ? 0.07 : 0.045);
      });
    },
  };
  return rig;
}
