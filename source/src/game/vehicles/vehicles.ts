import * as THREE from "three";
import { carModel } from "@/game/world/assets";
import type { VehicleSpawn } from "@/game/world/island";

/**
 * Drivable cars: arcade handling like Fortnite's (punchy acceleration, speed-sensitive steering,
 * the body follows the ground with pitch and roll, airtime off ramps and hills, wheels spin and
 * steer). The engine owns input, camera, enter/exit and damage; this module owns the car itself.
 */
export type Vehicle = {
  id: number;
  model: string;
  group: THREE.Group;
  visual: THREE.Object3D;
  wheels: { fl: THREE.Object3D | null; fr: THREE.Object3D | null; back: THREE.Object3D | null };
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  steer: number;
  vy: number;
  pitch: number;
  roll: number;
  lean: number;
  spin: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  /** -1 empty, 0 the player. */
  driver: number;
  /** Half extents: width, length, height. */
  hw: number;
  hl: number;
  h: number;
  wheelR: number;
  grounded: boolean;
  hurtT: number;
  /** Parked cars snap to the ground once before they first idle. */
  settled: boolean;
};

export type VehicleEnv = {
  /** Highest walkable surface under (x, z) that is not above `feet` + a small step. */
  ground: (x: number, z: number, feet: number) => number;
  /** True if a probe of radius r at (x, z) between y0 and y1 hits the world (not counting this car). */
  blocked: (x: number, z: number, y0: number, y1: number, r: number, self: Vehicle) => boolean;
  wet: (x: number, z: number) => boolean;
};

let nextId = 1;

/** Build a car from a spawn point. Returns null if the car models are not loaded. */
export function spawnVehicle(sp: VehicleSpawn): Vehicle | null {
  const visual = carModel(sp.model);
  if (!visual) return null;
  const paint = (visual.userData as { paint?: string }).paint;
  const col = new THREE.Color(sp.paint);
  visual.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const recolor = (mat: THREE.Material) => {
      const c = mat.clone() as THREE.MeshStandardMaterial;
      if (paint && mat.name === paint && sp.model !== "police" && sp.model !== "taxi") c.color.copy(col);
      // a little extra shine on paint and glass
      if (mat.name === "Windows") {
        c.roughness = 0.15;
        c.metalness = 0.4;
      }
      return c;
    };
    m.material = Array.isArray(m.material) ? m.material.map(recolor) : recolor(m.material);
  });
  const box = new THREE.Box3().setFromObject(visual);
  const size = box.getSize(new THREE.Vector3());
  const group = new THREE.Group();
  group.add(visual);
  const get = (part: string) => visual.getObjectByName(`${sp.model}_${part}`) ?? null;
  const wheels = { fl: get("wheel_fl"), fr: get("wheel_fr"), back: get("wheels_back") };
  for (const w of [wheels.fl, wheels.fr]) if (w) w.rotation.order = "YXZ";
  const wheelR = wheels.back ? Math.max(0.2, wheels.back.position.y) : 0.28;
  const v: Vehicle = {
    id: nextId++,
    model: sp.model,
    group,
    visual,
    wheels,
    x: sp.x,
    y: sp.y,
    z: sp.z,
    yaw: sp.yaw,
    speed: 0,
    steer: 0,
    vy: 0,
    pitch: 0,
    roll: 0,
    lean: 0,
    spin: 0,
    hp: sp.model === "suv" || sp.model === "police" ? 520 : 420,
    maxHp: sp.model === "suv" || sp.model === "police" ? 520 : 420,
    alive: true,
    driver: -1,
    hw: size.x / 2,
    hl: size.z / 2,
    h: size.y,
    wheelR,
    grounded: true,
    hurtT: 0,
    settled: false,
  };
  syncVehicle(v);
  return v;
}

const TOP: Record<string, number> = { sports: 31, coupe: 30, sedan: 27, hatch: 26, taxi: 27, police: 30, suv: 25 };

