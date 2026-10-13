import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CONFIG } from '../core/config.js';
import { mulberry32 } from '../core/rng.js';
import { blobShadowAssets } from './blobShadow.js';

// Mobile-style meadow: flat saturated ground, a stone rim, a few chunky trees/rocks, blob shadows.
// Map code is isolated here; the grass system was removed (tuft methods are kept as no-ops).
export class World {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.half = CONFIG.map.playHalf;
    this.obstacles = [];
    this.rng = mulberry32(CONFIG.map.seed);
    this.shadowSpots = []; // {x,z,size} for static blob shadows

    this.buildLights();
    this.buildGround();
    this.buildBorder();
    this.buildTrees();
    this.buildRocks();
    this.buildStaticShadows();
  }

  // ---- lights (no shadow maps) --------------------------------------------
  buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xb5d99a, 1.9));
    const sun = new THREE.DirectionalLight(0xfff4dc, 1.5);
    sun.position.set(12, 22, 8);
    this.scene.add(sun);
    this.sun = sun;
  }

  // ---- ground -------------------------------------------------------------
  buildGround() {
    // Outer skirt (darker, fades into fog) + play field with a soft vignette texture.
    const outerGeo = new THREE.PlaneGeometry(260, 260);
    outerGeo.rotateX(-Math.PI / 2);
    const outer = new THREE.Mesh(outerGeo, new THREE.MeshLambertMaterial({ color: 0x5fa845 }));
    outer.position.y = -0.4;
    this.scene.add(outer);

    const S = 128;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d');
    g.fillStyle = '#7cc35a';
    g.fillRect(0, 0, S, S);
    const patches = [[0.25, 0.3, 0.3], [0.75, 0.65, 0.35], [0.55, 0.15, 0.2], [0.2, 0.8, 0.25]];
    for (const [px, py, pr] of patches) {
      const gr = g.createRadialGradient(px * S, py * S, 0, px * S, py * S, pr * S);
      gr.addColorStop(0, 'rgba(160,220,110,0.35)');
      gr.addColorStop(1, 'rgba(160,220,110,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, S, S);
    }
    const vg = g.createRadialGradient(S / 2, S / 2, S * 0.35, S / 2, S / 2, S * 0.75);
    vg.addColorStop(0, 'rgba(40,110,40,0)');
    vg.addColorStop(1, 'rgba(40,110,40,0.28)');
    g.fillStyle = vg;
    g.fillRect(0, 0, S, S);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 1;
    this.groundTex = tex;

    const w = this.half * 2 + 4;
    const geo = new THREE.PlaneGeometry(w, w);
    geo.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
    this.scene.add(ground);
    this.ground = ground;

    // Sandy clearing at spawn.
    const cg = new THREE.CircleGeometry(5, 32);
    cg.rotateX(-Math.PI / 2);
    const clearing = new THREE.Mesh(cg, new THREE.MeshLambertMaterial({ color: 0xe6d29a }));
    clearing.position.y = 0.01;
    this.scene.add(clearing);
  }

  // Low stone rim around the play field (4 boxes) with a darker cliff face below it.
  buildBorder() {
    const h = this.half;
    const t = 1.6;
    const wallH = 0.9;
    const L = (h + t) * 2;
    const mk = (w, d, x, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), this.wallMat);
      m.position.set(x, wallH / 2 - 0.05, z);
      this.scene.add(m);
    };
    this.wallMat = new THREE.MeshLambertMaterial({ color: 0xc9b98f });
    const o = h + t / 2 + 0.3;
    mk(L, t, 0, -o); mk(L, t, 0, o); mk(t, L - t * 2, -o, 0); mk(t, L - t * 2, o, 0);
    // dark base so the rim reads as a raised edge
    const baseMat = new THREE.MeshLambertMaterial({ color: 0x8d7a55 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(L + 1.2, 0.3, L + 1.2), baseMat);
    base.position.y = -0.2;
    // (hidden under the ground plane; only the outer lip peeks out)
    this.scene.add(base);
  }

  // Grass methods are no-ops now; FireField/Game still call them.
  indexTufts() {}
  burnTufts() {}
  regrowTufts() {}

  // ---- trees --------------------------------------------------------------
  buildTrees() {
    const rng = this.rng;
    const trees = [];
    let tries = 0;
    const lim = this.half - 3;
    while (trees.length < 10 && tries++ < 600) {
      const x = (rng() * 2 - 1) * lim;
      const z = (rng() * 2 - 1) * lim;
      if (Math.hypot(x, z) < 8) continue;
      if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 7)) continue;
      const s = 1.0 + rng() * 0.5;
      trees.push({ x, z, s, round: rng() < 0.5, rot: rng() * Math.PI * 2 });
      this.obstacles.push({ x, z, r: 0.45 * s });
      this.shadowSpots.push({ x, z, size: 3.4 * s });
    }

    // two chunky silhouettes: cone-stack pine and round bush-tree (<= 8 segments)
    const pineF = mergeGeometries([
      new THREE.ConeGeometry(1.2, 1.7, 8).translate(0, 1.7, 0),
      new THREE.ConeGeometry(0.85, 1.5, 8).translate(0, 2.7, 0),
    ]);
    const roundF = mergeGeometries([
      new THREE.IcosahedronGeometry(1.15, 0).translate(0, 2.2, 0),
      new THREE.IcosahedronGeometry(0.75, 0).translate(0.5, 3.0, 0.2),
    ]);
    const trunk = new THREE.CylinderGeometry(0.22, 0.3, 1.4, 6).translate(0, 0.7, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const col = new THREE.Color();
    const groups = [
      { list: trees.filter((t) => !t.round), geo: pineF, colors: [0x2f9a4a, 0x3aa856] },
      { list: trees.filter((t) => t.round), geo: roundF, colors: [0x5cc04a, 0x6fd055] },
    ];
    for (const grp of groups) {
      const n = grp.list.length;
      if (!n) continue;
      const fol = new THREE.InstancedMesh(grp.geo, mat, n);
      const trk = new THREE.InstancedMesh(trunk, mat, n);
      grp.list.forEach((t, i) => {
        q.setFromAxisAngle(up, t.rot);
        p.set(t.x, 0, t.z);
        sc.set(t.s, t.s, t.s);
        m.compose(p, q, sc);
        fol.setMatrixAt(i, m);
        trk.setMatrixAt(i, m);
        fol.setColorAt(i, col.setHex(grp.colors[i % grp.colors.length]));
        trk.setColorAt(i, col.setHex(0x8a5a34));
      });
      for (const mesh of [fol, trk]) {
        mesh.frustumCulled = false;
        this.scene.add(mesh);
      }
    }
    this.treeCount = trees.length;
  }

  // ---- rocks --------------------------------------------------------------
  buildRocks() {
    const rng = this.rng;
    const N = 6;
    const mesh = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(1, 0),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
      N,
    );
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const col = new THREE.Color();
    const lim = this.half - 2;
    let placed = 0;
    let tries = 0;
    while (placed < N && tries++ < 500) {
      const x = (rng() * 2 - 1) * lim;
      const z = (rng() * 2 - 1) * lim;
      if (Math.hypot(x, z) < 7) continue;
      const sc = 0.7 + rng() * 0.6;
      if (this.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + sc + 2)) continue;
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rng() * 6.28);
      p.set(x, sc * 0.5, z);
      s.set(sc, sc * 0.75, sc);
      m.compose(p, q, s);
      mesh.setMatrixAt(placed, m);
      mesh.setColorAt(placed, col.setHex(rng() < 0.5 ? 0xb9bec8 : 0xa4aab6));
      this.obstacles.push({ x, z, r: sc * 0.9 });
      this.shadowSpots.push({ x, z, size: sc * 3 });
      placed++;
    }
    mesh.count = placed;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  // One instanced draw call for every static blob shadow.
  buildStaticShadows() {
    const { geo, mat } = blobShadowAssets();
    const n = this.shadowSpots.length;
    if (!n) return;
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    this.shadowSpots.forEach((sp, i) => {
      p.set(sp.x + 0.2, 0.03, sp.z + 0.15);
      s.set(sp.size, 1, sp.size);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    });
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

  update() {}
}
