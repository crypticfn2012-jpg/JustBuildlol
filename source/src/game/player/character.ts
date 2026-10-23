import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { gearById, type Gear, type Skin } from "@/game/core/content";
import workerUrl from "../models/worker.glb?url";
import gunsUrl from "../models/guns.glb?url";
import { whenAssetsReady } from "@/game/world/assets";

export type Rig = {
  group: THREE.Group;
  lLeg: THREE.Object3D;
  rLeg: THREE.Object3D;
  lArm: THREE.Object3D;
  rArm: THREE.Object3D;
  weapon: THREE.Group;
  backPick: THREE.Group;
  armed: boolean;
  /** Held-weapon animation state (recoil kick, equip raise, muzzle flash). */
  fx: { kick: number; equip: number; flash: number; swing: number; combo: number };
  mixer: THREE.AnimationMixer;
  actions: Record<string, THREE.AnimationAction>;
  current: string;
  last: number;
  bones: {
    legL: THREE.Object3D | null;
    legR: THREE.Object3D | null;
    kneeL: THREE.Object3D | null;
    kneeR: THREE.Object3D | null;
    body: THREE.Object3D | null;
    armL: THREE.Object3D | null;
    armR: THREE.Object3D | null;
    foreL: THREE.Object3D | null;
    foreR: THREE.Object3D | null;
    handL: THREE.Object3D | null;
    handR: THREE.Object3D | null;
    chest: THREE.Object3D | null;
    /** The feet are separate bones (not children of the shins) and the shin tips they belong at. */
    footL: THREE.Object3D | null;
    footR: THREE.Object3D | null;
    shinEndL: THREE.Object3D | null;
    shinEndR: THREE.Object3D | null;
  };
};

export type AnimOpts = {
  speed: number;
  swing?: boolean;
  shoot?: boolean;
  air?: boolean;
  crouch?: boolean;
  hit?: boolean;
  slide?: boolean;
  /** Sprinting (Shift): a faster run cycle. */
  sprint?: boolean;
  /** Hanging under a glider: arms up on the bar, legs trailing. */
  glide?: boolean;
  /** Skydiving out of the drop ship (Fortnite style): arms spread, knees bent. 0 = level, 1 = full dive. */
  sky?: number;
  /** Playing an emote: its id and how long it has been playing. */
  emote?: { id: string; t: number };
  yaw?: number;
  vx?: number;
  vz?: number;
};

const matCache = new Map<string, THREE.MeshLambertMaterial>();

function mat(color: string) {
  let m = matCache.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    matCache.set(color, m);
  }
  return m;
}

let gltfPromise: Promise<GLTF> | null = null;

export function preloadWorker() {
  if (!gltfPromise) {
    gltfPromise = new Promise((resolve, reject) => {
      new GLTFLoader().load(workerUrl, resolve, undefined, reject);
    });
  }
  return gltfPromise;
}

function tintMaterial(meshName: string, source: THREE.Material, skin: Skin) {
  const next = source.clone() as THREE.MeshStandardMaterial;
  if (!next.color) return next;
  if (next.name === "Worker_Yellow") next.color.set(meshName.includes("Head") ? skin.cap : skin.shirt);
  else if (next.name === "Worker_Vest") next.color.set(skin.stripe);
  else if (next.name === "Brown") next.color.set(skin.pants);
  else if (next.name === "Brown2") next.color.set(skin.pants).multiplyScalar(0.72);
  else if (next.name === "Skin") next.color.set(skin.skinTone);
  else if (next.name === "Moustache" || next.name === "Eyebrows") next.color.set(skin.hair);
  next.roughness = 0.78;
  next.metalness = 0.02;
  return next;
}

const CLIP_NAMES = [
  "Idle",
  "Idle_Gun",
  "Idle_Gun_Pointing",
  "Idle_Gun_Shoot",
  "Walk",
  "Run",
  "Run_Shoot",
  "Run_Left",
  "Run_Right",
  "Run_Back",
  "Punch_Right",
  "HitRecieve",
  "Roll",
  "Wave",
];

function actionFor(gltf: GLTF, mixer: THREE.AnimationMixer, suffix: string) {
  const clip = gltf.animations.find((a) => a.name.endsWith(`|${suffix}`));
  if (!clip) return null;
  const action = mixer.clipAction(clip);
  action.enabled = suffix === "Idle";
  action.setEffectiveWeight(1);
  action.weight = 1;
  if (suffix === "Idle") action.play();
  return action;
}

export function createCharacter(skin: Skin, pack: Gear | null, _pick: Gear | null): Rig {
  const gltf = readyGltf;
  if (!gltf) throw new Error("Character model is still loading");

  const model = cloneSkeleton(gltf.scene);
  model.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    const src = mesh.material;
    const list = Array.isArray(src) ? src : [src];
    const tinted = list.map((m) => tintMaterial(mesh.name, m, skin));
    mesh.material = Array.isArray(src) ? tinted : tinted[0]!;
  });

  const group = new THREE.Group();
  group.add(model);

  const wrist = model.getObjectByName("WristR") ?? group;
  const chest = model.getObjectByName("Chest") ?? group;
  const weapon = new THREE.Group();
  weapon.position.set(0.00012, 0.00085, 0.00006);
  weapon.scale.setScalar(0.01);
  wrist.add(weapon);

  // nothing is worn on the back any more (back blings were removed); the group stays as an anchor
  const backPick = new THREE.Group();
  void pack;
  backPick.position.set(0, -0.0006, -0.0022);
  backPick.scale.setScalar(0.01);
  chest.add(backPick);

  const mixer = new THREE.AnimationMixer(model);
  const actions: Record<string, THREE.AnimationAction> = {};
  for (const name of CLIP_NAMES) {
    const action = actionFor(gltf, mixer, name);
    if (action) actions[name] = action;
  }

  const dummy = () => new THREE.Object3D();
  return {
    group,
    lLeg: dummy(),
    rLeg: dummy(),
    lArm: dummy(),
    rArm: dummy(),
    weapon,
    backPick,
    armed: false,
    fx: { kick: 0, equip: 0, flash: 0, swing: -1, combo: 0 },
    mixer,
    actions,
    current: "Idle",
    last: -1,
    bones: {
      legL: model.getObjectByName("UpperLegL") ?? null,
      legR: model.getObjectByName("UpperLegR") ?? null,
      kneeL: model.getObjectByName("LowerLegL") ?? null,
      kneeR: model.getObjectByName("LowerLegR") ?? null,
      body: model.getObjectByName("Body") ?? null,
      armL: model.getObjectByName("UpperArmL") ?? null,
      armR: model.getObjectByName("UpperArmR") ?? null,
      foreL: model.getObjectByName("LowerArmL") ?? null,
      foreR: model.getObjectByName("LowerArmR") ?? null,
      handL: model.getObjectByName("WristL") ?? null,
      handR: model.getObjectByName("WristR") ?? null,
      chest: model.getObjectByName("Chest") ?? null,
      footL: model.getObjectByName("FootL") ?? null,
      footR: model.getObjectByName("FootR") ?? null,
      shinEndL: model.getObjectByName("LowerLegL_end") ?? null,
      shinEndR: model.getObjectByName("LowerLegR_end") ?? null,
    },
  };
}

let readyGltf: GLTF | null = null;
const pending = preloadWorker().then((gltf) => {
  readyGltf = gltf;
  return gltf;
});

/* ---------- gun models ----------
 * guns.glb holds the Quaternius "Toon Shooter Game Kit" guns (CC0), normalised offline:
 * barrel along +Z, up +Y, grip at the origin, real-world length. Each node's userData.muzzle
 * is the barrel tip. The "Grey" body material takes the rarity colour, like Fortnite.
 */
export type GunKind = "ar" | "shotgun" | "smg" | "sniper";
const GUN_KINDS: GunKind[] = ["ar", "shotgun", "smg", "sniper"];
/** Body colour per rarity: common, uncommon, rare, epic, legendary. */
export const GUN_RARITY_BODY = ["#9ba2ad", "#58b84f", "#3f8ee0", "#9a57d8", "#eaa53a"];
let gunsGltf: GLTF | null = null;
const gunsPending = new Promise<GLTF>((resolve, reject) => {
  new GLTFLoader().load(gunsUrl, resolve, undefined, reject);
})
  .then((g) => {
    gunsGltf = g;
    return g;
  })
  .catch(() => null);