/**
 * Advance one car. `throttle` -1..1 (W/S), `steer` -1..1 (+1 = left), `brake` = handbrake.
 * Returns the speed lost in a collision this step (0 if none), so the caller can apply damage.
 */
export function driveVehicle(v: Vehicle, dt: number, throttle: number, steer: number, brake: boolean, env: VehicleEnv): number {
  const top = TOP[v.model] ?? 27;
  const fx = Math.sin(v.yaw);
  const fz = Math.cos(v.yaw);
  // engine and brakes
  if (throttle > 0.05) {
    if (v.speed < -0.5) v.speed = Math.min(0, v.speed + 30 * dt);
    else v.speed += (14 - v.speed * 0.32) * throttle * dt * (v.grounded ? 1 : 0.15);
  } else if (throttle < -0.05) {
    if (v.speed > 0.5) v.speed = Math.max(0, v.speed - 30 * dt);
    else v.speed -= 9 * -throttle * dt * (v.grounded ? 1 : 0.15);
  } else if (v.grounded) {
    v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), 3.2 * dt);
  }
  if (brake && v.grounded) v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), 22 * dt);
  v.speed = Math.max(-9, Math.min(top, v.speed));
  // only water the car is actually in slows it (not the river under a bridge)
  if (v.y < 0.6 && env.wet(v.x, v.z)) v.speed *= Math.exp(-1.8 * dt);
  // steering: tighter at low speed, calmer at high speed, sharper with the handbrake
  v.steer += (steer - v.steer) * Math.min(1, dt * 7);
  const sp = Math.abs(v.speed);
  const grip = Math.min(1, sp / 6) * (1.15 - Math.min(0.5, sp / 60)) * (brake ? 1.45 : 1);
  if (v.grounded) v.yaw += v.steer * 1.85 * grip * Math.sign(v.speed || 1) * dt;
  v.lean += (-v.steer * Math.min(1, sp / 25) * 0.07 - v.lean) * Math.min(1, dt * 5);

  // move with collision probes around the bumper
  let impact = 0;
  const nx = v.x + fx * v.speed * dt;
  const nz = v.z + fz * v.speed * dt;
  const dir = v.speed >= 0 ? 1 : -1;
  const probes: [number, number][] = [
    [0, dir * (v.hl - 0.25)],
    [v.hw - 0.3, dir * (v.hl - 0.3)],
    [-(v.hw - 0.3), dir * (v.hl - 0.3)],
    [v.hw - 0.25, 0],
    [-(v.hw - 0.25), 0],
  ];
  const rx = Math.cos(v.yaw);
  const rz = -Math.sin(v.yaw);
  let hit = false;
  for (const [u, w] of probes) {
    const px = nx + rx * u + fx * w;
    const pz = nz + rz * u + fz * w;
    if (env.blocked(px, pz, v.y + 0.45, v.y + v.h * 0.85, 0.32, v)) {
      hit = true;
      break;
    }
  }
  if (hit && Math.abs(v.speed) > 0.2) {
    impact = Math.abs(v.speed);
    v.speed = -v.speed * 0.28;
  } else {
    v.x = nx;
    v.z = nz;
  }

  // follow the ground: tyres rest on the terrain, the body tilts to match, and nothing dips below it
  const feet = v.y + 1.1;
  const pose = groundPose(v, env, feet, dt);
  const target = pose.y;
  if (v.y > target + 0.12 || v.vy > 0) {
    v.grounded = false;
    v.vy -= 26 * dt;
    v.y += v.vy * dt;
    if (v.y <= target) {
      v.y = target;
      v.vy = 0;
      v.grounded = true;
    }
  } else {
    // keep a little launch speed when cresting a hill or ramp
    const rise = (target - v.y) / Math.max(dt, 1e-3);
    v.y = target;
    v.grounded = true;
    v.vy = rise > 0 ? Math.min(rise * 0.35, 9) : 0;
    if (v.vy < 2.5) v.vy = 0;
  }
  if (!v.grounded) v.pitch += (Math.max(-0.4, Math.min(0.3, v.vy * -0.02)) - v.pitch) * Math.min(1, dt * 2);
  v.spin += (v.speed * dt) / v.wheelR;
  v.hurtT = Math.max(0, v.hurtT - dt);
  syncVehicle(v);
  return impact;
}

