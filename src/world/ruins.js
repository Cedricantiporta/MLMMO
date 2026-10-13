import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';
import { prep, jitter, paint, transformed, lerpCol, mergeGeometries, hash3 } from './geoUtil.js';

const PALE = new THREE.Color(0x8f8a78);
const GRIME = new THREE.Color(0x3a4a3a);
const DARK = new THREE.Color(0x56584c);
const tmp = new THREE.Color();

function stonePaint(y0, H, seed = 0) {
  return (x, y, z, f) => {
    const k = Math.max(0, Math.min(1, (y - y0) / H));
    lerpCol(GRIME, PALE, 0.25 + k * 0.75, tmp);
    const n = hash3(Math.floor(x * 2), Math.floor(z * 2), f % 5, seed);
    tmp.lerp(DARK, n * 0.35).multiplyScalar(0.85 + 0.3 * hash3(f, seed, 4));
    return tmp;
  };
}

// Broken pillars, a curved carved wall arc and fallen blocks. One merged geometry.
export function buildRuins() {
  const rng = mulberry32(2024);
  const parts = [];
  const obstacles = [];
  const shadows = [];

  const pillar = (x, z, H, broken) => {
    const cyl = new THREE.CylinderGeometry(0.5, 0.62, H, 8, 1);
    const g = transformed(cyl, [x, H / 2, z], rng() * 6, [1, 1, 1]);
    if (broken) {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        if (p.getY(i) > H - 0.05) p.setY(i, H - hash3(p.getX(i), 0, p.getZ(i), 3) * 0.7 - (p.getX(i) - x) * 0.25);
      }
    }
    jitter(g, 0.06, Math.floor(rng() * 99));
    paint(g, stonePaint(0, H, 1));
    parts.push(g);
    // plinth block + capital
    const base = transformed(new THREE.BoxGeometry(1.5, 0.35, 1.5), [x, 0.15, z], rng() * 6, [1, 1, 1]);
    paint(base, stonePaint(-0.1, 0.5, 2));
    parts.push(base);
    if (!broken) {
      const cap = transformed(new THREE.BoxGeometry(1.35, 0.3, 1.35), [x, H + 0.1, z], rng() * 6, [1, 1, 1]);
      paint(cap, stonePaint(H - 0.3, 0.6, 3));
      parts.push(cap);
    }
    obstacles.push({ x, z, r: 0.62 });
    shadows.push({ x, z, size: 2.4 });
  };

  // pillar ring in the east
  const ring = { x: 21, z: 8.5, r: 3.6 };
  for (let i = 0; i < 7; i++) {
    if (i === 3) continue; // gap
    const a = (i / 7) * Math.PI * 2 + 0.3;
    const broken = i % 2 === 0 || i === 5;
    pillar(ring.x + Math.cos(a) * ring.r, ring.z + Math.sin(a) * ring.r, broken ? 1.3 + rng() * 1.2 : 3.4 + rng() * 0.6, broken);
  }
  // two gate pillars on the north lane
  pillar(-5, -12.5, 3.8, false);
  pillar(5.5, -13, 2.1, true);

  // curved carved wall arc (west)
  const arc = { x: -22, z: 5, r: 5.6, a0: -1.1, a1: 1.5 };
  const nSeg = 15;
  for (let i = 0; i < nSeg; i++) {
    const a = arc.a0 + ((arc.a1 - arc.a0) * i) / (nSeg - 1);
    const px = arc.x + Math.cos(a) * arc.r, pz = arc.z + Math.sin(a) * arc.r;
    const hh = 1.1 + 0.5 * Math.sin(i * 0.9) + (i % 4 === 0 ? 0.35 : 0) - (i > 11 ? 0.45 : 0);
    const rot = -a - Math.PI / 2; // tangent aligned
    const blk = transformed(new THREE.BoxGeometry(0.95, hh, 0.9), [px, hh / 2, pz], rot, [1, 1, 1]);
    jitter(blk, 0.05, i);
    paint(blk, stonePaint(0, hh, 4));
    parts.push(blk);
    // carved dark band on the face
    const band = transformed(new THREE.BoxGeometry(1.0, 0.16, 0.98), [px, hh * 0.62, pz], rot, [1, 1, 1]);
    paint(band, (x, y, z, f) => tmp.copy(DARK).multiplyScalar(0.6 + 0.2 * hash3(f, i, 1)));
    parts.push(band);
    obstacles.push({ x: px, z: pz, r: 0.6 });
    if (i % 2 === 0) shadows.push({ x: px, z: pz, size: 1.8 });
  }

  // fallen blocks
  const blocks = [[-8, 9, 0.4], [9.5, 6, 1.2], [-3, -24, 2.2], [24, -3, 0.8], [-24, 18, 1.9], [3, 25, 0.3]];
  for (const [x, z, yaw] of blocks) {
    const w = 1.6 + rng() * 0.6, d = 1.0, hgt = 0.8;
    const g = transformed(new THREE.BoxGeometry(w, hgt, d), [x, hgt / 2 - 0.05, z], yaw, [1, 1, 1]);
    jitter(g, 0.1, Math.floor(rng() * 50));
    paint(g, stonePaint(-0.1, hgt, 5));
    parts.push(g);
    obstacles.push({ x: x + Math.cos(yaw) * 0.45, z: z - Math.sin(yaw) * 0.45, r: 0.7 });
    obstacles.push({ x: x - Math.cos(yaw) * 0.45, z: z + Math.sin(yaw) * 0.45, r: 0.7 });
    shadows.push({ x, z, size: 2.6 });
  }
  return { geo: mergeGeometries(parts, false), obstacles, shadows };
}
