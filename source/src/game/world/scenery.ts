import * as THREE from "three";

function canvasTex(draw: (g: CanvasRenderingContext2D, s: number) => void, size = 256) {
	const c = document.createElement("canvas");
	c.width = c.height = size;
	const g = c.getContext("2d");
	if (!g) return new THREE.CanvasTexture(c);
	draw(g, size);
	const tex = new THREE.CanvasTexture(c);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
	tex.anisotropy = 8;
	tex.magFilter = THREE.LinearFilter;
	tex.minFilter = THREE.LinearMipmapLinearFilter;
	return tex;
}
export function makeWoodMap() {
	return canvasTex((g, s) => {
		g.fillStyle = "#c9844a";
		g.fillRect(0, 0, s, s);
		const cols = 4;
		const w = s / cols;
		for (let i = 0; i < cols; i++) {
			const x = i * w;
			g.fillStyle = i % 2 === 0 ? "#f0c078" : "#e0a85c";
			g.fillRect(x + 3, 4, w - 6, s - 8);
			g.strokeStyle = "rgba(110, 62, 24, 0.28)";
			g.lineWidth = 2;
			for (let k = 0; k < 7; k++) {
				const y = 18 + k * 34;
				g.beginPath();
				g.moveTo(x + 10, y);
				g.bezierCurveTo(x + 22, y - 8, x + w * .55, y + 10, x + w - 12, y - 2);
				g.stroke();
			}
			g.fillStyle = "rgba(90, 52, 24, 0.85)";
			for (const [nx, ny] of [
				[12, 16],
				[w - 12, 16],
				[12, s - 16],
				[w - 12, s - 16]
			]) {
				g.beginPath();
				g.arc(x + nx, ny, 2.4, 0, Math.PI * 2);
				g.fill();
			}
		}
		g.strokeStyle = "rgba(74, 40, 16, 0.7)";
		g.lineWidth = 8;
		g.strokeRect(4, 4, s - 8, s - 8);
		g.strokeStyle = "rgba(255, 226, 180, 0.35)";
		g.lineWidth = 2;
		g.strokeRect(10, 10, s - 20, s - 20);
	});
}
export function makeGrassMap() {
	return canvasTex((g, s) => {
		g.fillStyle = "#3ea844";
		g.fillRect(0, 0, s, s);
		for (let i = 0; i < 2200; i++) {
			const x = Math.random() * s;
			const y = Math.random() * s;
			const blade = Math.random();
			g.fillStyle = blade > .72 ? "#7ed35a" : blade > .4 ? "#2f8d34" : "#56b84a";
			g.fillRect(x, y, 2, 4 + Math.random() * 5);
		}
		for (let i = 0; i < 40; i++) {
			g.fillStyle = Math.random() > .5 ? "#ffe27a" : "#ff8fb8";
			g.beginPath();
			g.arc(Math.random() * s, Math.random() * s, 1.6, 0, Math.PI * 2);
			g.fill();
		}
	});
}
export function makeSandMap() {
	return canvasTex((g, s) => {
		g.fillStyle = "#d9c7a2";
		g.fillRect(0, 0, s, s);
		for (let i = 0; i < 900; i++) {
			g.fillStyle = Math.random() > .5 ? "#cbb892" : "#efe2c4";
			g.fillRect(Math.random() * s, Math.random() * s, 3, 2);
		}
		g.strokeStyle = "rgba(255,255,255,0.18)";
		g.lineWidth = 2;
		for (let i = 1; i < 4; i++) {
			g.beginPath();
			g.moveTo(s / 4 * i, 0);
			g.lineTo(s / 4 * i, s);
			g.moveTo(0, s / 4 * i);
			g.lineTo(s, s / 4 * i);
			g.stroke();
		}
	});
}

export type BuildMat = "wood" | "brick" | "metal";

