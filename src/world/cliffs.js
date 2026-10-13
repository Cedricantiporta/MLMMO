import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';
import { WALLS, sampleChain } from './layout.js';
import { prep, jitter, paint, transformed, lerpCol, mergeGeometries, hash3 } from './geoUtil.js';

const BASE = new THREE.Color(0x2a3431);
const MID = new THREE.Color(0x6d6858);
const TOP = new THREE.Color(0x978a70);
const MOSS_LO = new THREE.Color(0x12281a);
const MOSS_HI = new THREE.Color(0x335a28);
const tmp = new THREE.Color();
const tmp2 = new THREE.Color();

// Builds every cliff wall as ONE merged vertex-coloured geometry. Returns collision circles and top-edge info.
export function buildCliffs(rng = mulberry32(99)) {
  const parts = [];
  const obstacles = [];
  const tops = []; // {x,z,h,nx,nz,t} samples along wall tops for foliage
  const dode = new THREE.DodecahedronGeometry(1, 0);
  const cyl = new THREE.CylinderGeometry(1, 1.12, 0.5, 7, 1);

  for (const wall of WALLS) {
    const samples = sampleChain(wall.pts, wall.spacing);
    const rows = wall.t > 3 ? 2 : 2;
    const { t, h } = wall;
    samples.forEach((s, si) => {
      const nx = -s.tz, nz = s.tx;
      const wob = Math.sin(s.s * 0.45 + wall.pts[0][0]) * 0.35 + Math.sin(s.s * 1.3) * 0.15;
      const hv = h * (0.9 + 0.18 * hash3(s.x, s.z, 3, 1)) + Math.sin(s.s * 0.37) * 0.15;
      for (let r = 0; r < rows; r++) {
        const off = (r / (rows - 1) - 0.5) * (t - 1.5) + wob + (rng() - 0.5) * 0.3;
        const cx = s.x + nx * off, cz = s.z + nz * off;
        const rad = t * 0.36 + rng() * 0.3;
        // lower, wide tier
        const hl = hv * (0.55 + rng() * 0.2);
        const yaw = rng() * 6.28;
        parts.push(rockBlock(dode, [cx, hl * 0.5 - 0.35, cz], yaw, [rad * (1 + rng() * 0.25), hl * 0.5 + 0.35, rad * (0.95 + rng() * 0.2)], hv, rng));
        // upper tier slightly inset, reaching the top
        const ic = rad * 0.85;
        parts.push(rockBlock(dode, [cx + (rng() - 0.5) * 0.4, hl + (hv - hl) * 0.5 - 0.05, cz + (rng() - 0.5) * 0.4], yaw + 1, [ic, (hv - hl) * 0.5 + 0.3, ic * (0.9 + rng() * 0.3)], hv, rng));
        // mossy cap puck, overhanging the rock edge
        const cap = transformed(cyl, [cx, hv - 0.06, cz], rng() * 6.28, [rad * 1.0, 0.4 + rng() * 0.12, rad * 1.0]);
        jitter(cap, 0.2, si + r);
        paint(cap, (x, y, z, f) => {
          const k = hash3(x * 0.8, 0, z * 0.8, 5);
          const yy = (y - (hv - 0.3)) / 0.7;
          lerpCol(MOSS_LO, MOSS_HI, 0.25 + k * 0.55 + yy * 0.25, tmp);
          return tmp.multiplyScalar(0.85 + 0.3 * hash3(f, 1, 2));
        });
        parts.push(cap);
      }
      tops.push({ x: s.x, z: s.z, h: hv, nx, nz, t, wall: wall.id });
      if (wall.collide && si % 1 === 0) obstacles.push({ x: s.x + nx * wob * 0.5, z: s.z + nz * wob * 0.5, r: t / 2 + 0.05 });
    });
  }
  const geo = mergeGeometries(parts, false);
  return { geo, obstacles, tops };
}

function rockBlock(dode, pos, yaw, sc, H, rng) {
  const g = transformed(dode, pos, yaw, sc);
  jitter(g, 0.45, Math.floor(rng() * 1000));
  const bandPh = rng() * 6;
  paint(g, (x, y, z, f) => {
    const k = Math.max(0, Math.min(1, y / H));
    if (k < 0.5) lerpCol(BASE, MID, k / 0.5, tmp); else lerpCol(MID, TOP, (k - 0.5) / 0.5, tmp);
    // facet tint (warm/cool) + strata banding
    const ft = hash3(f, bandPh, 7);
    tmp2.setRGB(0.88 + ft * 0.26, 0.9 + hash3(f, 2, 3) * 0.18, 0.86 + hash3(f, 5, 9) * 0.22);
    tmp.multiply(tmp2).multiplyScalar(0.9 + 0.12 * Math.sin(y * 5.5 + bandPh));
    // mossy stain near the base
    if (k < 0.18) tmp.lerp(MOSS_LO, 0.35 * (1 - k / 0.18));
    return tmp;
  });
  return g;
}
