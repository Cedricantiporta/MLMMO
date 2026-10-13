import * as THREE from 'three';
import * as UnitModule from './Unit.js';
import { CONFIG } from '../core/config.js';
import { rand, lerpAngle, clamp } from '../core/rng.js';
import { EnemyProjectile } from '../combat/EnemyProjectile.js';

// Unit may be a default or named export depending on the engine file.
const Unit = UnitModule.default ?? UnitModule.Unit;

// ---------------------------------------------------------------------------------------------
// Shared geometry / materials (module-level, live for the whole session)
// ---------------------------------------------------------------------------------------------
const BODY_RADIUS = 0.55; // model-space radius that maps to def.radius
let shared = null;

function getShared() {
  if (shared) return shared;

  // Glossy blob: a sphere with a flattened, slightly widened bottom, resting on y = 0.
  const body = new THREE.SphereGeometry(0.5, 28, 20);
  const pos = body.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    if (y < 0) {
      const k = -y / 0.5; // 0 at equator .. 1 at the pole
      const widen = 1 + 0.1 * Math.sin(Math.min(1, k * 1.6) * Math.PI * 0.5);
      x *= widen;
      z *= widen;
      y *= 0.6;
    }
    pos.setXYZ(i, x, y + 0.3, z);
  }
  body.attributes.position.needsUpdate = true;
  body.computeBoundingSphere();

  const hpFill = new THREE.PlaneGeometry(1, 1);
  hpFill.translate(0.5, 0, 0); // anchored on the left edge

  shared = {
    body,
    sphere: new THREE.SphereGeometry(1, 14, 10),
    mouth: new THREE.TorusGeometry(0.06, 0.013, 6, 14, Math.PI),
    flame: new THREE.ConeGeometry(0.1, 0.42, 7, 1, true),
    crystal: new THREE.ConeGeometry(0.075, 0.34, 5),
    hpBg: new THREE.PlaneGeometry(1, 1),
    hpFill,
    eyeMat: new THREE.MeshStandardMaterial({ color: 0x07070a, roughness: 0.1, metalness: 0.2 }),
    highlightMat: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    mouthMat: new THREE.MeshBasicMaterial({ color: 0x14231a }),
    hpBgMat: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, depthTest: false, depthWrite: false }),
    hpFillMat: new THREE.MeshBasicMaterial({ color: 0xe23a3a, depthTest: false, depthWrite: false }),
  };
  return shared;
}

const HP_BAR_W = 0.95;
const HP_BAR_H = 0.1;

const easeOutBack = (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);

const _tmp = new THREE.Vector3();

// ---------------------------------------------------------------------------------------------
// Slime
// ---------------------------------------------------------------------------------------------
export class Slime extends Unit {
  constructor(game, type, position) {
    const def = CONFIG.slimes[type];
    super(game, { maxHp: def.hp, radius: def.radius, team: 'enemy', height: def.radius * 1.5 });
    this.type = type;
    this.def = def;
    this.aimHeight = 0.45;
    this.position.copy(position);

    this.s = def.radius / BODY_RADIUS; // model scale
    this.phase = Math.random() * 10;
    this.home = this.position.clone();

    // AI state
    this.state = 'spawning'; // spawning | wander | engage | dying
    this.stateTime = 0;
    this.aggroTimer = 0;
    this.attackCd = rand(0.4, def.attack.interval); // first shot is staggered
    this.attack = null; // { phase: 'windup'|'jump'|'recover', t, dur }
    this.yaw = Math.random() * Math.PI * 2;
    this.wanderTarget = null;
    this.idleTimer = rand(0.3, 2);
    this.wanderTimer = 0;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.strafeTimer = rand(1, 3);

    // Animation state
    this.moving = false;
    this.moveAmt = 0;
    this.hopT = Math.random();
    this.deathT = 0;
    this.exploded = false;
    this.fxTimer = 0;

    this._buildModel();
    this._buildHpBar();
    this.registerFlashMaterials([this.shellMat, this.coreMat]);
    this._applyBody(0.001, 0, 0);

    // Spawn pop
    game.particles.burst(_tmp.set(this.position.x, 0.1, this.position.z), 10, {
      spread: 2.2, vy: 1.5, color: def.color, size: 0.22, life: 0.6, gravity: 6,
    });
  }

