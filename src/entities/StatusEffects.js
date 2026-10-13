import * as THREE from 'three';
import { rand } from '../core/rng.js';

const ICE_GEO = new THREE.IcosahedronGeometry(1, 1);
let iceMat = null;
const getIceMaterial = () =>
  iceMat ||
  (iceMat = new THREE.MeshLambertMaterial({
    color: 0x9fe6ff, emissive: 0x2a8fc0, emissiveIntensity: 0.5,
    transparent: true, opacity: 0.55, flatShading: true, depthWrite: false,
  }));

// Burn (damage over time) and freeze (immobilize) state for one unit.
export class StatusEffects {
  constructor(unit) {
    this.unit = unit;
    this.burnTime = 0;
    this.burnDps = 0;
    this.burnTick = 0;
    this.flameAcc = 0;
    this.freezeTime = 0;
    this.freezeImmune = 0;
    this.ice = null;
    this._lastFrame = -1;
    this._p = new THREE.Vector3();
  }

  get burning() { return this.burnTime > 0; }
  get frozen() { return this.freezeTime > 0; }

  applyBurn(dps, duration) {
    if (!this.unit.alive) return;
    if (this.burnTime <= 0) this.burnTick = 0.5;
    this.burnDps = Math.max(this.burnTime > 0 ? this.burnDps : 0, dps);
    this.burnTime = Math.max(this.burnTime, duration);
  }

  // Returns true if the unit is (now) frozen.
  applyFreeze(duration) {
    const u = this.unit;
    if (!u.alive || this.freezeImmune > 0) return false;
    if (this.freezeTime <= 0) this.createIce();
    this.freezeTime = Math.max(this.freezeTime, duration);
    return true;
  }

  createIce() {
    const u = this.unit;
    const mesh = new THREE.Mesh(ICE_GEO, getIceMaterial());
    mesh.scale.set(u.radius * 1.6, u.height * 0.6, u.radius * 1.6);
    mesh.position.y = u.height * 0.5;
    mesh.rotation.y = Math.random() * Math.PI;
    u.root.add(mesh);
    this.ice = mesh;
  }

  removeIce() {
    if (this.ice) {
      this.ice.parent?.remove(this.ice);
      this.ice = null;
    }
  }

  thaw() {
    const u = this.unit;
    this.freezeTime = 0;
    this.removeIce();
    this.freezeImmune = u.freezeImmunity || 0;
    const p = this._p.copy(u.position);
    p.y += u.height * 0.5;
    u.game.particles.burst(p, 22, {
      spread: 3.2, color: 0xbff4ff, size: 0.2, life: 0.6, gravity: 6, drag: 1, additive: true,
    });
    u.game.particles.burst(p, 8, {
      spread: 2, color: 0xffffff, size: 0.14, life: 0.5, gravity: 8, additive: true,
    });
  }

  update(dt) {
    const u = this.unit;
    // Guard so the status ticks once per frame even if both Game and the unit call update().
    const frame = u.game.frameId ?? -1;
    if (frame >= 0 && frame === this._lastFrame) return;
    this._lastFrame = frame;

    if (this.freezeTime > 0) {
      this.freezeTime -= dt;
      if (this.freezeTime <= 0) this.thaw();
    } else if (this.freezeImmune > 0) {
      this.freezeImmune -= dt;
    }

    if (this.burnTime > 0) {
      this.burnTime -= dt;
      this.burnTick -= dt;
      if (this.burnTick <= 0) {
        this.burnTick += 0.5;
        if (u.alive) u.takeDamage(this.burnDps * 0.5, { type: 'burn' });
      }
      this.flameAcc += dt * 26;
      while (this.flameAcc >= 1) {
        this.flameAcc -= 1;
        this._p.set(
          u.position.x + rand(-u.radius, u.radius) * 0.8,
          u.position.y + rand(0.1, u.height * 0.8),
          u.position.z + rand(-u.radius, u.radius) * 0.8,
        );
        u.game.particles.emit(this._p, {
          vy: rand(1.2, 2.4), color: Math.random() < 0.5 ? 0xff7a20 : 0xffc040,
          size: rand(0.16, 0.3), life: rand(0.35, 0.6), additive: true, grow: -0.2,
        });
      }
      if (this.burnTime <= 0) this.burnDps = 0;
    }
  }

  clear() {
    this.burnTime = 0;
    this.burnDps = 0;
    this.freezeTime = 0;
    this.removeIce();
  }
}
