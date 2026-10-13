import * as THREE from 'three';
import { Unit } from './Unit.js';
import { createElfArcherModel } from './ElfArcherModel.js';
import { CONFIG } from '../core/config.js';
import { rand, clamp, lerpAngle } from '../core/rng.js';
import { Skill } from '../combat/Skill.js';
import { Arrow } from '../combat/Arrow.js';
import { RainOfArrows } from '../combat/RainOfArrows.js';

const AIM_HOLD = 0.6; // seconds the aiming pose lingers after a shot
const STRIDE = 4.6; // walk-cycle radians per unit travelled

const distXZ = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Exponential smoothing of an Euler angle (or any numeric property) toward a target.
function damp(obj, key, target, k) {
  obj[key] += (target - obj[key]) * k;
}

function makeRingTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.translate(128, 128);
  g.strokeStyle = '#7dffa0';
  g.lineWidth = 7;
  g.beginPath();
  g.arc(0, 0, 118, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 4;
  g.setLineDash([16, 12]);
  g.beginPath();
  g.arc(0, 0, 98, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  g.lineWidth = 3;
  for (let i = 0; i < 3; i++) {
    g.rotate((Math.PI * 2) / 3);
    g.beginPath();
    g.moveTo(0, -84);
    g.lineTo(0, -60);
    g.lineTo(10, -70);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Unit may be exported as a named or default export.

export class ElfArcher extends Unit {
  constructor(game) {
    const cfg = CONFIG.hero;
    super(game, { maxHp: cfg.maxHp, radius: cfg.radius, team: 'hero', height: cfg.height });
    this.cfg = cfg;
    this.aimHeight = 1.25;
    this.freezeImmunity = cfg.freezeImmunity;

    this.skills = { rain: new Skill(CONFIG.skills.rain), split: new Skill(CONFIG.skills.split) };
    this.splitTime = 0;
    this.respawnTimer = 0;
    this.target = null;

    // Model lives under a yaw group; the root itself never rotates.
    this.yawGroup = new THREE.Group();
    this.root.add(this.yawGroup);
    this.model = createElfArcherModel();
    this.yawGroup.add(this.model.root);
    this.registerFlashMaterials(this.model.materials);

    // Splitting Shot ring under the feet.
    this.ringMat = new THREE.MeshBasicMaterial({
      map: makeRingTexture(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.0).rotateX(-Math.PI / 2), this.ringMat);
    this.ring.position.y = 0.06;
    this.ring.visible = false;
    this.ring.renderOrder = 3;
    this.root.add(this.ring);

    // Behaviour state.
    this.yaw = 0;
    this.attackTimer = 0;
    this.retargetT = 0;
    this.drawing = false;
    this.drawT = 0;
    this.drawVis = 0;
    this.shotTarget = null;
    this.aimHold = 0;
    this.castT = 0;
    this.castCenter = new THREE.Vector3();
    this.castBlend = 0;
    this.aimBlend = 0;
    this.deathT = 0;

    // Animation state.
    this.speedNow = 0;
    this.animSpeed = 0;
    this.walkPhase = 0;
    this.animTime = 0;
    this.yawVel = 0;
  }

  get attackCooldownFrac() {
    return clamp(this.attackTimer / this.cfg.attackInterval, 0, 1);
  }

  getBowWorldPosition(out) {
    return this.model.bow.group.getWorldPosition(out);
  }

  takeDamage(amount, opts) {
    const dealt = super.takeDamage(amount, opts);
    if (dealt > 0) this.game.hud.hurt();
    return dealt;
  }

  die(source) {
    super.die(source);
    this.status.clear();
    this.respawnTimer = this.cfg.respawnTime;
    this.deathT = 0;
    this.target = null;
    this.shotTarget = null;
    this.drawing = false;
    this.drawT = 0;
    this.castT = 0;
    this.splitTime = 0;
    this.ring.visible = false;
    this.model.bow.setPull(0);
  }

  respawn() {
    this.alive = true;
    this.hp = this.maxHp;
    this.position.set(0, 0, 0);
    this.invuln = this.cfg.respawnInvuln;
    this.status.clear();
    this.status.freezeImmune = this.freezeImmunity;
    this.attackTimer = 0.4;
    this.aimHold = 0;
    this.castBlend = 0;
    this.aimBlend = 0;
    this.animSpeed = 0;
    this.model.root.rotation.set(0, 0, 0);
    this.model.root.position.set(0, 0, 0);
    this.model.root.visible = true;
    this.game.fx.castBurst(this.position, 0x9dffb4);
  }

  update(dt) {
    const game = this.game;
    if (!this.alive) {
      this.updateDead(dt);
      return;
    }

    this.status.update(dt);
    this.updateFlash(dt);
    if (!this.alive) return; // a burn tick may have killed us

    this.skills.rain.update(dt);
    this.skills.split.update(dt);
    this.splitTime = Math.max(0, this.splitTime - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.model.root.visible = this.invuln <= 0 || Math.floor(game.time * 14) % 2 === 0;

    const frozen = this.frozen;
    this.updateTarget(dt);

    let moved = 0;
    if (!frozen) {
      this.attackTimer = Math.max(0, this.attackTimer - dt);
      this.aimHold = Math.max(0, this.aimHold - dt);
      this.castT = Math.max(0, this.castT - dt);
      moved = this.updateMovement(dt);
      this.updateAttack(dt);
      this.updateSkills();
      this.updateFacing(dt);
    }
    this.speedNow = dt > 0 ? moved / dt : 0;

    this.updateRing(dt);
    if (!frozen) this.animate(dt);
  }

  // ---------------- Dead ----------------
  updateDead(dt) {
    this.updateFlash(dt);
    this.deathT += dt;
    const k = clamp(this.deathT / 0.7, 0, 1);
    const ease = 1 - (1 - k) * (1 - k);
    this.model.root.rotation.x = -ease * 1.5;
    this.model.root.position.y = ease * 0.12;
    this.model.root.visible = true;
    this.respawnTimer -= dt;
    if (this.respawnTimer <= 0) this.respawn();
  }

  // ---------------- Targeting ----------------
  isValidTarget(e) {
    return e && e.alive && !e.removed && this.game.isOnScreen(e.position);
  }

  updateTarget(dt) {
    const game = this.game;
    const range = this.cfg.attackRange;
    if (this.target && !this.isValidTarget(this.target)) this.target = null;

    this.retargetT -= dt;
    if (this.target && this.retargetT > 0) return;
    this.retargetT = this.cfg.retargetInterval;

    if (this.target && distXZ(this.position, this.target.position) <= range) return;
    this.target = game.nearestEnemy(this.position, Infinity, (e) => this.isValidTarget(e));
  }

  // ---------------- Movement ----------------
  updateMovement(dt) {
    const game = this.game;
    const mv = game.input.moveVector(this._moveInput ??= { x: 0, z: 0 });
    let dx = 0;
    let dz = 0;
    if (mv) {
      dx = mv.x || 0;
      dz = mv.z || 0;
    }
    const inputLen = Math.hypot(dx, dz);
    let moving = inputLen > 0.01;
    let mag = Math.min(1, inputLen);

    if (!moving && this.target) {
      const d = distXZ(this.position, this.target.position);
      if (d > this.cfg.attackRange * 0.95) {
        dx = this.target.position.x - this.position.x;
        dz = this.target.position.z - this.position.z;
        moving = true;
        mag = 1;
      }
    }

    const bx = this.position.x;
    const bz = this.position.z;
    if (moving) {
      const len = Math.hypot(dx, dz) || 1;
      const step = this.cfg.speed * mag * dt;
      this.position.x += (dx / len) * step;
      this.position.z += (dz / len) * step;
      this.moveDir = Math.atan2(dx, dz);
    }
    game.world.resolveCircle(this.position, this.radius);
    return Math.hypot(this.position.x - bx, this.position.z - bz);
  }

  // ---------------- Facing ----------------
  updateFacing(dt) {
    let desired = null;
    if (this.castT > 0) {
      desired = Math.atan2(this.castCenter.x - this.position.x, this.castCenter.z - this.position.z);
    } else {
      const t = this.drawing && this.shotTarget && this.shotTarget.alive ? this.shotTarget : this.target;
      const inRange = t && distXZ(this.position, t.position) <= this.cfg.attackRange;
      if (t && (inRange || this.drawing)) {
        desired = Math.atan2(t.position.x - this.position.x, t.position.z - this.position.z);
      } else if (this.speedNow > 0.3 && this.moveDir !== undefined) {
        desired = this.moveDir;
      }
    }
    if (desired === null) {
      this.yawVel *= 0.8;
      return;
    }
    const prev = this.yaw;
    this.yaw = lerpAngle(this.yaw, desired, 1 - Math.exp(-14 * dt));
    let d = this.yaw - prev;
    d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;
    this.yawVel = dt > 0 ? d / dt : 0;
    this.yawGroup.rotation.y = this.yaw;
  }

  // ---------------- Basic attack ----------------
  updateAttack(dt) {
    const cfg = this.cfg;
    if (this.drawing) {
      this.drawT += dt;
      if (this.drawT >= cfg.drawTime) {
        this.release();
        this.drawing = false;
        this.drawT = 0;
      }
      return;
    }
    if (this.attackTimer > 0 || this.castT > 0 || !this.target) return;
    if (distXZ(this.position, this.target.position) > cfg.attackRange) return;
    this.drawing = true;
    this.drawT = 0;
    this.shotTarget = this.target;
    this.attackTimer = cfg.attackInterval;
    this.aimHold = AIM_HOLD;
  }

  release() {
    const game = this.game;
    const cfg = this.cfg;
    const range = cfg.attackRange;

    let primary = this.shotTarget;
    if (!primary || !primary.alive || primary.removed) primary = this.target;
    this.shotTarget = null;
    if (!primary || !primary.alive || distXZ(this.position, primary.position) > range + 1) return;

    const targets = [primary];
    const splitting = this.splitTime > 0;
    if (splitting) {
      const extras = game.enemies
        .filter((e) => e !== primary && this.isValidTarget(e) && distXZ(this.position, e.position) <= range)
        .sort((a, b) => distXZ(this.position, a.position) - distXZ(this.position, b.position));
      targets.push(...extras.slice(0, CONFIG.skills.split.maxTargets - 1));
    }

    const origin = this.getBowWorldPosition(new THREE.Vector3());
    targets.forEach((t, i) => {
      let damage = rand(cfg.damage[0], cfg.damage[1]);
      if (i > 0) damage *= CONFIG.skills.split.extraDamageMult;
      const crit = Math.random() < cfg.critChance;
      if (crit) damage *= cfg.critMult;
      game.addActor(new Arrow(game, origin, t, { damage: Math.round(damage), crit, speed: cfg.arrowSpeed, glow: splitting }));
    });
    this.aimHold = AIM_HOLD;
  }

  // ---------------- Skills ----------------
  updateSkills() {
    const game = this.game;
    if (this.castT > 0) return;

    const rain = this.skills.rain;
    if (rain.ready && !this.drawing) {
      const center = this.findRainCenter();
      if (center) {
        rain.trigger();
        this.castT = rain.def.castTime;
        this.castCenter.copy(center);
        this.aimHold = AIM_HOLD;
        game.addActor(new RainOfArrows(game, this, center));
        game.fx.castBurst(this.position, 0xffcf5a);
        return;
      }
    }

    const split = this.skills.split;
    if (split.ready && this.target && distXZ(this.position, this.target.position) <= this.cfg.attackRange) {
      split.trigger();
      this.splitTime = split.def.duration;
      game.fx.castBurst(this.position, 0x44ff88);
      game.hud.floatText(this, 'Splitting Shot!', 'skill');
    }
  }

  // The on-screen enemy (within cast range) whose surroundings hold the most enemies.
  findRainCenter() {
    const def = this.skills.rain.def;
    const cands = this.game.enemies.filter(
      (e) => this.isValidTarget(e) && distXZ(this.position, e.position) <= def.castRange,
    );
    let best = null;
    let bestCount = 0;
    let bestDist = Infinity;
    for (const c of cands) {
      let count = 0;
      for (const o of cands) if (distXZ(c.position, o.position) <= def.radius) count++;
      const d = distXZ(this.position, c.position);
      if (count > bestCount || (count === bestCount && d < bestDist)) {
        best = c;
        bestCount = count;
        bestDist = d;
      }
    }
    return best ? best.position : null;
  }

  // ---------------- Visuals ----------------
  updateRing(dt) {
    const on = this.splitTime > 0;
    this.ring.visible = on;
    if (!on) return;
    this.ring.rotation.y += dt * 2.2;
    const pulse = 1 + Math.sin(this.game.time * 6) * 0.05;
    this.ring.scale.setScalar(pulse);
    this.ringMat.opacity = this.splitTime < 0.6 ? this.splitTime / 0.6 : 0.9;
  }

  animate(dt) {
    const m = this.model;
    const t = (this.animTime += dt);
    const k = 1 - Math.exp(-16 * dt);
    const kFast = 1 - Math.exp(-30 * dt);

    this.animSpeed += (this.speedNow - this.animSpeed) * (1 - Math.exp(-10 * dt));
    const sr = clamp(this.animSpeed / this.cfg.speed, 0, 1.2);
    this.walkPhase += this.speedNow * dt * STRIDE;
    const s = Math.sin(this.walkPhase);
    const c = Math.cos(this.walkPhase);

    // Blend factors.
    const aiming = this.drawing || this.aimHold > 0;
    this.aimBlend += ((aiming ? 1 : 0) - this.aimBlend) * k;
    this.castBlend += ((this.castT > 0 ? 1 : 0) - this.castBlend) * k;
    const a = this.aimBlend;
    const cb = this.castBlend;
    const draw = this.drawing ? clamp(this.drawT / this.cfg.drawTime, 0, 1) : 0;
    this.drawVis += (draw - this.drawVis) * kFast;
    m.bow.setPull(this.drawVis);

    // Legs.
    const legSwing = 0.75 * sr;
    m.legs.L.hip.rotation.x = -s * legSwing;
    m.legs.R.hip.rotation.x = s * legSwing;
    m.legs.L.knee.rotation.x = (0.05 + Math.max(0, c) * 0.95) * sr;
    m.legs.R.knee.rotation.x = (0.05 + Math.max(0, -c) * 0.95) * sr;

    // Pelvis / torso.
    const breathe = Math.sin(t * 1.9);
    m.pelvis.position.y = 0.98 + Math.cos(this.walkPhase * 2) * 0.026 * sr - 0.02 * sr;
    m.pelvis.rotation.y = s * 0.12 * sr;
    m.spine.rotation.x = 0.07 * sr + breathe * 0.012 - cb * 0.14;
    m.spine.rotation.y = -s * 0.14 * sr * (1 - a) + 0.3 * a * (1 - cb);
    m.spine.position.y = 0.1 + breathe * 0.004;
    m.head.rotation.y = -m.spine.rotation.y - m.pelvis.rotation.y * 0.5;
    m.head.rotation.x = -0.07 * sr - cb * 0.32 + Math.sin(t * 0.8) * 0.01;

    // Arms.
    const L = m.arms.L;
    const R = m.arms.R;
    const swing = 0.65 * sr * (1 - a);
    const sway = Math.sin(t * 1.9) * 0.02;
    const elbowRest = -0.12 - 0.4 * sr;

    // Aim targets (blended with the cast pose).
    const lx = lerp(lerp(s * swing, -1.5, a), -2.55, cb);
    const lz = lerp(lerp(0.1 + sway, -0.25, a), -0.12, cb);
    const rx = lerp(lerp(-s * swing, -1.45, a), -2.5, cb);
    const rz = lerp(lerp(-0.1 - sway, -0.05, a), 0.12, cb);
    const rElbowZ = lerp(0.9, 2.5, this.drawVis);
    const lElbowX = lerp(elbowRest, 0, a);
    const rElbowX = lerp(elbowRest, 0, a);
    damp(L.shoulder.rotation, 'x', lx, k);
    damp(L.shoulder.rotation, 'z', lz, k);
    damp(R.shoulder.rotation, 'x', rx, k);
    damp(R.shoulder.rotation, 'z', rz, k);
    damp(L.elbow.rotation, 'x', lElbowX, k);
    damp(R.elbow.rotation, 'x', rElbowX, k);
    damp(R.elbow.rotation, 'z', lerp(0, rElbowZ, Math.max(a, cb * 0.6)), kFast);

    // Secondary motion.
    const turn = clamp(this.yawVel * 0.05, -0.4, 0.4);
    damp(m.hairBack.rotation, 'x', 0.08 + sr * 0.38 + Math.sin(t * 3.1) * 0.04 * (0.4 + sr), k * 0.6);
    damp(m.hairBack.rotation, 'z', Math.sin(t * 2.3) * 0.04 + turn, k * 0.6);
    damp(m.cape.rotation, 'x', 0.05 + sr * 0.5 + Math.sin(t * 4.2 + 1) * 0.04 * (0.3 + sr), k * 0.6);
    damp(m.cape.rotation, 'z', Math.sin(t * 2.7) * 0.03 + turn * 0.8, k * 0.6);
  }

  dispose() {
    this.ring.geometry.dispose();
    this.ringMat.map?.dispose();
    this.ringMat.dispose();
    super.dispose();
  }
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
