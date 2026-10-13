// Static map layout shared by ground painting, geometry and collision. World units, map is [-28,28]^2.
export const WALLS = [
  // outer cliffs: west/north/east are tall, the south (camera side) stays low so it never hides the hero
  { id: 'outer', pts: [[-29.4, 29.4], [-29.4, -29.4], [29.4, -29.4], [29.4, 29.4]], t: 2.8, h: 3.5, spacing: 1.9, collide: false },
  { id: 'south', pts: [[-29.4, 29.4], [29.4, 29.4]], t: 2.8, h: 1.5, spacing: 1.9, collide: false },
  // interior plateaus forming lanes / pockets
  { id: 'w1', pts: [[-29, -6], [-19, -6], [-13, -11], [-13, -18]], t: 3.4, h: 3.1, spacing: 1.4, collide: true },
  { id: 'w2', pts: [[29, -8], [21, -8], [16, -14], [16, -20]], t: 3.4, h: 3.0, spacing: 1.4, collide: true },
  { id: 'w3', pts: [[-18, 29], [-18, 19], [-10, 14]], t: 3.4, h: 2.8, spacing: 1.4, collide: true },
  { id: 'w4', pts: [[10, 29], [10, 21], [17, 16], [22, 16]], t: 3.4, h: 2.8, spacing: 1.4, collide: true },
];

export const RIVER = {
  w: 3.4,
  pts: [[-32, -23], [-24, -24.5], [-17, -23], [-10, -19.5], [-2, -17], [6, -19.5], [12, -25], [15, -32]],
};

// Muted dirt lanes (painted only).
export const PATHS = [
  { w: 1.5, pts: [[-30, -1.5], [-14, -1], [0, 0], [12, 1], [20, 3], [30, 6]] },
  { w: 1.4, pts: [[0, 0], [2, 12], [0, 20], [2, 30]] },
  { w: 1.3, pts: [[0, 0], [-3, -10], [2, -17], [2, -30]] },
];

export const SPAWN_CLEAR = 7;

export function catmull(pts, per = 8) {
  const P = [pts[0], ...pts, pts[pts.length - 1]];
  const out = [];
  for (let i = 1; i < P.length - 2; i++) {
    for (let s = 0; s < per; s++) {
      const t = s / per, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(P[i - 1][0], P[i][0], P[i + 1][0], P[i + 2][0]), f(P[i - 1][1], P[i][1], P[i + 1][1], P[i + 2][1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// Resample a polyline at roughly even spacing; returns {x,z,tx,tz,s}.
export function sampleChain(pts, spacing) {
  const out = [];
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const tx = (x1 - x0) / len, tz = (z1 - z0) / len;
    const n = Math.max(1, Math.round(len / spacing));
    for (let k = 0; k < n; k++) {
      const u = k / n;
      out.push({ x: x0 + (x1 - x0) * u, z: z0 + (z1 - z0) * u, tx, tz, s: acc + len * u });
    }
    acc += len;
  }
  const [lx, lz] = pts[pts.length - 1];
  const l = out[out.length - 1];
  out.push({ x: lx, z: lz, tx: l.tx, tz: l.tz, s: acc });
  return out;
}

export const RIVER_CURVE = catmull(RIVER.pts, 10);
const RIVER_DENSE = (() => {
  const d = [];
  for (let i = 0; i < RIVER_CURVE.length - 1; i++) {
    const [x0, z0] = RIVER_CURVE[i], [x1, z1] = RIVER_CURVE[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.4));
    for (let k = 0; k < n; k++) d.push([x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n]);
  }
  return d;
})();

export function riverDistance(x, z) {
  let best = 1e9;
  for (const [px, pz] of RIVER_DENSE) {
    const d = (px - x) * (px - x) + (pz - z) * (pz - z);
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}
