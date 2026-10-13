import * as THREE from 'three';
import { CONFIG } from '../core/config.js';

const POOL = 60;

const $ = (id) => document.getElementById(id);

// DOM HUD: player frame, skill bar, stats, overlays and pooled floating damage numbers.
export class HUD {
  constructor(game) {
    this.game = game;
    this.hpFill = $('hp-fill');
    this.hpLag = $('hp-lag');
    this.hpText = $('hp-text');
    this.statuses = $('statuses');
    this.stats = $('stats');
    this.vignette = $('vignette');
    this.death = $('death');
    this.deathCount = $('death-count');
    this.pausedEl = $('paused');
    this.floaterRoot = $('floaters');
    this.tf = {
      el: $('target-frame'), dot: $('tf-dot'), name: $('tf-name'), fill: $('tf-fill'), text: $('tf-text'), tags: $('tf-tags'),
      unit: null, key: '', hpText: '',
    };

    this.slots = {
      auto: this.bindSlot('slot-auto'),
      rain: this.bindSlot('slot-rain'),
      split: this.bindSlot('slot-split'),
    };

    this.lagFrac = 1;
    this.hurtT = 0;
    this.fps = 60;
    this.statsTimer = 0;
    this.badgeKey = '';

    this.pool = [];
    for (let i = 0; i < POOL; i++) {
      const el = document.createElement('div');
      el.className = 'floater';
      this.floaterRoot.appendChild(el);
      this.pool.push({ el, active: false, age: 0, life: 1, pos: new THREE.Vector3(), rise: 1.5, dx: 0, scale: 1 });
    }
    this.next = 0;
    this._v = new THREE.Vector3();
  }

  bindSlot(id) {
    const el = $(id);
    return {
      el,
      cd: el.querySelector('.cd'),
      text: el.querySelector('.cd-text'),
      p: -1,
      label: '',
    };
  }

  // ---- floating text ------------------------------------------------------
  spawnFloater(pos, text, cls, life = 1.0, scale = 1) {
    // reuse the first idle div, otherwise recycle the oldest in round-robin order
    let f = null;
    for (let i = 0; i < POOL; i++) {
      const c = this.pool[(this.next + i) % POOL];
      if (!c.active) { f = c; this.next = (this.next + i + 1) % POOL; break; }
    }
    if (!f) { f = this.pool[this.next]; this.next = (this.next + 1) % POOL; }
    f.active = true;
    f.age = 0;
    f.life = life;
    f.pos.copy(pos);
    f.dx = (Math.random() - 0.5) * 30;
    f.rise = 46 + Math.random() * 14;
    f.el.className = `floater ${cls}`;
    f.el.textContent = text;
    f.el.style.display = 'block';
    f.scale = scale;
  }

  damageNumber(unit, amount, type, crit) {
    let cls = 'normal';
    if (unit.team === 'hero') cls = type === 'burn' ? 'burn' : 'hero-damage';
    else if (crit) cls = 'crit';
    else if (['burn', 'fire', 'ice', 'poison'].includes(type)) cls = type;
    const p = this._v.copy(unit.position);
    p.y += (unit.height ?? 1) + 0.3;
    p.x += (Math.random() - 0.5) * 0.5;
    this.spawnFloater(p, crit ? `${amount}!` : `${amount}`, cls, crit ? 1.2 : 0.95);
  }

  floatText(target, text, cls = 'normal') {
    const p = this._v;
    if (target?.position) {
      p.copy(target.position);
      p.y += (target.height ?? 1) + 0.3;
    } else {
      p.copy(target);
    }
    this.spawnFloater(p, text, cls, 1.1);
  }

  hurt() {
    this.hurtT = 1;
  }

  // ---- per-frame ----------------------------------------------------------
  update(dt) {
    const g = this.game;
    const hero = g.hero;
    if (!hero) return;

    this.fps += (1 / Math.max(dt, 0.001) - this.fps) * 0.05;

    // HP + lag bar
    const max = hero.maxHp || 1;
    const frac = Math.max(0, Math.min(1, (hero.hp ?? 0) / max));
    this.hpFill.style.transform = `scaleX(${frac})`;
    if (this.lagFrac > frac) this.lagFrac = Math.max(frac, this.lagFrac - dt * 0.35);
    else this.lagFrac = frac;
    this.hpLag.style.transform = `scaleX(${this.lagFrac})`;
    this.hpText.textContent = `${Math.ceil(hero.hp ?? 0)} / ${max}`;
    this.hpFill.classList.toggle('low', frac < 0.25 && hero.alive !== false);

    this.updateBadges(hero);
    this.updateTargetFrame(hero);
    this.updateSkills(hero);

    // stats (throttled)
    this.statsTimer -= dt;
    if (this.statsTimer <= 0) {
      this.statsTimer = 0.25;
      const slimes = g.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0);
      this.stats.textContent = `Kills ${g.stats.kills} · Slimes ${slimes} · ${Math.round(this.fps)} FPS`;
    }

    // overlays
    const dead = hero.alive === false;
    this.death.classList.toggle('hidden', !dead);
    if (dead) this.deathCount.textContent = Math.max(0, Math.ceil(hero.respawnTimer ?? 0));
    this.pausedEl.classList.toggle('hidden', !g.paused);

