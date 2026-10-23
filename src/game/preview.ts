import * as THREE from "three";
import { animateRig, createCharacter, fillWeapon, whenWorkerReady } from "@/game/character";
import { gearById, skinById } from "@/game/content";

export function mountPreview(canvas: HTMLCanvasElement, skinId: string, packId: string, pickId: string) {
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
    camera.position.set(1.15, 1.35, 3.6);
    camera.lookAt(0, 0.95, 0);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a5a8a, 1.05));
    const sun = new THREE.DirectionalLight(0xfff4d2, 1.7);
    sun.position.set(3, 6, 4);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x8eb6ff, 0.55);
    rim.position.set(-3, 2, -2);
    scene.add(rim);

    const rig = createCharacter(skinById(skinId), gearById(packId), gearById(pickId));
    fillWeapon(rig.weapon, "pick", gearById(pickId).primary);
    rig.group.position.y = 0.16;
    scene.add(rig.group);

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

    const loop = (now: number) => {
      if (dead) return;
      const t = (now - start) / 1000;
      rig.group.rotation.y = t * 0.55;
      const phase = t % 8;
      const speed = phase < 2.4 ? 0 : phase < 5 ? 3.4 : phase < 7.1 ? 10 : 0;
      animateRig(rig, t, { speed, swing: phase >= 7.1 });
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    disposeInner = () => {
      dead = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
    };
  });

  return () => {
    dead = true;
    disposeInner();
  };
}