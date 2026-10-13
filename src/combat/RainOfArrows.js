import * as THREE from 'three';
import { CONFIG } from '../core/config.js';
import { rand } from '../core/rng.js';
import { createArrowMesh } from './arrowMesh.js';

const SPAWN_HEIGHT = 9;
const FALL_SPEED = 34;
const STICK_TIME = 0.5;
const SHRINK_TIME = 0.25;
const EMBED = 0.12;
const GOLD = 0xffcf5a;

// Rain of Arrows: a launch arrow shoots skyward, then arrows pour down on a circle and tick damage.
export class RainOfArrows {
  constructor(game, hero, center) {
    this.game = game;
    this.hero = hero;
    this.def = CONFIG.skills.rain;
    this.center = center.clone();
    this.center.y = 0;
    this.t = 0;
    this.spawnAcc = 0;
    this.tickAcc = 0;
    this.arrows = [];

    // Launch arrow (flies straight up from the bow).
    const start = new THREE.Vector3();
    hero.getBowWorldPosition(start);
    this.launchStart = start;
    this.launchMesh = createArrowMesh();
    this.launchMesh.rotation.x = -Math.PI / 2; // +Z -> +Y
    this.launchMesh.position.copy(start);
    game.scene.add(this.launchMesh);

    // Telegraph: ring + faint disc on the ground.
    const r = this.def.radius;
    this.group = new THREE.Group();
    this.group.position.set(this.center.x, 0.07, this.center.z);
    this.ringMat = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.discMat = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.12, r, 48).rotateX(-Math.PI / 2), this.ringMat);
    this.disc = new THREE.Mesh(new THREE.CircleGeometry(r, 40).rotateX(-Math.PI / 2), this.discMat);
    this.ring.renderOrder = 2;
    this.disc.renderOrder = 1;
    this.group.add(this.disc, this.ring);
    game.scene.add(this.group);
  }

  get rainTime() {
    return this.t - this.def.delay;
  }

  update(dt) {
    const def = this.def;
    const game = this.game;
    this.t += dt;
    const rainT = this.rainTime;

    this.updateLaunch(dt);
    this.updateTelegraph(rainT);

    if (rainT >= 0 && rainT < def.duration) {
      this.spawnAcc += def.arrowsPerSecond * dt;
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        this.spawnArrow();
      }
      this.tickAcc += dt;
      while (this.tickAcc >= def.tickInterval) {
        this.tickAcc -= def.tickInterval;
        this.damageTick();
      }
    }

    this.updateArrows(dt);

    const over = rainT >= def.duration && this.arrows.length === 0 && !this.launchMesh;
    if (over) return false;
    return true;
  }

  updateLaunch(dt) {
    if (!this.launchMesh) return;
    const k = Math.min(1, this.t / this.def.delay);
    const eased = 1 - (1 - k) * (1 - k);
    const pos = this.launchMesh.position;
    pos.copy(this.launchStart);
    pos.y += eased * 15;
    this.game.particles.emit(pos, {
      color: GOLD,
      additive: true,
      size: 0.35,
      life: 0.45,
      alpha: 0.9,
      vx: rand(-0.4, 0.4),
      vy: rand(-0.4, 0.2),
      vz: rand(-0.4, 0.4),
      grow: -0.5,
    });
    if (k >= 1) {
      this.game.particles.burst(pos, 10, { spread: 2.5, color: GOLD, additive: true, size: 0.3, life: 0.5 });
      this.removeLaunch();
    }
  }

  removeLaunch() {
    if (!this.launchMesh) return;
    this.launchMesh.parent?.remove(this.launchMesh);
    this.launchMesh = null;
  }

  updateTelegraph(rainT) {
    const def = this.def;
    const fadeIn = Math.min(1, this.t / Math.max(0.01, def.delay));
    const fadeOut = rainT > def.duration - 0.3 ? Math.max(0, (def.duration - rainT) / 0.3) : 1;
    const a = fadeIn * fadeOut;
    const pulse = 0.85 + 0.15 * Math.sin(this.t * 10);
    this.ringMat.opacity = 0.85 * a * pulse;
    this.discMat.opacity = 0.16 * a;
    this.ring.rotation.y = this.t * 0.6;
  }

  spawnArrow() {
    const def = this.def;
    const ang = Math.random() * Math.PI * 2;
    const rr = Math.sqrt(Math.random()) * def.radius * 0.95;
    const target = new THREE.Vector3(this.center.x + Math.cos(ang) * rr, 0, this.center.z + Math.sin(ang) * rr);
    const start = new THREE.Vector3(target.x + rand(1.5, 3), SPAWN_HEIGHT, target.z + rand(-1, 1));
    const dir = target.clone().sub(start).normalize();

    const mesh = createArrowMesh();
    mesh.position.copy(start);
    mesh.lookAt(start.clone().add(dir));
    this.game.scene.add(mesh);
    this.arrows.push({ mesh, dir, target, state: 'fall', timer: 0 });
  }

  updateArrows(dt) {
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      if (a.state === 'fall') {
        a.mesh.position.addScaledVector(a.dir, FALL_SPEED * dt);
        const tipY = a.mesh.position.y + a.dir.y * 0.4;
        if (tipY <= a.target.y - EMBED) {
          a.state = 'stuck';
          a.mesh.position.copy(a.target).addScaledVector(a.dir, -0.4);
          a.mesh.position.y -= EMBED;
          this.game.particles.burst(a.target, 3, { spread: 1.2, vy: 0.8, color: 0xb59a6a, size: 0.35, life: 0.5, drag: 2, grow: 0.8, alpha: 0.6 });
        }
      } else {
        a.timer += dt;
        if (a.timer > STICK_TIME) {
          const s = 1 - (a.timer - STICK_TIME) / SHRINK_TIME;
          if (s <= 0) {
            a.mesh.parent?.remove(a.mesh);
            this.arrows.splice(i, 1);
          } else {
            a.mesh.scale.setScalar(s);
          }
        }
      }
    }
  }

  damageTick() {
    const def = this.def;
    const enemies = this.game.enemiesInRadius(this.center, def.radius);
    for (const e of enemies) {
      e.takeDamage(Math.round(rand(def.tickDamage[0], def.tickDamage[1])), { type: 'physical', source: this.hero });
      e.aggro?.(CONFIG.slimeAI.aggroOnHit);
    }
  }

  dispose() {
    this.removeLaunch();
    for (const a of this.arrows) a.mesh.parent?.remove(a.mesh);
    this.arrows.length = 0;
    this.group.parent?.remove(this.group);
    this.ring.geometry.dispose();
    this.disc.geometry.dispose();
    this.ringMat.dispose();
    this.discMat.dispose();
  }
}
