import * as THREE from 'three';

// Cheap fake shadows: one shared soft radial-gradient texture/geometry/material on flat planes.
let shared = null;

function getShared() {
  if (shared) return shared;
  const S = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(0,0,0,0.5)');
  gr.addColorStop(0.55, 'rgba(0,0,0,0.28)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
  shared = { tex, geo, mat };
  return shared;
}

// Returns a mesh of diameter `size` lying just above the ground (y = 0.03).
export function createBlobShadow(size) {
  const { geo, mat } = getShared();
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(size, 1, size);
  m.position.y = 0.03;
  m.renderOrder = 0;
  m.matrixAutoUpdate = true;
  return m;
}

export function blobShadowAssets() { return getShared(); }
