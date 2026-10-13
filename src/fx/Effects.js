import * as THREE from 'three';
import { rand } from '../core/rng.js';

// Shared unit geometries (never disposed per effect).
const RING_GEO = new THREE.RingGeometry(0.82, 1, 56).rotateX(-Math.PI / 2);
const SPHERE_GEO = new THREE.SphereGeometry(1, 20, 14);

// A mesh that scales up and fades out, then removes itself.
class ExpandingMesh {
  constructor(game, mesh, { from, to, life, opacity, grow = 'out' }) {
    this.game = game;
    this.mesh = mesh;
    this.from = from;
    this.to = to;
    this.life = life;
    this.age = 0;
    this.opacity = opacity;
    this.ease = grow;
    game.scene.add(mesh);
    this.apply(0);
  }

  apply(t) {
    const k = this.ease === 'out' ? 1 - (1 - t) * (1 - t) : t;
    this.mesh.scale.setScalar(this.from + (this.to - this.from) * k);
    this.mesh.material.opacity = this.opacity * (1 - t) * (1 - t);
  }

  update(dt) {
    this.age += dt;
    const t = this.age / this.life;
    if (t >= 1) return false;
    this.apply(t);
    return true;
  }

  dispose() {
    this.game.scene.remove(this.mesh);
    this.mesh.material.dispose();
  }
}

export class Effects {
  constructor(game) {
    this.game = game;
    this._p = new THREE.Vector3();
  }

  // Flat expanding ring on the ground.
  shockwave(pos, radius, color = 0xffffff, life = 0.5) {
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(RING_GEO, mat);
    mesh.position.set(pos.x, 0.06, pos.z);
    mesh.renderOrder = 5;
    this.game.addActor(new ExpandingMesh(this.game, mesh, { from: radius * 0.15, to: radius, life, opacity: 0.9 }));
  }

  // Bright additive sphere that swells and fades.
  flashSphere(pos, radius, color = 0xffffff, life = 0.25) {
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(SPHERE_GEO, mat);
    mesh.position.copy(pos);
    mesh.renderOrder = 6;
    this.game.addActor(new ExpandingMesh(this.game, mesh, { from: radius * 0.4, to: radius, life, opacity: 0.85 }));
  }

  explosion(pos, radius) {
    const g = this.game;
    const c = this._p.set(pos.x, pos.y + 0.5, pos.z);
    g.particles.burst(c, Math.round(30 + radius * 10), {
      spread: radius * 3.2, color: 0xff8a20, size: 0.55, life: 0.7, drag: 2.2, grow: 0.5, additive: true,
    });
    g.particles.burst(c, Math.round(18 + radius * 5), {
      spread: radius * 2.4, color: 0xffe070, size: 0.4, life: 0.5, drag: 2.6, additive: true,
    });
    g.particles.burst(c, Math.round(14 + radius * 4), {
      spread: radius * 1.5, vy: 1, color: 0x2a2420, alpha: 0.7, size: 0.8, life: 1.4, drag: 1.2, grow: 0.9, gravity: -0.5,
    });
    this.shockwave(pos, radius * 1.15, 0xffb040, 0.5);
    this.flashSphere(c, radius * 0.7, 0xffc060, 0.28);
    g.cameraRig.shake(0.35, 0.35);
  }

  frostNova(pos, radius) {
    const g = this.game;
    const c = this._p.set(pos.x, pos.y + 0.4, pos.z);
    g.particles.burst(c, Math.round(26 + radius * 8), {
      spread: radius * 3, color: 0xbff4ff, size: 0.28, life: 0.7, drag: 2.4, gravity: 3, additive: true,
    });
    g.particles.burst(c, 16, {
      spread: radius * 2.2, color: 0xffffff, size: 0.2, life: 0.6, drag: 2, gravity: 4, additive: true,
    });
    g.particles.burst(c, 14, {
      spread: radius * 1.2, color: 0x9fdcf0, alpha: 0.55, size: 0.9, life: 1.1, drag: 1.5, grow: 0.8,
    });
    this.shockwave(pos, radius * 1.1, 0x8fe6ff, 0.6);
    this.flashSphere(c, radius * 0.5, 0xbff4ff, 0.22);
    g.cameraRig.shake(0.2, 0.25);
  }

  // Slime goo splatter.
  splat(pos, color = 0x5fd068) {
    const c = this._p.set(pos.x, pos.y + 0.3, pos.z);
    this.game.particles.burst(c, 14, {
      spread: 3, vy: 1.5, color, size: 0.22, life: 0.6, gravity: 12, drag: 0.5,
    });
  }

  hitSpark(pos, color = 0xfff0b0) {
    this.game.particles.burst(pos, 7, {
      spread: 3.2, color, size: 0.16, life: 0.25, drag: 3, additive: true,
    });
  }

  heal(pos) {
    const g = this.game;
    for (let i = 0; i < 12; i++) {
      this._p.set(pos.x + rand(-0.4, 0.4), pos.y + rand(0.1, 0.9), pos.z + rand(-0.4, 0.4));
      g.particles.emit(this._p, {
        vy: rand(1.2, 2.4), color: i % 2 ? 0x7dff9a : 0xd8ffc0, size: rand(0.14, 0.26),
        life: rand(0.7, 1.1), additive: true, drag: 0.6,
      });
    }
  }

  castBurst(pos, color = 0xffffff) {
    const c = this._p.set(pos.x, pos.y + 0.5, pos.z);
    this.game.particles.burst(c, 14, {
      spread: 2.4, color, size: 0.2, life: 0.4, drag: 3, additive: true,
    });
    this.shockwave(pos, 1.2, color, 0.3);
  }
}
