import * as THREE from 'three';
import { prep, jitter, paint, transformed, lerpCol, mergeGeometries, hash3 } from './geoUtil.js';

const tmp = new THREE.Color();
const TRUNK_LO = new THREE.Color(0x1c1511);
const TRUNK_HI = new THREE.Color(0x4a3626);
const LEAF_LO = new THREE.Color(0x082018);
const LEAF_MID = new THREE.Color(0x174a2c);
const LEAF_HI = new THREE.Color(0x3a6e30);
const WARM = new THREE.Color(0x5e7a30);

// Big leafy tree: tapered trunk + clustered faceted canopy. `detail` 1 = near trees, 0 = cheap far ring.
export function treeGeometry(detail, seed = 1) {
  const parts = [];
  const trunk = transformed(new THREE.CylinderGeometry(0.3, 0.55, 3.4, 6), [0, 1.7, 0], 0, [1, 1, 1]);
  jitter(trunk, 0.08, seed);
  paint(trunk, (x, y) => lerpCol(TRUNK_LO, TRUNK_HI, y / 3.4, tmp));
  parts.push(trunk);
  const blobs = [
    [0, 4.4, 0, 1.9], [1.3, 3.8, 0.4, 1.4], [-1.2, 3.9, -0.5, 1.5], [0.2, 3.7, 1.3, 1.3], [-0.4, 5.5, 0.3, 1.3], [0.5, 4.0, -1.3, 1.3],
  ];
  blobs.forEach(([x, y, z, r], i) => {
    const g = transformed(new THREE.IcosahedronGeometry(1, detail), [x, y, z], i, [r * 1.1, r * 0.85, r * 1.1]);
    jitter(g, 0.35, seed + i);
    paint(g, (px, py, pz, f) => {
      const k = Math.max(0, Math.min(1, (py - (y - r)) / (2 * r)));
      if (k < 0.5) lerpCol(LEAF_LO, LEAF_MID, k * 2, tmp); else lerpCol(LEAF_MID, LEAF_HI, (k - 0.5) * 2, tmp);
      const n = hash3(f, i, seed);
      if (n > 0.93) tmp.lerp(WARM, 0.5);
      return tmp.multiplyScalar(0.82 + 0.35 * hash3(f, 3, i));
    });
    parts.push(g);
  });
  return mergeGeometries(parts, false);
}

// Low bush clump (3 faceted blobs).
export function bushGeometry() {
  const parts = [];
  [[0, 0.32, 0, 0.55], [0.45, 0.25, 0.1, 0.4], [-0.35, 0.22, -0.2, 0.42]].forEach(([x, y, z, r], i) => {
    const g = transformed(new THREE.IcosahedronGeometry(1, 0), [x, y, z], i * 2, [r * 1.15, r * 0.75, r * 1.15]);
    jitter(g, 0.25, i + 11);
    paint(g, (px, py, pz, f) => {
      const k = Math.max(0, Math.min(1, (py - (y - r * 0.75)) / (r * 1.5)));
      lerpCol(LEAF_LO, LEAF_HI, 0.15 + k * 0.7, tmp);
      return tmp.multiplyScalar(0.8 + 0.4 * hash3(f, i, 8));
    });
    parts.push(g);
  });
  return mergeGeometries(parts, false);
}

// Fern: fan of arched blades.
export function fernGeometry() {
  const parts = [];
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (i % 2) * 0.2;
    const len = 0.85 + (i % 3) * 0.2;
    const w = 0.16;
    // 3 rings along the blade, arching outward then drooping
    const rings = [[0, 0.02, w * 0.5], [len * 0.4, 0.5 + (i % 2) * 0.1, w], [len * 0.8, 0.55, w * 0.7], [len, 0.34, 0]];
    const pos = [];
    const idx = [];
    rings.forEach(([d, y, ww]) => {
      const cx = Math.cos(a) * d, cz = Math.sin(a) * d;
      const px = -Math.sin(a) * ww, pz = Math.cos(a) * ww;
      pos.push(cx - px, y, cz - pz, cx + px, y, cz + pz);
    });
    for (let r = 0; r < rings.length - 1; r++) {
      const b = r * 2;
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const ng = g.toNonIndexed();
    // upward normals-ish via computeVertexNormals, double-sided material handles the back
    paint(ng, (x, y) => lerpCol(LEAF_LO, LEAF_HI, y / 0.6 + 0.1 * (i % 3), tmp));
    parts.push(ng);
  }
  return mergeGeometries(parts, false);
}

export function boulderGeometry() {
  const g = transformed(new THREE.DodecahedronGeometry(1, 0), [0, 0.45, 0], 0, [1, 0.75, 1]);
  jitter(g, 0.3, 5);
  const lo = new THREE.Color(0x232a27), hi = new THREE.Color(0x7d7765), mo = new THREE.Color(0x2c4a2c);
  paint(g, (x, y, z, f) => {
    lerpCol(lo, hi, y / 1.1, tmp);
    if (y > 0.9) tmp.lerp(mo, 0.5);
    return tmp.multiplyScalar(0.85 + 0.3 * hash3(f, 1, 1));
  });
  return g;
}
