import * as THREE from 'three';
import { CONFIG } from '../core/config.js';
import { rand } from '../core/rng.js';

const HOVER_Y = 0.55;
const GRAVITY = 16;
const BLINK_TIME = 5;

let sphereGeo = null;

const _target = new THREE.Vector3();

// Diablo-style health orb: pops out of a dead enemy, bobs, and magnets to a hurt hero.
export class HealthOrb {
  constructor(game, pos) {
    this.game = game;
    this.age = 0;
    this.life = CONFIG.orb.lifetime;
    this.magnetSpeed = 0;
    this.sparkleTimer = 0;
    this.settled = false;
    this.phase = Math.random() * Math.PI * 2;

    if (!sphereGeo) sphereGeo = new THREE.SphereGeometry(1, 16, 12);

    this.coreMat = new THREE.MeshStandardMaterial({ color: 0xff4458, emissive: 0xff1428, emissiveIntensity: 1.6, roughness: 0.25 });
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0xff3040, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false });
    const core = new THREE.Mesh(sphereGeo, this.coreMat);
    core.scale.setScalar(0.17);
    this.glow = new THREE.Mesh(sphereGeo, this.glowMat);
    this.glow.scale.setScalar(0.36);

    this.group = new THREE.Group();
    this.group.add(core, this.glow);
    this.group.position.set(pos.x, Math.max(pos.y, 0) + 0.5, pos.z);
    game.scene.add(this.group);

    // Logical position (without the visual bob) and pop velocity.
    this.pos = this.group.position.clone();
    const a = Math.random() * Math.PI * 2;
    const s = rand(1.2, 2.6);
    this.vel = new THREE.Vector3(Math.cos(a) * s, rand(4.5, 6), Math.sin(a) * s);
    this.bobY = 0;
  }

  update(dt) {
    const game = this.game;
    const hero = game.hero;
    this.age += dt;
    const remaining = this.life - this.age;
    if (remaining <= 0) {
      game.particles.burst(this.group.position, 6, { spread: 1.2, color: 0xff6070, size: 0.2, life: 0.4, additive: true });
      return false;
    }

    const hurt = !!hero && hero.alive && hero.hp < hero.maxHp;
    let magnetized = false;

    if (hurt) {
      _target.set(hero.position.x, hero.position.y + 0.8, hero.position.z);
      const dx = _target.x - this.pos.x;
      const dy = _target.y - this.pos.y;
      const dz = _target.z - this.pos.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist <= CONFIG.orb.pickupRange) {
        this._collect(hero);
        return false;
      }
      if (dist <= CONFIG.orb.magnetRange) {
        magnetized = true;
        this.settled = true;
        this.magnetSpeed = Math.min(this.magnetSpeed + 28 * dt, 18);
        const step = Math.min(this.magnetSpeed * dt, dist);
        this.pos.x += (dx / dist) * step;
        this.pos.y += (dy / dist) * step;
        this.pos.z += (dz / dist) * step;
      }
    }
    if (!magnetized) {
      this.magnetSpeed = Math.max(0, this.magnetSpeed - 40 * dt);
      this._physics(dt);
    }

    // Bob + spin once settled.
    const t = this.age + this.phase;
    this.bobY = this.settled && !magnetized ? Math.sin(t * 3) * 0.08 : 0;
    this.group.position.set(this.pos.x, this.pos.y + this.bobY, this.pos.z);
    const pulse = 1 + Math.sin(t * 5) * 0.08;
    this.glow.scale.setScalar(0.36 * pulse);
    this.group.rotation.y += dt * 3;

    // Blink during the last seconds of life (faster as it runs out).
    if (remaining < BLINK_TIME) {
      const rate = remaining < 2 ? 14 : 7;
      this.group.visible = Math.sin(this.age * rate) > -0.25;
    }

    this.sparkleTimer -= dt;
    if (this.sparkleTimer <= 0 && this.group.visible) {
      this.sparkleTimer = 0.14;
      game.particles.emit(
        { x: this.group.position.x + rand(-0.15, 0.15), y: this.group.position.y + 0.1, z: this.group.position.z + rand(-0.15, 0.15) },
        { vy: 0.9, color: 0xff7080, size: 0.16, life: 0.8, additive: true, grow: -0.1 }
      );
    }
    return true;
  }

  // Arc out of the corpse, bounce once, then settle at hover height.
  _physics(dt) {
    if (this.settled) {
      this.pos.y += (HOVER_Y - this.pos.y) * Math.min(1, dt * 4);
      this.vel.set(0, 0, 0);
      return;
    }
    this.vel.y -= GRAVITY * dt;
    this.pos.addScaledVector(this.vel, dt);
    this.vel.x *= 1 - Math.min(1, dt * 1.5);
    this.vel.z *= 1 - Math.min(1, dt * 1.5);
    if (this.pos.y <= HOVER_Y && this.vel.y < 0) {
      this.pos.y = HOVER_Y;
      if (this.vel.y < -2.5) {
        this.vel.y *= -0.35;
      } else {
        this.settled = true;
      }
    }
  }

  _collect(hero) {
    const game = this.game;
    hero.heal(hero.maxHp * CONFIG.orb.healPct);
    const p = this.group.position;
    game.particles.burst(p, 16, { spread: 3.5, vy: 1.5, color: 0xff6070, size: 0.22, life: 0.6, additive: true, drag: 2 });
    game.particles.burst(p, 8, { spread: 2, vy: 2.5, color: 0xffd0d6, size: 0.14, life: 0.7, additive: true });
  }

  dispose() {
    this.game.scene.remove(this.group);
    this.coreMat.dispose();
    this.glowMat.dispose();
  }
}