function rnd(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Fortnite-style build panel textures, one per material.
 * u 0..0.04 is the edge/frame strip that thin box sides sample, so keep it frame-colored.
 * `brace` adds the diagonal brace that walls get (floors and roofs skip it).
 */
export function makeBuildMap(mat: BuildMat = "wood", brace = true) {
  return canvasTex((g, s) => {
    const r = rnd(mat === "wood" ? 11 : mat === "brick" ? 23 : 37);
    if (mat === "wood") {
      g.fillStyle = "#4a2c12";
      g.fillRect(0, 0, s, s);
      // tall vertical planks with gaps, like Fortnite's wood wall
      let x = 20;
      while (x < s - 20) {
        const w = Math.min(s - 20 - x, 34 + Math.floor(r() * 26));
        if (w < 14) break;
        const tone = ["#efc57e", "#e2b36a", "#f6d08c", "#e8bc74", "#d9a862"][Math.floor(r() * 5)]!;
        const grad = g.createLinearGradient(x, 0, x + w, 0);
        grad.addColorStop(0, "rgba(120,70,24,0.45)");
        grad.addColorStop(0.18, tone);
        grad.addColorStop(0.6, tone);
        grad.addColorStop(1, "rgba(120,70,24,0.5)");
        g.fillStyle = tone;
        g.fillRect(x, 0, w, s);
        g.fillStyle = grad;
        g.fillRect(x, 0, w, s);
        g.strokeStyle = "rgba(150,92,36,0.4)";
        g.lineWidth = 1.5;
        for (let k = 0; k < 3; k++) {
          const gx = x + 6 + r() * (w - 12);
          g.beginPath();
          g.moveTo(gx, 0);
          for (let y = 0; y <= s; y += 32) g.lineTo(gx + Math.sin(y * 0.03 + k) * 2.5, y);
          g.stroke();
        }
        if (r() < 0.55) {
          g.fillStyle = "rgba(90,48,18,0.7)";
          g.beginPath();
          g.ellipse(x + w * (0.3 + r() * 0.4), 60 + r() * (s - 120), 4, 7, 0, 0, Math.PI * 2);
          g.fill();
        }
        x += w + 2 + Math.floor(r() * 2);
      }
      const beam = (y: number, h: number) => {
        const gr = g.createLinearGradient(0, y, 0, y + h);
        gr.addColorStop(0, "#f8d494");
        gr.addColorStop(0.45, "#d9a25a");
        gr.addColorStop(1, "#8a5a28");
        g.fillStyle = gr;
        g.fillRect(0, y, s, h);
      };
      beam(0, 30);
      beam(s - 30, 30);
      const post = (px: number) => {
        const gr = g.createLinearGradient(px, 0, px + 22, 0);
        gr.addColorStop(0, "#8a5a28");
        gr.addColorStop(0.5, "#e4b06a");
        gr.addColorStop(1, "#8a5a28");
        g.fillStyle = gr;
        g.fillRect(px, 0, 22, s);
      };
      post(0);
      post(s - 22);
      if (brace) {
        g.save();
        g.translate(s * 0.08, s * 0.86);
        g.rotate(-Math.atan2(s * 0.72, s * 0.84));
        const len = Math.hypot(s * 0.84, s * 0.72);
        const gr = g.createLinearGradient(0, -17, 0, 17);
        gr.addColorStop(0, "#fde2a8");
        gr.addColorStop(0.5, "#ecbd74");
        gr.addColorStop(1, "#a06a30");
        g.fillStyle = "rgba(30,16,6,0.45)";
        g.fillRect(0, 6, len, 34);
        g.fillStyle = gr;
        g.fillRect(0, -17, len, 34);
        g.fillStyle = "#3a3a3a";
        for (const bx of [16, len - 16]) {
          g.beginPath();
          g.arc(bx, 0, 6, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = "#c8c8c8";
        for (const bx of [16, len - 16]) {
          g.beginPath();
          g.arc(bx - 1.5, -1.5, 2.2, 0, Math.PI * 2);
          g.fill();
        }
        g.restore();
      }
      return;
    }
    if (mat === "brick") {
      g.fillStyle = "#6a5a50";
      g.fillRect(0, 0, s, s);
      const bh = 26;
      const bw = 62;
      for (let row = 0; row * bh < s; row++) {
        const off = row % 2 === 0 ? 0 : -bw / 2;
        for (let x = off; x < s; x += bw) {
          const tone = ["#a24c33", "#b85c3d", "#8f412c", "#ab5638", "#c46a46", "#97462f"][Math.floor(r() * 6)]!;
          g.fillStyle = tone;
          g.fillRect(x + 2, row * bh + 2, bw - 4, bh - 4);
          g.fillStyle = "rgba(255,210,170,0.18)";
          g.fillRect(x + 2, row * bh + 2, bw - 4, 4);
          g.fillStyle = "rgba(40,12,6,0.25)";
          g.fillRect(x + 2, row * bh + bh - 6, bw - 4, 4);
        }
      }
      // grey stone frame and corner quoins
      const stone = (x: number, y: number, w: number, h: number) => {
        const gr = g.createLinearGradient(x, y, x, y + h);
        gr.addColorStop(0, "#c9c6c0");
        gr.addColorStop(1, "#8b8780");
        g.fillStyle = "#4e4a45";
        g.fillRect(x, y, w, h);
        g.fillStyle = gr;
        g.fillRect(x + 2, y + 2, w - 4, h - 4);
      };
      stone(0, 0, s, 30);
      stone(0, s - 30, s, 30);
      for (let y = 30, i = 0; y < s - 30; y += 44, i++) {
        const w = i % 2 === 0 ? 46 : 30;
        stone(0, y, w, 44);
        stone(s - w, y, w, 44);
      }
      return;
    }
    // metal: corrugated steel sheet in a dark steel frame
    g.fillStyle = "#3f454c";
    g.fillRect(0, 0, s, s);
    const period = 24;
    for (let x = 0; x < s; x += period) {
      const gr = g.createLinearGradient(x, 0, x + period, 0);
      gr.addColorStop(0, "#5d646c");
      gr.addColorStop(0.35, "#b9c0c7");
      gr.addColorStop(0.55, "#8e959d");
      gr.addColorStop(1, "#555c64");
      g.fillStyle = gr;
      g.fillRect(x, 0, period, s);
    }
    g.fillStyle = "rgba(120,80,40,0.18)";
    for (let i = 0; i < 9; i++) g.fillRect(r() * s, r() * s, 6 + r() * 20, 30 + r() * 60);
    const bar = (x: number, y: number, w: number, h: number) => {
      g.fillStyle = "#2b3036";
      g.fillRect(x, y, w, h);
      g.fillStyle = "#6c747d";
      g.fillRect(x + 3, y + 3, w - 6, h - 6);
      g.fillStyle = "rgba(255,255,255,0.25)";
      g.fillRect(x + 3, y + 3, w - 6, 3);
    };
    bar(0, 0, s, 30);
    bar(0, s - 30, s, 30);
    bar(0, s / 2 - 14, s, 28);
    bar(0, 0, 26, s);
    bar(s - 26, 0, 26, s);
    g.fillStyle = "#23272c";
    for (let x = 40; x < s - 30; x += 54) {
      for (const y of [15, s - 15, s / 2]) {
        g.beginPath();
        g.arc(x, y, 4, 0, Math.PI * 2);
        g.fill();
      }
    }
  }, 512);
}

/** Pale, frosted copy of a build texture: Fortnite's look for placement previews and pieces still under construction. */
export function makeHoloMap(src: THREE.Texture) {
  const img = src.image as HTMLCanvasElement;
  return canvasTex((g, s) => {
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, s, s);
    g.globalAlpha = 0.32;
    g.drawImage(img, 0, 0, s, s);
    g.globalAlpha = 1;
    g.strokeStyle = "rgba(255,255,255,0.9)";
    g.lineWidth = 3;
    for (let i = 0; i <= 3; i++) {
      const p = (i / 3) * s;
      g.beginPath();
      g.moveTo(p, 0);
      g.lineTo(p, s);
      g.moveTo(0, p);
      g.lineTo(s, p);
      g.stroke();
    }
  }, 256);
}

/** Edit-mode tile faces: plain tile (kept) and X tile (cut), tinted by material color. */
/** Stair edit tile: the same blue square with two chevrons pointing up the stairs (toward the top of the texture). */
export function makeEditArrowMap() {
  return canvasTex((g, s) => {
    g.fillStyle = "#c8c8c8";
    g.fillRect(0, 0, s, s);
    g.strokeStyle = "#ffffff";
    g.lineWidth = 6;
    g.strokeRect(3, 3, s - 6, s - 6);
    g.strokeStyle = "rgba(255,255,255,0.85)";
    g.lineWidth = 9;
    g.lineJoin = "round";
    for (const y of [0.36, 0.64]) {
      g.beginPath();
      g.moveTo(s * 0.24, s * (y + 0.14));
      g.lineTo(s * 0.5, s * (y - 0.08));
      g.lineTo(s * 0.76, s * (y + 0.14));
      g.stroke();
    }
  }, 128);
}

export function makeEditTileMap(cross: boolean) {
  return canvasTex((g, s) => {
    g.fillStyle = "#c8c8c8";
    g.fillRect(0, 0, s, s);
    g.strokeStyle = "#ffffff";
    g.lineWidth = 6;
    g.strokeRect(3, 3, s - 6, s - 6);
    if (cross) {
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(8, 8);
      g.lineTo(s - 8, s - 8);
      g.moveTo(s - 8, 8);
      g.lineTo(8, s - 8);
      g.stroke();
    }
  }, 128);
}

function rng(seed: number) {
	let s = seed;
	return () => {
		s = s * 16807 % 2147483647;
		return (s - 1) / 2147483646;
	};
}
var _m = new THREE.Matrix4();
var _p = new THREE.Vector3();
var _q = new THREE.Quaternion();
var _s = new THREE.Vector3();
var _c = new THREE.Color();
function put(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw = 0, color?: string) {
	_q.setFromAxisAngle(_up, yaw);
	_m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
	mesh.setMatrixAt(i, _m);
	if (color) mesh.setColorAt(i, _c.set(color));
}
var _up = new THREE.Vector3(0, 1, 0);
export function addSky(scene: THREE.Scene): { sky: THREE.Mesh; clouds: THREE.InstancedMesh; sunDisc: THREE.Mesh } {
	const geo = new THREE.SphereGeometry(230, 28, 18);
	const pos = geo.attributes.position;
	const cols = new Float32Array(pos.count * 3);
	const top = new THREE.Color("#1f62e0");
	const mid = new THREE.Color("#4aa4f0");
	const hor = new THREE.Color("#8fd4ff");
	const warm = new THREE.Color("#ffe3a8");
	const tmp = new THREE.Color();
	for (let i = 0; i < pos.count; i++) {
		const y = pos.getY(i) / 230;
		const x = pos.getX(i) / 230;
		const t = THREE.MathUtils.clamp((y + .08) / 1.05, 0, 1);
		tmp.copy(hor).lerp(mid, Math.min(1, t * 1.6)).lerp(top, Math.max(0, t - .35) / .65);
		if (x > .2 && y > .05) tmp.lerp(warm, Math.max(0, x - .2) * .35 * (1 - t));
		cols[i * 3] = tmp.r;
		cols[i * 3 + 1] = tmp.g;
		cols[i * 3 + 2] = tmp.b;
	}
	geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
	const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
		vertexColors: true,
		side: THREE.BackSide,
		depthWrite: false,
		fog: false
	}));
	sky.renderOrder = -2;
	sky.frustumCulled = false;
	scene.add(sky);
	// fluffy cartoon clouds: smooth puffs with flattened, slightly shaded undersides
	const puff = new THREE.IcosahedronGeometry(1, 2);
	{
		const p = puff.attributes.position;
		const col = new Float32Array(p.count * 3);
		for (let i = 0; i < p.count; i++) {
			const y = p.getY(i);
			if (y < -0.15) p.setY(i, -0.15 + (y + 0.15) * 0.25);
			const k = 0.8 + 0.2 * THREE.MathUtils.smoothstep(y, -0.2, 0.7);
			col[i * 3] = k * 0.97;
			col[i * 3 + 1] = k * 0.985;
			col[i * 3 + 2] = k;
		}
		puff.setAttribute("color", new THREE.BufferAttribute(col, 3));
		puff.computeVertexNormals();
	}
	const MAXP = 90;
	const clouds = new THREE.InstancedMesh(puff, new THREE.MeshLambertMaterial({
		color: "#ffffff",
		vertexColors: true,
		emissive: new THREE.Color("#c9dcf2"),
		emissiveIntensity: 0.45,
		fog: false
	}), MAXP);
	const rand = rng(42);
	let n = 0;
	for (let i = 0; i < 12 && n < MAXP; i++) {
		const ang = rand() * Math.PI * 2;
		const dist = 50 + rand() * 75;
		const cx = Math.cos(ang) * dist;
		const cz = Math.sin(ang) * dist;
		const cy = 44 + rand() * 16;
		const size = 3.2 + rand() * 2.6;
		const blobs = 6 + Math.floor(rand() * 3);
		for (let b = 0; b < blobs && n < MAXP; b++) {
			// a long low base with taller puffs piled in the middle
			const t = (b / (blobs - 1)) * 2 - 1;
			const sc = size * (1.05 - Math.abs(t) * 0.45) * (0.8 + rand() * 0.35);
			put(clouds, n, cx + t * size * 2.1 + (rand() - .5) * 1.5, cy + (1 - Math.abs(t)) * size * 0.45, cz + (rand() - .5) * size * 1.1, sc * 1.25, sc * 0.95, sc * 1.1, rand() * 6, "#ffffff");
			n++;
		}
	}
	clouds.count = n;
	clouds.instanceMatrix.needsUpdate = true;
	if (clouds.instanceColor) clouds.instanceColor.needsUpdate = true;
	scene.add(clouds);
	const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(11, 24), new THREE.MeshBasicMaterial({
		color: "#fff6d2",
		fog: false,
		depthWrite: false,
		transparent: true,
		opacity: .95
	}));
	sunDisc.position.set(90, 78, 36);
	sunDisc.lookAt(0, 10, 0);
	scene.add(sunDisc);
	return { sky, clouds, sunDisc };
}

