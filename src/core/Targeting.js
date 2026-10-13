import * as THREE from 'three';

const PICK_PX = 40; // click tolerance (CSS pixels) around an enemy's projected centre

function ringTexture(color, ticks) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.translate(128, 128);
  g.strokeStyle = color;
  g.lineCap = 'round';
  g.lineWidth = ticks ? 8 : 10;
  g.beginPath();
  g.arc(0, 0, 116, 0, Math.PI * 2);
  g.stroke();
  if (ticks) {
    g.lineWidth = 4;
    g.setLineDash([18, 12]);
    g.beginPath();
    g.arc(0, 0, 96, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.lineWidth = 7;
    for (let i = 0; i < 4; i++) {
      g.rotate(Math.PI / 2);
      g.beginPath();
      g.moveTo(0, -78);
      g.lineTo(-12, -58);
      g.lineTo(12, -58);
      g.closePath();
      g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeRing(color, ticks, order) {
  const mat = new THREE.MeshBasicMaterial({
    map: ringTexture(color, ticks),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat);
  mesh.visible = false;
  mesh.renderOrder = order;
  return mesh;
}

// Click-to-target: picks enemies by projecting them to the screen (robust to the multi-layer
// XRayRenderer) and draws one shared selection ring plus a subtler ring under the hero's auto-target.
export class Targeting {
  constructor(game) {
    this.game = game;
    this._v = new THREE.Vector3();
    this.selRing = makeRing('#ff5a2a', true, 4);
    this.autoRing = makeRing('#ffffff', false, 3);
    game.scene.add(this.selRing, this.autoRing);

    game.renderer.domElement.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      this.pick(e.clientX, e.clientY);
    });
  }

  // Closest alive enemy whose projected body centre lies near the pointer.
  pickEnemy(px, py) {
    const g = this.game;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const camPos = g.camera.position;
    const pxPerUnit = (h * 0.5) / Math.tan(THREE.MathUtils.degToRad(g.camera.fov) / 2);
    let best = null;
    let bestScore = 1;
    g.camera.updateMatrixWorld();
    for (const e of g.enemies) {
      if (!e.alive || e.removed) continue;
      const v = this._v.set(e.position.x, e.position.y + e.height * 0.5, e.position.z);
      const dist = v.distanceTo(camPos);
      v.project(g.camera);
      if (v.z > 1) continue;
      const sx = (v.x * 0.5 + 0.5) * w;
      const sy = (-v.y * 0.5 + 0.5) * h;
      const limit = Math.max(PICK_PX, (e.radius * pxPerUnit) / dist);
      const score = Math.hypot(sx - px, sy - py) / limit;
      if (score <= bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  pick(px, py) {
    const hero = this.game.hero;
    const e = this.pickEnemy(px, py);
    hero.selectedTarget = e;
    if (!e) hero.forceTarget = null; // clicking empty ground cancels any attack order
  }

  place(ring, unit, scale, t, speed, alpha) {
    ring.visible = true;
    ring.position.set(unit.position.x, 0.09, unit.position.z);
    ring.rotation.y = t * speed;
    ring.scale.setScalar(scale);
    ring.material.opacity = alpha;
  }

  update() {
    const g = this.game;
    const hero = g.hero;
    const t = g.time;
    const sel = hero.selectedTarget;
    const selOk = sel && sel.alive && !sel.removed;
    if (selOk) {
      const d = Math.max(1.7, sel.radius * 3.4);
      const pulse = 1 + Math.sin(t * 6) * 0.06;
      this.place(this.selRing, sel, d * pulse, t, 1.6, 0.75 + Math.sin(t * 6) * 0.2);
    } else {
      this.selRing.visible = false;
    }

    const auto = hero.target;
    if (hero.alive && auto && auto.alive && !auto.removed && auto !== sel) {
      this.place(this.autoRing, auto, Math.max(1.2, auto.radius * 2.6), t, 0, 0.4);
    } else {
      this.autoRing.visible = false;
    }
  }
}
