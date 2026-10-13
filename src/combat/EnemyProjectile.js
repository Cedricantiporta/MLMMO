import * as THREE from 'three';
import { clamp } from '../core/rng.js';

// Shared geometry (created lazily, never disposed: it lives for the whole session).
let shared = null;
function getShared() {
  if (!shared) shared = { sphere: new THREE.SphereGeometry(1, 14, 10) };
  return shared;
}

const KINDS = {
  spit: { radius: 0.17, damageType: 'poison', turnRate: 0.9, arc: 0.7 },
  fireball: { radius: 0.24, damageType: 'fire', turnRate: 0.7, arc: 0.35 },
};

const _aim = new THREE.Vector3();
const _want = new THREE.Vector3();

// Projectile fired by enemies. Flies toward the target's aim point (captured at launch, with slight
// homing and a small arc) and only ever damages the hero.
export class EnemyProjectile {
  constructor(game, from, targetUnit, { kind = 'spit', damage = 10, speed = 9, onHit = null, source = null } = {}) {
    this.game = game;
    this.kind = kind;
    this.cfg = KINDS[kind] || KINDS.spit;
    this.target = targetUnit;
    this.damage = damage;
    this.speed = speed;
    this.onHit = onHit;
    this.source = source;
    this.age = 0;
    this.travelled = 0;
    this.trailTimer = 0;

    this.pos = from.clone();
    this.aim = new THREE.Vector3(targetUnit.position.x, targetUnit.position.y + targetUnit.aimHeight, targetUnit.position.z);
    this.dir = this.aim.clone().sub(this.pos);
    this.startDist = Math.max(this.dir.length(), 0.5);
    this.dir.normalize();
    this.maxTravel = this.startDist + 3;

    this._buildMesh();
    this.group.position.copy(this.pos);
    game.scene.add(this.group);
  }

  _buildMesh() {
    const { sphere } = getShared();
    const r = this.cfg.radius;
    this.group = new THREE.Group();
    this.materials = [];
    if (this.kind === 'fireball') {
      const core = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const glow = new THREE.MeshBasicMaterial({ color: 0xff5a1a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
      const coreMesh = new THREE.Mesh(sphere, core);
      coreMesh.scale.setScalar(r * 0.7);
      const glowMesh = new THREE.Mesh(sphere, glow);
      glowMesh.scale.setScalar(r * 1.5);
      this.glowMesh = glowMesh;
      this.group.add(glowMesh, coreMesh);
      this.materials.push(core, glow);
    } else {
      const goo = new THREE.MeshStandardMaterial({
        color: 0x6fe06f,
        emissive: 0x2a8a30,
        roughness: 0.15,
        transparent: true,
        opacity: 0.92,
      });
      const mesh = new THREE.Mesh(sphere, goo);
      mesh.scale.setScalar(r);
      this.gooMesh = mesh;
      this.group.add(mesh);
      this.materials.push(goo);
    }
  }

  update(dt) {
    const game = this.game;
    this.age += dt;
    const target = this.target;

    // Slight homing toward the target's current aim point.
    if (target && target.alive) {
      _aim.set(target.position.x, target.position.y + target.aimHeight, target.position.z);
      _want.copy(_aim).sub(this.pos);
      if (_want.lengthSq() > 1e-6) {
        _want.normalize();
        const maxTurn = this.cfg.turnRate * dt;
        const ang = this.dir.angleTo(_want);
        if (ang > 1e-4) this.dir.lerp(_want, Math.min(1, maxTurn / ang)).normalize();
      }
    }

    const step = this.speed * dt;
    this.pos.addScaledVector(this.dir, step);
    this.travelled += step;

    // Arc: visual lift that peaks mid-flight and returns to zero on arrival.
    const frac = clamp(this.travelled / this.startDist, 0, 1);
    const lift = Math.sin(frac * Math.PI) * this.cfg.arc;
    this.group.position.set(this.pos.x, this.pos.y + lift, this.pos.z);

    if (this.gooMesh) {
      const wob = 1 + Math.sin(this.age * 24) * 0.12;
      this.gooMesh.scale.set(this.cfg.radius * wob, this.cfg.radius / wob, this.cfg.radius * wob);
    } else {
      this.glowMesh.scale.setScalar(this.cfg.radius * (1.5 + Math.sin(this.age * 30) * 0.15));
    }
    this._trail(dt);

    // Hit test against the hero only.
    if (target && target.alive) {
      const dx = this.group.position.x - target.position.x;
      const dz = this.group.position.z - target.position.z;
      const y = this.group.position.y - target.position.y;
      if (dx * dx + dz * dz <= (target.radius + 0.25) ** 2 && y > -0.3 && y < target.height + 0.4) {
        this._impact(true);
        return false;
      }
    }

    if (this.travelled >= this.maxTravel || this.age >= 3) {
      this._impact(false);
      return false;
    }
    return true;
  }

  _trail(dt) {
    this.trailTimer -= dt;
    if (this.trailTimer > 0) return;
    const p = this.group.position;
    if (this.kind === 'fireball') {
      this.trailTimer = 0.035;
      this.game.particles.emit(p, {
        vx: (Math.random() - 0.5) * 0.8,
        vy: 0.4 + Math.random() * 0.6,
        vz: (Math.random() - 0.5) * 0.8,
        color: Math.random() < 0.5 ? 0xff8a2a : 0xffc060,
        size: 0.28,
        life: 0.45,
        grow: -0.4,
        additive: true,
      });
    } else {
      this.trailTimer = 0.07;
      this.game.particles.emit(p, {
        vx: (Math.random() - 0.5) * 0.5,
        vy: 0,
        vz: (Math.random() - 0.5) * 0.5,
        color: 0x86e886,
        size: 0.12,
        life: 0.35,
        gravity: 4,
      });
    }
  }

  _impact(hitTarget) {
    const game = this.game;
    const p = this.group.position;
    if (this.kind === 'fireball') {
      game.particles.burst(p, 14, { spread: 3.2, color: 0xff8a2a, size: 0.4, life: 0.5, drag: 2, additive: true, grow: -0.3 });
      game.particles.burst(p, 6, { spread: 2, color: 0xffe0a0, size: 0.3, life: 0.35, additive: true });
      game.fx.flashSphere(p, 0.9, 0xff7a2a, 0.25);
    } else {
      game.particles.burst(p, 12, { spread: 3, vy: 1.2, color: 0x7be07f, size: 0.16, life: 0.55, gravity: 9 });
    }
    if (!hitTarget) return;
    const target = this.target;
    if (!target.alive || target.invuln > 0) return;
    target.takeDamage(this.damage, { type: this.cfg.damageType, source: this.source });
    if (this.onHit) this.onHit(target);
  }

  dispose() {
    this.game.scene.remove(this.group);
    for (const m of this.materials) m.dispose();
  }
}
