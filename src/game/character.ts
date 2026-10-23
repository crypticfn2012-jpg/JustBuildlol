import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import type { Gear, Skin } from "@/game/content";
import workerUrl from "./worker.glb?url";

export type Rig = {
  group: THREE.Group;
  lLeg: THREE.Object3D;
  rLeg: THREE.Object3D;
  lArm: THREE.Object3D;
  rArm: THREE.Object3D;
  weapon: THREE.Group;
  backPick: THREE.Group;
  armed: boolean;
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

  const backPick = new THREE.Group();
  const equipped = pack && pack.id !== "none-pack";
  const bp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), mat(equipped ? pack!.primary : skin.accent));
  bp.scale.set(1.05, 1.15, 0.62);
  bp.castShadow = true;
  const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.05), mat(equipped ? pack!.secondary : skin.cap));
  pocket.position.set(0, -0.02, 0.08);
  backPick.add(bp, pocket);
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
    },
  };
}

let readyGltf: GLTF | null = null;
const pending = preloadWorker().then((gltf) => {
  readyGltf = gltf;
  return gltf;
});

export function whenWorkerReady() {
  return pending.then(() => undefined);
}

export function fillWeapon(slot: THREE.Group, kind: "pick" | "ar" | "shotgun" | "smg" | "sniper" | "heal" | "build", color = "#3d4654") {
  while (slot.children.length) slot.remove(slot.children[0]!);
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
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.62, 6), wood);
    h.rotation.x = Math.PI / 2;
    const hd = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.1), body);
    hd.position.set(0, 0, -0.28);
    hd.rotation.z = 0.4;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 5), steel);
    spike.rotation.x = Math.PI / 2;
    spike.position.z = -0.42;
    slot.add(h, hd, spike);
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
  if (o.slide && rig.actions.Roll) name = "Roll";
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
  if (active) active.timeScale = CLIP_SPEED[rig.current] ?? 1;
  rig.mixer.update(dt);

  const b = rig.bones;
  if (o.air && speed < 3) {
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
}

const _aim = new THREE.Vector3();
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
