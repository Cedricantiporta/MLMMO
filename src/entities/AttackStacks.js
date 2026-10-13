import * as THREE from 'three';

// Six pips floating above the hero's head. Filled pips glow gold; empty ones are dim sockets.
const PIP_GEO = new THREE.CircleGeometry(0.12, 14);
const RIM_GEO = new THREE.RingGeometry(0.12, 0.16, 18);
const EMPTY_MAT = new THREE.MeshBasicMaterial({ color: 0x1a1f1c, transparent: true, opacity: 0.75, depthTest: false, depthWrite: false });
const RIM_MAT = new THREE.MeshBasicMaterial({ color: 0xd9b45a, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false });

export class AttackStacks {
  constructor(parent, { max, height }) {
    this.max = max;
    this.group = new THREE.Group();
    this.group.position.y = height + 0.5;
    this.group.renderOrder = 1000;
    parent.add(this.group);

    this.pips = [];
    const spacing = 0.38;
    for (let i = 0; i < max; i++) {
      const x = (i - (max - 1) / 2) * spacing;
      const rim = new THREE.Mesh(RIM_GEO, RIM_MAT);
      const fillMat = new THREE.MeshBasicMaterial({
        color: 0xffd25a, transparent: true, opacity: 1, depthTest: false, depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const empty = new THREE.Mesh(PIP_GEO, EMPTY_MAT);
      const fill = new THREE.Mesh(PIP_GEO, fillMat);
      for (const m of [empty, fill, rim]) {
        m.position.x = x;
        m.renderOrder = 1000;
        this.group.add(m);
      }
      fill.renderOrder = 1001;
      rim.renderOrder = 1002;
      this.pips.push({ fill, fillMat, pop: 0 });
    }
    this.shown = 0;
  }

  // `count` stacks filled; `fade` 0..1 dims everything shortly before the stacks expire.
  update(dt, camera, count, fade, time) {
    this.group.quaternion.copy(camera.quaternion);
    this.group.visible = count > 0;
    for (let i = 0; i < this.max; i++) {
      const p = this.pips[i];
      const on = i < count;
      if (on && i >= this.shown) p.pop = 1; // newly gained stack pops
      p.pop = Math.max(0, p.pop - dt * 5);
      p.fill.visible = on;
      // Full stacks pulse brighter to signal max attack speed.
      const pulse = count >= this.max ? 0.75 + 0.25 * Math.sin(time * 10) : 1;
      p.fillMat.opacity = pulse * fade;
      p.fill.scale.setScalar(1 + p.pop * 0.6);
      p.fillMat.color.setHex(count >= this.max ? 0xffb02e : 0xffd25a);
    }
    this.shown = count;
  }

  dispose() {
    this.group.removeFromParent();
    for (const p of this.pips) p.fillMat.dispose();
  }
}
