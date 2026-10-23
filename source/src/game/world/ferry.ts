import * as THREE from "three";

/**
 * The "Driftwood Ferry": the battle royale drop ship. A chunky cartoon wooden ferry boat
 * carried by a big striped hot-air balloon, with side propeller pods, a stern prop, a smoking
 * stack, pennants and bunting. All geometry is generated here; `update` animates it.
 * Local frame: +X is the bow (direction of travel), +Y up.
 */
export type Ferry = { group: THREE.Group; update: (dt: number, time: number) => void; dispose: () => void };

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const lam = (color: string, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

export function buildFerry(): Ferry {
  const group = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D = root) => {
    const o = new THREE.Mesh(g, m);
    o.castShadow = true;
    parent.add(o);
    disposables.push(g);
    return o;
  };
  const root = new THREE.Group();
  group.add(root);

  /* ---------- hull: lofted sections with painted planks ---------- */
  const DECK_Y = -7;
  const hullTex = canvasTex(64, 256, (g) => {
    // v=0 (top of texture) is the deck edge, bottom is the keel
    const planks = ["#b5773d", "#a66a33", "#bd8044", "#9e6230"];
    for (let i = 0; i < 9; i++) {
      g.fillStyle = planks[i % planks.length]!;
      g.fillRect(0, 22 + i * 18, 64, 18);
      g.fillStyle = "rgba(60,30,10,0.55)";
      g.fillRect(0, 22 + i * 18, 64, 2);
    }
    g.fillStyle = "#5a3418";
    g.fillRect(0, 0, 64, 22);
    g.fillStyle = "#f4ead2";
    g.fillRect(0, 184, 64, 8);
    g.fillStyle = "#d8452f";
    g.fillRect(0, 192, 64, 64);
    g.fillStyle = "rgba(0,0,0,0.12)";
    for (let i = 0; i < 4; i++) g.fillRect(0, 204 + i * 14, 64, 2);
  });
  hullTex.wrapS = THREE.RepeatWrapping;
  disposables.push(hullTex);
  const ST = 22;
  const SEG = 14;
  const X0 = -10.5;
  const X1 = 12.5;
  const halfW = (u: number) => {
    if (u < 0.08) return 2.9 + u * 6;
    if (u < 0.6) return 3.4 + Math.sin(((u - 0.08) / 0.52) * Math.PI * 0.5) * 0.3;
    return Math.max(0.12, 3.7 * Math.pow(Math.cos(((u - 0.6) / 0.4) * Math.PI * 0.5), 0.75));
  };
  const sheer = (u: number) => 0.9 * Math.pow(2 * u - 1, 2) + (u > 0.85 ? (u - 0.85) * 5 : 0);
  const depth = (u: number) => (u < 0.1 ? 2.2 + u * 4 : u > 0.75 ? 2.6 - (u - 0.75) * 5.5 : 2.6);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const deckEdge: [number, number, number][] = [];
  for (let i = 0; i <= ST; i++) {
    const u = i / ST;
    const x = X0 + (X1 - X0) * u;
    const w = halfW(u);
    const yd = DECK_Y + sheer(u);
    const d = Math.max(0.4, depth(u));
    deckEdge.push([x, yd, w]);
    for (let j = 0; j <= SEG; j++) {
      const phi = (j / SEG) * Math.PI;
      const t = Math.pow(Math.sin(phi), 0.7);
      pos.push(x, yd - d * t, w * Math.cos(phi));
      uv.push(u * 6, 1 - t);
    }
  }
  for (let i = 0; i < ST; i++)
    for (let j = 0; j < SEG; j++) {
      const a = i * (SEG + 1) + j;
      const b = a + SEG + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  const hullGeo = new THREE.BufferGeometry();
  hullGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  hullGeo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  hullGeo.setIndex(idx);
  hullGeo.computeVertexNormals();
  mesh(hullGeo, new THREE.MeshLambertMaterial({ map: hullTex, side: THREE.DoubleSide }));
  // transom (flat stern) with a painted name board
  {
    const sh = new THREE.Shape();
    for (let j = 0; j <= SEG; j++) {
      const p = j * 3;
      const zz = pos[p + 2]!;
      const yy = pos[p + 1]!;
      if (j === 0) sh.moveTo(zz, yy);
      else sh.lineTo(zz, yy);
    }
    const g = new THREE.ShapeGeometry(sh).rotateY(-Math.PI / 2).translate(X0, 0, 0);
    mesh(g, lam("#9e6230", { side: THREE.DoubleSide }));
    const board = canvasTex(256, 64, (c) => {
      c.fillStyle = "#2a5d7c";
      c.fillRect(0, 0, 256, 64);
      c.strokeStyle = "#f6c544";
      c.lineWidth = 6;
      c.strokeRect(4, 4, 248, 56);
      c.fillStyle = "#fff4d6";
      c.font = "900 34px 'Trebuchet MS', sans-serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText("DRIFTWOOD", 128, 34);
    });
    disposables.push(board);
    const bg = new THREE.PlaneGeometry(3.6, 0.9).rotateY(-Math.PI / 2).translate(X0 - 0.05, DECK_Y + 0.2, 0);
    mesh(bg, new THREE.MeshLambertMaterial({ map: board }));
  }
  // deck
  {
    const deckTex = canvasTex(256, 64, (g) => {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? "#d9a86a" : "#cf9c5c";
        g.fillRect(0, i * 8, 256, 8);
        g.fillStyle = "rgba(90,50,20,0.45)";
        g.fillRect(0, i * 8, 256, 1);
      }
      for (let i = 0; i < 6; i++) {
        g.fillStyle = "rgba(90,50,20,0.35)";
        g.fillRect(((i * 47) % 256) | 0, (i % 8) * 8, 2, 8);
      }
    });
    deckTex.wrapS = deckTex.wrapT = THREE.RepeatWrapping;
    deckTex.repeat.set(4, 3);
    disposables.push(deckTex);
    const sh = new THREE.Shape();
    deckEdge.forEach(([x, , w], i) => (i ? sh.lineTo(x, w - 0.15) : sh.moveTo(x, w - 0.15)));
    for (let i = deckEdge.length - 1; i >= 0; i--) sh.lineTo(deckEdge[i]![0], -deckEdge[i]![2] + 0.15);
    const g = new THREE.ShapeGeometry(sh);
    // ShapeGeometry is in XY: map shape-y to world z, lay it flat
    const p = g.attributes.position!;
    const uvs = g.attributes.uv!;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      p.setXYZ(i, x, DECK_Y + 0.06, y);
      uvs.setXY(i, x / 6, y / 6);
    }
    g.computeVertexNormals();
    const n = g.attributes.normal!;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    mesh(g, new THREE.MeshLambertMaterial({ map: deckTex, side: THREE.DoubleSide }));
  }
  // gunwale rail: posts and a top rail following the deck edge
  {
    const railMat = lam("#f4ead2");
    const postGeo = new THREE.BoxGeometry(0.16, 1, 0.16);
    const posts = new THREE.InstancedMesh(postGeo, railMat, (ST + 1) * 2);
    disposables.push(postGeo);
    let k = 0;
    const m = new THREE.Matrix4();
    for (const side of [1, -1]) {
      for (let i = 1; i < ST; i++) {
        const [x, y, w] = deckEdge[i]!;
        m.makeTranslation(x, y + 0.6, side * (w - 0.12));
        posts.setMatrixAt(k++, m);
      }
      const pts = deckEdge.slice(1, ST).map(([x, y, w]) => new THREE.Vector3(x, y + 1.1, side * (w - 0.12)));
      const curve = new THREE.CatmullRomCurve3(pts);
      mesh(new THREE.TubeGeometry(curve, 48, 0.1, 6), railMat);
    }
    posts.count = k;
    posts.castShadow = true;
    root.add(posts);
  }

  /* ---------- cabin, wheelhouse and stack ---------- */
  const cream = lam("#f6ecd4");
  const teal = lam("#2fa5a0");
  const red = lam("#e2533c");
  const dark = lam("#3a4552");
  const gold = lam("#f6c544", { emissive: new THREE.Color("#5a3a06"), emissiveIntensity: 0.3 });
  const glass = lam("#8fd3f4", { emissive: new THREE.Color("#2f78a8"), emissiveIntensity: 0.55 });
  const cab = mesh(new THREE.BoxGeometry(9, 2.6, 4.8), cream);
  cab.position.set(-1.6, DECK_Y + 1.55, 0);
  const trim = mesh(new THREE.BoxGeometry(9.1, 0.3, 4.9), teal);
  trim.position.set(-1.6, DECK_Y + 0.4, 0);
  const roof = mesh(new THREE.CylinderGeometry(2.9, 2.9, 10, 18, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).scale(1, 0.32, 1), red);
  roof.position.set(-1.6, DECK_Y + 2.85, 0);
  // portholes along both sides
  const holeGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.2, 14).rotateX(Math.PI / 2);
  const ringGeo = new THREE.TorusGeometry(0.46, 0.09, 6, 16);
  disposables.push(holeGeo, ringGeo);
  for (const side of [1, -1])
    for (let i = 0; i < 5; i++) {
      const x = -5.2 + i * 1.8;
      const h = new THREE.Mesh(holeGeo, glass);
      h.position.set(x, DECK_Y + 1.75, side * 2.42);
      const r = new THREE.Mesh(ringGeo, gold);
      r.position.copy(h.position);
      r.position.z += side * 0.06;
      root.add(h, r);
    }
  // wheelhouse at the front of the cabin
  const wh = mesh(new THREE.BoxGeometry(2.6, 2.0, 3.4), cream);
  wh.position.set(4.2, DECK_Y + 1.3, 0);
  const whGlass = mesh(new THREE.BoxGeometry(2.62, 0.9, 3.0), glass);
  whGlass.position.set(4.25, DECK_Y + 1.75, 0);
  const whRoof = mesh(new THREE.BoxGeometry(3.1, 0.25, 3.9), teal);
  whRoof.position.set(4.2, DECK_Y + 2.42, 0);
  // smoke stack
  const stack = mesh(new THREE.CylinderGeometry(0.55, 0.65, 2.6, 12), red);
  stack.position.set(-4.5, DECK_Y + 4.0, 0);
  const stackBand = mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.35, 12), cream);
  stackBand.position.set(-4.5, DECK_Y + 4.5, 0);
  const stackTop = mesh(new THREE.CylinderGeometry(0.66, 0.58, 0.3, 12), dark);
  stackTop.position.set(-4.5, DECK_Y + 5.4, 0);
  // life rings on the cabin walls
  const lifeTex = canvasTex(64, 8, (g) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? "#ffffff" : "#e2533c";
      g.fillRect(i * 8, 0, 8, 8);
    }
  });
  disposables.push(lifeTex);
  for (const side of [1, -1]) {
    const lr = mesh(new THREE.TorusGeometry(0.5, 0.16, 8, 20), new THREE.MeshLambertMaterial({ map: lifeTex }));
    lr.position.set(1.6, DECK_Y + 1.6, side * 2.5);
  }

  /* ---------- side propeller pods and stern prop ---------- */
  const props: THREE.Object3D[] = [];
  const bladeGeo = new THREE.BoxGeometry(0.12, 1.5, 0.42).translate(0, 0.75, 0);
  disposables.push(bladeGeo);
  const makeProp = (n: number, scale: number) => {
    const p = new THREE.Group();
    for (let i = 0; i < n; i++) {
      const b = new THREE.Mesh(bladeGeo, dark);
      b.rotation.x = (i * Math.PI * 2) / n;
      b.rotation.y = 0.35;
      b.castShadow = true;
      p.add(b);
    }
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), gold);
    p.add(hub);
    p.scale.setScalar(scale);
    props.push(p);
    return p;
  };
  for (const side of [1, -1]) {
    const arm = mesh(new THREE.BoxGeometry(0.5, 0.35, 2.6), teal);
    arm.position.set(-1.5, DECK_Y + 0.9, side * 4.6);
    const pod = mesh(new THREE.CylinderGeometry(0.8, 0.65, 3.2, 14).rotateZ(Math.PI / 2), red);
    pod.position.set(-1.5, DECK_Y + 0.9, side * 6.1);
    const nose = mesh(new THREE.SphereGeometry(0.8, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(-Math.PI / 2), cream);
    nose.position.set(0.1, DECK_Y + 0.9, side * 6.1);
    const band = mesh(new THREE.CylinderGeometry(0.84, 0.84, 0.3, 14).rotateZ(Math.PI / 2), gold);
    band.position.set(-1.0, DECK_Y + 0.9, side * 6.1);
    const p = makeProp(3, 1);
    p.position.set(-3.25, DECK_Y + 0.9, side * 6.1);
    root.add(p);
  }
  const sternProp = makeProp(4, 1.5);
  sternProp.position.set(X0 - 1.2, DECK_Y - 1.0, 0);
  root.add(sternProp);
  const shaft = mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.4, 8).rotateZ(Math.PI / 2), dark);
  shaft.position.set(X0 - 0.5, DECK_Y - 1.0, 0);
  const rudder = mesh(new THREE.BoxGeometry(1.6, 2.4, 0.18), teal);
  rudder.position.set(X0 - 0.6, DECK_Y + 0.6, 0);

  /* ---------- balloon ---------- */
  const B_Y = 8.5;
  const B_R = 9;
  const env = new THREE.SphereGeometry(B_R, 24, 18).toNonIndexed();
  {
    const p = env.attributes.position!;
    // teardrop: pinch the lower half toward the throat
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y < 0) {
        const k = 1 - 0.62 * Math.pow(-y / B_R, 1.6);
        p.setX(i, p.getX(i) * k);
        p.setZ(i, p.getZ(i) * k);
        p.setY(i, y * 1.12);
      }
    }
    env.computeVertexNormals();
    const gores = ["#e8483a", "#ffd04a", "#ffffff", "#2fa5a0"];
    const col = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    for (let f = 0; f < p.count; f += 3) {
      const cx = (p.getX(f) + p.getX(f + 1) + p.getX(f + 2)) / 3;
      const cz = (p.getZ(f) + p.getZ(f + 1) + p.getZ(f + 2)) / 3;
      const cy = (p.getY(f) + p.getY(f + 1) + p.getY(f + 2)) / 3;
      const a = (Math.atan2(cz, cx) + Math.PI) / (Math.PI * 2);
      const gore = Math.floor(a * 12) % 4;
      c.set(gores[gore]!);
      // a darker crown band and a cream belt around the middle
      if (cy > B_R * 0.86) c.set("#c23a2f");
      else if (Math.abs(cy - B_R * 0.1) < 0.7) c.set("#2a5d7c");
      for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (f + k) * 3);
    }
    env.setAttribute("color", new THREE.BufferAttribute(col, 3));
  }
  const balloon = new THREE.Group();
  balloon.position.y = B_Y;
  root.add(balloon);
  mesh(env, new THREE.MeshLambertMaterial({ vertexColors: true }), balloon);
  const throatY = -B_R * 1.12 + 0.2;
  const skirt = mesh(new THREE.CylinderGeometry(3.6, 2.6, 2.2, 18, 1, true), lam("#c98a3f", { side: THREE.DoubleSide }), balloon);
  skirt.position.y = throatY - 0.4;
  const ringM = mesh(new THREE.TorusGeometry(2.6, 0.16, 6, 24).rotateX(Math.PI / 2), dark, balloon);
  ringM.position.y = throatY - 1.5;
  // burner flame (flickers)
  const flameMat = new THREE.MeshBasicMaterial({ color: "#ffb340", transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const flame = mesh(new THREE.ConeGeometry(0.9, 3.2, 10).translate(0, 1.6, 0), flameMat, balloon);
  flame.position.y = throatY - 1.6;
  flame.castShadow = false;
  const flameCore = mesh(new THREE.ConeGeometry(0.45, 2, 8).translate(0, 1, 0), new THREE.MeshBasicMaterial({ color: "#fff3c4", transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }), balloon);
  flameCore.position.y = throatY - 1.6;
  flameCore.castShadow = false;
  // ropes from the balloon ring down to the deck
  const ropeMat = lam("#5c4a36");
  const ropeTops: THREE.Vector3[] = [];
  const ropeEnds: [number, number][] = [
    [7.5, 2.4],
    [7.5, -2.4],
    [-8.5, 2.6],
    [-8.5, -2.6],
    [-1.6, 3.2],
    [-1.6, -3.2],
  ];
  for (const [x, z] of ropeEnds) {
    const a = Math.atan2(z, x);
    const top = new THREE.Vector3(Math.cos(a) * 4.2, B_Y + throatY + 1.2, Math.sin(a) * 4.2);
    ropeTops.push(top);
    const bottom = new THREE.Vector3(x, DECK_Y + 1.1, z);
    const len = top.distanceTo(bottom);
    const r = mesh(new THREE.CylinderGeometry(0.07, 0.07, len, 5), ropeMat);
    r.position.copy(top).add(bottom).multiplyScalar(0.5);
    r.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), bottom.clone().sub(top).normalize());
  }
  // bunting: little pennants hanging along the first two ropes and the masts
  const buntCols = ["#e8483a", "#ffd04a", "#2fa5a0", "#ffffff", "#6c5ce7"];
  const flagGeo = new THREE.BufferGeometry();
  {
    const p: number[] = [];
    const c: number[] = [];
    const col = new THREE.Color();
    const addRun = (a: THREE.Vector3, b: THREE.Vector3, n: number) => {
      for (let i = 0; i < n; i++) {
        const t0 = (i + 0.15) / n;
        const t1 = (i + 0.85) / n;
        const p0 = a.clone().lerp(b, t0);
        const p1 = a.clone().lerp(b, t1);
        const sag = (t: number) => Math.sin(t * Math.PI) * 0.8;
        p0.y -= sag(t0);
        p1.y -= sag(t1);
        const tip = p0.clone().add(p1).multiplyScalar(0.5);
        tip.y -= 0.75;
        p.push(...p0.toArray(), ...p1.toArray(), ...tip.toArray());
        col.set(buntCols[i % buntCols.length]!);
        for (let k = 0; k < 3; k++) c.push(col.r, col.g, col.b);
      }
    };
    const mastF = new THREE.Vector3(10.2, DECK_Y + 6.6, 0);
    const mastS = new THREE.Vector3(-9.2, DECK_Y + 6.2, 0);
    addRun(mastF, new THREE.Vector3(3.6, B_Y + throatY - 0.2, 0), 12);
    addRun(mastS, new THREE.Vector3(-3.6, B_Y + throatY - 0.2, 0), 12);
    addRun(new THREE.Vector3(4.2, DECK_Y + 2.6, 1.6), mastF.clone().setY(DECK_Y + 5), 7);
    flagGeo.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    flagGeo.setAttribute("color", new THREE.Float32BufferAttribute(c, 3));
    flagGeo.computeVertexNormals();
    mesh(flagGeo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    // bunting strings
    for (const [a, b] of [
      [mastF, new THREE.Vector3(3.6, B_Y + throatY - 0.2, 0)],
      [mastS, new THREE.Vector3(-3.6, B_Y + throatY - 0.2, 0)],
    ] as const) {
      const curve = new THREE.QuadraticBezierCurve3(a, a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, -0.8, 0)), b);
      mesh(new THREE.TubeGeometry(curve, 16, 0.04, 4), ropeMat);
    }
    // masts with lanterns
    for (const m of [mastF, mastS]) {
      const mast = mesh(new THREE.CylinderGeometry(0.14, 0.18, m.y - DECK_Y, 8), lam("#7a4a2a"));
      mast.position.set(m.x, (m.y + DECK_Y) / 2, 0);
      const lantern = mesh(new THREE.BoxGeometry(0.4, 0.5, 0.4), lam("#ffe6a0", { emissive: new THREE.Color("#ffb340"), emissiveIntensity: 0.9 }));
      lantern.position.set(m.x, m.y + 0.35, 0);
    }
  }
  // waving pennant on the stern mast
  const pennantGeo = new THREE.PlaneGeometry(2.6, 0.9, 10, 2);
  pennantGeo.translate(-1.3, 0, 0);
  const pennantBase = (pennantGeo.attributes.position!.array as Float32Array).slice();
  const pennantTex = canvasTex(128, 32, (g) => {
    g.fillStyle = "#e8483a";
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(128, 16);
    g.lineTo(0, 32);
    g.fill();
    g.fillStyle = "#ffd04a";
    g.fillRect(0, 12, 70, 8);
  });
  disposables.push(pennantTex);
  const pennant = mesh(pennantGeo, new THREE.MeshLambertMaterial({ map: pennantTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }));
  pennant.position.set(-9.2, DECK_Y + 7.4, 0);
  pennant.castShadow = false;

  /* ---------- smoke puffs from the stack ---------- */
  const puffTex = canvasTex(64, 64, (g) => {
    const grd = g.createRadialGradient(32, 32, 4, 32, 32, 31);
    grd.addColorStop(0, "rgba(255,255,255,0.95)");
    grd.addColorStop(0.6, "rgba(240,240,240,0.6)");
    grd.addColorStop(1, "rgba(230,230,230,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  });
  disposables.push(puffTex);
  const puffs: { s: THREE.Sprite; t: number; vx: number; vy: number }[] = [];
  for (let i = 0; i < 16; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, color: "#f2f2f2" }));
    s.visible = false;
    root.add(s);
    puffs.push({ s, t: 99, vx: 0, vy: 0 });
  }
  let puffAcc = 0;
  let nextPuff = 0;

  return {
    group,
    update(dt, time) {
      for (let i = 0; i < props.length; i++) props[i]!.rotation.x += dt * (i === props.length - 1 ? 9 : 16);
      // gentle sway of the whole ship and the balloon
      root.rotation.z = Math.sin(time * 0.7) * 0.025;
      root.rotation.x = Math.sin(time * 0.5 + 1) * 0.02;
      balloon.rotation.z = Math.sin(time * 0.9 + 0.5) * 0.015;
      const f = 0.75 + Math.sin(time * 23) * 0.12 + Math.sin(time * 37) * 0.1;
      flame.scale.set(f, f * (0.9 + Math.sin(time * 17) * 0.15), f);
      flameCore.scale.setScalar(f);
      // pennant wave
      const pa = pennantGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pa.count; i++) {
        const x = pennantBase[i * 3]!;
        const k = -x / 2.6;
        pa.setZ(i, Math.sin(time * 7 + x * 2.4) * 0.35 * k);
        pa.setY(i, pennantBase[i * 3 + 1]! - k * 0.1);
      }
      pa.needsUpdate = true;
      // smoke
      puffAcc += dt;
      if (puffAcc > 0.22) {
        puffAcc = 0;
        const p = puffs[nextPuff++ % puffs.length]!;
        p.t = 0;
        p.vx = -5 - Math.random() * 2;
        p.vy = 1.4 + Math.random() * 0.8;
        p.s.position.set(-4.5, DECK_Y + 5.7, (Math.random() - 0.5) * 0.4);
        p.s.visible = true;
      }
      for (const p of puffs) {
        if (p.t > 3) {
          p.s.visible = false;
          continue;
        }
        p.t += dt;
        p.s.position.x += p.vx * dt;
        p.s.position.y += p.vy * dt;
        const sc = 1 + p.t * 1.6;
        p.s.scale.set(sc, sc, 1);
        (p.s.material as THREE.SpriteMaterial).opacity = Math.max(0, 0.85 - p.t * 0.28);
      }
    },
    dispose() {
      for (const d of disposables) d.dispose();
      group.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        m?.dispose?.();
      });
    },
  };
}
