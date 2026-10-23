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

export function makeBuildMap() {
  return canvasTex((g, s) => {
    const frame = Math.round(s * 0.055);
    g.fillStyle = "#3f2814";
    g.fillRect(0, 0, s, s);
    g.fillStyle = "#6b4424";
    g.fillRect(6, 6, s - 12, s - 12);
    g.fillStyle = "#8d5a30";
    g.fillRect(frame - 4, frame - 4, s - (frame - 4) * 2, s - (frame - 4) * 2);
    const x0 = frame;
    const y0 = frame;
    const w = s - frame * 2;
    const h = s - frame * 2;
    const rows = 8;
    const bh = h / rows;
    for (let i = 0; i < rows; i++) {
      const y = y0 + i * bh;
      g.fillStyle = i % 2 === 0 ? "#f0c27a" : "#e2a45a";
      g.fillRect(x0, y + 1.5, w, bh - 3);
      g.fillStyle = "rgba(74, 40, 16, 0.55)";
      g.fillRect(x0, y + bh - 2.5, w, 2.5);
      g.strokeStyle = "rgba(110, 64, 28, 0.4)";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x0 + 10, y + bh * 0.55);
      g.bezierCurveTo(x0 + w * 0.28, y + bh * 0.25, x0 + w * 0.62, y + bh * 0.8, x0 + w - 12, y + bh * 0.42);
      g.stroke();
      g.fillStyle = "rgba(62, 34, 14, 0.75)";
      g.beginPath();
      g.arc(x0 + 14, y + bh * 0.5, 2.4, 0, Math.PI * 2);
      g.arc(x0 + w - 14, y + bh * 0.5, 2.4, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = "rgba(255, 226, 180, 0.45)";
    g.lineWidth = 3;
    g.strokeRect(frame + 1, frame + 1, w - 2, h - 2);
    g.fillStyle = "#2c1c10";
    const bolt = frame * 0.48;
    for (const [x, y] of [
      [bolt, bolt],
      [s - bolt, bolt],
      [bolt, s - bolt],
      [s - bolt, s - bolt],
    ]) {
      g.beginPath();
      g.arc(x, y, 4, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#d7c4a4";
      g.beginPath();
      g.arc(x, y, 1.6, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#2c1c10";
    }
  }, 512);
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
export function addSky(scene: THREE.Scene) {
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
	const puff = new THREE.SphereGeometry(1, 8, 6);
	const clouds = new THREE.InstancedMesh(puff, new THREE.MeshLambertMaterial({
		color: "#ffffff",
		fog: false
	}), 36);
	const rand = rng(42);
	let n = 0;
	for (let i = 0; i < 9 && n < 36; i++) {
		const cx = (rand() - .5) * 160;
		const cz = (rand() - .5) * 160;
		const cy = 42 + rand() * 18;
		const blobs = 3 + Math.floor(rand() * 2);
		for (let b = 0; b < blobs && n < 36; b++) {
			const sc = 4 + rand() * 5;
			put(clouds, n, cx + (rand() - .5) * 10, cy + (rand() - .5) * 2, cz + (rand() - .5) * 8, sc * 1.4, sc * .55, sc, 0, rand() > .5 ? "#ffffff" : "#f3f7ff");
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
