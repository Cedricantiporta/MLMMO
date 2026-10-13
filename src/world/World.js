import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CONFIG } from '../core/config.js';
import { mulberry32 } from '../core/rng.js';

const SUN_OFFSET = new THREE.Vector3(12, 22, 8);
const TUFT_COUNT = 3500;

// Meadow: lights, ground, instanced grass/trees/rocks and the obstacle list used for collision.
export class World {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.half = CONFIG.map.playHalf;
    this.obstacles = [];
    this.rng = mulberry32(CONFIG.map.seed);

    this.buildLights();
    this.buildGround();
    this.buildTufts();
    this.buildTrees();
    this.buildRocks();
  }

  // ---- lights -------------------------------------------------------------
  buildLights() {
    const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x4a6b2a, 0.9);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const cam = sun.shadow.camera;
    cam.left = -18; cam.right = 18; cam.top = 18; cam.bottom = -18;
    cam.near = 1; cam.far = 70;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    sun.position.copy(SUN_OFFSET);
    this.scene.add(sun, sun.target);
    this.sun = sun;
  }

  // ---- ground -------------------------------------------------------------
  makeGrassTexture() {
    const S = 512;
    const rng = mulberry32(CONFIG.map.seed + 11);
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d');
    g.fillStyle = '#4d8a34';
    g.fillRect(0, 0, S, S);

    // soft blotches (drawn wrapped so the texture tiles)
    for (let i = 0; i < 46; i++) {
      const x = rng() * S;
      const y = rng() * S;
      const r = 30 + rng() * 70;
      const light = rng() < 0.5;
      const col = light ? '150,200,80' : '30,80,36';
      for (const ox of [-S, 0, S]) {
        for (const oy of [-S, 0, S]) {
          const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
          gr.addColorStop(0, `rgba(${col},${0.22 + rng() * 0.12})`);
          gr.addColorStop(1, `rgba(${col},0)`);
          g.fillStyle = gr;
          g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
        }
      }
    }
    // speckles
    for (let i = 0; i < 5200; i++) {
      const x = rng() * S;
      const y = rng() * S;
      const l = 22 + rng() * 38;
      g.fillStyle = `hsla(${88 + rng() * 40},${45 + rng() * 25}%,${l}%,${0.35 + rng() * 0.4})`;
      g.fillRect(x, y, 1 + rng() * 2, 1 + rng() * 3);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(12, 12);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.game.renderer.capabilities.getMaxAnisotropy();
    return tex;
  }

  buildGround() {
    const geo = new THREE.PlaneGeometry(140, 140);
    geo.rotateX(-Math.PI / 2);
    this.groundTex = this.makeGrassTexture();
    const mat = new THREE.MeshLambertMaterial({ map: this.groundTex });
    const ground = new THREE.Mesh(geo, mat);
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.ground = ground;
  }

  // ---- grass tufts --------------------------------------------------------
  buildTufts() {
    // 3 crossed blades, each a single upward-pointing triangle with straight-up normals.
    const pos = [];
    const nor = [];
    const w = 0.07;
    const h = 0.55;
    for (let b = 0; b < 3; b++) {
      const a = (b * Math.PI) / 3;
      const dx = Math.cos(a) * w;
      const dz = Math.sin(a) * w;
      const lean = 0.08;
      pos.push(-dx, 0, -dz, dx, 0, dz, Math.sin(a) * lean, h, Math.cos(a) * lean);
      nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
      // reversed twin so both faces are front-facing (keeps the upward normals lit correctly)
      pos.push(dx, 0, dz, -dx, 0, -dz, Math.sin(a) * lean, h, Math.cos(a) * lean);
      nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const mesh = new THREE.InstancedMesh(geo, mat, TUFT_COUNT);
    const rng = this.rng;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    const extent = this.half + 4;
    this.tuftPos = new Float32Array(TUFT_COUNT * 2);
    for (let i = 0; i < TUFT_COUNT; i++) {
      const x = (rng() * 2 - 1) * extent;
      const z = (rng() * 2 - 1) * extent;
      const sc = 0.7 + rng() * 1.1;
      q.setFromAxisAngle(up, rng() * Math.PI * 2);
      p.set(x, 0, z);
      s.set(sc, sc * (0.8 + rng() * 0.6), sc);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
      col.setHSL(0.25 + rng() * 0.08, 0.5 + rng() * 0.2, 0.28 + rng() * 0.16);
      mesh.setColorAt(i, col);
      this.tuftPos[i * 2] = x;
      this.tuftPos[i * 2 + 1] = z;
    }
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.tufts = mesh;
    this.tuftMatrices = new Float32Array(mesh.instanceMatrix.array); // originals for regrow
    this.tuftHidden = new THREE.Matrix4().compose(
      new THREE.Vector3(0, -10, 0), new THREE.Quaternion(), new THREE.Vector3(0, 0, 0),
    );
    this.tuftsByCell = new Map();
  }

  // Bucket tufts by fire-grid cell so burn/regrow only touch the cell's own instances.
  indexTufts(fire) {
    this.tuftsByCell.clear();
    for (let i = 0; i < TUFT_COUNT; i++) {
      const c = fire.cellIndex(this.tuftPos[i * 2], this.tuftPos[i * 2 + 1]);
      if (c < 0) continue;
      let list = this.tuftsByCell.get(c);
      if (!list) this.tuftsByCell.set(c, (list = []));
      list.push(i);
    }
  }

  burnTufts(cell) {
    const list = this.tuftsByCell.get(cell);
    if (!list) return;
    for (const i of list) this.tufts.setMatrixAt(i, this.tuftHidden);
    this.tufts.instanceMatrix.needsUpdate = true;
  }

  regrowTufts(cell) {
    const list = this.tuftsByCell.get(cell);
    if (!list) return;
    const m = new THREE.Matrix4();
    for (const i of list) {
      m.fromArray(this.tuftMatrices, i * 16);
      this.tufts.setMatrixAt(i, m);
    }
    this.tufts.instanceMatrix.needsUpdate = true;
  }

  // ---- trees --------------------------------------------------------------
  makePineGeometries() {
    const cones = [];
    const specs = [[1.25, 1.5, 0.9], [0.95, 1.4, 1.7], [0.65, 1.3, 2.5]];
    for (const [r, h, y] of specs) {
      const c = new THREE.ConeGeometry(r, h, 7);
      c.translate(0, y + h / 2, 0);
      cones.push(c);
    }
    const foliage = mergeGeometries(cones);
    const trunk = new THREE.CylinderGeometry(0.14, 0.2, 1.1, 6);
    trunk.translate(0, 0.55, 0);
    return { foliage, trunk };
  }

  makeOakGeometries() {
    const blobs = [];
    const specs = [[0, 2.5, 0, 1.2], [0.7, 2.2, 0.2, 0.85], [-0.65, 2.3, -0.2, 0.9], [0.1, 3.1, -0.4, 0.8], [-0.2, 2.2, 0.7, 0.8]];
    for (const [x, y, z, r] of specs) {
      const b = new THREE.IcosahedronGeometry(r, 1);
      b.translate(x, y, z);
      blobs.push(b);
    }
    const foliage = mergeGeometries(blobs);
    const trunk = new THREE.CylinderGeometry(0.18, 0.28, 1.9, 6);
    trunk.translate(0, 0.95, 0);
    return { foliage, trunk };
  }

  buildTrees() {
    const rng = this.rng;
    const trees = []; // {x,z,s,oak,rot}
    const center = 7;

    // interior trees
    let tries = 0;
    const lim = this.half - 3;
    while (trees.length < 20 && tries++ < 600) {
      const x = (rng() * 2 - 1) * lim;
      const z = (rng() * 2 - 1) * lim;
      if (Math.hypot(x, z) < center) continue;
      if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 3.5)) continue;
      const s = 0.9 + rng() * 0.7;
      const t = { x, z, s, oak: rng() < 0.4, rot: rng() * Math.PI * 2 };
      trees.push(t);
      this.obstacles.push({ x, z, r: 0.4 * s });
    }

    // dense 3-layer border wall just outside the playable area
    for (let layer = 0; layer < 3; layer++) {
      const d = this.half + 1.4 + layer * 2.6;
      const step = 2.0 + layer * 0.2;
      for (let side = 0; side < 4; side++) {
        for (let u = -d; u <= d; u += step) {
          
          const v = d + (rng() - 0.5) * 1.2;
          const a = u + (rng() - 0.5) * 0.8;
          let x; let z;
          if (side === 0) { x = a; z = -v; } else if (side === 1) { x = a; z = v; } else if (side === 2) { x = -v; z = a; } else { x = v; z = a; }
          trees.push({ x, z, s: 1.3 + rng() * 1.1, oak: rng() < 0.3, rot: rng() * Math.PI * 2 });
        }
      }
    }

    const pine = this.makePineGeometries();
    const oak = this.makeOakGeometries();
    const foliageMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });

    const groups = [
      { list: trees.filter((t) => !t.oak), geo: pine, hue: 0.37, light: 0.2 },
      { list: trees.filter((t) => t.oak), geo: oak, hue: 0.26, light: 0.3 },
    ];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const col = new THREE.Color();
    for (const grp of groups) {
      const n = grp.list.length;
      if (!n) continue;
      const fol = new THREE.InstancedMesh(grp.geo.foliage, foliageMat, n);
      const trk = new THREE.InstancedMesh(grp.geo.trunk, trunkMat, n);
      grp.list.forEach((t, i) => {
        q.setFromAxisAngle(up, t.rot);
        p.set(t.x, 0, t.z);
        s.set(t.s, t.s * (0.9 + rng() * 0.3), t.s);
        m.compose(p, q, s);
        fol.setMatrixAt(i, m);
        trk.setMatrixAt(i, m);
        col.setHSL(grp.hue + (rng() - 0.5) * 0.06, 0.45 + rng() * 0.2, grp.light + (rng() - 0.5) * 0.08);
        fol.setColorAt(i, col);
        col.setHSL(0.07 + rng() * 0.03, 0.4, 0.2 + rng() * 0.08);
        trk.setColorAt(i, col);
      });
      for (const mesh of [fol, trk]) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        this.scene.add(mesh);
      }
    }
    this.treeCount = trees.length;
  }

  // ---- rocks --------------------------------------------------------------
  buildRocks() {
    const rng = this.rng;
    const N = 10;
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    const mesh = new THREE.InstancedMesh(geo, mat, N);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const col = new THREE.Color();
    const lim = this.half - 2;
    let placed = 0;
    let tries = 0;
    while (placed < N && tries++ < 500) {
      const x = (rng() * 2 - 1) * lim;
      const z = (rng() * 2 - 1) * lim;
      if (Math.hypot(x, z) < 5) continue;
      const sc = 0.6 + rng() * 0.9;
      if (this.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + sc + 1.2)) continue;
      e.set((rng() - 0.5) * 0.4, rng() * Math.PI * 2, (rng() - 0.5) * 0.4);
      q.setFromEuler(e);
      p.set(x, sc * 0.45, z);
      s.set(sc * (0.9 + rng() * 0.4), sc * 0.7, sc * (0.9 + rng() * 0.4));
      m.compose(p, q, s);
      mesh.setMatrixAt(placed, m);
      const g = 0.4 + rng() * 0.16;
      col.setRGB(g, g * 0.98, g * 0.94);
      mesh.setColorAt(placed, col);
      this.obstacles.push({ x, z, r: sc * 0.9 });
      placed++;
    }
    mesh.count = placed;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  // ---- queries ------------------------------------------------------------
  // Push a circle out of obstacles and clamp it inside the playable bounds.
  resolveCircle(pos, r) {
    for (const o of this.obstacles) {
      const dx = pos.x - o.x;
      const dz = pos.z - o.z;
      const min = o.r + r;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min) {
        const d = Math.sqrt(d2) || 0.0001;
        const k = (min - d) / d;
        pos.x += (d2 === 0 ? 1 : dx) * k;
        pos.z += (d2 === 0 ? 0 : dz) * k;
      }
    }
    const lim = this.half - r;
    pos.x = Math.max(-lim, Math.min(lim, pos.x));
    pos.z = Math.max(-lim, Math.min(lim, pos.z));
    return pos;
  }

  randomOpenPoint(avoidPos, minDist = 0) {
    const out = new THREE.Vector3();
    const lim = this.half - 2;
    for (let i = 0; i < 60; i++) {
      out.set((Math.random() * 2 - 1) * lim, 0, (Math.random() * 2 - 1) * lim);
      if (avoidPos && Math.hypot(out.x - avoidPos.x, out.z - avoidPos.z) < minDist) continue;
      if (this.obstacles.some((o) => Math.hypot(o.x - out.x, o.z - out.z) < o.r + 1.2)) continue;
      return out;
    }
    return out;
  }

  // Sun (and its shadow frustum) follows the hero, snapped to shadow texels to avoid shimmer.
  update() {
    const hero = this.game.hero;
    if (!hero) return;
    const texel = 36 / 2048;
    const tx = Math.round(hero.position.x / texel) * texel;
    const tz = Math.round(hero.position.z / texel) * texel;
    this.sun.target.position.set(tx, 0, tz);
    this.sun.position.set(tx + SUN_OFFSET.x, SUN_OFFSET.y, tz + SUN_OFFSET.z);
  }
}
