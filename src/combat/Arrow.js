import * as THREE from 'three';
import { CONFIG } from '../core/config.js';
import { createArrowMesh, getArrowMaterial } from './arrowMesh.js';

const HIT_PADDING = 0.15;

// Homing arrow actor. If the target dies mid-flight it flies on to the last aim point and vanishes.
export class Arrow {
  constructor(game, from, target, { damage, crit = false, speed = CONFIG.hero.arrowSpeed, glow = false } = {}) {
    this.game = game;
    this.target = target;
    this.damage = damage;
    this.crit = crit;
    this.speed = speed;
    this.glow = glow;
    this.life = 2;

    this.ownMaterial = null;
    let material = getArrowMaterial();
    if (glow) {
      material = material.clone();
      material.emissive = new THREE.Color(0x35ff7a);
      material.emissiveIntensity = 0.7;
      this.ownMaterial = material;
    }
    this.mesh = createArrowMesh(material);
    this.mesh.position.copy(from);
    this.aim = new THREE.Vector3();
    this.updateAim();
    this.mesh.lookAt(this.aim);
    game.scene.add(this.mesh);
  }

  updateAim() {
    const t = this.target;
    if (t && t.alive) {
      this.aim.copy(t.position);
      this.aim.y += t.aimHeight ?? 0.6;
    }
  }

  update(dt) {
    this.life -= dt;
    if (this.life <= 0) return false;

    this.updateAim();
    const pos = this.mesh.position;
    const toAim = this.aim.clone().sub(pos);
    const dist = toAim.length();
    const step = this.speed * dt;

    if (dist <= step + HIT_PADDING) {
      if (this.target && this.target.alive) this.hit();
      return false;
    }

    toAim.multiplyScalar(1 / dist);
    pos.addScaledVector(toAim, step);
    this.mesh.lookAt(pos.x + toAim.x, pos.y + toAim.y, pos.z + toAim.z);

    if (this.glow) {
      this.game.particles.emit(pos, {
        color: 0x5dff8c,
        additive: true,
        size: 0.32,
        life: 0.3,
        alpha: 0.8,
        grow: -0.6,
      });
    }
    return true;
  }

  hit() {
    const game = this.game;
    const target = this.target;
    target.takeDamage(this.damage, {
      type: this.crit ? 'crit' : 'physical',
      crit: this.crit,
      source: game.hero,
    });
    target.aggro?.(CONFIG.slimeAI.aggroOnHit);
    game.fx.hitSpark(this.mesh.position, this.crit ? 0xffd34d : this.glow ? 0x7dff9a : 0xffffff);
  }

  dispose() {
    this.mesh.parent?.remove(this.mesh);
    this.ownMaterial?.dispose();
  }
}
