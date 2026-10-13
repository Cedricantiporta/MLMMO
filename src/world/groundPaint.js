import { mulberry32 } from '../core/rng.js';

// Procedurally paints the flat ground texture once: grass, soft shade blobs, soil clearings and
// dirt paths (drawn as unions of discs, so the same discs double as keep-out zones for props).
const CLEARINGS = [
  { x: 0, z: 0, r: 7 },
  { x: -16, z: -12, r: 4.6 },
  { x: 15, z: -16, r: 4.2 },
  { x: 14, z: 13, r: 5 },
];
// Catmull-Rom control points (world x,z) and path half-width.
const PATHS = [
  { w: 1.7, pts: [[-34, -24], [-26, -17], [-16, -12], [-9, -6], [0, 0], [8, 6], [14, 13], [22, 20], [34, 24]] },
  { w: 1.5, pts: [[15, -34], [14, -26], [15, -16], [8, -8], [0, 0], [-8, 8], [-14, 18], [-22, 34]] },
];

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
}

export function paintGround({ size, px = 2048, seed, maxGrassTex = 0 }) {
  const rng = mulberry32(seed + 17);
  const R = (a, b) => a + rng() * (b - a);
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const g = cv.getContext('2d');
  const k = px / size; // pixels per world unit
  const X = (x) => (x + size / 2) * k;
  const Z = (z) => (z + size / 2) * k; // canvas top = world -Z
  const disc = (x, z, r) => { g.beginPath(); g.arc(X(x), Z(z), Math.max(0.1, r * k), 0, Math.PI * 2); g.fill(); };

  // ---- soil discs: clearings (with lumps) + path samples ----
  const soil = [];
  for (const c of CLEARINGS) {
    soil.push({ x: c.x, z: c.z, r: c.r * 0.92 });
    const lumps = Math.round(c.r * 3.2);
    for (let i = 0; i < lumps; i++) {
      const a = (i / lumps) * Math.PI * 2 + R(-0.1, 0.1);
      const lr = c.r * R(0.22, 0.34);
      const d = c.r * R(0.72, 0.9);
      soil.push({ x: c.x + Math.cos(a) * d, z: c.z + Math.sin(a) * d, r: lr });
    }
  }
  for (const p of PATHS) {
    const pts = [p.pts[0], ...p.pts, p.pts[p.pts.length - 1]];
    let wob = 0;
    for (let i = 1; i < pts.length - 2; i++) {
      const steps = 14;
      for (let s = 0; s < steps; s++) {
        const [x, z] = catmull(pts[i - 1], pts[i], pts[i + 1], pts[i + 2], s / steps);
        wob = wob * 0.85 + R(-0.18, 0.18);
        soil.push({ x, z, r: p.w * (1 + wob) });
      }
    }
  }
  const drawSoil = (grow) => { for (const d of soil) disc(d.x, d.z, d.r + grow); };

  // ---- base grass ----
  g.fillStyle = '#7cc35a';
  g.fillRect(0, 0, px, px);

  // soft large shade blobs
  const shade = (rgb, a, n, r0, r1) => {
    for (let i = 0; i < n; i++) {
      const x = R(-size / 2, size / 2);
      const z = R(-size / 2, size / 2);
      const r = R(r0, r1) * k;
      const gr = g.createRadialGradient(X(x), Z(z), r * 0.15, X(x), Z(z), r);
      gr.addColorStop(0, `rgba(${rgb},${a})`);
      gr.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gr;
      g.fillRect(X(x) - r, Z(z) - r, r * 2, r * 2);
    }
  };
  shade('148,214,102', 0.5, 22, 3, 7);
  shade('92,168,66', 0.42, 20, 3, 7);
  // a few flat bushier darker-green clusters
  g.fillStyle = 'rgba(104,176,72,0.55)';
  for (let i = 0; i < 12; i++) {
    const x = R(-size / 2 + 4, size / 2 - 4);
    const z = R(-size / 2 + 4, size / 2 - 4);
    const n = 5 + Math.floor(R(0, 4));
    for (let j = 0; j < n; j++) disc(x + R(-1.6, 1.6), z + R(-1.1, 1.1), R(0.8, 1.5));
  }
  g.fillStyle = 'rgba(150,215,106,0.5)';
  for (let i = 0; i < 8; i++) {
    const x = R(-size / 2 + 4, size / 2 - 4);
    const z = R(-size / 2 + 4, size / 2 - 4);
    for (let j = 0; j < 5; j++) disc(x + R(-1.5, 1.5), z + R(-1, 1), R(0.8, 1.4));
  }

  // ---- grass rim: darker scalloped bushy edge slightly larger than soil ----
  g.fillStyle = '#5ba73f';
  drawSoil(0.55);
  for (const d of soil) {
    const n = Math.max(6, Math.round(d.r * 5));
    const off = R(0, 6.28);
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * Math.PI * 2;
      disc(d.x + Math.cos(a) * (d.r + 0.45), d.z + Math.sin(a) * (d.r + 0.45), R(0.35, 0.6));
    }
  }
  // lighter lip just outside the dark rim shadow (tiny highlight on top of the bush edge)
  g.fillStyle = '#68b449';
  drawSoil(0.3);

  // ---- soil ----
  g.fillStyle = '#b57444'; // darker inner edge
  drawSoil(0);
  g.fillStyle = '#c98f5a';
  drawSoil(-0.32);

  // lighter soil highlights
  g.fillStyle = 'rgba(232,186,132,0.5)';
  for (let i = 0; i < 70; i++) {
    const d = soil[Math.floor(rng() * soil.length)];
    if (d.r < 1) continue;
    const a = R(0, 6.28);
    const rr = Math.sqrt(rng()) * d.r * 0.55;
    g.beginPath();
    g.ellipse(X(d.x + Math.cos(a) * rr), Z(d.z + Math.sin(a) * rr), R(0.4, 1.1) * k, R(0.25, 0.6) * k, R(0, 3), 0, Math.PI * 2);
    g.fill();
  }
  // a few darker soil patches
  g.fillStyle = 'rgba(160,100,60,0.35)';
  for (let i = 0; i < 40; i++) {
    const d = soil[Math.floor(rng() * soil.length)];
    if (d.r < 1) continue;
    const a = R(0, 6.28);
    const rr = Math.sqrt(rng()) * d.r * 0.5;
    g.beginPath();
    g.ellipse(X(d.x + Math.cos(a) * rr), Z(d.z + Math.sin(a) * rr), R(0.4, 0.9) * k, R(0.25, 0.5) * k, R(0, 3), 0, Math.PI * 2);
    g.fill();
  }

  // pebbles: darker underside + light top
  for (let i = 0; i < 110; i++) {
    const d = soil[Math.floor(rng() * soil.length)];
    const a = R(0, 6.28);
    const rr = Math.sqrt(rng()) * Math.max(0, d.r - 0.4) * 0.8;
    const x = d.x + Math.cos(a) * rr;
    const z = d.z + Math.sin(a) * rr;
    const w = R(0.13, 0.26) * k;
    const h = w * R(0.6, 0.8);
    const rot = R(-0.5, 0.5);
    g.fillStyle = '#8b6446';
    g.beginPath(); g.ellipse(X(x) + 1, Z(z) + h * 0.35, w, h, rot, 0, Math.PI * 2); g.fill();
    g.fillStyle = rng() < 0.5 ? '#d8cfbe' : '#c4bba8';
    g.beginPath(); g.ellipse(X(x), Z(z), w, h, rot, 0, Math.PI * 2); g.fill();
  }

  return { canvas: cv, soil };
}

// True if (x,z) lies within `margin` of any painted soil disc.
export function nearSoil(soil, x, z, margin = 0) {
  for (const d of soil) {
    const rr = d.r + margin;
    const dx = x - d.x;
    const dz = z - d.z;
    if (dx * dx + dz * dz < rr * rr) return true;
  }
  return false;
}