export function whenWorkerReady() {
  return Promise.all([pending, gunsPending, whenAssetsReady()]).then(() => undefined);
}

function gunNode(kind: GunKind) {
  return (gunsGltf?.scene.getObjectByName(kind) as THREE.Object3D | undefined) ?? null;
}

const gunMatCache = new Map<string, THREE.MeshLambertMaterial>();
function gunMaterial(src: THREE.Material, body: boolean, rarity: number) {
  const base = (src as THREE.MeshStandardMaterial).color ?? new THREE.Color("#888888");
  const key = `${src.name}:${base.getHexString()}:${body ? rarity : -1}`;
  let m = gunMatCache.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: body ? new THREE.Color(GUN_RARITY_BODY[rarity] ?? GUN_RARITY_BODY[0]) : base.clone() });
    if (body && rarity >= 3) {
      m.emissive = new THREE.Color(GUN_RARITY_BODY[rarity]!);
      m.emissiveIntensity = rarity === 4 ? 0.28 : 0.16;
    }
    gunMatCache.set(key, m);
  }
  return m;
}

/** A ready-to-add clone of a gun model with rarity-tinted body, or null while models are missing. */
export function gunModel(kind: GunKind, rarity = 0) {
  const node = gunNode(kind);
  if (!node) return null;
  const g = node.clone(true);
  const bodyName = (node.userData.body as string) ?? "Grey";
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const src = m.material as THREE.Material;
    m.material = gunMaterial(src, src.name === bodyName, rarity);
    m.castShadow = true;
  });
  // epic and legendary assault rifles are Fortnite's Scoped AR: a scope sits on the receiver
  if (kind === "ar" && rarity >= 3) {
    g.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g);
    const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
    box.applyMatrix4(inv);
    const top = box.max.y;
    const cz = box.min.z + (box.max.z - box.min.z) * 0.42;
    const dark = new THREE.MeshStandardMaterial({ color: "#1d2127", roughness: 0.45, metalness: 0.5 });
    const glass = new THREE.MeshStandardMaterial({ color: "#5fb6ff", roughness: 0.1, metalness: 0.2, emissive: new THREE.Color("#0b3a66"), emissiveIntensity: 0.5 });
    const scope = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.2, 12).rotateX(Math.PI / 2), dark);
    const bellF = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.028, 0.06, 12).rotateX(Math.PI / 2).translate(0, 0, 0.12), dark);
    const bellB = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.026, 0.05, 12).rotateX(Math.PI / 2).translate(0, 0, -0.115), dark);
    const lensF = new THREE.Mesh(new THREE.CircleGeometry(0.031, 14).translate(0, 0, 0.151), glass);
    const lensB = new THREE.Mesh(new THREE.CircleGeometry(0.025, 14).rotateY(Math.PI).translate(0, 0, -0.141), glass);
    const mount1 = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.045, 0.03).translate(0, -0.035, 0.05), dark);
    const mount2 = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.045, 0.03).translate(0, -0.035, -0.05), dark);
    scope.add(tube, bellF, bellB, lensF, lensB, mount1, mount2);
    scope.position.set((box.min.x + box.max.x) / 2, top + 0.05, cz);
    scope.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    g.add(scope);
  }
  return g;
}

/** Muzzle position (gun space) for a kind. */
export function gunMuzzle(kind: GunKind) {
  const mz = gunNode(kind)?.userData.muzzle as number[] | undefined;
  return new THREE.Vector3(mz?.[0] ?? 0, mz?.[1] ?? 0.05, mz?.[2] ?? 0.6);
}

/**
 * One merged, vertex-coloured geometry per gun for instanced floor loot. The body is baked
 * white so the instance colour tints it to the rarity; other parts keep their own colours.
 */
export function gunLootGeometry(kind: GunKind) {
  const node = gunNode(kind);
  if (!node) return null;
  node.updateMatrixWorld(true);
  const bodyName = (node.userData.body as string) ?? "Grey";
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  const inv = new THREE.Matrix4().copy(node.matrixWorld).invert();
  node.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    const src = m.material as THREE.MeshStandardMaterial;
    if (src.name === bodyName) c.setRGB(1, 1, 1);
    else c.copy(src.color).multiplyScalar(1.15);
    const p = g.attributes.position!;
    const n = g.attributes.normal!;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      col.push(c.r, c.g, c.b);
    }
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return out;
}
export const GUN_KIND_LIST = GUN_KINDS;

let flashTex: THREE.CanvasTexture | null = null;
function muzzleFlash() {
  if (!flashTex && typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grd.addColorStop(0, "rgba(255,255,230,1)");
    grd.addColorStop(0.35, "rgba(255,210,90,0.9)");
    grd.addColorStop(1, "rgba(255,120,20,0)");
    g.fillStyle = grd;
    g.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r = i % 2 ? 13 : 31;
      g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
    }
    g.fill();
    flashTex = new THREE.CanvasTexture(c);
    flashTex.colorSpace = THREE.SRGBColorSpace;
  }
  const mat = new THREE.MeshBasicMaterial({ map: flashTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const f = new THREE.Group();
  const front = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), mat);
  const side1 = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.5).rotateX(-Math.PI / 2).translate(0, 0, 0.18), mat);
  const side2 = side1.clone();
  side2.rotation.z = Math.PI / 2;
  f.add(front, side1, side2);
  f.visible = false;
  f.name = "flash";
  return f;
}

/** Fire a shot: recoil kick and a muzzle flash on the held gun. */
export function kickWeapon(rig: Rig, power = 1) {
  rig.fx.kick = Math.min(1.6, rig.fx.kick + power);
  rig.fx.flash = 0.055;
}

/**
 * Procedural held-weapon animation: equip raise, recoil, reload (tilt, mag slap, shotgun pump,
 * sniper bolt) and the muzzle flash. `reload` is progress 0..1, or -1 when not reloading.
 */
export function animateWeapon(rig: Rig, dt: number, reload = -1) {
  const pivot = rig.weapon.userData.pivot as THREE.Object3D | undefined;
  if (!pivot) return;
  const fx = rig.fx;
  fx.kick = Math.max(0, fx.kick - dt * (5 + fx.kick * 8));
  fx.equip = Math.max(0, fx.equip - dt * 4);
  fx.flash = Math.max(0, fx.flash - dt);
  const kind = rig.weapon.userData.kind as string;
  const e = fx.equip * fx.equip * (3 - 2 * fx.equip);
  let py = -e * 0.14;
  let pz = 0;
  let rx = e * 1.15;
  let ry = 0;
  let rz = e * 0.3;
  const k = Math.min(1.2, fx.kick);
  pz -= k * 0.1;
  rx -= k * 0.26;
  if (reload >= 0) {
    const u = Math.min(1, reload);
    const env = Math.sin(u * Math.PI);
    if (kind === "shotgun") {
      // tilt and feed shells: little pushes along the barrel
      rz += env * 0.4;
      rx += env * 0.18;
      pz -= Math.abs(Math.sin(u * Math.PI * 5)) * 0.05 * env;
    } else if (kind === "sniper") {
      rz += env * 0.55;
      ry += env * 0.22;
      py -= env * 0.05;
      const bolt = Math.max(0, 1 - Math.abs(u - 0.75) * 9);
      pz -= bolt * 0.06;
    } else {
      // tilt the gun, drop the old mag, slap in a new one
      rz += env * 0.8;
      rx += env * 0.38;
      py -= env * 0.08;
      const slap = Math.max(0, 1 - Math.abs(u - 0.64) * 11);
      py += slap * 0.06;
      rx -= slap * 0.2;
    }
  }
  if (kind === "pick" && fx.swing >= 0) {
    // harvesting chop: quick wind-up, fast strike through, short follow-through and recover
    const u = Math.min(1, fx.swing);
    let a: number;
    if (u < 0.28) a = -0.95 * Math.sin((u / 0.28) * Math.PI * 0.5);
    else if (u < 0.5) {
      const k = (u - 0.28) / 0.22;
      a = -0.95 + 2.25 * k * k * (3 - 2 * k);
    } else a = 1.3 * (1 - (u - 0.5) / 0.5) ** 2;
    // the arm IK does the whole swing; keep the grip steady
    void a;
    pz = 0;
    rx = 0;
    rz = 0;
    py = 0;
  } else if (kind === "pick" || kind === "heal" || kind === "build") {
    // pickaxe and props: just the equip swing
    pz = 0;
    rx = e * 1.15;
  }
  pivot.position.set(0, py, pz);
  pivot.rotation.set(rx, ry, rz);
  pivot.scale.setScalar(1 - e * 0.4);
  const flash = rig.weapon.userData.flash as THREE.Object3D | undefined;
  if (flash) {
    flash.visible = fx.flash > 0;
    if (flash.visible) {
      flash.rotation.z = Math.random() * Math.PI;
      flash.scale.setScalar(0.8 + Math.random() * 0.6);
    }
  }
}