export type HarvestTree = { x: number; y: number; z: number; hide: () => void };

export function dressHills(scene: THREE.Scene, groundHeight: (x: number, z: number) => number, wood: THREE.Texture): HarvestTree[] {
	const rand = rng(9001);
	const bark = new THREE.MeshLambertMaterial({ color: "#ffffff" });
	const leaf = new THREE.MeshLambertMaterial({ color: "#ffffff" });
	const rockMat = new THREE.MeshLambertMaterial({ color: "#ffffff" });
	const trunkGeo = new THREE.CylinderGeometry(.22, .34, 1, 6);
	const ballGeo = new THREE.SphereGeometry(1, 8, 6);
	const coneGeo = new THREE.ConeGeometry(1, 1, 7);
	const rockGeo = new THREE.DodecahedronGeometry(1, 0);
	const trunks = new THREE.InstancedMesh(trunkGeo, bark, 80);
	const puffs = new THREE.InstancedMesh(ballGeo, leaf, 280);
	const pines = new THREE.InstancedMesh(coneGeo, leaf, 120);
	const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 28);
	const bushes = new THREE.InstancedMesh(ballGeo, leaf, 80);
	let ti = 0;
	let pi = 0;
	let ci = 0;
	let ri = 0;
	let bi = 0;
	const harvest: HarvestTree[] = [];
	const leafCols = [
		"#3cb84a",
		"#2f9a3a",
		"#67d15a",
		"#218a32",
		"#8ed84a"
	];
	const clear = (x: number, z: number) => Math.hypot(x, z - 18) < 7.5;
	const spots = [
		{
			x: -9,
			z: 4,
			oak: true,
			big: true
		},
		{
			x: 11,
			z: 2,
			oak: true,
			big: true
		},
		{
			x: 2,
			z: -8,
			oak: false,
			big: true
		},
		{
			x: -16,
			z: -6,
			oak: true,
			big: true
		},
		{
			x: 18,
			z: 10,
			oak: false,
			big: false
		}
	];
	function plant(x: number, z: number, oak: boolean, big: boolean) {
		if (ti >= 78) return;
		const y = groundHeight(x, z);
		if (y < -.5) return;
		const boost = big ? 1.28 : 1;
		const h = (oak ? 3.4 + rand() * 1.5 : 2.3 + rand() * .9) * boost;
		const sc = (1.05 + rand() * .4) * boost;
		const trunkIndex = ti;
		put(trunks, ti++, x, y + h * .5, z, sc * .85, h, sc * .85, rand() * 3, rand() > .5 ? "#8d5a32" : "#6e4324");
		const puffStart = pi;
		const coneStart = ci;
		if (oak) {
			const crowns = [
				[
					0,
					h + 1.15,
					0,
					1.7
				],
				[
					-.95,
					h + .55,
					.35,
					1.25
				],
				[
					.9,
					h + .5,
					-.25,
					1.2
				],
				[
					.15,
					h + 1.7,
					-.1,
					1.05
				]
			];
			for (const [ox, oy, oz, r] of crowns) {
				if (pi >= 270) break;
				put(puffs, pi++, x + ox * sc, y + oy, z + oz * sc, r * sc, r * sc * .82, r * sc, 0, leafCols[pi % leafCols.length]);
			}
		} else for (let k = 0; k < 3; k++) {
			if (ci >= 110) break;
			const r = (1.7 - k * .38) * sc;
			put(pines, ci++, x, y + h + k * 1.05 * sc, z, r, 1.45 * sc, r, rand(), leafCols[(ci + k) % leafCols.length]);
		}
		const puffEnd = pi;
		const coneEnd = ci;
		harvest.push({
			x,
			y,
			z,
			hide() {
				put(trunks, trunkIndex, x, -40, z, .001, .001, .001);
				for (let k = puffStart; k < puffEnd; k++) put(puffs, k, x, -40, z, .001, .001, .001);
				for (let k = coneStart; k < coneEnd; k++) put(pines, k, x, -40, z, .001, .001, .001);
				trunks.instanceMatrix.needsUpdate = true;
				puffs.instanceMatrix.needsUpdate = true;
				pines.instanceMatrix.needsUpdate = true;
			}
		});
	}
	for (const spot of spots) plant(spot.x, spot.z, spot.oak, spot.big);
	for (let i = 0; i < 42; i++) {
		const ang = rand() * Math.PI * 2;
		const rad = 18 + rand() * 78;
		const x = Math.cos(ang) * rad;
		const z = Math.sin(ang) * rad * .92;
		if (clear(x, z)) continue;
		plant(x, z, rand() > .38, rand() > .72);
	}
	for (let i = 0; i < 22; i++) {
		const ang = rand() * Math.PI * 2;
		const rad = 14 + rand() * 70;
		const x = Math.cos(ang) * rad;
		const z = Math.sin(ang) * rad;
		if (clear(x, z) || ri >= 28) continue;
		const y = groundHeight(x, z);
		if (y < -.5) continue;
		const s = .45 + rand() * .9;
		put(rocks, ri++, x, y + s * .35, z, s * (.8 + rand() * .6), s * .55, s, rand() * 6, rand() > .5 ? "#9aa098" : "#6f6a60");
	}
	for (let i = 0; i < 46; i++) {
		const ang = rand() * Math.PI * 2;
		const rad = 10 + rand() * 78;
		const x = Math.cos(ang) * rad;
		const z = Math.sin(ang) * rad;
		if (clear(x, z) || bi >= 80) continue;
		const y = groundHeight(x, z);
		if (y < -.5) continue;
		const s = .35 + rand() * .45;
		put(bushes, bi++, x, y + s * .45, z, s * 1.3, s * .7, s * 1.2, 0, rand() > .3 ? "#2f8f38" : "#4caf50");
	}
	const tuftGeo = new THREE.ConeGeometry(.12, .55, 4);
	const tufts = new THREE.InstancedMesh(tuftGeo, leaf, 140);
	let ui = 0;
	for (let i = 0; i < 140; i++) {
		const ang = rand() * Math.PI * 2;
		const rad = 3 + rand() * 36;
		const x = Math.cos(ang) * rad;
		const z = 18 + Math.sin(ang) * rad;
		const y = groundHeight(x, z);
		if (y < -.5) continue;
		put(tufts, ui++, x, y + .22, z, .7 + rand(), .7 + rand() * .8, .7 + rand(), rand(), rand() > .5 ? "#2f9a34" : "#6dce4e");
	}
	for (const mesh of [
		trunks,
		puffs,
		pines,
		rocks,
		bushes,
		tufts
	]) {
		mesh.count = mesh === trunks ? ti : mesh === puffs ? pi : mesh === pines ? ci : mesh === rocks ? ri : mesh === bushes ? bi : ui;
		mesh.instanceMatrix.needsUpdate = true;
		if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
		mesh.castShadow = mesh === trunks || mesh === rocks;
		mesh.receiveShadow = true;
		scene.add(mesh);
	}
	const house = new THREE.Group();
	const wallMat = new THREE.MeshLambertMaterial({
		map: wood,
		color: "#ffe0b8"
	});
	const wall = new THREE.Mesh(new THREE.BoxGeometry(7.2, 3.6, 5.2), wallMat);
	wall.position.y = 1.8;
	wall.castShadow = wall.receiveShadow = true;
	const roofMat = new THREE.MeshLambertMaterial({ color: "#d4533c" });
	const roofA = new THREE.Mesh(new THREE.BoxGeometry(4.4, .28, 5.8), roofMat);
	roofA.position.set(-1.35, 3.85, 0);
	roofA.rotation.z = .48;
	const roofB = new THREE.Mesh(new THREE.BoxGeometry(4.4, .28, 5.8), roofMat);
	roofB.position.set(1.35, 3.85, 0);
	roofB.rotation.z = -.48;
	const door = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.1, .16), new THREE.MeshLambertMaterial({ color: "#5a3822" }));
	door.position.set(0, 1.05, 2.66);
	const glass = new THREE.MeshLambertMaterial({ color: "#b9e6fb" });
	const w1 = new THREE.Mesh(new THREE.BoxGeometry(1.15, .95, .12), glass);
	w1.position.set(-2.1, 2.15, 2.66);
	const w2 = w1.clone();
	w2.position.x = 2.1;
	const chimney = new THREE.Mesh(new THREE.BoxGeometry(.7, 1.4, .7), new THREE.MeshLambertMaterial({ color: "#a33b32" }));
	chimney.position.set(2.2, 4.5, -1.2);
	house.add(wall, roofA, roofB, door, w1, w2, chimney);
	const hx = -32;
	const hz = 4;
	house.position.set(hx, groundHeight(hx, hz), hz);
	house.rotation.y = .4;
	scene.add(house);
	const postGeo = new THREE.BoxGeometry(.18, 1.1, .18);
	const railGeo = new THREE.BoxGeometry(1.8, .1, .1);
	const postMat = new THREE.MeshLambertMaterial({ color: "#c9854a" });
	for (let i = 0; i < 6; i++) {
		const post = new THREE.Mesh(postGeo, postMat);
		const px = -24 + i * 1.7;
		const pz = 14;
		post.position.set(px, groundHeight(px, pz) + .55, pz);
		scene.add(post);
		if (i < 5) {
			const rail = new THREE.Mesh(railGeo, postMat);
			rail.position.set(px + .85, groundHeight(px, pz) + .85, pz);
			scene.add(rail);
		}
	}
	return harvest;
}
