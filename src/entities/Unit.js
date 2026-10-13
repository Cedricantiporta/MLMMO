import * as THREE from 'three';
import { StatusEffects } from './StatusEffects.js';

const FLASH_TIME = 0.14;
const FROZEN_TINT = new THREE.Color(0x2a8fc0);
const WHITE = new THREE.Color(0xffffff);
const RED = new THREE.Color(0xff2a1a);
const _c = new THREE.Color();

// Base class for anything with HP that lives in the world (hero and slimes).
export class Unit {
  constructor(game, { maxHp = 100, radius = 0.5, team = 'enemy', height = 1 } = {}) {
    this.game = game;
    this.team = team;
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.radius = radius;
    this.height = height;
    this.aimHeight = height * 0.55;
    this.alive = true;
    this.removed = false;
    this.invuln = 0;
    this.flash = 0;
    this.flashMats = [];

    this.root = new THREE.Group(); // never rotated; models rotate inside it
    this.position = this.root.position;
    game.scene.add(this.root);

    this.status = new StatusEffects(this);
  }

  get frozen() { return this.status.frozen; }

  // Remember each material's base emissive so flashes can be blended back to it.
  registerFlashMaterials(mats) {
    for (const m of mats) {
      if (!m || !m.emissive || this.flashMats.includes(m)) continue;
      m.userData.baseEmissive = m.emissive.clone();
      m.userData.baseEmissiveIntensity = m.emissiveIntensity ?? 1;
      this.flashMats.push(m);
    }
  }

  updateFlash(dt) {
    if (this._flashFrame === this.game.frameId && this.game.frameId !== undefined) return;
    this._flashFrame = this.game.frameId;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt);
    const frozen = this.frozen;
    if (this.flash <= 0 && !frozen && !this._tinted) return;
    this._tinted = this.flash > 0 || frozen;
    const k = this.flash / FLASH_TIME;
    const flashCol = this.team === 'hero' ? RED : WHITE;
    for (const m of this.flashMats) {
      const base = m.userData.baseEmissive;
      _c.copy(base);
      if (frozen) _c.lerp(FROZEN_TINT, 0.6);
      if (k > 0) _c.lerp(flashCol, k * 0.85);
      m.emissive.copy(_c);
      m.emissiveIntensity = k > 0 ? 1 : m.userData.baseEmissiveIntensity;
    }
  }

  takeDamage(amount, { type = 'physical', crit = false, source = null } = {}) {
    if (!this.alive || this.invuln > 0) return 0;
    const dealt = Math.max(1, Math.round(amount));
    this.hp = Math.max(0, this.hp - dealt);
    if (type !== 'burn') this.flash = FLASH_TIME;
    this.game.hud?.damageNumber(this, dealt, type, crit);
    if (this.hp <= 0) this.die(source);
    return dealt;
  }

  heal(amount) {
    if (!this.alive) return 0;
    const n = Math.round(Math.min(amount, this.maxHp - this.hp));
    if (n <= 0) return 0;
    this.hp += n;
    this.game.hud?.floatText(this, `+${n}`, 'heal');
    this.game.fx?.heal(this.position);
    return n;
  }

  die(source) { // eslint-disable-line no-unused-vars
    this.alive = false;
    this.status.clear();
  }

  dispose() {
    this.status.clear();
    this.game.scene.remove(this.root);
  }
}