/* ---------- harvesting tools ----------
 * Original pickaxe designs in the spirit of Fortnite's harvesting tools: a chunky handle with a
 * wrapped grip, and a bold, readable head. Local frame matches the held prop: grip at the origin,
 * handle running along -Z to the head, head blades spreading along +-Y.
 */
const _pm = new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1);
/** Extrude a 2D outline (x -> world Y, y -> world Z) with thickness along world X. */
function bladeGeo(pts: [number, number][], thick: number) {
  const sh = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1, curveSegments: 4 });
  g.translate(0, 0, -thick / 2);
  g.applyMatrix4(_pm);
  return g;
}
/** Crescent pick: two tapered prongs curving back toward the handle. */
function crescent(span: number, z: number, curl: number, thick: number) {
  // thick in the middle, tapering to sharp points that curve back toward the handle
  const pts: [number, number][] = [];
  const N = 14;
  const top = (t: number) => z - 0.08 + curl * t * t;
  const w = (t: number) => 0.1 * (1 - Math.pow(Math.abs(t), 1.8)) + 0.006;
  for (let i = 0; i <= N; i++) {
    const t = -1 + (2 * i) / N;
    pts.push([span * t, top(t)]);
  }
  for (let i = N - 1; i >= 1; i--) {
    const t = -1 + (2 * i) / N;
    pts.push([span * t * 0.97, top(t) + w(t)]);
  }
  return bladeGeo(pts, thick);
}
function handle(len: number, wood: string, grip: string, parent: THREE.Object3D) {
  const h = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.036, len, 8).rotateX(Math.PI / 2).translate(0, 0, -len / 2 + 0.16), mat(wood));
  const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.22, 8).rotateX(Math.PI / 2).translate(0, 0, 0.03), mat(grip));
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6).translate(0, 0, 0.17), mat(grip));
  for (const m of [h, wrap, pommel]) m.castShadow = true;
  parent.add(h, wrap, pommel);
}
export function pickaxeModel(style: string, primary: string, secondary: string) {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, m: THREE.Material) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };
  const glow = (c: string, k = 0.5) => new THREE.MeshLambertMaterial({ color: c, emissive: new THREE.Color(c), emissiveIntensity: k });
  if (style === "ember") {
    // Ember Bit: a broad single-bit axe with a glowing edge and a back spike
    handle(0.86, "#4a2a1c", "#1f1f24", g);
    add(bladeGeo([[0.02, -0.5], [0.3, -0.58], [0.4, -0.7], [0.36, -0.86], [0.24, -0.92], [0.02, -0.82]], 0.05), mat(primary));
    add(bladeGeo([[0.33, -0.56], [0.42, -0.68], [0.39, -0.88], [0.27, -0.95], [0.36, -0.86], [0.38, -0.7]], 0.056), glow("#ffd24a", 0.9));
    add(bladeGeo([[0, -0.6], [-0.26, -0.66], [0, -0.74]], 0.05), mat(secondary));
    add(new THREE.BoxGeometry(0.1, 0.16, 0.2).translate(0, 0.02, -0.68), mat("#2a2a30"));
    return g;
  }
  if (style === "bloom") {
    // Twin Bloom: a flower-headed mallet with petals on both faces
    handle(0.8, "#e9d6b5", "#5ec26a", g);
    // barrel-shaped mallet head across the handle, with a big flower on each striking face
    add(new THREE.CylinderGeometry(0.115, 0.13, 0.34, 16).translate(0, 0, -0.72), mat("#ffffff"));
    add(new THREE.CylinderGeometry(0.135, 0.135, 0.06, 16).translate(0, 0, -0.72), mat(primary));
    for (const side of [1, -1]) {
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const petal = add(new THREE.SphereGeometry(0.075, 10, 6).scale(1.5, 0.32, 0.8), mat(primary));
        petal.position.set(Math.cos(a) * 0.12, side * 0.185, -0.72 + Math.sin(a) * 0.12);
        petal.rotation.set(0, -a, side * 0.25);
      }
      const core = add(new THREE.SphereGeometry(0.075, 12, 8).scale(1, 0.55, 1), glow(secondary, 0.45));
      core.position.set(0, side * 0.2, -0.72);
    }
    const leaf = add(new THREE.SphereGeometry(0.07, 8, 6).scale(0.35, 0.18, 1.3), mat("#4cae4c"));
    leaf.position.set(0.04, 0, -0.5);
    leaf.rotation.y = 0.5;
    return g;
  }
  if (style === "icepick") {
    // Clearcut: an ice axe with a crystal pick, a steel adze and frosty shards
    handle(0.9, "#2d3b48", "#9ad7f5", g);
    // steel adze on one side
    add(bladeGeo([[-0.02, -0.67], [-0.22, -0.66], [-0.3, -0.6], [-0.3, -0.72], [-0.02, -0.77]], 0.045), mat("#c9d3dc"));
    // crystal pick on the other, curving down
    const crystal = bladeGeo([[0.02, -0.66], [0.25, -0.65], [0.44, -0.6], [0.52, -0.52], [0.4, -0.66], [0.22, -0.76], [0.02, -0.78]], 0.07);
    add(crystal, new THREE.MeshLambertMaterial({ color: primary, emissive: new THREE.Color("#4fc3ff"), emissiveIntensity: 0.45, transparent: true, opacity: 0.92 }));
    for (const [x, z, s] of [
      [0.04, -0.82, 0.07],
      [-0.06, -0.8, 0.05],
      [0.0, -0.86, 0.045],
    ] as const) {
      const shard = add(new THREE.OctahedronGeometry(s, 0).scale(0.7, 1, 1.6), glow("#bdeeff", 0.55));
      shard.position.set(x, 0, z);
    }
    add(new THREE.BoxGeometry(0.09, 0.14, 0.16).translate(0, 0, -0.72), mat(secondary));
    return g;
  }
  // Stock Pick: the classic double-ended pickaxe with a curved steel head and a collar
  handle(0.84, "#9a6232", "#2b2f36", g);
  add(crescent(0.38, -0.68, 0.3, 0.065), mat(primary));
  add(new THREE.BoxGeometry(0.1, 0.13, 0.18).translate(0, 0, -0.68), mat(secondary));
  add(new THREE.BoxGeometry(0.11, 0.05, 0.05).translate(0, 0, -0.58), mat("#d9a441"));
  return g;
}

