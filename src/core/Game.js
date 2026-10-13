import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Input } from './Input.js';
import { CameraRig } from './CameraRig.js';
import { Particles } from '../fx/Particles.js';
import { Effects } from '../fx/Effects.js';
import { World } from '../world/World.js';
import { FireField } from '../world/FireField.js';
import { HUD } from '../ui/HUD.js';
import { ElfArcher } from '../entities/ElfArcher.js';
import { Spawner } from '../systems/Spawner.js';
import { HealthOrb } from '../entities/HealthOrb.js';

const SKY = 0xa9d6ee;

export class Game {
  constructor(container) {
    this.container = container;
    this.time = 0;
    this.paused = false;
    this.frameId = 0;
    this.lastDt = 0.016;
    this.enemies = [];
    this.actors = [];
    this.timers = [];
    this.stats = { kills: 0 };
    this.killsSinceOrb = 0;
    this.frustum = new THREE.Frustum();
    this._pv = new THREE.Matrix4();
    this._sphere = new THREE.Sphere();
    this._last = 0;

    // renderer / scene / camera
    const dpr = window.devicePixelRatio || 1;
    this.renderer = new THREE.WebGLRenderer({ antialias: dpr <= 1, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(dpr, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = false; // blob shadows instead
    this.renderer.toneMapping = THREE.NoToneMapping; // flat, saturated mobile look
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SKY);
    this.scene.fog = new THREE.Fog(SKY, 55, 95);
    this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, window.innerWidth / window.innerHeight, 0.5, 200);

    // systems, in contract order
    this.input = new Input();
    this.cameraRig = new CameraRig(this.camera, this.renderer.domElement);
    this.particles = new Particles(this);
    this.fx = new Effects(this);
    this.world = new World(this);
    this.fire = new FireField(this);
    this.world.indexTufts(this.fire); // no-op (grass removed)
    this.hero = new ElfArcher(this);
    this.hud = new HUD(this);
    this.spawner = new Spawner(this);
    this.cameraRig.snap(this.hero.position);

    this.input.onKey('KeyP', () => { this.paused = !this.paused; });
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.particles.resize();
  }

  start() {
    this._last = performance.now();
    const loop = (now) => {
      requestAnimationFrame(loop);
      const dt = Math.min(0.05, Math.max(0, (now - this._last) / 1000));
      this._last = now;
      this.frame(dt);
    };
    requestAnimationFrame(loop);
  }

  frame(dt) {
    if (!this.paused) this.update(dt);
    this.hud.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  // ---- simulation ---------------------------------------------------------
  update(dt) {
    this.time += dt;
    this.frameId++;
    this.lastDt = dt;

    // camera frustum for on-screen tests
    this.camera.updateMatrixWorld();
    this._pv.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this._pv);

    // timers
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) {
        this.timers.splice(i, 1);
        t.fn();
      }
    }

    this.hero.update(dt);
    this.tickUnit(this.hero, dt);
    for (const e of this.enemies) {
      e.update(dt);
      this.tickUnit(e, dt);
    }

    this.separate();
    this.fire.update(dt);

    // actors: update returns false when finished
    for (let i = this.actors.length - 1; i >= 0; i--) {
      const a = this.actors[i];
      if (a.update(dt) === false) {
        this.actors.splice(i, 1);
        a.dispose?.();
      }
    }

    // drop finished enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.removed) {
        this.enemies.splice(i, 1);
        e.dispose();
      }
    }

    this.spawner.update(dt);
    this.particles.update(dt);
    this.world.update(dt);
    this.cameraRig.update(dt, this.hero.position);
  }

  // Status + flash are guarded per frame, so units may also tick them themselves.
  tickUnit(u, dt) {
    u.status.update(dt);
    u.updateFlash(dt);
  }

  // Keep units from overlapping each other; frozen units are immovable.
  separate() {
    const list = this.enemies;
    const hero = this.hero;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b.alive) continue;
        this.pushApart(a, b, 0.5);
      }
      if (hero.alive) this.pushApart(hero, a, 0.3);
    }
    for (const e of list) if (e.alive) this.world.resolveCircle(e.position, e.radius);
    this.world.resolveCircle(hero.position, hero.radius);
  }

  // `shareA` is the fraction of the overlap that unit `a` absorbs.
  pushApart(a, b, shareA) {
    const dx = b.position.x - a.position.x;
    const dz = b.position.z - a.position.z;
    const min = a.radius + b.radius;
    const d2 = dx * dx + dz * dz;
    if (d2 >= min * min) return;
    const fa = a.frozen;
    const fb = b.frozen;
    if (fa && fb) return;
    const d = Math.sqrt(d2);
    let nx = 1;
    let nz = 0;
    if (d > 1e-4) { nx = dx / d; nz = dz / d; } else { const r = Math.random() * 6.283; nx = Math.cos(r); nz = Math.sin(r); }
    const overlap = min - d;
    const sa = fa ? 0 : fb ? 1 : shareA;
    a.position.x -= nx * overlap * sa;
    a.position.z -= nz * overlap * sa;
    b.position.x += nx * overlap * (1 - sa);
    b.position.z += nz * overlap * (1 - sa);
  }

  // ---- services -----------------------------------------------------------
  addActor(a) {
    this.actors.push(a);
    return a;
  }

  after(seconds, fn) {
    this.timers.push({ t: seconds, fn });
  }

  isOnScreen(v) {
    this._sphere.center.set(v.x, v.y + 0.5, v.z);
    this._sphere.radius = 0.6;
    return this.frustum.intersectsSphere(this._sphere);
  }

  enemiesInRadius(pos, r, exclude) {
    const out = [];
    for (const e of this.enemies) {
      if (!e.alive || e === exclude) continue;
      if (Math.hypot(e.position.x - pos.x, e.position.z - pos.z) <= r + e.radius) out.push(e);
    }
    return out;
  }

  unitsInRadius(pos, r, exclude) {
    const out = this.enemiesInRadius(pos, r, exclude);
    const h = this.hero;
    if (h && h.alive && h !== exclude && Math.hypot(h.position.x - pos.x, h.position.z - pos.z) <= r + h.radius) out.push(h);
    return out;
  }

  nearestEnemy(pos, maxDist = Infinity, filterFn) {
    let best = null;
    let bd = maxDist;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (filterFn && !filterFn(e)) continue;
      const d = Math.hypot(e.position.x - pos.x, e.position.z - pos.z);
      if (d <= bd) { bd = d; best = e; }
    }
    return best;
  }

  onEnemyKilled(slime) {
    this.stats.kills++;
    this.killsSinceOrb++;
    const o = CONFIG.orb;
    if (Math.random() < o.dropChance || this.killsSinceOrb >= o.pityKills) {
      this.killsSinceOrb = 0;
      this.addActor(new HealthOrb(this, slime.position.clone()));
    }
  }
}