    // hurt vignette
    if (this.hurtT > 0) this.hurtT = Math.max(0, this.hurtT - dt * 2.2);
    this.vignette.style.opacity = (this.hurtT * 0.9).toFixed(3);

    this.updateFloaters(dt);
  }

  updateBadges(hero) {
    const burning = !!hero.status?.burning;
    const frozen = !!hero.status?.frozen;
    const split = (hero.splitTime ?? 0) > 0;
    const key = `${burning}${frozen}${split}`;
    if (key === this.badgeKey) return;
    this.badgeKey = key;
    this.statuses.innerHTML =
      (burning ? '<span class="badge burn">Burning</span>' : '') +
      (frozen ? '<span class="badge frozen">Frozen</span>' : '') +
      (split ? '<span class="badge split">Splitting Shot</span>' : '');
  }

  // Top-centre frame for the clicked enemy: name, type dot, HP, attack style and statuses.
  updateTargetFrame(hero) {
    const tf = this.tf;
    const t = hero.selectedTarget;
    const show = !!t && t.alive && !t.removed;
    if (!show) {
      if (tf.unit) { tf.unit = null; tf.el.classList.add('hidden'); }
      return;
    }
    if (tf.unit !== t) {
      tf.unit = t;
      tf.key = '';
      const def = CONFIG.slimes[t.type] || t.def;
      tf.name.textContent = def.label;
      tf.dot.style.color = `#${def.color.toString(16).padStart(6, '0')}`;
      tf.style = this.attackStyle(def);
      tf.el.classList.remove('hidden');
    }
    const max = t.maxHp || 1;
    tf.fill.style.transform = `scaleX(${Math.max(0, Math.min(1, t.hp / max))})`;
    const txt = `${Math.ceil(t.hp)} / ${max}`;
    if (txt !== tf.hpText) { tf.hpText = txt; tf.text.textContent = txt; }
    const burning = !!t.status?.burning;
    const frozen = !!t.status?.frozen;
    const key = `${burning}${frozen}`;
    if (key !== tf.key) {
      tf.key = key;
      tf.tags.innerHTML =
        `<span class="tf-tag">${tf.style}</span>` +
        (burning ? '<span class="tf-tag burn">Burning</span>' : '') +
        (frozen ? '<span class="tf-tag frozen">Frozen</span>' : '');
    }
  }

  attackStyle(def) {
    const a = def.attack;
    const speed = a.interval <= 1.3 ? 'Fast' : a.interval >= 2 ? 'Slow' : 'Medium';
    const reach = a.kind === 'slam' ? 'Melee-range slam' : `Ranged ${a.range}m`;
    return `${reach} \u2022 ${speed}`;
  }

  setSlot(slot, remainingFrac, text, ready, active) {
    const p = Math.round(remainingFrac * 1000) / 1000;
    if (p !== slot.p) { slot.p = p; slot.cd.style.setProperty('--p', p); }
    if (slot.label !== text) { slot.label = text; slot.text.textContent = text; }
    slot.el.classList.toggle('ready', ready && !active);
    slot.el.classList.toggle('cooling', !ready && !active && text !== '');
    slot.el.classList.toggle('active', active);
  }

  updateSkills(hero) {
    // Auto shot: attackCooldownFrac is the fraction of the attack cooldown still remaining.
    const af = Math.max(0, Math.min(1, hero.attackCooldownFrac ?? 0));
    this.setSlot(this.slots.auto, af, '', af <= 0, false);

    const rain = hero.skills?.rain;
    if (rain) {
      const rem = rain.ready ? 0 : Math.max(0, Math.min(1, rain.cdFrac ?? 0));
      this.setSlot(this.slots.rain, rem, rain.ready ? '' : String(Math.ceil(rain.cd ?? 0)), !!rain.ready, false);
    }

    const split = hero.skills?.split;
    if (split) {
      const buff = hero.splitTime ?? 0;
      if (buff > 0) {
        this.setSlot(this.slots.split, 0, `${buff.toFixed(1)}`, false, true);
      } else {
        const rem = split.ready ? 0 : Math.max(0, Math.min(1, split.cdFrac ?? 0));
        this.setSlot(this.slots.split, rem, split.ready ? '' : String(Math.ceil(split.cd ?? 0)), !!split.ready, false);
      }
    }
  }

  updateFloaters(dt) {
    const cam = this.game.camera;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const v = this._v;
    for (const f of this.pool) {
      if (!f.active) continue;
      f.age += dt;
      const t = f.age / f.life;
      if (t >= 1) {
        f.active = false;
        f.el.style.display = 'none';
        continue;
      }
      v.copy(f.pos).project(cam);
      if (v.z > 1) { f.el.style.display = 'none'; continue; }
      f.el.style.display = 'block';
      const x = (v.x * 0.5 + 0.5) * w + f.dx * t;
      const y = (-v.y * 0.5 + 0.5) * h - f.rise * (1 - (1 - t) * (1 - t));
      const pop = t < 0.12 ? 0.7 + (t / 0.12) * 0.5 : 1.2 - Math.min(0.2, (t - 0.12) * 0.4);
      f.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%) scale(${pop.toFixed(2)})`;
      f.el.style.opacity = t < 0.6 ? 1 : (1 - (t - 0.6) / 0.4).toFixed(2);
    }
  }
}
