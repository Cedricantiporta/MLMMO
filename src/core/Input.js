import * as THREE from 'three';

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyP', 'Space',
]);

// Keyboard state: a Set of pressed `KeyboardEvent.code` values plus per-key callbacks.
export class Input {
  constructor() {
    this.pressed = new Set();
    this.handlers = new Map();

    window.addEventListener('keydown', (e) => {
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.pressed.add(e.code);
      const list = this.handlers.get(e.code);
      if (list) for (const fn of list) fn(e);
    });
    window.addEventListener('keyup', (e) => {
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      this.pressed.delete(e.code);
    });
    window.addEventListener('blur', () => this.pressed.clear());
  }

  isDown(code) {
    return this.pressed.has(code);
  }

  // Writes a normalized camera-relative move vector (x = D-A, z = S-W) into `out` and returns it.
  moveVector(out = new THREE.Vector3()) {
    const p = this.pressed;
    let x = 0;
    let z = 0;
    if (p.has('KeyA') || p.has('ArrowLeft')) x -= 1;
    if (p.has('KeyD') || p.has('ArrowRight')) x += 1;
    if (p.has('KeyW') || p.has('ArrowUp')) z -= 1;
    if (p.has('KeyS') || p.has('ArrowDown')) z += 1;
    const len = Math.hypot(x, z);
    if (len > 0) {
      x /= len;
      z /= len;
    }
    out.x = x;
    out.z = z;
    if ('y' in out) out.y = 0;
    return out;
  }

  // Fires `fn` on each fresh key press of `code`.
  onKey(code, fn) {
    if (!this.handlers.has(code)) this.handlers.set(code, []);
    this.handlers.get(code).push(fn);
  }
}
