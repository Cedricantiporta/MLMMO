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

// ---- Glowing magical arrow (Rain of Arrows) --------------------------------------------------
// Shared geometry + materials: an unlit golden-white arrow plus two crossed additive glow quads.
let glowShared = null;

function getGlowShared() {
  if (glowShared) return glowShared;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,248,215,1)');
  gr.addColorStop(0.3, 'rgba(255,204,90,0.55)');
  gr.addColorStop(1, 'rgba(255,170,40,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;

  const core = mergeGeometries([
    new THREE.CylinderGeometry(0.02, 0.02, 0.66, 5).rotateX(Math.PI / 2).translate(0, 0, -0.07).toNonIndexed(),
    new THREE.ConeGeometry(0.055, 0.17, 5).rotateX(Math.PI / 2).translate(0, 0, 0.32).toNonIndexed(),
    new THREE.OctahedronGeometry(0.05, 0).scale(1, 1, 2.2).translate(0, 0, -0.38),
  ]);
  const glowA = new THREE.PlaneGeometry(0.55, 1.9).rotateX(Math.PI / 2);
  const glowB = new THREE.PlaneGeometry(0.55, 1.9).rotateX(Math.PI / 2).rotateZ(Math.PI / 2);
  glowShared = {
    core,
    glowA,
    glowB,
    coreMat: new THREE.MeshBasicMaterial({ color: 0xfff3c4, toneMapped: false }),
    glowMat: new THREE.MeshBasicMaterial({
      map: tex, color: 0xffd060, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    }),
  };
  return glowShared;
}

// Glowing arrow pointing +Z (origin at its centre). Glow quads are tagged as overlay so they never write depth.
export function createGlowArrowMesh() {
  const s = getGlowShared();
  const group = new THREE.Group();
  group.add(new THREE.Mesh(s.core, s.coreMat));
  const a = new THREE.Mesh(s.glowA, s.glowMat);
  const b = new THREE.Mesh(s.glowB, s.glowMat);
  a.renderOrder = b.renderOrder = 5;
  group.add(a, b);
  return group;
}
