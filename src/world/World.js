import * as THREE from 'three';
import { CONFIG } from '../core/config.js';
import { mulberry32 } from '../core/rng.js';
import { blobShadowAssets } from './blobShadow.js';
import { paintGround } from './groundPaint.js';
import { WALLS, RIVER, RIVER_CURVE, riverDistance, sampleChain } from './layout.js';
import { buildCliffs } from './cliffs.js';
import { buildRuins } from './ruins.js';
import { buildWater, BED_DEPTH } from './water.js';
import { treeGeometry, bushGeometry, fernGeometry, boulderGeometry } from './foliage.js';

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Moody jungle arena: raised cliff walls, a shallow river, ancient ruins, dense foliage, blob shadows.
// Everything is merged / instanced (≈ 20 draw calls). Tuft methods are no-ops kept for the contract.
export class World {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.half = CONFIG.map.playHalf;
    this.obstacles = [];
    this.rng = mulberry32(CONFIG.map.seed);
    this.shadowSpots = [];
    this.time = 0;
    this.lit = new THREE.Vector3();

    this.buildLights();
    this.buildGround();
    this.buildCliffs();
    this.buildWater();
    this.buildRuins();
    this.buildFoliage();
    this.buildStaticShadows();
    this.buildHeroGlow();
  }

  buildLights() {
    this.scene.add(new THREE.HemisphereLight(0x7fc4bd, 0x1b3324, 1.25));
    const key = new THREE.DirectionalLight(0xffd9a0, 2.1); // warm golden key from one side
    key.position.set(-16, 20, 10);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x4aa9b8, 0.55); // cool fill from the opposite side
    rim.position.set(14, 8, -12);
    this.scene.add(rim);
    this.sun = key;
  }

  // ---- ground: one subdivided plane, river bed carved into it, painted texture ----
  buildGround() {
    const outer = new THREE.Mesh(
      new THREE.PlaneGeometry(300, 300).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0x14301f }),
    );
    outer.position.y = -0.45;
    this.scene.add(outer);

    const size = CONFIG.map.size;
    const { canvas } = paintGround({ size, px: 2048, seed: CONFIG.map.seed });
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.game.renderer?.capabilities.getMaxAnisotropy?.() ?? 1;
    this.groundTex = tex;

    const seg = 96;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg).rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    const rw = RIVER.w / 2;
    for (let i = 0; i < p.count; i++) {
      const d = riverDistance(p.getX(i), p.getZ(i));
      if (d < rw + 1.2) p.setY(i, -BED_DEPTH * smooth(rw + 1.1, rw - 0.4, d));
    }
    geo.computeVertexNormals();
    this.ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
    this.scene.add(this.ground);
  }

  buildCliffs() {
    const { geo, obstacles, tops } = buildCliffs();
    this.tops = tops;
    this.obstacles.push(...obstacles);
    this.cliffMesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.scene.add(this.cliffMesh);
  }

  buildWater() {
    const { mesh, mat } = buildWater();
    this.water = mesh;
    this.waterMat = mat;
    this.scene.add(mesh);
  }

  buildRuins() {
    const { geo, obstacles, shadows } = buildRuins();
    this.obstacles.push(...obstacles);
    this.shadowSpots.push(...shadows);
    this.scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  }

  // ---- vegetation ---------------------------------------------------------
  buildFoliage() {
    const rng = this.rng;
    const white = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const white2 = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    const blockedByWall = (x, z, pad) => this.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + pad);
    const awayFromSpawn = (x, z, d) => Math.hypot(x, z) > d;
    const inWall = (x, z) => this.wallDistance(x, z) < 0.4;

    // trees
    const near = [], far = [];
    const L = this.half;
    // overhanging cliff-top trees (west / north / east outer cliffs, plus interior plateaus)
    for (let i = -L + 3; i < L - 1; i += 4.6) {
      const j = (rng() - 0.5) * 1.6;
      far.push({ x: -L - 0.7 + rng() * 0.8, z: i + j, y: 3.2, s: 0.8 + rng() * 0.35 });
      far.push({ x: i + j, z: -L - 0.7 + rng() * 0.8, y: 3.2, s: 0.8 + rng() * 0.35 });
      far.push({ x: L + 0.7 - rng() * 0.8, z: i + j, y: 3.2, s: 0.8 + rng() * 0.35 });
    }
    // back ring on the outside
    for (let i = -L - 2; i <= L + 2; i += 5) {
      far.push({ x: -L - 5 + rng() * 2, z: i, y: 0, s: 1.5 + rng() }, { x: i, z: -L - 5 + rng() * 2, y: 0, s: 1.5 + rng() }, { x: L + 5 - rng() * 2, z: i, y: 0, s: 1.5 + rng() });
      far.push({ x: i, z: L + 5 + rng() * 2, y: 0, s: 1.0 + rng() * 0.4 });
    }
    // interior plateau trees on top of the cliffs
    const interior = this.tops.filter((t) => t.wall === 'w1' || t.wall === 'w2');
    for (let n = 0; n < 9; n++) {
      const t = interior[(rng() * interior.length) | 0];
      if (!t) break;
      near.push({ x: t.x + t.nx * (rng() - 0.5) * 0.8, z: t.z + t.nz * (rng() - 0.5) * 0.8, y: t.h - 0.2, s: 0.6 + rng() * 0.25, onCliff: true });
    }
    // ground trees hugging wall bases
    let tries = 0, placed = 0;
    while (placed < 12 && tries++ < 600) {
      const t = this.tops[(rng() * this.tops.length) | 0];
      if (t.wall === 'outer' || t.wall === 'south') continue;
      const side = rng() < 0.5 ? -1 : 1;
      const off = t.t / 2 + 1.1 + rng() * 1.6;
      const x = t.x + t.nx * off * side, z = t.z + t.nz * off * side;
      if (Math.abs(x) > L - 2 || Math.abs(z) > L - 2) continue;
      if (!awayFromSpawn(x, z, 9) || riverDistance(x, z) < 3.4 || blockedByWall(x, z, 1.3)) continue;
      if (near.some((n) => !n.onCliff && Math.hypot(n.x - x, n.z - z) < 7)) continue;
      const s = 0.7 + rng() * 0.3;
      near.push({ x, z, y: 0, s });
      this.obstacles.push({ x, z, r: 0.5 * s });
      this.shadowSpots.push({ x, z, size: 4 * s });
      placed++;
    }
    const mkTrees = (list, detail, seed) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(treeGeometry(detail, seed), white, list.length);
      list.forEach((t, i) => {
        dummy.position.set(t.x, t.y, t.z);
        dummy.rotation.set(0, rng() * 6.28, 0);
        dummy.scale.setScalar(t.s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        const v = 0.65 + rng() * 0.35;
        mesh.setColorAt(i, col.setRGB(v * (0.9 + rng() * 0.2), v, v * (0.9 + rng() * 0.2)));
      });
      mesh.frustumCulled = false;
      this.scene.add(mesh);
    };
    mkTrees(near, 1, 3);
    mkTrees(far, 0, 7);

    // bushes / ferns: along wall bases, river banks, and on cliff-top edges
    const bushes = [], ferns = [];
    const add = (arr, x, z, y, s) => arr.push({ x, z, y, s });
    for (const t of this.tops) {
      if (t.wall === 'south') {
        if (rng() < 0.6) add(bushes, t.x + t.nx * 0.5, t.z + t.nz * 0.5, t.h, 1.2 + rng() * 0.8);
        continue;
      }
      // cliff-top edge clumps (inner side, overhanging)
      const sideTop = t.wall === 'outer' ? -Math.sign(t.nx * t.x + t.nz * t.z) || 1 : (rng() < 0.5 ? -1 : 1);
      if (rng() < 0.55) add(rng() < 0.5 ? bushes : ferns, t.x + t.nx * sideTop * (t.t / 2 - 0.5), t.z + t.nz * sideTop * (t.t / 2 - 0.5), t.h, 0.9 + rng() * 0.8);
      // base clumps
      for (let side = -1; side <= 1; side += 2) {
        if (rng() > 0.55) continue;
        const off = t.t / 2 + 0.3 + rng() * 1.2;
        const x = t.x + t.nx * off * side, z = t.z + t.nz * off * side;
        if (Math.abs(x) > L - 0.5 || Math.abs(z) > L - 0.5) continue;
        if (!awayFromSpawn(x, z, 6.5) || this.wallDistance(x, z) < 0.3) continue;
        add(rng() < 0.5 ? bushes : ferns, x, z, 0, 0.8 + rng() * 0.9);
      }
    }
    // river banks + scattered undergrowth
    const rs = sampleChain(RIVER_CURVE, 1.6);
    for (const r of rs) {
      for (let side = -1; side <= 1; side += 2) {
        if (rng() > 0.45) continue;
        const off = RIVER.w / 2 + 1.2 + rng() * 1.2;
        const x = r.x + -r.tz * off * side, z = r.z + r.tx * off * side;
        if (Math.abs(x) > L - 0.5 || Math.abs(z) > L - 0.5 || this.wallDistance(x, z) < 0.5 || !awayFromSpawn(x, z, 6.5)) continue;
        add(rng() < 0.6 ? ferns : bushes, x, z, 0, 0.8 + rng() * 0.8);
      }
    }
    for (let n = 0, tr = 0; n < 70 && tr < 400; tr++) {
      const x = (rng() * 2 - 1) * (L - 1), z = (rng() * 2 - 1) * (L - 1);
      if (!awayFromSpawn(x, z, 8) || riverDistance(x, z) < 2.4 || this.wallDistance(x, z) < 0.6) continue;
      add(rng() < 0.5 ? ferns : bushes, x, z, 0, 0.7 + rng() * 0.7);
      n++;
    }
    const mk = (list, geo, mat) => {
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((b, i) => {
        dummy.position.set(b.x, b.y, b.z);
        dummy.rotation.set(0, rng() * 6.28, 0);
        dummy.scale.set(b.s, b.s * (0.8 + rng() * 0.4), b.s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        const v = 0.55 + rng() * 0.45;
        mesh.setColorAt(i, col.setRGB(v * (0.85 + rng() * 0.3), v, v * (0.85 + rng() * 0.3)));
      });
      mesh.frustumCulled = false;
      this.scene.add(mesh);
    };
    mk(bushes, bushGeometry(), white);
    mk(ferns, fernGeometry(), white2);

    // boulders along the lanes
    const rocks = [];
    for (let n = 0, tr = 0; n < 9 && tr < 500; tr++) {
      const x = (rng() * 2 - 1) * (L - 2), z = (rng() * 2 - 1) * (L - 2);
      if (!awayFromSpawn(x, z, 9) || riverDistance(x, z) < 3 || blockedByWall(x, z, 2.2)) continue;
      const s = 0.8 + rng() * 0.7;
      rocks.push({ x, z, y: 0, s });
      this.obstacles.push({ x, z, r: s * 0.85 });
      this.shadowSpots.push({ x, z, size: s * 3.2 });
      n++;
    }
    mk(rocks, boulderGeometry(), white);
  }

  // distance from (x,z) to the nearest wall footprint (negative inside)
  wallDistance(x, z) {
    let best = 1e9;
    for (const w of WALLS) {
      for (let i = 0; i < w.pts.length - 1; i++) {
        const [ax, az] = w.pts[i], [bx, bz] = w.pts[i + 1];
        const dx = bx - ax, dz = bz - az;
        const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
        const d = Math.hypot(x - (ax + dx * u), z - (az + dz * u)) - w.t / 2;
        if (d < best) best = d;
      }
    }
    return best;
  }

  // Grass methods are no-ops; FireField/Game still call them.
  indexTufts() {}
  burnTufts() {}
  regrowTufts() {}

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

  // Soft warm additive glow under the hero so it reads against the dark environment.
  buildHeroGlow() {
    const S = 128;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const c = cv.getContext('2d');
    const gr = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(255,240,200,0.9)');
    gr.addColorStop(0.45, 'rgba(255,225,170,0.35)');
    gr.addColorStop(1, 'rgba(255,220,160,0)');
    c.fillStyle = gr;
    c.fillRect(0, 0, S, S);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.glow = new THREE.Mesh(
      new THREE.PlaneGeometry(5.2, 5.2).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }),
    );
    this.glow.position.y = 0.045;
    this.glow.renderOrder = 3;
    this.scene.add(this.glow);
  }

  // ---- queries ------------------------------------------------------------
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

  // Inside the play bounds and not inside any wall / prop circle (rivers are shallow = walkable).
  isWalkable(x, z, margin = 0) {
    const lim = this.half - 1;
    if (Math.abs(x) > lim || Math.abs(z) > lim) return false;
    for (const o of this.obstacles) {
      const rr = o.r + margin;
      if ((o.x - x) * (o.x - x) + (o.z - z) * (o.z - z) < rr * rr) return false;
    }
    return true;
  }

  randomOpenPoint(avoidPos, minDist = 0) {
    const out = new THREE.Vector3();
    const lim = this.half - 2;
    for (let i = 0; i < 120; i++) {
      out.set((Math.random() * 2 - 1) * lim, 0, (Math.random() * 2 - 1) * lim);
      if (avoidPos && Math.hypot(out.x - avoidPos.x, out.z - avoidPos.z) < minDist) continue;
      if (!this.isWalkable(out.x, out.z, 1.2)) continue;
      return out;
    }
    out.set(0, 0, 4); // always-open fallback near the spawn glade
    return out;
  }

  update(dt) {
    this.time += dt;
    if (this.waterMat) this.waterMat.uniforms.time.value = this.time;
    const h = this.game.hero;
    if (h && this.glow) this.glow.position.set(h.position.x, 0.045, h.position.z);
  }
}
