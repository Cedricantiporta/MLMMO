// Simple cooldown tracker for auto-cast skills.
export class Skill {
  constructor(def) {
    this.def = def;
    this.cd = def.initialDelay ?? 1.5;
  }

  get ready() {
    return this.cd <= 0;
  }

  // 1 = just used, 0 = ready.
  get cdFrac() {
    return this.def.cooldown > 0 ? Math.min(1, Math.max(0, this.cd / this.def.cooldown)) : 0;
  }

  update(dt) {
    if (this.cd > 0) this.cd = Math.max(0, this.cd - dt);
  }

  trigger() {
    this.cd = this.def.cooldown;
  }
}