export function fillWeapon(holder: THREE.Group, kind: "pick" | "ar" | "shotgun" | "smg" | "sniper" | "heal" | "build", color = "#3d4654", rarity = 0, style?: string) {
  while (holder.children.length) holder.remove(holder.children[0]!);
  const slot = new THREE.Group();
  slot.name = "pivot";
  holder.add(slot);
  holder.userData.pivot = slot;
  holder.userData.kind = kind;
  holder.userData.flash = undefined;
  if (kind === "ar" || kind === "shotgun" || kind === "smg" || kind === "sniper") {
    const model = gunModel(kind, rarity);
    if (model) {
      slot.add(model);
      const flash = muzzleFlash();
      flash.position.copy(gunMuzzle(kind)).add(new THREE.Vector3(0, 0, 0.12));
      slot.add(flash);
      holder.userData.flash = flash;
      return;
    }
  }
  const dark = mat("#24282f");
  const body = mat(color);
  const steel = mat("#5d6772");
  const wood = mat("#a56b3c");
  if (kind === "build") {
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 0.56), mat("#3ec6ff"));
    board.position.set(0, 0, 0.05);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.46, 0.6), mat("#dff4ff"));
    slot.add(board, edge);
    return;
  }
  if (kind === "heal") {
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.24, 8), mat("#f4f4f4"));
    roll.rotation.z = Math.PI / 2;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.16), mat("#e23b3b"));
    slot.add(roll, band);
    return;
  }
  if (kind === "pick") {
    const gear = gearById(style ?? "stock");
    const pm = pickaxeModel(gear.kind === "pickaxe" ? gear.style ?? gear.id : "stock", gear.kind === "pickaxe" ? gear.primary : color, gear.kind === "pickaxe" ? gear.secondary : "#5c6570");
    // held two-handed: the right (top) hand sits partway up the handle, the left hand near the end
    pm.position.z = PICK_SHIFT;
    slot.add(pm);
    return;
  }
  const len = kind === "sniper" ? 0.92 : kind === "shotgun" ? 0.74 : kind === "smg" ? 0.46 : 0.64;
  const gunColor = kind === "shotgun" ? "#6b4228" : kind === "sniper" ? "#3c4654" : kind === "smg" ? "#2e343c" : "#353b44";
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, len), mat(gunColor));
  barrel.position.z = len * 0.22;
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.22), dark);
  stock.position.z = -len * 0.28;
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.16, 0.07), dark);
  mag.position.set(0, -0.1, 0.02);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.06), dark);
  grip.position.set(0, -0.08, -0.02);
  grip.rotation.x = 0.35;
  slot.add(barrel, stock, mag, grip);
  if (kind === "sniper") {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 8), steel);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.08, len * 0.12);
    slot.add(scope);
  } else if (kind === "shotgun") {
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.18), wood);
    pump.position.set(0, -0.02, len * 0.05);
    slot.add(pump);
  } else {
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.02), mat("#e8c15a"));
    sight.position.set(0, 0.07, len * 0.28);
    const muzzleTip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.05), mat("#e6d59a"));
    muzzleTip.position.z = len * 0.22 + len * 0.5;
    slot.add(sight, muzzleTip);
  }
}

const CLIP_SPEED: Record<string, number> = {
  Idle: 1,
  Idle_Gun: 1,
  Idle_Gun_Pointing: 1,
  Idle_Gun_Shoot: 1.55,
  Walk: 1.15,
  Run: 1.28,
  Run_Shoot: 1.22,
  Run_Left: 1.25,
  Run_Right: 1.25,
  Run_Back: 1.2,
  Punch_Right: 2.15,
  HitRecieve: 1.45,
  Roll: 1.55,
};

function playClip(rig: Rig, name: string) {
  const next = rig.actions[name];
  if (!next || rig.current === name) return;
  const prev = rig.actions[rig.current];
  next.enabled = true;
  next.weight = 1;
  next.reset().fadeIn(0.08).play();
  if (prev && prev !== next) {
    prev.enabled = true;
    prev.weight = 1;
    prev.fadeOut(0.08);
  }
  rig.current = name;
}

function addEuler(bone: THREE.Object3D | null, dx: number, dy: number, dz: number) {
  if (!bone || (dx === 0 && dy === 0 && dz === 0)) return;
  _e.setFromQuaternion(bone.quaternion, bone.rotation.order);
  _e.x += dx;
  _e.y += dy;
  _e.z += dz;
  bone.quaternion.setFromEuler(_e);
}

const _e = new THREE.Euler();

export function animateRig(rig: Rig, time: number, speedOrOpts: number | AnimOpts, swinging = false) {
  const o: AnimOpts = typeof speedOrOpts === "number" ? { speed: speedOrOpts, swing: swinging } : speedOrOpts;
  const dt = rig.last < 0 ? 1 / 60 : Math.min(0.05, Math.max(0, time - rig.last));
  rig.last = time;
  const speed = o.speed;
  const yaw = o.yaw ?? 0;
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  const forward = (o.vx ?? 0) * fx + (o.vz ?? 0) * fz;
  const strafe = (o.vx ?? 0) * rx + (o.vz ?? 0) * rz;
  let name = "Idle";
  // in the air off the drop ship the legs hold a pose: no running cycle
  if (o.emote) name = o.emote.id === "wave" && rig.actions.Wave ? "Wave" : "Idle";
  else if (o.glide || o.sky !== undefined) name = "Idle";
  else if (o.swing && rig.actions.Punch_Right) name = "Punch_Right";
  else if (o.hit && speed < 4 && rig.actions.HitRecieve) name = "HitRecieve";
  else if (o.shoot && speed > 6.2 && rig.actions.Run_Shoot) name = "Run_Shoot";
  else if (o.shoot && rig.actions.Idle_Gun_Shoot) name = "Idle_Gun_Shoot";
  else if (speed > 6.1) {
    if (strafe > 2.2 && Math.abs(strafe) > Math.abs(forward) && rig.actions.Run_Right) name = "Run_Right";
    else if (strafe < -2.2 && Math.abs(strafe) > Math.abs(forward) && rig.actions.Run_Left) name = "Run_Left";
    else if (forward < -2.2 && rig.actions.Run_Back) name = "Run_Back";
    else name = "Run";
  } else if (speed > 0.35) name = "Walk";
  else if (o.air && rig.actions.Run) name = "Run";
  else name = rig.armed && rig.actions.Idle_Gun_Pointing ? "Idle_Gun_Pointing" : rig.armed && rig.actions.Idle_Gun ? "Idle_Gun" : "Idle";
  playClip(rig, name);
  const active = rig.actions[rig.current];
  // sprinting: the same run, quicker strides
  if (active) active.timeScale = (CLIP_SPEED[rig.current] ?? 1) * (o.sprint && rig.current.startsWith("Run") ? 1.3 : 1);
  rig.mixer.update(dt);

  const b = rig.bones;
  // posed legs carry the feet with them (the feet are free bones in this rig, so they get snapped on)
  const legsPosed = !!(o.glide || o.sky !== undefined || (o.air && speed < 3) || (o.crouch && !o.air) || !!o.emote);
  if (legsPosed) captureLegs(rig);
  if (o.emote) poseEmote(rig, o.emote.id, o.emote.t);
  else if (o.glide) {
    // hanging from the bar: legs together below, knees soft, feet trailing a little
    poseLeg(rig, b.legL, b.kneeL, b.shinEndL, [0.1, -1, -0.1], [0.07, -0.93, -0.36]);
    poseLeg(rig, b.legR, b.kneeR, b.shinEndR, [0.1, -1, -0.1], [0.07, -0.93, -0.36]);
    reachUp(rig, b.armL, b.foreL, b.handL, fx, fz);
    reachUp(rig, b.armR, b.foreR, b.handR, fx, fz);
  } else if (o.sky !== undefined) {
    const dv = Math.max(0, Math.min(1, o.sky));
    // belly-down: thighs a little apart, knees bent so the feet lift up behind; straighter in a dive
    const mix = (a: number, c: number) => a + (c - a) * dv;
    poseLeg(rig, b.legL, b.kneeL, b.shinEndL, [mix(0.24, 0.08), -0.96, mix(-0.1, -0.04)], [mix(0.2, 0.06), mix(-0.5, -0.9), mix(-0.86, -0.42)]);
    poseLeg(rig, b.legR, b.kneeR, b.shinEndR, [mix(0.24, 0.08), -0.96, mix(-0.1, -0.04)], [mix(0.2, 0.06), mix(-0.5, -0.9), mix(-0.86, -0.42)]);
    spreadArm(rig, b.armL, b.foreL, b.handL, dv);
    spreadArm(rig, b.armR, b.foreR, b.handR, dv);
  } else if (o.air && speed < 3) {
    addEuler(b.legL, 0.85, 0, 0);
    addEuler(b.legR, 0.85, 0, 0);
    addEuler(b.kneeL, 0, 0.7, 0);
    addEuler(b.kneeR, 0, 0.7, 0);
  } else if (o.crouch && !o.air) {
    if (b.body) b.body.position.y -= 0.0026;
    addEuler(b.legL, 0.45, 0, 0);
    addEuler(b.legR, 0.45, 0, 0);
    addEuler(b.kneeL, 0, 0.85, 0);
    addEuler(b.kneeR, 0, 0.85, 0);
  }
  if (legsPosed) snapFeet(rig);
}

