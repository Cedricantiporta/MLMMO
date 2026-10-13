import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const hash3 = (x, y, z, s = 0) => {
  const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + s * 4.1414) * 43758.5453;
  return v - Math.floor(v);
};

// Non-indexed, uv-less geometry (flat normals once computeVertexNormals runs).
export function prep(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.deleteAttribute('uv');
  return g;
}

// Jitter vertices continuously (shared positions stay shared), then finalise normals.
export function jitter(g, amt, seed = 0) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    p.setXYZ(i, x + (hash3(x, y, z, seed) - 0.5) * amt, y + (hash3(y, z, x, seed + 1) - 0.5) * amt, z + (hash3(z, x, y, seed + 2) - 0.5) * amt);
  }
}

// fn(x, y, z, faceIndex, vertexInFace) -> THREE.Color ; call after the geometry is in world space.
export function paint(g, fn) {
  g.computeVertexNormals();
  const p = g.attributes.position;
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const col = fn(p.getX(i), p.getY(i), p.getZ(i), (i / 3) | 0, i % 3);
    c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

export function transformed(geo, pos, rotY, scale) {
  const g = prep(geo);
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(pos[0], pos[1], pos[2]),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY),
    new THREE.Vector3(scale[0], scale[1], scale[2]),
  );
  g.applyMatrix4(m);
  return g;
}

export const lerpCol = (a, b, t, out = new THREE.Color()) => out.copy(a).lerp(b, Math.max(0, Math.min(1, t)));
export { mergeGeometries };
