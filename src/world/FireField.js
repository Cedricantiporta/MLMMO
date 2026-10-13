import * as THREE from 'three';
import { CONFIG } from '../core/config.js';
import { hash01, rand } from '../core/rng.js';

const MAX_FLAMES = 800;
const YELLOW = new THREE.Color(0xffd23a);
const ORANGE = new THREE.Color(0xff5a14);

// Grid of ground cells that can burn and then stay scorched before it fades.
export class FireField {
  constructor(game) {
    this.game = game;
    this.size = CONFIG.map.size;
    this.cell = CONFIG.map.cellSize;
    this.n = Math.round(this.size / this.cell);
    this.burn = new Float32Array(this.n * this.n);
    this.scorch = new Float32Array(this.n * this.n);
    this.active = new Set(); // burning cells
    this.scorched = new Set(); // cells with any scorch (superset of active)
    this.time = 0;
    this._activeList = [];
    this._p = new THREE.Vector3();

    this.buildOverlay();
    this.buildFlames();
  }

  buildOverlay() {
    const n = this.n;
    this.pixels = new Uint8Array(n * n * 4);
    this.tex = new THREE.DataTexture(this.pixels, n, n, THREE.RGBAFormat);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = false;
    this.tex.needsUpdate = true;

    const mat = new THREE.MeshBasicMaterial({
      map: this.tex, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const geo = new THREE.PlaneGeometry(this.size, this.size);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.02;
    mesh.renderOrder = 1;
    this.game.scene.add(mesh);
    this.overlay = mesh;
  }

  buildFlames() {
    const geo = new THREE.ConeGeometry(0.2, 1, 4);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.flames = new THREE.InstancedMesh(geo, mat, MAX_FLAMES);
    this.flames.frustumCulled = false;
    this.flames.count = 0;
    this.flames.renderOrder = 4;
    this.flames.setColorAt(0, YELLOW); // allocate instanceColor
    this.game.scene.add(this.flames);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._pos = new THREE.Vector3();
    this._col = new THREE.Color();
  }

  cellIndex(x, z) {
    const half = this.size / 2;
    const ix = Math.floor((x + half) / this.cell);
    const iz = Math.floor((z + half) / this.cell);
    if (ix < 0 || iz < 0 || ix >= this.n || iz >= this.n) return -1;
    return iz * this.n + ix;
  }

  isBurning(x, z) {
    const c = this.cellIndex(x, z);
    return c >= 0 && this.burn[c] > 0;
  }

  // Set every cell whose centre lies within `radius` of pos on fire for ~duration seconds.
  ignite(pos, radius, duration) {
    const half = this.size / 2;
    const n = this.n;
    const i0 = Math.max(0, Math.floor((pos.x - radius + half) / this.cell));
    const i1 = Math.min(n - 1, Math.floor((pos.x + radius + half) / this.cell));
    const j0 = Math.max(0, Math.floor((pos.z - radius + half) / this.cell));
    const j1 = Math.min(n - 1, Math.floor((pos.z + radius + half) / this.cell));
    for (let iz = j0; iz <= j1; iz++) {
      for (let ix = i0; ix <= i1; ix++) {
        const cx = (ix + 0.5) * this.cell - half;
        const cz = (iz + 0.5) * this.cell - half;
        if (Math.hypot(cx - pos.x, cz - pos.z) > radius) continue;
        const c = iz * n + ix;
        this.burn[c] = Math.max(this.burn[c], duration * rand(0.75, 1.25));
        this.scorch[c] = 1;
        this.active.add(c);
        this.scorched.add(c);
        this.game.world.burnTufts(c);
      }
    }
  }

  update(dt) {
    this.time += dt;
    const g = this.game;
    const n = this.n;
    const px = this.pixels;
    let dirty = false;

    // Advance burn and scorch timers.
    for (const c of this.active) {
      this.burn[c] -= dt;
      if (this.burn[c] <= 0) {
        this.burn[c] = 0;
        this.active.delete(c);
      }
    }
    for (const c of this.scorched) {
      const iz = Math.floor(c / n);
      const ix = c - iz * n;
      const o = ((n - 1 - iz) * n + ix) * 4;
      if (this.burn[c] <= 0) this.scorch[c] -= dt / CONFIG.fire.scorchFade;
      if (this.scorch[c] <= 0) {
        this.scorch[c] = 0;
        this.scorched.delete(c);
        px[o] = px[o + 1] = px[o + 2] = px[o + 3] = 0;
        g.world.regrowTufts(c);
        dirty = true;
        continue;
      }
      const sc = this.scorch[c];
      if (this.burn[c] > 0) {
        const f = 0.5 + 0.5 * Math.sin(this.time * 11 + hash01(c) * 6.283);
        px[o] = 255;
        px[o + 1] = 90 + 80 * f;
        px[o + 2] = 20;
        px[o + 3] = 110 + 90 * f;
      } else {
        px[o] = 14; px[o + 1] = 11; px[o + 2] = 9;
        px[o + 3] = 175 * Math.min(1, sc * 1.4);
      }
      dirty = true;
    }
    if (dirty) this.tex.needsUpdate = true;

    this.updateFlames();
    this.applyBurnStatus();
  }

  updateFlames() {
    const list = this._activeList;
    list.length = 0;
    let count = 0;
    const half = this.size / 2;
    const n = this.n;
    const m = this._m;
    const q = this._q;
    const s = this._s;
    const p = this._pos;
    const col = this._col;
    for (const c of this.active) {
      list.push(c);
      if (count + 2 > MAX_FLAMES) continue;
      const iz = Math.floor(c / n);
      const ix = c - iz * n;
      const cx = (ix + 0.5) * this.cell - half;
      const cz = (iz + 0.5) * this.cell - half;
      const fade = Math.min(1, this.burn[c] / 0.7);
      for (let k = 0; k < 2; k++) {
        const h = hash01(c * 2 + k);
        const h2 = hash01(c * 3 + k + 7);
        const flick = 0.5 + 0.5 * Math.sin(this.time * (8 + h * 6) + h * 40);
        const height = (0.45 + 0.7 * flick) * (0.7 + h2 * 0.6) * fade;
        const wid = (0.7 + 0.5 * h) * fade;
        p.set(cx + (h - 0.5) * this.cell * 0.9, 0.02, cz + (h2 - 0.5) * this.cell * 0.9);
        q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, h * 6.28);
        s.set(wid, height, wid);
        m.compose(p, q, s);
        this.flames.setMatrixAt(count, m);
        col.copy(YELLOW).lerp(ORANGE, 1 - flick);
        this.flames.setColorAt(count, col);
        count++;
      }
    }
    this.flames.count = count;
    this.flames.instanceMatrix.needsUpdate = true;
    if (this.flames.instanceColor) this.flames.instanceColor.needsUpdate = true;

    // Embers and the occasional smoke wisp from a random burning cell.
    if (list.length) {
      const dt = this.game.lastDt || 0.016;
      let budget = Math.min(3, list.length * dt * 0.5);
      while (budget > 0) {
        if (Math.random() >= budget) break;
        budget -= 1;
        const c = list[(Math.random() * list.length) | 0];
        const iz = Math.floor(c / n);
        const ix = c - iz * n;
        this._pos.set((ix + Math.random()) * this.cell - half, 0.3, (iz + Math.random()) * this.cell - half);
        this.game.particles.emit(this._pos, {
          vx: rand(-0.3, 0.3), vy: rand(1.4, 3), vz: rand(-0.3, 0.3),
          color: Math.random() < 0.5 ? 0xff9a30 : 0xffd060, size: rand(0.06, 0.12),
          life: rand(0.8, 1.6), additive: true, drag: 0.3,
        });
        if (Math.random() < 0.2) {
          this._pos.y = 0.8;
          this.game.particles.emit(this._pos, {
            vy: rand(0.8, 1.4), color: 0x3a3430, alpha: 0.35, size: 0.5, life: 1.6, grow: 0.5,
          });
        }
      }
    }
  }

  applyBurnStatus() {
    const g = this.game;
    const { dps, statusDuration } = CONFIG.fire;
    const hero = g.hero;
    if (hero?.alive && this.isBurning(hero.position.x, hero.position.z)) hero.status.applyBurn(dps, statusDuration);
    for (const e of g.enemies) {
      if (e.alive && this.isBurning(e.position.x, e.position.z)) e.status.applyBurn(dps, statusDuration);
    }
  }
}