const _k0L = new THREE.Quaternion();
const _k0R = new THREE.Quaternion();
const _f0L = new THREE.Quaternion();
const _f0R = new THREE.Quaternion();
const _kq = new THREE.Quaternion();
const _fp = new THREE.Vector3();
/** Remember the shins' and feet's world rotations from the animation clip, before the legs are posed. */
function captureLegs(rig: Rig) {
  const b = rig.bones;
  rig.group.updateWorldMatrix(true, true);
  b.kneeL?.getWorldQuaternion(_k0L);
  b.kneeR?.getWorldQuaternion(_k0R);
  b.footL?.getWorldQuaternion(_f0L);
  b.footR?.getWorldQuaternion(_f0R);
}
/** Put each foot back on the tip of its shin, turned with the shin, so posed legs stay in one piece. */
function snapFeet(rig: Rig) {
  const b = rig.bones;
  rig.group.updateWorldMatrix(true, true);
  for (const [knee, end, foot, k0, f0] of [
    [b.kneeL, b.shinEndL, b.footL, _k0L, _f0L],
    [b.kneeR, b.shinEndR, b.footR, _k0R, _f0R],
  ] as const) {
    if (!knee || !end || !foot || !foot.parent) continue;
    knee.getWorldQuaternion(_kq);
    // the shin's turn since the clip pose, applied to the clip's foot rotation
    _kq.multiply(_qA.copy(k0).invert()).multiply(f0);
    end.getWorldPosition(_fp);
    foot.parent.updateWorldMatrix(true, false);
    foot.parent.worldToLocal(_fp);
    foot.position.copy(_fp);
    foot.parent.getWorldQuaternion(_qB);
    foot.quaternion.copy(_qB.invert()).multiply(_kq);
  }
}

const _lgD = new THREE.Vector3();
const _lgQ = new THREE.Quaternion();
/** Point a thigh and shin along directions in the rig's own frame (+x out to that leg's side, +y up, +z out of the chest). */
function poseLeg(rig: Rig, upper: THREE.Object3D | null, lower: THREE.Object3D | null, end: THREE.Object3D | null, thigh: [number, number, number], shin: [number, number, number]) {
  if (!upper || !lower || !end) return;
  rig.group.updateWorldMatrix(true, true);
  upper.getWorldPosition(_fp);
  rig.group.worldToLocal(_fp);
  const side = Math.sign(_fp.x) || 1;
  rig.group.getWorldQuaternion(_lgQ);
  _lgD.set(thigh[0] * side, thigh[1], thigh[2]).normalize().applyQuaternion(_lgQ);
  jointDir(upper, lower, _have);
  _qR.setFromUnitVectors(_have, _lgD);
  rotateBoneWorld(upper, _qR);
  _lgD.set(shin[0] * side, shin[1], shin[2]).normalize().applyQuaternion(_lgQ);
  jointDir(lower, end, _have);
  _qR.setFromUnitVectors(_have, _lgD);
  rotateBoneWorld(lower, _qR);
}

const _aim = new THREE.Vector3();
const _sh = new THREE.Vector3();
const _hip = new THREE.Vector3();
const _want = new THREE.Vector3();
const _have = new THREE.Vector3();
const _qR = new THREE.Quaternion();
const _sd = new THREE.Vector3();
const _sq = new THREE.Quaternion();
/**
 * Skydiving arms: spread wide and bent toward the head (level), or swept back along the body (diving).
 * Directions are in the rig's own frame (+y toward the head, +z out of the chest), so they follow the
 * body as it tips forward into the dive.
 */
function spreadArm(rig: Rig, upper: THREE.Object3D | null, fore: THREE.Object3D | null, hand: THREE.Object3D | null, dive: number) {
  if (!upper || !fore || !hand) return;
  rig.group.updateWorldMatrix(true, true);
  upper.getWorldPosition(_sh);
  rig.group.worldToLocal(_sh);
  const side = Math.sign(_sh.x) || 1;
  rig.group.getWorldQuaternion(_sq);
  const lerp3 = (a: [number, number, number], b2: [number, number, number]) => _sd.set(a[0] + (b2[0] - a[0]) * dive, a[1] + (b2[1] - a[1]) * dive, a[2] + (b2[2] - a[2]) * dive).normalize().applyQuaternion(_sq);
  // classic free-fall arch: upper arms straight out to the sides, a touch toward the sky
  lerp3([side, 0.08, -0.2], [side * 0.32, -0.92, -0.3]);
  jointDir(upper, fore, _have);
  _qR.setFromUnitVectors(_have, _sd);
  rotateBoneWorld(upper, _qR);
  // forearms bent up toward the head, hands about level with the ears
  lerp3([side * 0.3, 0.9, -0.3], [side * 0.22, -0.95, -0.26]);
  jointDir(fore, hand, _have);
  _qR.setFromUnitVectors(_have, _sd);
  rotateBoneWorld(fore, _qR);
}

/** Swing one arm up overhead (holding a glider bar): upper arm up and out, forearm up and in. */
function reachUp(rig: Rig, upper: THREE.Object3D | null, fore: THREE.Object3D | null, hand: THREE.Object3D | null, fx: number, fz: number) {
  if (!upper || !fore || !hand) return;
  rig.group.updateWorldMatrix(true, true);
  upper.getWorldPosition(_sh);
  rig.group.getWorldPosition(_hip);
  const ox = _sh.x - _hip.x;
  const oz = _sh.z - _hip.z;
  const ol = Math.hypot(ox, oz) || 1;
  _want.set((ox / ol) * 0.42 + fx * 0.2, 1, (oz / ol) * 0.42 + fz * 0.2).normalize();
  jointDir(upper, fore, _have);
  _qR.setFromUnitVectors(_have, _want);
  rotateBoneWorld(upper, _qR);
  _want.set((-ox / ol) * 0.12 + fx * 0.22, 1, (-oz / ol) * 0.12 + fz * 0.22).normalize();
  jointDir(fore, hand, _have);
  _qR.setFromUnitVectors(_have, _want);
  rotateBoneWorld(fore, _qR);
}
const _fore = new THREE.Vector3();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _qA = new THREE.Quaternion();
const _qB = new THREE.Quaternion();
const _qC = new THREE.Quaternion();
const _qD = new THREE.Quaternion();
const _qHold = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _gunQ = new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)),
);
const _pickQ = new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0)),
);

function rotateBoneWorld(bone: THREE.Object3D, delta: THREE.Quaternion) {
  const parent = bone.parent;
  if (!parent) return;
  parent.updateWorldMatrix(true, false);
  bone.updateWorldMatrix(true, false);
  bone.getWorldQuaternion(_qA);
  _qB.multiplyQuaternions(delta, _qA);
  parent.getWorldQuaternion(_qC);
  bone.quaternion.copy(_qC.invert()).multiply(_qB);
  bone.updateWorldMatrix(true, true);
}

function jointDir(from: THREE.Object3D, to: THREE.Object3D, out: THREE.Vector3) {
  from.getWorldPosition(_from);
  to.getWorldPosition(_to);
  out.copy(_to).sub(_from);
  if (out.lengthSq() < 1e-8) out.set(0, 1, 0);
  else out.normalize();
  return out;
}

