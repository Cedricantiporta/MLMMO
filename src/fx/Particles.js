import * as THREE from 'three';
import { CONFIG } from '../core/config.js';

const VERT = /* glsl */ `
  attribute vec4 aColor;
  attribute float aSize;
  uniform float uScale;
  varying vec4 vColor;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.001, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG_SOFT = /* glsl */ `
  varying vec4 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float a = (1.0 - d);
    a *= a;
    gl_FragColor = vec4(vColor.rgb, vColor.a * a);
    #include <colorspace_fragment>
  }
`;

const FRAG_HARD = /* glsl */ `
  varying vec4 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float a = smoothstep(1.0, 0.72, d);
    gl_FragColor = vec4(vColor.rgb, vColor.a * a);
    #include <colorspace_fragment>
  }
`;

const _c = new THREE.Color();

// One fixed-capacity pool rendered as a single THREE.Points draw call.
class Pool {
  constructor(scene, max, additive) {
    this.max = max;
    this.count = 0;
    // per-particle simulation state
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.sim = new Float32Array(max * 7); // alpha, size, life, age, gravity, drag, grow

    this.geometry = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aColor = new THREE.BufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', this.aPos);
    this.geometry.setAttribute('aColor', this.aColor);
    this.geometry.setAttribute('aSize', this.aSize);
    this.geometry.setDrawRange(0, 0);

    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      vertexShader: VERT,
      fragmentShader: additive ? FRAG_SOFT : FRAG_HARD,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 11 : 10;
    scene.add(this.points);
  }

  add(x, y, z, vx, vy, vz, color, alpha, size, life, gravity, drag, grow) {
    if (this.count >= this.max) return;
    const i = this.count++;
    const p = i * 3;
    this.pos[p] = x; this.pos[p + 1] = y; this.pos[p + 2] = z;
    this.vel[p] = vx; this.vel[p + 1] = vy; this.vel[p + 2] = vz;
    _c.set(color);
    this.col[p] = _c.r; this.col[p + 1] = _c.g; this.col[p + 2] = _c.b;
    const s = i * 7;
    this.sim[s] = alpha; this.sim[s + 1] = size; this.sim[s + 2] = life; this.sim[s + 3] = 0;
    this.sim[s + 4] = gravity; this.sim[s + 5] = drag; this.sim[s + 6] = grow;
  }

  // Copy particle `from` into slot `to`.
  move(from, to) {
    for (let k = 0; k < 3; k++) {
      this.pos[to * 3 + k] = this.pos[from * 3 + k];
      this.vel[to * 3 + k] = this.vel[from * 3 + k];
      this.col[to * 3 + k] = this.col[from * 3 + k];
    }
    for (let k = 0; k < 7; k++) this.sim[to * 7 + k] = this.sim[from * 7 + k];
  }

  update(dt) {
    const { pos, vel, col, sim } = this;
    const outP = this.aPos.array;
    const outC = this.aColor.array;
    const outS = this.aSize.array;
    let i = 0;
    while (i < this.count) {
      const s = i * 7;
      sim[s + 3] += dt;
      const age = sim[s + 3];
      const life = sim[s + 2];
      if (age >= life) {
        // swap-remove: pull the last live particle into this slot and re-process it
        this.count--;
        if (i !== this.count) this.move(this.count, i);
        continue;
      }
      const p = i * 3;
      const drag = Math.max(0, 1 - sim[s + 5] * dt);
      vel[p] *= drag; vel[p + 1] = vel[p + 1] * drag - sim[s + 4] * dt; vel[p + 2] *= drag;
      pos[p] += vel[p] * dt; pos[p + 1] += vel[p + 1] * dt; pos[p + 2] += vel[p + 2] * dt;
      sim[s + 1] = Math.max(0.001, sim[s + 1] + sim[s + 6] * dt);

      const t = age / life;
      const fade = Math.min(1, (1 - t) * 2.5) * Math.min(1, age * 30 + 0.2);
      outP[p] = pos[p]; outP[p + 1] = pos[p + 1]; outP[p + 2] = pos[p + 2];
      const c = i * 4;
      outC[c] = col[p]; outC[c + 1] = col[p + 1]; outC[c + 2] = col[p + 2];
      outC[c + 3] = sim[s] * fade;
      outS[i] = sim[s + 1];
      i++;
    }
    this.geometry.setDrawRange(0, this.count);
    this.aPos.needsUpdate = true;
    this.aColor.needsUpdate = true;
    this.aSize.needsUpdate = true;
  }

  dispose(scene) {
    scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
  }
}

// Particle system: an additive "glow" pool and a normal-blended "smoke/debris" pool.
export class Particles {
  constructor(game) {
    this.game = game;
    this.additive = new Pool(game.scene, 2500, true);
    this.normal = new Pool(game.scene, 1500, false);
    this.resize();
  }

  resize() {
    const { renderer, camera } = this.game;
    const h = window.innerHeight;
    const scale = (renderer.getPixelRatio() * h * 0.5) / Math.tan(THREE.MathUtils.degToRad(camera.fov || CONFIG.camera.fov) / 2);
    this.additive.material.uniforms.uScale.value = scale;
    this.normal.material.uniforms.uScale.value = scale;
  }

  // Spawn one particle. Size is in world units; `grow` adds world units per second.
  emit(pos, o = {}) {
    const pool = o.additive ? this.additive : this.normal;
    pool.add(
      pos.x, pos.y, pos.z,
      o.vx || 0, o.vy || 0, o.vz || 0,
      o.color ?? 0xffffff, o.alpha ?? 1, o.size ?? 0.3, o.life ?? 1,
      o.gravity || 0, o.drag || 0, o.grow || 0,
    );
  }

  // Spawn `count` particles with random directions on a sphere (biased upward) scaled by `spread`.
  burst(pos, count, o = {}) {
    const spread = o.spread ?? 1;
    const pool = o.additive ? this.additive : this.normal;
    for (let i = 0; i < count; i++) {
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const mag = spread * (0.35 + Math.random() * 0.65);
      const dx = r * Math.cos(th);
      const dz = r * Math.sin(th);
      const dy = u * 0.5 + 0.5; // 0..1 upward bias
      const life = (o.life ?? 1) * (0.75 + Math.random() * 0.5);
      const size = (o.size ?? 0.3) * (0.7 + Math.random() * 0.6);
      pool.add(
        pos.x, pos.y, pos.z,
        dx * mag + (o.vx || 0), dy * mag + (o.vy || 0), dz * mag + (o.vz || 0),
        o.color ?? 0xffffff, o.alpha ?? 1, size, life,
        o.gravity || 0, o.drag || 0, o.grow || 0,
      );
    }
  }

  update(dt) {
    this.additive.update(dt);
    this.normal.update(dt);
  }
}
