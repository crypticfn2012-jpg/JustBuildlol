import * as THREE from "three";
import { animateRig, createCharacter, fillWeapon, gliderReachOffset, holdGlider, holdWeapon, whenWorkerReady } from "@/game/player/character";
const _gA = new THREE.Vector3();
const _gB = new THREE.Vector3();
import { gearById, skinById } from "@/game/core/content";
import { buildGlider, type GliderRig } from "@/game/player/glider";

const _fwd = new THREE.Vector3();

/**
 * Lobby/locker stage. With `glider`, the character hangs from that glider (deployed) instead of idling.
 * The lobby shows the character empty-handed and framed full-length; the locker passes `pick` to show
 * the equipped pickaxe.
 */
/** Play an emote on the locker / lobby preview character (null stops it). */
let previewEmoteId: string | null = null;
let previewEmoteAt = 0;
export function previewEmote(id: string | null) {
  previewEmoteId = id;
  previewEmoteAt = performance.now();
}

export function mountPreview(canvas: HTMLCanvasElement, skinId: string, packId: string, pickId: string, opts?: { glider?: string; pick?: boolean }) {
  let dead = false;
  let disposeInner = () => {};

  void whenWorkerReady().then(() => {
    if (dead) return;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 40);
    const showPick = !!opts?.pick;
    // full-length framing with room around the character (the locker zooms in a little more)
    if (showPick) {
      camera.position.set(1.35, 1.3, 4.9);
      camera.lookAt(0, 0.9, 0);
    } else {
      camera.position.set(1.7, 1.45, 6.6);
      camera.lookAt(0, 0.95, 0);
    }

    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a5a8a, 1.05));
    const sun = new THREE.DirectionalLight(0xfff4d2, 1.7);
    sun.position.set(3, 6, 4);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x8eb6ff, 0.55);
    rim.position.set(-3, 2, -2);
    scene.add(rim);

    const rig = createCharacter(skinById(skinId), gearById(packId), gearById(pickId));
    fillWeapon(rig.weapon, "pick", gearById(pickId).primary, 0, pickId);
    rig.weapon.visible = showPick;
    rig.group.position.y = 0.16;
    scene.add(rig.group);
    let glider: GliderRig | null = null;
    if (opts?.glider) {
      const g = gearById(opts.glider);
      glider = buildGlider(g.kind === "glider" ? g : gearById("glider"));
      scene.add(glider.group);
      rig.weapon.visible = false;
      camera.position.set(2.2, 2.5, 8.6);
      camera.lookAt(0, 1.95, 0);
    }

    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.95, 0.16, 24),
      new THREE.MeshLambertMaterial({ color: "#eef3f8" }),
    );
    pad.position.y = 0.08;
    const pad2 = new THREE.Mesh(
      new THREE.CylinderGeometry(1.05, 1.15, 0.1, 24),
      new THREE.MeshLambertMaterial({ color: "#9eb0c8" }),
    );
    pad2.position.y = -0.02;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.0, 0.035, 8, 28),
      new THREE.MeshLambertMaterial({ color: "#f0b429" }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.16;
    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.38, 16),
      new THREE.MeshBasicMaterial({ color: "#1a2433", transparent: true, opacity: 0.28, depthWrite: false }),
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.17;
    scene.add(pad, pad2, ring, blob);

    let raf = 0;
    const start = performance.now();

    function resize() {
      const w = canvas.clientWidth || 320;
      const h = canvas.clientHeight || 480;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Lobby pose: face the camera (slightly turned), idle, with an occasional pickaxe flourish.
    // Drag on the stage to spin the character; it eases back to the pose when released.
    let spin = 0;
    let dragX: number | null = null;
    const onDown = (e: PointerEvent) => {
      dragX = e.clientX;
      canvas.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (dragX === null) return;
      spin += (e.clientX - dragX) * 0.012;
      dragX = e.clientX;
    };
    const onUp = () => {
      dragX = null;
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    let last = performance.now();
    const loop = (now: number) => {
      if (dead) return;
      const t = (now - start) / 1000;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (dragX === null) spin += (0 - spin) * Math.min(1, dt * 2.2);
      rig.group.rotation.y = 0.32 + Math.sin(t * 0.35) * 0.08 + spin;
      if (glider) {
        // hang under the glider, bobbing a little as it soars
        const yaw = rig.group.rotation.y + Math.PI;
        glider.update(dt, t, { active: true, x: 0, y: 0.16 + Math.sin(t * 1.6) * 0.06, z: 0, yaw, speed: 6 });
        rig.group.position.y = 0.16 + Math.sin(t * 1.6) * 0.06;
        animateRig(rig, t, { speed: 0, air: true, glide: glider.open > 0.15, yaw });
        if (glider.open > 0.15) {
          glider.gripWorld(_gA, _gB);
          glider.hang = Math.max(-1.5, Math.min(0.6, glider.hang + gliderReachOffset(rig, _gA, _gB) * 0.5));
          holdGlider(rig, _gA, _gB);
        }
      } else {
        if (showPick) {
          const phase = t % 9;
          rig.fx.swing = phase > 7.6 && phase < 8.3 ? (phase - 7.6) / 0.7 : -1;
        }
        const emoting = previewEmoteId && !showPick;
        animateRig(rig, t, emoting ? { speed: 0, emote: { id: previewEmoteId!, t: (now - previewEmoteAt) / 1000 } } : { speed: 0 });
        rig.weapon.visible = showPick && !emoting;
        if (showPick) {
          const r = rig.group.rotation.y;
          holdWeapon(rig, "pick", _fwd.set(Math.sin(r), 0, Math.cos(r)));
        }
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    disposeInner = () => {
      dead = true;
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      ro.disconnect();
      renderer.dispose();
    };
  });

  return () => {
    dead = true;
    disposeInner();
  };
}