/** Point the held prop at `dir`. Guns use local +Z as the barrel; picks keep the spike on local -Z. */
export function aimWeapon(rig: Rig, dir: THREE.Vector3, flip = false, aimPoint?: THREE.Vector3) {
  const wrist = rig.weapon.parent;
  if (!wrist || wrist === rig.group) return;
  _aim.copy(dir);
  if (_aim.lengthSq() < 1e-8) return;
  _aim.normalize();
  rig.weapon.quaternion.copy(flip ? _pickQ : _gunQ);

  const lower = wrist.parent;
  const upper = lower?.parent ?? null;
  const solve = (bone: THREE.Object3D | null, amount: number) => {
    if (!bone) return;
    jointDir(bone, wrist, _fore);
    _qD.setFromUnitVectors(_fore, _aim);
    _qHold.identity().slerp(_qD, amount);
    rotateBoneWorld(bone, _qHold);
  };
  solve(upper, 0.62);
  solve(lower, 0.85);

  if (aimPoint) {
    wrist.getWorldPosition(_from);
    _aim.copy(aimPoint).sub(_from);
    if (_aim.lengthSq() < 1e-8) return;
    _aim.normalize();
  }
  const parent = wrist.parent;
  if (!parent) return;
  parent.updateWorldMatrix(true, false);
  parent.getWorldQuaternion(_qC);
  _y.copy(_aim);
  _z.copy(_up).addScaledVector(_y, -_up.dot(_y));
  if (_z.lengthSq() < 1e-6) _z.set(1, 0, 0);
  _z.normalize();
  _x.crossVectors(_y, _z).normalize();
  _z.crossVectors(_x, _y).normalize();
  _m.makeBasis(_x, _y, _z);
  _qB.setFromRotationMatrix(_m);
  wrist.quaternion.copy(_qC.invert()).multiply(_qB);
  wrist.updateWorldMatrix(true, true);
}

/* ---------- Fortnite-style holds (two-bone IK on the arms) ---------- */
const _A = new THREE.Vector3();
const _B = new THREE.Vector3();
const _C = new THREE.Vector3();
const _T = new THREE.Vector3();
const _D = new THREE.Vector3();
const _P = new THREE.Vector3();
const _E = new THREE.Vector3();
const _u1 = new THREE.Vector3();
const _u2 = new THREE.Vector3();
const _qIK = new THREE.Quaternion();

/** Bend an arm so its end bone reaches `target`, with the elbow pointing toward `pole`. */
function twoBoneIK(upper: THREE.Object3D, lower: THREE.Object3D, end: THREE.Object3D, target: THREE.Vector3, pole: THREE.Vector3) {
  upper.getWorldPosition(_A);
  lower.getWorldPosition(_B);
  end.getWorldPosition(_C);
  const l1 = _A.distanceTo(_B);
  const l2 = _B.distanceTo(_C);
  if (l1 < 1e-5 || l2 < 1e-5) return;
  _D.copy(target).sub(_A);
  let d = _D.length();
  if (d < 1e-5) return;
  _D.multiplyScalar(1 / d);
  d = Math.max(Math.abs(l1 - l2) + 1e-3, Math.min(l1 + l2 - 1e-3, d));
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  _P.copy(pole).addScaledVector(_D, -pole.dot(_D));
  if (_P.lengthSq() < 1e-8) _P.set(0, -1, 0);
  _P.normalize();
  _E.copy(_A).addScaledVector(_D, a).addScaledVector(_P, h);
  _u1.copy(_B).sub(_A).normalize();
  _u2.copy(_E).sub(_A).normalize();
  _qIK.setFromUnitVectors(_u1, _u2);
  rotateBoneWorld(upper, _qIK);
  lower.getWorldPosition(_B);
  end.getWorldPosition(_C);
  _T.copy(_A).addScaledVector(_D, d);
  _u1.copy(_C).sub(_B).normalize();
  _u2.copy(_T).sub(_B).normalize();
  _qIK.setFromUnitVectors(_u1, _u2);
  rotateBoneWorld(lower, _qIK);
}

const _gsL = new THREE.Vector3();
const _gsR = new THREE.Vector3();
const _gPole = new THREE.Vector3();
const _rA = new THREE.Vector3();
const _rB = new THREE.Vector3();
/**
 * How far (metres, + = up) the glider should move so its grips sit at the top of the rider's reach:
 * arms almost straight up overhead, hands on the bar, the bar clear above the head. Call after
 * animateRig() and before holdGlider(); feed the result into the glider's `hang`.
 */
export function gliderReachOffset(rig: Rig, gripA: THREE.Vector3, gripB: THREE.Vector3) {
  const b = rig.bones;
  if (!b.armL || !b.foreL || !b.handL || !b.armR || !b.foreR || !b.handR) return 0;
  rig.group.updateWorldMatrix(true, true);
  let sum = 0;
  let n = 0;
  for (const [up, lo, hand] of [
    [b.armL, b.foreL, b.handL],
    [b.armR, b.foreR, b.handR],
  ] as const) {
    up.getWorldPosition(_rA);
    lo.getWorldPosition(_rB);
    const l1 = _rA.distanceTo(_rB);
    hand.getWorldPosition(_fp);
    const len = l1 + _rB.distanceTo(_fp);
    const grip = _rA.distanceToSquared(gripA) < _rA.distanceToSquared(gripB) ? gripA : gripB;
    const dh = Math.hypot(grip.x - _rA.x, grip.z - _rA.z);
    const reach = len * 0.94;
    const want = _rA.y + Math.sqrt(Math.max(0.01, reach * reach - dh * dh));
    sum += want - grip.y;
    n++;
  }
  return n ? sum / n : 0;
}

/**
 * Hands on the glider, like Fortnite: both hands grip the control bar (or risers / shaft) overhead,
 * elbows bent out to the sides. Call after animateRig() with the glider's grip points in world space.
 */
export function holdGlider(rig: Rig, gripA: THREE.Vector3, gripB: THREE.Vector3) {
  const b = rig.bones;
  if (!b.armL || !b.foreL || !b.handL || !b.armR || !b.foreR || !b.handR) return;
  rig.group.updateWorldMatrix(true, true);
  b.armL.getWorldPosition(_gsL);
  b.armR.getWorldPosition(_gsR);
  // each hand takes the grip on its own side
  const swap = _gsL.distanceToSquared(gripA) + _gsR.distanceToSquared(gripB) > _gsL.distanceToSquared(gripB) + _gsR.distanceToSquared(gripA);
  const tL = swap ? gripB : gripA;
  const tR = swap ? gripA : gripB;
  _gPole.copy(_gsL).sub(_gsR).setY(0);
  if (_gPole.lengthSq() < 1e-6) _gPole.set(1, 0, 0);
  _gPole.normalize();
  rig.group.getWorldDirection(_gsR);
  _gPole.addScaledVector(_gsR.setY(0).normalize(), 0.35);
  _gPole.y = -0.15;
  twoBoneIK(b.armL, b.foreL, b.handL, tL, _gPole);
  // mirror the sideways part for the right arm, keep the forward part
  _gsL.copy(_gsR).multiplyScalar(0.35);
  _gPole.sub(_gsL);
  _gPole.x = -_gPole.x;
  _gPole.z = -_gPole.z;
  _gPole.add(_gsL);
  twoBoneIK(b.armR, b.foreR, b.handR, tR, _gPole);
}

/** Turn a wrist so its held prop's long axis lies along `dir` (the prop quaternion maps local axes). */
function orientWrist(wrist: THREE.Object3D, dir: THREE.Vector3) {
  const parent = wrist.parent;
  if (!parent) return;
  parent.updateWorldMatrix(true, false);
  parent.getWorldQuaternion(_qC);
  _y.copy(dir).normalize();
  _z.copy(_up).addScaledVector(_y, -_up.dot(_y));
  if (_z.lengthSq() < 1e-6) _z.set(1, 0, 0);
  _z.normalize();
  _x.crossVectors(_y, _z).normalize();
  _z.crossVectors(_x, _y).normalize();
  _m.makeBasis(_x, _y, _z);
  _qB.setFromRotationMatrix(_m);
  wrist.quaternion.copy(_qC.invert()).multiply(_qB);
  wrist.updateWorldMatrix(true, true);
}

