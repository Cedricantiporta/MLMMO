import { CONFIG } from '../core/config.js';
import { Slime } from '../entities/Slime.js';

const INITIAL_MIN_DIST = 8;

// Keeps the meadow populated: an initial wave at construction, then a steady trickle up to a cap.
export class Spawner {
  constructor(game) {
    this.game = game;
    this.timer = 0;
    for (let i = 0; i < CONFIG.spawner.initial; i++) this.spawn(INITIAL_MIN_DIST);
  }

  aliveCount() {
    let n = 0;
    for (const e of this.game.enemies) if (e.alive) n++;
    return n;
  }

  pickType() {
    const weights = CONFIG.spawner.weights;
    let total = 0;
    for (const k in weights) total += weights[k];
    let r = Math.random() * total;
    for (const k in weights) {
      r -= weights[k];
      if (r <= 0) return k;
    }
    return 'normal';
  }

  spawn(minDist) {
    const game = this.game;
    const p = game.world.randomOpenPoint(game.hero.position, minDist);
    const slime = new Slime(game, this.pickType(), p);
    game.enemies.push(slime);
    return slime;
  }

  update(dt) {
    this.timer += dt;
    if (this.timer < CONFIG.spawner.interval) return;
    this.timer = 0;
    if (this.aliveCount() < CONFIG.spawner.max) this.spawn(CONFIG.spawner.minDistFromHero);
  }
}