/**
 * Fit the car to the ground under it. Samples the four tyre contact points, the bumpers and the
 * middle of the floor pan, tilts the body (pitch/roll) toward the slope, then lifts the car until
 * every tyre is on or above the ground and the body keeps its clearance, so no part sinks into
 * hills, kerbs or road edges. dt = 0 snaps the tilt instantly (used when a parked car settles).
 */
function groundPose(v: Vehicle, env: VehicleEnv, feet: number, dt: number) {
  const fx = Math.sin(v.yaw);
  const fz = Math.cos(v.yaw);
  const rx = Math.cos(v.yaw);
  const rz = -Math.sin(v.yaw);
  const g = (u: number, w: number) => env.ground(v.x + rx * u + fx * w, v.z + rz * u + fz * w, feet);
  const U = v.hw * 0.78;
  const W = v.hl * 0.64;
  const fl = g(U, W);
  const fr = g(-U, W);
  const bl = g(U, -W);
  const br = g(-U, -W);
  const front = Math.max(fl, fr);
  const back = Math.max(bl, br);
  const left = Math.max(fl, bl);
  const right = Math.max(fr, br);
  const wantPitch = Math.atan(Math.max(-0.65, Math.min(0.65, (front - back) / (2 * W))));
  const wantRoll = Math.atan(Math.max(-0.5, Math.min(0.5, (left - right) / (2 * U))));
  if (dt <= 0) {
    v.pitch = wantPitch;
    v.roll = wantRoll;
  } else if (v.grounded || v.y <= Math.max(fl, fr, bl, br) + 0.2) {
    v.pitch += (wantPitch - v.pitch) * Math.min(1, dt * 12);
    v.roll += (wantRoll - v.roll) * Math.min(1, dt * 12);
  }
  const tp = Math.tan(v.pitch);
  const tr = Math.tan(v.roll);
  // tyres sit on the ground; the floor pan and bumpers keep some clearance
  let y = -Infinity;
  for (const [u, w, h] of [
    [U, W, fl],
    [-U, W, fr],
    [U, -W, bl],
    [-U, -W, br],
  ] as const)
    y = Math.max(y, h - w * tp - u * tr);
  // the rest of the underside: a 5 x 7 grid, each point keeping the body's clearance above the ground
  const CLEAR = Math.max(0.16, v.wheelR * 0.7);
  for (let i = -2; i <= 2; i++)
    for (let k = -3; k <= 3; k++) {
      const u = (i / 2) * v.hw * 0.9;
      const w = (k / 3) * v.hl * 0.96;
      const c = Math.abs(k) === 3 ? CLEAR + 0.06 : CLEAR;
      y = Math.max(y, g(u, w) - w * tp - u * tr - c);
    }
  return { y };
}

/** Let an empty car settle (gravity, ground) without input. */
export function idleVehicle(v: Vehicle, dt: number, env: VehicleEnv) {
  if (!v.settled) {
    v.settled = true;
    const pose = groundPose(v, env, v.y + 1.1, 0);
    v.y = pose.y;
    v.vy = 0;
    v.grounded = true;
    syncVehicle(v);
    return 0;
  }
  if (Math.abs(v.speed) < 0.05 && v.grounded && v.vy === 0) {
    v.steer *= 0.9;
    syncVehicle(v);
    return 0;
  }
  return driveVehicle(v, dt, 0, 0, true, env);
}

