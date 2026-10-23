import * as THREE from "three";
import { animateRig, createCharacter, pickaxeModel, whenWorkerReady } from "@/game/player/character";
import { buildGlider } from "@/game/player/glider";
import { GEAR, SKINS, gearById, skinById } from "@/game/core/content";

/**
 * Item-card art for the shop, locker and battle pass: each cosmetic is rendered once with a
 * small offscreen renderer and cached as a transparent PNG data URL.
 */
let renderer: THREE.WebGLRenderer | null = null;
const cache = new Map<string, Promise<string>>();
const SIZE = 320;

function getRenderer() {
  if (renderer) return renderer;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(SIZE, SIZE, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setClearColor(0x000000, 0);
  return renderer;
}

function stage() {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x4a5f88, 1.15));
  const sun = new THREE.DirectionalLight(0xfff2d6, 1.8);
  sun.position.set(3, 6, 5);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x9fc4ff, 0.9);
  rim.position.set(-4, 3, -3);
  scene.add(rim);
  return scene;
}

function shoot(scene: THREE.Scene, cam: THREE.PerspectiveCamera) {
  const r = getRenderer();
  r.render(scene, cam);
  return r.domElement.toDataURL("image/png");
}

function renderSkin(id: string, back: string | null) {
  const scene = stage();
  const rig = createCharacter(skinById(id), back ? gearById(back) : null, null);
  rig.weapon.visible = false;
  animateRig(rig, 0.4, { speed: 0 });
  rig.group.rotation.y = back ? Math.PI + 0.55 : 0.35;
  scene.add(rig.group);
  const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 30);
  if (back) {
    cam.position.set(0, 1.35, 3.6);
    cam.lookAt(0, 1.15, 0);
  } else {
    cam.position.set(0, 1.05, 4.4);
    cam.lookAt(0, 0.92, 0);
  }
  return shoot(scene, cam);
}

function renderPickaxe(id: string) {
  const g = gearById(id);
  const scene = stage();
  const model = pickaxeModel(g.style ?? g.id, g.primary, g.secondary);
  // handle upright, head blades left-right, tilted like a card pose
  const inner = new THREE.Group();
  inner.add(model);
  inner.rotation.x = Math.PI / 2;
  const mid = new THREE.Group();
  mid.add(inner);
  mid.rotation.y = Math.PI / 2;
  const outer = new THREE.Group();
  outer.add(mid);
  outer.rotation.z = -0.55;
  outer.position.y = -0.36;
  scene.add(outer);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  cam.position.set(0.25, 0.1, 2.1);
  cam.lookAt(0, 0, 0);
  return shoot(scene, cam);
}

function renderGlider(id: string) {
  const g = gearById(id);
  const scene = stage();
  const rig = buildGlider(g);
  rig.update(1, 0, { active: true, x: 0, y: 0, z: 0, yaw: 0, speed: 0 });
  rig.group.rotation.set(-0.05, Math.PI + 0.65, 0.12);
  scene.add(rig.group);
  const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 40);
  cam.position.set(0, 6.2, 7.6);
  cam.lookAt(0, 2.75, 0);
  return shoot(scene, cam);
}

/** A transparent PNG of the item (skin, backpack, pickaxe or glider). */
export function itemThumb(id: string): Promise<string> {
  let p = cache.get(id);
  if (p) return p;
  p = whenWorkerReady().then(() => {
    if (SKINS.some((s) => s.id === id)) return renderSkin(id, null);
    const g = GEAR.find((x) => x.id === id);
    if (!g) return "";
    if (g.kind === "pickaxe") return renderPickaxe(id);
    if (g.kind === "glider") return renderGlider(id);
    if (g.id === "none-pack") return "";
    return renderSkin("chainline", id);
  });
  cache.set(id, p);
  return p;
}

/** Head-and-shoulders portrait of a skin, for the player card's round avatar. */
export function skinHeadshot(id: string): Promise<string> {
  const key = `head:${id}`;
  let p = cache.get(key);
  if (p) return p;
  p = whenWorkerReady().then(() => {
    const scene = stage();
    const rig = createCharacter(skinById(id), null, null);
    rig.weapon.visible = false;
    animateRig(rig, 0.4, { speed: 0 });
    rig.group.rotation.y = 0.3;
    scene.add(rig.group);
    rig.group.updateWorldMatrix(true, true);
    // frame the head: find it on the rig, fall back to a typical height
    const head = new THREE.Vector3(0, 1.6, 0);
    rig.group.getObjectByName("Head")?.getWorldPosition(head);
    const cam = new THREE.PerspectiveCamera(24, 1, 0.05, 20);
    cam.position.set(head.x + 0.12, head.y + 0.12, head.z + 1.6);
    cam.lookAt(head.x, head.y - 0.02, head.z);
    return shoot(scene, cam);
  });
  cache.set(key, p);
  return p;
}
