import * as THREE from 'three';
import { CONFIG } from './config.js';
import { clamp } from './rng.js';

// Fixed-yaw follow camera looking toward -Z from the +Z side, with smoothed wheel zoom and screen shake.
export class CameraRig {
  constructor(camera, domElement) {
    this.camera = camera;
    this.focus = new THREE.Vector3();
    this.distance = CONFIG.camera.distance;
    this.targetDistance = CONFIG.camera.distance;
    this.pitch = CONFIG.camera.pitch;
    this.shakeAmp = 0;
    this.shakeTime = 0;
    this.shakeDur = 0.0001;
    this._look = new THREE.Vector3();

    domElement.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.targetDistance = clamp(
          this.targetDistance * Math.exp(e.deltaY * 0.0012),
          CONFIG.camera.minDistance,
          CONFIG.camera.maxDistance,
        );
      },
      { passive: false },
    );
  }

  shake(amp, time) {
    // Keep the stronger of the running and new shake.
    const remaining = this.shakeAmp * (this.shakeTime / this.shakeDur);
    if (amp >= remaining) {
      this.shakeAmp = amp;
      this.shakeTime = time;
      this.shakeDur = Math.max(time, 0.0001);
    }
  }

  snap(pos) {
    this.focus.copy(pos);
    this.distance = this.targetDistance;
    this.apply(0);
  }

  update(dt, pos) {
    this.focus.lerp(pos, 1 - Math.exp(-7 * dt));
    this.distance += (this.targetDistance - this.distance) * (1 - Math.exp(-8 * dt));
    this.apply(dt);
  }

  apply(dt) {
    const d = this.distance;
    const cam = this.camera;
    cam.position.set(
      this.focus.x,
      this.focus.y + Math.sin(this.pitch) * d,
      this.focus.z + Math.cos(this.pitch) * d,
    );
    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      const k = (this.shakeTime / this.shakeDur) * this.shakeAmp;
      cam.position.x += (Math.random() - 0.5) * 2 * k;
      cam.position.y += (Math.random() - 0.5) * 2 * k;
      cam.position.z += (Math.random() - 0.5) * 2 * k;
    }
    this._look.set(this.focus.x, this.focus.y + 0.8, this.focus.z);
    cam.lookAt(this._look);
  }
}