  // -------------------------------------------------------------------------------------------
  // Construction
  // -------------------------------------------------------------------------------------------
  _buildModel() {
    const g = getShared();
    const def = this.def;
    const color = new THREE.Color(def.color);
    this.materials = []; // per-instance, disposed in dispose()

    this.shellMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color.clone().multiplyScalar(0.2),
      roughness: 0.2,
      metalness: 0,
      transparent: true,
      opacity: 0.88,
    });
    this.coreMat = new THREE.MeshStandardMaterial({
      color: color.clone().multiplyScalar(0.5),
      emissive: color.clone().multiplyScalar(0.12),
      roughness: 0.5,
    });
    this.glowMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.materials.push(this.shellMat, this.coreMat, this.glowMat);

    this.body = new THREE.Group(); // squash/stretch pivot (bottom at y = 0)
    this.face = new THREE.Group(); // yaw, +Z is forward
    this.body.add(this.face);
    this.root.add(this.body);

    const shell = new THREE.Mesh(g.body, this.shellMat);
    shell.castShadow = true;
    const glow = new THREE.Mesh(g.body, this.glowMat);
    glow.scale.setScalar(1.1);
    glow.position.y = -0.03;
    const core = new THREE.Mesh(g.sphere, this.coreMat);
    core.scale.setScalar(0.2);
    core.position.set(0, 0.27, -0.02);
    this.face.add(shell, glow, core);

    // Eyes with highlights, small smile.
    this.eyes = [];
    for (const sx of [-1, 1]) {
      const eye = new THREE.Group();
      const ball = new THREE.Mesh(g.sphere, g.eyeMat);
      ball.scale.set(0.075, 0.095, 0.05);
      const hi = new THREE.Mesh(g.sphere, g.highlightMat);
      hi.scale.setScalar(0.024);
      hi.position.set(-0.02 * sx, 0.03, 0.04);
      const hi2 = new THREE.Mesh(g.sphere, g.highlightMat);
      hi2.scale.setScalar(0.012);
      hi2.position.set(0.025 * sx, -0.03, 0.04);
      eye.add(ball, hi, hi2);
      eye.position.set(sx * 0.17, 0.35, 0.435);
      eye.lookAt(sx * 0.3, 0.38, 1.2);
      this.face.add(eye);
      this.eyes.push(eye);
    }
    const mouth = new THREE.Mesh(g.mouth, g.mouthMat);
    mouth.rotation.z = Math.PI; // arc opens upward -> smile
    mouth.position.set(0, 0.275, 0.485);
    mouth.rotation.x = -0.12;
    this.face.add(mouth);

    this.flames = [];
    this.crystals = [];
    if (this.type === 'fire') this._buildFlames(g);
    if (this.type === 'ice') this._buildCrystals(g);
  }

  _buildFlames(g) {
    this.flameMatA = new THREE.MeshBasicMaterial({
      color: 0xff5a14, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.flameMatB = new THREE.MeshBasicMaterial({
      color: 0xffc23a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.materials.push(this.flameMatA, this.flameMatB);
    const count = 6;
    for (let i = 0; i < count; i++) {
      const center = i === count - 1;
      const a = (i / (count - 1)) * Math.PI * 2;
      const m = new THREE.Mesh(g.flame, center ? this.flameMatB : this.flameMatA);
      const r = center ? 0 : 0.17;
      m.position.set(Math.cos(a) * r, 0.78 + (center ? 0.08 : 0), Math.sin(a) * r);
      m.userData.baseScale = center ? 1.15 : 0.8 + (i % 2) * 0.2;
      m.userData.seed = i * 1.7;
      m.rotation.z = center ? 0 : Math.cos(a) * 0.18;
      m.rotation.x = center ? 0 : -Math.sin(a) * 0.18;
      this.face.add(m);
      this.flames.push(m);
    }
  }

  _buildCrystals(g) {
    this.crystalMat = new THREE.MeshStandardMaterial({
      color: 0xcff4ff,
      emissive: 0x3aa8e8,
      emissiveIntensity: 0.9,
      flatShading: true,
      roughness: 0.15,
      metalness: 0.1,
    });
    this.materials.push(this.crystalMat);
    const spec = [
      [0, 0, 1.25, 0, 0],
      [0.17, 0.05, 0.85, 0.35, 0.2],
      [-0.15, 0.1, 0.9, -0.3, 0.1],
      [0.04, -0.17, 0.8, 0.1, -0.35],
      [-0.06, 0.17, 0.7, 0.2, 0.4],
    ];
    for (const [x, z, sc, rz, rx] of spec) {
      const m = new THREE.Mesh(g.crystal, this.crystalMat);
      m.position.set(x, 0.78 + sc * 0.1 - 0.05, z);
      m.scale.setScalar(sc);
      m.rotation.set(rx, 0, rz);
      m.castShadow = true;
      this.face.add(m);
      this.crystals.push(m);
    }
  }

  _buildHpBar() {
    const g = getShared();
    this.hpBar = new THREE.Group();
    const bg = new THREE.Mesh(g.hpBg, g.hpBgMat);
    bg.scale.set(HP_BAR_W + 0.06, HP_BAR_H + 0.05, 1);
    bg.renderOrder = 998;
    this.hpFill = new THREE.Mesh(g.hpFill, g.hpFillMat);
    this.hpFill.position.set(-HP_BAR_W / 2, 0, 0.001);
    this.hpFill.scale.set(HP_BAR_W, HP_BAR_H, 1);
    this.hpFill.renderOrder = 999;
    this.hpBar.add(bg, this.hpFill);
    this.hpBar.position.y = 1.5 * this.s + 0.15;
    this.hpBar.visible = false;
    this.root.add(this.hpBar);
  }

  // -------------------------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------------------------
  aggro(seconds) {
    this.aggroTimer = Math.max(this.aggroTimer, seconds);
  }

  takeDamage(amount, opts = {}) {
    const dealt = super.takeDamage(amount, opts);
    if (this.alive && dealt > 0) this.aggro(CONFIG.slimeAI.aggroOnHit);
    return dealt;
  }

  die(source) {
    if (!this.alive) return;
    super.die(source);
    this.hpBar.visible = false;
    this.status.clear();
    this.attack = null;
    this.state = 'dying';
    this.deathT = 0;
    this.game.onEnemyKilled(this);

    const game = this.game;
    const p = _tmp.set(this.position.x, 0.1, this.position.z);
    if (this.type === 'normal') {
      game.fx.splat(p, this.def.color);
    } else {
      // Swell for a beat, then explode.
      game.after(0.15, () => this._explode());
    }
  }

  dispose() {
    super.dispose();
    for (const m of this.materials) m.dispose();
  }

  // -------------------------------------------------------------------------------------------
  // Death explosions (fire / ice) — hit the hero AND other enemies
  // -------------------------------------------------------------------------------------------
  _explode() {
    if (this.exploded) return;
    this.exploded = true;
    const game = this.game;
    const ex = this.def.explosion;
    const pos = new THREE.Vector3(this.position.x, 0.4, this.position.z);
    this.body.visible = false;
    this.glowMat.opacity = 0;

    if (this.type === 'fire') {
      game.fx.explosion(pos, ex.radius);
      for (const u of game.unitsInRadius(pos, ex.radius, this)) {
        u.takeDamage(ex.damage, { type: 'fire', source: this });
        if (u.alive) u.status.applyBurn(ex.burnDps, ex.burnDuration);
      }
      game.fire.ignite(pos, this.def.ignite.radius, this.def.ignite.duration);
    } else {
      game.fx.frostNova(pos, ex.radius);
      for (const u of game.unitsInRadius(pos, ex.radius, this)) {
        u.takeDamage(ex.damage, { type: 'ice', source: this });
        if (u.alive) u.status.applyFreeze(ex.freezeDuration);
      }
    }
    this.removed = true;
  }

  // -------------------------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------------------------
  update(dt) {
    if (this.removed) return;
    const game = this.game;
    this.updateFlash(dt);
    this.status.update(dt);
    this._updateHpBar();
    if (this.state === 'dying') {
      this._updateDying(dt);
      return;
    }
    if (this.frozen) return; // frozen: no AI, no animation advance

    this.stateTime += dt;
    this.moving = false;
    if (this.state === 'spawning') {
      this._updateSpawning(dt);
      return;
    }

    this.attackCd -= dt;
    this.aggroTimer = Math.max(0, this.aggroTimer - dt);

    const hero = game.hero;
    const heroAlive = !!hero && hero.alive;
    let dist = Infinity;
    let hx = 0;
    let hz = 0;
    if (heroAlive) {
      hx = hero.position.x - this.position.x;
      hz = hero.position.z - this.position.z;
      dist = Math.hypot(hx, hz);
    }

    const engaged = heroAlive && (dist < CONFIG.slimeAI.aggroRange || this.aggroTimer > 0);
    if (engaged && this.state !== 'engage') this._setState('engage');
    else if (!engaged && this.state === 'engage' && !this.attack) {
      this.home.copy(this.position);
      this.wanderTarget = null;
      this._setState('wander');
    }

    if (this.state === 'engage' && heroAlive) this._updateEngage(dt, hx, hz, dist);
    else this._updateWander(dt);

    if (this.attack) this._updateAttack(dt, hx, hz, heroAlive);

    this._animate(dt);
  }

  _setState(s) {
    this.state = s;
    this.stateTime = 0;
  }

  _updateSpawning(dt) {
    const p = clamp(this.stateTime / CONFIG.slimeAI.spawnTime, 0, 1);
    this._applyBody(Math.max(0.001, easeOutBack(p)), 0, (1 - p) * 0.4);
    this.glowMat.opacity = (1 - p) * 0.5;
    if (p >= 1) {
      this.glowMat.opacity = 0;
      this._setState('wander');
    }
  }

  _updateWander(dt) {
    if (this.idleTimer > 0) {
      this.idleTimer -= dt;
      if (this.idleTimer <= 0) this.wanderTarget = null;
      return;
    }
    if (!this.wanderTarget) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * CONFIG.slimeAI.wanderRadius;
      this.wanderTarget = new THREE.Vector3(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
      this.wanderTimer = 6;
    }
    this.wanderTimer -= dt;
    const dx = this.wanderTarget.x - this.position.x;
    const dz = this.wanderTarget.z - this.position.z;
    if (Math.hypot(dx, dz) < 0.35 || this.wanderTimer <= 0) {
      this.wanderTarget = null;
      this.idleTimer = rand(0.8, 2.8);
      return;
    }
    this._moveToward(dx, dz, this.def.speed * CONFIG.slimeAI.wanderSpeedMult, dt);
    this._faceDir(dx, dz, dt, 8);
  }

  _updateEngage(dt, hx, hz, dist) {
    const atk = this.def.attack;
    this._faceDir(hx, hz, dt, 12);

    // Start an attack once in range and ready.
    if (!this.attack && dist <= atk.range && this.attackCd <= 0) {
      this.attack = { phase: 'windup', t: 0, dur: atk.windup };
    }
    if (this.attack) return; // planted while attacking

    if (dist > atk.range * 0.9) {
      this._moveToward(hx, hz, this.def.speed, dt);
    } else if (dist < this.def.standoff) {
      this._moveToward(-hx, -hz, this.def.speed * 1.15, dt); // hop back, never push into the hero
    } else {
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) {
        this.strafeDir *= -1;
        this.strafeTimer = rand(1.5, 3.2);
      }
      this._moveToward(-hz * this.strafeDir, hx * this.strafeDir, this.def.speed * 0.3, dt);
    }
  }

  _moveToward(dx, dz, speed, dt) {
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return;
    // Slimes travel mostly while airborne mid-hop.
    const cycle = this.hopT % 1;
    const mul = cycle < 0.65 ? 1.5 : 0.2;
    this.position.x += (dx / len) * speed * mul * dt;
    this.position.z += (dz / len) * speed * mul * dt;
    this.moving = true;
  }

  _faceDir(dx, dz, dt, rate) {
    if (Math.abs(dx) + Math.abs(dz) < 1e-4) return;
    this.yaw = lerpAngle(this.yaw, Math.atan2(dx, dz), 1 - Math.exp(-rate * dt));
  }

  // -------------------------------------------------------------------------------------------
  // Attacks
  // -------------------------------------------------------------------------------------------
  _updateAttack(dt, hx, hz, heroAlive) {
    const a = this.attack;
    a.t += dt;
    if (heroAlive) this._faceDir(hx, hz, dt, 14);
    if (a.t < a.dur) return;

    const kind = this.def.attack.kind;
    if (a.phase === 'windup') {
      if (kind === 'slam') {
        this.attack = { phase: 'jump', t: 0, dur: 0.3 };
      } else {
        if (heroAlive) this._shoot(kind);
        this.attack = { phase: 'recover', t: 0, dur: 0.22 };
      }
    } else if (a.phase === 'jump') {
      if (heroAlive) this._slam();
      this.attack = { phase: 'recover', t: 0, dur: 0.2 };
    } else {
      this.attack = null;
      this.attackCd = this.def.attack.interval * rand(0.85, 1.15);
    }
  }

  _shoot(kind) {
    const game = this.game;
    const hero = game.hero;
    const atk = this.def.attack;
    const dx = hero.position.x - this.position.x;
    const dz = hero.position.z - this.position.z;
    const len = Math.hypot(dx, dz) || 1;
    const from = new THREE.Vector3(
      this.position.x + (dx / len) * this.def.radius * 0.9,
      this.position.y + this.def.radius * 1.0,
      this.position.z + (dz / len) * this.def.radius * 0.9
    );
    const opts = { kind, damage: atk.damage, speed: atk.projectileSpeed, source: this };
    if (kind === 'fireball') opts.onHit = (target) => target.status.applyBurn(CONFIG.fire.dps * 0.5, 1.5);
    game.addActor(new EnemyProjectile(game, from, hero, opts));
    game.particles.burst(from, 5, {
      spread: 1.4, color: kind === 'fireball' ? 0xff8a2a : 0x7be07f, size: 0.2, life: 0.3, additive: kind === 'fireball',
    });
  }

  _slam() {
    const game = this.game;
    const atk = this.def.attack;
    const center = new THREE.Vector3(this.position.x, 0.1, this.position.z);
    game.fx.shockwave(center, atk.ringRadius, 0x6fd8ff, 0.45);
    game.particles.burst(center, 14, { spread: 3.5, vy: 1.2, color: 0xbff0ff, size: 0.2, life: 0.5, additive: true, drag: 2 });
    const hero = game.hero;
    if (hero && hero.alive) {
      const d = Math.hypot(hero.position.x - this.position.x, hero.position.z - this.position.z);
      if (d <= atk.ringRadius + hero.radius * 0.5) hero.takeDamage(atk.damage, { type: 'ice', source: this });
    }
  }

  // -------------------------------------------------------------------------------------------
  // Animation
  // -------------------------------------------------------------------------------------------
  _animate(dt) {
    const time = this.game.time;
    const target = this.moving ? 1 : 0;
    this.moveAmt += (target - this.moveAmt) * Math.min(1, dt * 8);
    if (this.moving) this.hopT += dt * 1.8;

    // Hop cycle: airborne for 65 % (stretch), landing squash for the rest.
    const cycle = this.hopT % 1;
    let q = Math.sin(time * 2.2 + this.phase) * 0.035; // idle wobble
    let y = 0;
    if (cycle < 0.65) {
      const k = Math.sin((cycle / 0.65) * Math.PI);
      y = k * 0.26 * this.moveAmt;
      q += k * 0.16 * this.moveAmt;
    } else {
      q -= Math.sin(((cycle - 0.65) / 0.35) * Math.PI) * 0.2 * this.moveAmt;
    }

    // Attack poses.
    let glow = 0;
    let boost = 1;
    const a = this.attack;
    if (a) {
      const p = clamp(a.t / a.dur, 0, 1);
      const crouch = this.def.attack.kind === 'slam' ? 0.36 : 0.28;
      if (a.phase === 'windup') {
        q -= crouch * p;
        glow = 0.55 * p;
        boost = 1 + p * 0.8;
      } else if (a.phase === 'jump') {
        const k = Math.sin(p * Math.PI);
        y += k * 0.6;
        q += k * 0.28 - crouch * (1 - p);
        glow = 0.4 * (1 - p) + 0.2;
      } else {
        q += 0.18 * (1 - p) * Math.cos(p * Math.PI * 2);
        glow = 0.25 * (1 - p);
        boost = 1 + (1 - p) * 0.4;
      }
    }
    this.glowMat.opacity = glow;
    this.flameBoost = boost;

    this._applyBody(1, q, y);
    this.face.rotation.y = this.yaw;

    // Blink
    const b = (time + this.phase) % 3.4;
    const eyeY = b < 0.12 ? 0.15 : 1;
    for (const e of this.eyes) e.scale.y = eyeY;

    this._updateExtras(dt, time);
  }

  // Squash/stretch around the bottom pivot; volume roughly preserved.
  _applyBody(scale, q, y) {
    const sy = (this.s * scale * (1 + q));
    const sxz = (this.s * scale) / Math.sqrt(Math.max(0.2, 1 + q));
    this.body.scale.set(sxz, sy, sxz);
    this.body.position.y = y;
  }

  _updateExtras(dt, time) {
    const game = this.game;
    this.fxTimer -= dt;
    const top = this.position.y + 0.85 * this.s + this.body.position.y;
    if (this.type === 'fire') {
      const boost = this.flameBoost || 1;
      for (const f of this.flames) {
        const t = time * 13 + f.userData.seed;
        const h = f.userData.baseScale * boost * (0.85 + 0.3 * Math.sin(t) + 0.12 * Math.sin(t * 2.3));
        f.scale.set(1 + 0.15 * Math.sin(t * 1.7), h, 1 + 0.15 * Math.cos(t * 1.3));
        f.position.y = 0.78 + h * 0.2;
      }
      if (this.fxTimer <= 0) {
        this.fxTimer = rand(0.12, 0.3);
        game.particles.emit(
          { x: this.position.x + rand(-0.2, 0.2), y: top + 0.15, z: this.position.z + rand(-0.2, 0.2) },
          { vx: rand(-0.3, 0.3), vy: rand(0.8, 1.6), vz: rand(-0.3, 0.3), color: 0xffa040, size: 0.14, life: 0.8, additive: true, grow: -0.1 }
        );
      }
    } else if (this.type === 'ice') {
      this.crystalMat.emissiveIntensity = 0.8 + 0.3 * Math.sin(time * 3 + this.phase);
      if (this.fxTimer <= 0) {
        this.fxTimer = rand(0.35, 0.9);
        game.particles.emit(
          { x: this.position.x + rand(-0.3, 0.3), y: this.position.y + rand(0.3, 0.9) * this.s, z: this.position.z + rand(-0.3, 0.3) },
          { vx: rand(-0.2, 0.2), vy: rand(0.1, 0.5), vz: rand(-0.2, 0.2), color: 0xe8fbff, size: 0.13, life: 0.6, additive: true, grow: -0.15 }
        );
      }
    }
  }

  _updateDying(dt) {
    this.deathT += dt;
    if (this.type === 'normal') {
      const p = clamp(this.deathT / 0.4, 0, 1);
      const e = 1 - (1 - p) * (1 - p);
      const sy = this.s * (1 - 0.88 * e);
      const sxz = this.s * (1 + 0.55 * e);
      this.body.scale.set(sxz, sy, sxz);
      this.body.position.y = 0;
      this.shellMat.opacity = 0.88 * (1 - p * p);
      if (p >= 1) this.removed = true;
      return;
    }
    if (this.exploded) return;
    // Swell + glow until the explosion fires.
    const p = clamp(this.deathT / 0.15, 0, 1);
    const swell = 1 + 0.4 * p;
    this.body.scale.set(this.s * swell, this.s * swell * 1.05, this.s * swell);
    this.body.position.y = 0;
    this.glowMat.opacity = 0.8 * p;
    this.face.rotation.y = this.yaw + Math.sin(this.deathT * 90) * 0.15 * p;
    if (this.deathT > 0.6) this._explode(); // safety net if the timer never fired
  }

  _updateHpBar() {
    const show = this.alive && this.state !== 'spawning' && this.hp < this.maxHp;
    this.hpBar.visible = show;
    if (!show) return;
    this.hpBar.quaternion.copy(this.game.camera.quaternion);
    this.hpFill.scale.x = Math.max(0.0001, (this.hp / this.maxHp) * HP_BAR_W);
  }
}
