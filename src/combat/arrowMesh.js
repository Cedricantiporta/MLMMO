import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const ARROW_LENGTH = 0.8;

const WOOD = 0xb98a56;
const STEEL = 0xc9d3dc;
const WHITE = 0xf4f1e6;
const GREEN = 0x3fae5c;

// Strip a geometry down to position/normal/color so all parts can be merged.
function part(geo, color) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function buildGeometry() {
  const parts = [];
  // Shaft: z from -0.4 to 0.26.
  parts.push(part(new THREE.CylinderGeometry(0.011, 0.011, 0.66, 5).rotateX(Math.PI / 2).translate(0, 0, -0.07), WOOD));
  // Steel head: z from 0.26 to 0.4, tip at +0.4.
  parts.push(part(new THREE.ConeGeometry(0.032, 0.14, 5).rotateX(Math.PI / 2).translate(0, 0, 0.33), STEEL));
  // Nock knob.
  parts.push(part(new THREE.SphereGeometry(0.014, 5, 4).translate(0, 0, -0.4), WOOD));
  // Three fletching vanes near the tail.
  for (let i = 0; i < 3; i++) {
    const vane = new THREE.PlaneGeometry(0.2, 0.07).rotateY(Math.PI / 2).translate(0, 0.04, -0.29).rotateZ((i * Math.PI * 2) / 3);
    parts.push(part(vane, i === 0 ? GREEN : WHITE));
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

let sharedGeometry = null;
let sharedMaterial = null;

export function getArrowGeometry() {
  if (!sharedGeometry) sharedGeometry = buildGeometry();
  return sharedGeometry;
}

export function getArrowMaterial() {
  if (!sharedMaterial) {
    sharedMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  }
  return sharedMaterial;
}

// Arrow pointing +Z, length ARROW_LENGTH, centred at the origin. Shares geometry + material.
export function createArrowMesh(material = getArrowMaterial()) {
  const mesh = new THREE.Mesh(getArrowGeometry(), material);
  return mesh;
}