export function syncVehicle(v: Vehicle) {
  v.group.position.set(v.x, v.y, v.z);
  v.group.rotation.set(0, v.yaw, 0);
  v.visual.rotation.order = "YXZ";
  v.visual.rotation.set(-v.pitch, 0, v.roll + v.lean);
  const s = v.steer * 0.5;
  if (v.wheels.fl) v.wheels.fl.rotation.set(v.spin, s, 0);
  if (v.wheels.fr) v.wheels.fr.rotation.set(v.spin, s, 0);
  if (v.wheels.back) v.wheels.back.rotation.x = v.spin;
  if (v.hurtT > 0) v.visual.position.set((Math.random() - 0.5) * 0.06, 0, (Math.random() - 0.5) * 0.06);
  else v.visual.position.set(0, 0, 0);
}

/** World point -> car local (u across, w along, y up from the car's base). */
function toLocal(v: Vehicle, x: number, z: number): [number, number] {
  const dx = x - v.x;
  const dz = z - v.z;
  const c = Math.cos(v.yaw);
  const s = Math.sin(v.yaw);
  return [dx * c - dz * s, dx * s + dz * c];
}

/** Is a vertical capsule at (x, z) with radius r, spanning y0..y1, touching the car body? */
export function vehicleTouches(v: Vehicle, x: number, z: number, y0: number, y1: number, r: number) {
  if (!v.alive) return false;
  if (y1 < v.y + 0.15 || y0 > v.y + v.h * 0.92) return false;
  const [u, w] = toLocal(v, x, z);
  return Math.abs(u) < v.hw * 0.92 + r && Math.abs(w) < v.hl * 0.95 + r;
}

/** Roof height if (x, z) is over the car, else -Infinity (players can stand on cars). */
export function vehicleRoof(v: Vehicle, x: number, z: number) {
  if (!v.alive) return -Infinity;
  const [u, w] = toLocal(v, x, z);
  if (Math.abs(u) > v.hw * 0.85 || Math.abs(w) > v.hl * 0.9) return -Infinity;
  // the cabin is the top in the middle; bonnet and boot are lower
  const mid = Math.abs(w) < v.hl * 0.42;
  return v.y + v.h * (mid ? 0.98 : 0.62);
}

/** Ray vs the car's box (slab test in car space). Returns the hit distance or null. */
export function rayVehicle(v: Vehicle, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): number | null {
  if (!v.alive) return null;
  const c = Math.cos(v.yaw);
  const s = Math.sin(v.yaw);
  const lox = (ox - v.x) * c - (oz - v.z) * s;
  const loz = (ox - v.x) * s + (oz - v.z) * c;
  const loy = oy - v.y;
  const ldx = dx * c - dz * s;
  const ldz = dx * s + dz * c;
  let t0 = 0;
  let t1 = max;
  const slab = (o: number, d: number, lo: number, hi: number) => {
    if (Math.abs(d) < 1e-6) return o >= lo && o <= hi;
    let a = (lo - o) / d;
    let b = (hi - o) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    return t0 <= t1;
  };
  if (!slab(lox, ldx, -v.hw * 0.92, v.hw * 0.92)) return null;
  if (!slab(loz, ldz, -v.hl * 0.95, v.hl * 0.95)) return null;
  if (!slab(loy, dy, 0.15, v.h * 0.92)) return null;
  return t0;
}

/** Where the driver sits (world). */
export function seatPos(v: Vehicle): [number, number, number] {
  const rx = Math.cos(v.yaw);
  const rz = -Math.sin(v.yaw);
  const fx = Math.sin(v.yaw);
  const fz = Math.cos(v.yaw);
  // left-hand drive: driver on the car's left (+u), slightly behind centre
  const u = v.hw * 0.32;
  const w = -v.hl * 0.08;
  return [v.x + rx * u + fx * w, v.y + 0.18, v.z + rz * u + fz * w];
}

/** A spot beside the driver door (side = 1 left, -1 right). */
export function doorPos(v: Vehicle, side: 1 | -1): [number, number] {
  const rx = Math.cos(v.yaw);
  const rz = -Math.sin(v.yaw);
  const d = v.hw + 0.75;
  return [v.x + rx * d * side, v.z + rz * d * side];
}