/** Pickaxe is held two-handed: the model slides so the right hand is partway up, the left hand this far below. */
const PICK_SHIFT = 0.2;
const PICK_HANDS = 0.22;
const FOREGRIP: Record<string, number> = { ar: 0.34, smg: 0.2, shotgun: 0.36, sniper: 0.42 };
/** How far in front of the shoulder the trigger hand sits (longer stocks sit further back). */
const GRIP_FWD: Record<string, number> = { ar: 0.3, smg: 0.32, shotgun: 0.17, sniper: 0.24 };
const _fw = new THREE.Vector3();
const _rt = new THREE.Vector3();
const _dn = new THREE.Vector3();
const _g = new THREE.Vector3();
const _g2 = new THREE.Vector3();
const _h = new THREE.Vector3();
const _h2 = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _sL = new THREE.Vector3();
const _gunAim = new THREE.Vector3();

export type HoldOpts = {
  /** 0 hip fire .. 1 fully aimed down sights. */
  ads?: number;
  /** Reload progress 0..1, or -1. */
  reload?: number;
  /** Where the crosshair points (the gun lines up on it). */
  aimPoint?: THREE.Vector3;
};

/**
 * Hold the current item like Fortnite: guns two-handed with the stock in the shoulder (raised to the
 * eye when aiming), the pickaxe carried low in the right hand and chopped overhead when swung.
 * Must run after animateRig (it overrides the arms of the animated pose).
 */
export function holdWeapon(rig: Rig, kind: string, aim: THREE.Vector3, o: HoldOpts = {}) {
  const b = rig.bones;
  const wristR = rig.weapon.parent;
  if (!b.armR || !b.foreR || !b.handR || !b.armL || !b.foreL || !b.handL || !wristR || wristR === rig.group) {
    aimWeapon(rig, aim, kind === "pick", o.aimPoint);
    return;
  }
  if (kind !== "pick" && kind !== "ar" && kind !== "smg" && kind !== "shotgun" && kind !== "sniper") {
    aimWeapon(rig, aim, false, o.aimPoint);
    return;
  }
  rig.group.updateWorldMatrix(true, true);
  _aim.copy(aim).normalize();
  _fw.set(_aim.x, 0, _aim.z);
  if (_fw.lengthSq() < 1e-6) {
    // looking straight up/down: use the body's facing
    rig.group.getWorldDirection(_fw);
    _fw.y = 0;
  }
  _fw.normalize();
  _rt.set(-_fw.z, 0, _fw.x);
  b.armR.getWorldPosition(_sh);
  b.armL.getWorldPosition(_sL);

  if (kind === "pick") {
    rig.weapon.quaternion.copy(_pickQ);
    // Fortnite-style two-handed pickaxe: a ready stance, then alternating forehand / backhand swings
    // (right shoulder down across to the left hip, then back from the left up across to the right),
    // with the torso twisting into each swing.
    const u = rig.fx.swing;
    const back = rig.fx.combo % 2 === 1;
    let twist = 0;
    const pose = (t: number, g: THREE.Vector3, h: THREE.Vector3) => {
      // key: [time, grip(fw, up, rt), head dir(fw, up, rt), torso twist (+ = left)]
      const KA: [number, number[], number[], number][] = [
        [0, [0.32, -0.38, 0.12], [0.25, 0.85, 0.35], 0],
        [0.3, [-0.02, 0.12, 0.32], [-0.82, 0.45, 0.35], -0.45],
        [0.5, [0.5, -0.22, 0.02], [0.85, -0.3, -0.25], 0.15],
        [0.68, [0.3, -0.45, -0.3], [0.25, -0.75, -0.6], 0.45],
        [1, [0.32, -0.38, 0.12], [0.25, 0.85, 0.35], 0],
      ];
      const KB: [number, number[], number[], number][] = [
        [0, [0.32, -0.38, 0.12], [0.25, 0.85, 0.35], 0],
        [0.3, [0.05, -0.2, -0.38], [-0.6, 0.25, -0.75], 0.5],
        [0.5, [0.52, -0.1, 0.05], [0.85, -0.1, 0.4], -0.1],
        [0.68, [0.32, 0.05, 0.35], [0.3, 0.4, 0.7], -0.4],
        [1, [0.32, -0.38, 0.12], [0.25, 0.85, 0.35], 0],
      ];
      const K = back ? KB : KA;
      let k = 0;
      while (k < K.length - 2 && t > K[k + 1]![0]) k++;
      const [t0, g0, h0, w0] = K[k]!;
      const [t1, g1, h1, w1] = K[k + 1]!;
      const f = Math.max(0, Math.min(1, (t - t0) / Math.max(1e-4, t1 - t0)));
      const e = f * f * (3 - 2 * f);
      const lerp = (a: number[], b: number[], i: number) => a[i]! + (b[i]! - a[i]!) * e;
      g.set(0, 0, 0).addScaledVector(_fw, lerp(g0, g1, 0)).addScaledVector(_up, lerp(g0, g1, 1)).addScaledVector(_rt, lerp(g0, g1, 2));
      h.set(0, 0, 0).addScaledVector(_fw, lerp(h0, h1, 0)).addScaledVector(_up, lerp(h0, h1, 1)).addScaledVector(_rt, lerp(h0, h1, 2)).normalize();
      twist = w0 + (w1 - w0) * e;
    };
    pose(u >= 0 ? Math.min(1, u) : 0, _g2, _h);
    if (b.chest && Math.abs(twist) > 1e-3) {
      _qIK.setFromAxisAngle(_up, twist);
      rotateBoneWorld(b.chest, _qIK);
      b.armR.getWorldPosition(_sh);
      b.armL.getWorldPosition(_sL);
    }
    // grips are relative to the middle of the chest
    _g.copy(_sh).add(_sL).multiplyScalar(0.5).add(_g2);
    _pole.copy(_up).multiplyScalar(-1).addScaledVector(_rt, 0.7).addScaledVector(_fw, -0.3);
    twoBoneIK(b.armR, b.foreR, b.handR, _g, _pole);
    orientWrist(wristR, _h);
    // left hand lower on the handle, toward the pommel
    _h2.copy(_g).addScaledVector(_h, -PICK_HANDS);
    _pole.copy(_up).multiplyScalar(-1).addScaledVector(_rt, -0.7).addScaledVector(_fw, -0.2);
    twoBoneIK(b.armL, b.foreL, b.handL, _h2, _pole);
    return;
  }

  // guns
  rig.weapon.quaternion.copy(_gunQ);
  const ads = Math.max(0, Math.min(1, o.ads ?? 0));
  _dn.copy(_up).addScaledVector(_aim, -_up.dot(_aim)).normalize().multiplyScalar(-1);
  const reach = GRIP_FWD[kind] ?? 0.3;
  _g.copy(_sh).addScaledVector(_aim, reach).addScaledVector(_dn, 0.2).addScaledVector(_rt, -0.05);
  _g2.copy(_sh).addScaledVector(_aim, reach - 0.02).addScaledVector(_dn, 0.02).addScaledVector(_rt, -0.13);
  _g.lerp(_g2, ads);
  // barrel on the crosshair target (converges at range), else straight along the aim
  _gunAim.copy(_aim);
  if (o.aimPoint) {
    _gunAim.copy(o.aimPoint).sub(_g);
    if (_gunAim.lengthSq() < 1) _gunAim.copy(_aim);
    _gunAim.normalize();
  }
  _pole.copy(_up).multiplyScalar(-1).addScaledVector(_rt, 0.65).addScaledVector(_fw, -0.35);
  twoBoneIK(b.armR, b.foreR, b.handR, _g, _pole);
  orientWrist(wristR, _gunAim);
  // support hand on the handguard (or down at the magazine while reloading)
  _h.copy(_g).addScaledVector(_gunAim, FOREGRIP[kind] ?? 0.32).addScaledVector(_dn, 0.06).addScaledVector(_rt, -0.03);
  const r = o.reload ?? -1;
  if (r >= 0 && r <= 1) {
    const env = Math.sin(Math.min(1, r) * Math.PI);
    _h2.copy(_g).addScaledVector(_gunAim, 0.1).addScaledVector(_dn, 0.2).addScaledVector(_rt, -0.06);
    _h.lerp(_h2, env);
  }
  _pole.copy(_up).multiplyScalar(-1).addScaledVector(_rt, -0.7).addScaledVector(_fw, -0.1);
  twoBoneIK(b.armL, b.foreL, b.handL, _h, _pole);
}

/* ---------- emotes ----------
 * Emotes are posed in code on the shared character rig, so every skin can do every one. Directions are in
 * the rig's own frame, mirrored per side: +x out to that limb's side, +y up, +z out of the chest.
 */
type V3 = [number, number, number];
const _ed = new THREE.Vector3();
const _eq = new THREE.Quaternion();
const _ep = new THREE.Vector3();
function sideOf(rig: Rig, bone: THREE.Object3D) {
  bone.getWorldPosition(_ep);
  rig.group.worldToLocal(_ep);
  return Math.sign(_ep.x) || 1;
}
/** Point a two-bone limb: `upperDir` for the upper part, `lowerDir` for the lower, x given for that side. */
function limb(rig: Rig, upper: THREE.Object3D | null, lower: THREE.Object3D | null, end: THREE.Object3D | null, upperDir: V3, lowerDir: V3, mirror = true) {
  if (!upper || !lower || !end) return;
  rig.group.updateWorldMatrix(true, true);
  const side = mirror ? sideOf(rig, upper) : 1;
  rig.group.getWorldQuaternion(_eq);
  _ed.set(upperDir[0] * side, upperDir[1], upperDir[2]).normalize().applyQuaternion(_eq);
  jointDir(upper, lower, _have);
  _qR.setFromUnitVectors(_have, _ed);
  rotateBoneWorld(upper, _qR);
  _ed.set(lowerDir[0] * side, lowerDir[1], lowerDir[2]).normalize().applyQuaternion(_eq);
  jointDir(lower, end, _have);
  _qR.setFromUnitVectors(_have, _ed);
  rotateBoneWorld(lower, _qR);
}
function hips(rig: Rig, x: number, y: number) {
  const body = rig.bones.body;
  if (!body) return;
  // offsets in centimetres (crouching drops the body 0.0026 for about 26 cm)
  body.position.x += x * 0.0001;
  body.position.y += y * 0.0001;
}

function poseEmote(rig: Rig, id: string, t: number) {
  const b = rig.bones;
  const TAU = Math.PI * 2;
  const armL = (u: V3, f: V3) => limb(rig, b.armL, b.foreL, b.handL, u, f);
  const armR = (u: V3, f: V3) => limb(rig, b.armR, b.foreR, b.handR, u, f);
  const legL = (u: V3, f: V3) => limb(rig, b.legL, b.kneeL, b.shinEndL, u, f);
  const legR = (u: V3, f: V3) => limb(rig, b.legR, b.kneeR, b.shinEndR, u, f);
  const stand = () => {
    legL([0.06, -1, 0.02], [0.04, -1, -0.02]);
    legR([0.06, -1, 0.02], [0.04, -1, -0.02]);
  };
  switch (id) {
    case "wave":
      // the character's own wave animation
      return;
    case "floss": {
      // straight arms swing side to side, one in front of the hips and one behind, swapping each beat
      const s = Math.sin(t * TAU * 1.6);
      const front = Math.cos(t * TAU * 1.6) > 0 ? 1 : -1;
      // world-side swing (not mirrored): both arms go the same way, the hips the other way
      const swing = s * 0.85;
      limb(rig, b.armL, b.foreL, b.handL, [swing, -1, 0.42 * front], [swing, -1, 0.42 * front], false);
      limb(rig, b.armR, b.foreR, b.handR, [swing, -1, -0.42 * front], [swing, -1, -0.42 * front], false);
      hips(rig, -s * 9, 0);
      legL([0.05, -1, 0], [0.02, -1, 0]);
      legR([0.05, -1, 0], [0.02, -1, 0]);
      return;
    }
    case "groove": {
      // a bouncy party dance: knees bob on the beat, bent arms pump in turn, shoulders twist
      const beat = t * TAU * 1.9;
      const bob = (1 - Math.cos(beat)) * 0.5;
      hips(rig, Math.sin(beat / 2) * 5, -bob * 9);
      addEuler(b.chest, 0, Math.sin(beat / 2) * 0.35, 0);
      const l = Math.sin(beat);
      armL([0.55, -0.55, 0.45], [0.05, 0.25 + l * 0.75, 0.95]);
      armR([0.55, -0.55, 0.45], [0.05, 0.25 - l * 0.75, 0.95]);
      legL([0.12, -1, 0.25 * bob], [0.06, -1, -0.35 * bob]);
      legR([0.12, -1, 0.25 * bob], [0.06, -1, -0.35 * bob]);
      return;
    }
    case "jacks": {
      // jumping jacks: arms clap overhead as the feet jump apart
      const p = (1 - Math.cos(t * TAU * 1.3)) / 2;
      const up = Math.abs(Math.sin(t * TAU * 1.3)) ;
      hips(rig, 0, up * 14);
      armL([0.35 + 0.55 * Math.sin(p * Math.PI), -1 + 2 * p, 0.05], [0.25 - 0.4 * p, -1 + 2.1 * p, 0.05]);
      armR([0.35 + 0.55 * Math.sin(p * Math.PI), -1 + 2 * p, 0.05], [0.25 - 0.4 * p, -1 + 2.1 * p, 0.05]);
      legL([0.05 + 0.4 * p, -1, 0], [0.05 + 0.4 * p, -1, 0]);
      legR([0.05 + 0.4 * p, -1, 0], [0.05 + 0.4 * p, -1, 0]);
      return;
    }
    case "robot": {
      // stiff robot moves on a ticking beat: forearms flip up and down in turn, the chest snaps round
      const step = Math.floor(t * 3) % 4;
      const lu = step === 0 || step === 3;
      armL([0.25, -0.35, 1], lu ? [0.05, 1, 0.3] : [0.05, -0.15, 1]);
      armR([0.25, -0.35, 1], lu ? [0.05, -0.15, 1] : [0.05, 1, 0.3]);
      addEuler(b.chest, 0, step < 2 ? 0.32 : -0.32, 0);
      stand();
      return;
    }
    case "clap": {
      // applause: forearms forward, hands meeting in front of the chest
      const k = (1 + Math.cos(t * TAU * 3.2)) / 2;
      armL([0.32, -0.62, 0.72], [-0.15 - 0.55 * (1 - k), 0.25, 0.95]);
      armR([0.32, -0.62, 0.72], [-0.15 - 0.55 * (1 - k), 0.25, 0.95]);
      hips(rig, 0, -Math.abs(Math.sin(t * TAU * 1.6)) * 2);
      stand();
      return;
    }
    case "salute": {
      // a crisp salute: right hand to the brow, left arm at the side
      const e = Math.min(1, t / 0.35);
      armR([0.95, 0.15 + 0.2 * e, 0.35], [-0.75 * e + 0.2 * (1 - e), 0.55 * e - 0.6 * (1 - e), 0.35]);
      armL([0.22, -1, 0], [0.12, -1, 0.05]);
      stand();
      return;
    }
    case "disco": {
      // the disco point: right arm points up to one side, then down across the body; left hand on the hip
      const beat = t * TAU * 1.1;
      const up = Math.sin(beat) > 0;
      armR(up ? [0.7, 0.75, 0.25] : [-0.35, -0.75, 0.55], up ? [0.7, 0.8, 0.25] : [-0.4, -0.8, 0.5]);
      armL([0.75, -0.55, -0.15], [-0.65, -0.15, 0.35]);
      hips(rig, Math.sin(beat) * 7, -Math.abs(Math.sin(beat)) * 3);
      addEuler(b.chest, 0, up ? -0.22 : 0.22, 0);
      legL([0.1, -1, 0], [0.05, -1, 0]);
      legR([0.18, -1, 0.15], [0.05, -1, -0.15]);
      return;
    }
  }
}
