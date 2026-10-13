import { mulberry32 } from '../core/rng.js';
import { WALLS, PATHS, RIVER, RIVER_CURVE, catmull } from './layout.js';

// Dark mossy jungle floor painted once into a single texture: grass noise, soft large variation,
// ambient-occlusion-like darkening along cliffs, muted dirt lanes, river banks and pebbles.
export function paintGround({ size, px = 2048, seed }) {
  const rng = mulberry32(seed + 17);
  const R = (a, b) => a + rng() * (b - a);
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const g = cv.getContext('2d');
  const k = px / size;
  const X = (x) => (x + size / 2) * k;
  const Z = (z) => (z + size / 2) * k;

  g.fillStyle = '#1d3b24';
  g.fillRect(0, 0, px, px);

  const blob = (rgb, a, n, r0, r1) => {
    for (let i = 0; i < n; i++) {
      const x = R(-size / 2, size / 2), z = R(-size / 2, size / 2), r = R(r0, r1) * k;
      const gr = g.createRadialGradient(X(x), Z(z), r * 0.1, X(x), Z(z), r);
      gr.addColorStop(0, `rgba(${rgb},${a})`);
      gr.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gr;
      g.fillRect(X(x) - r, Z(z) - r, r * 2, r * 2);
    }
  };
  blob('46,92,48', 0.55, 40, 3, 8);     // lighter moss
  blob('14,40,30', 0.55, 40, 3, 8);     // deep teal-green
  blob('84,100,44', 0.22, 18, 2, 5);    // yellowish moss
  blob('60,48,32', 0.2, 12, 2, 4);      // earth

  // stroke a polyline as a soft band using stacked translucent strokes
  const band = (pts, w, rgb, aEach, layers, grow = 2.2) => {
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (let i = 0; i < layers; i++) {
      const ww = w * (1 + (grow - 1) * (1 - i / (layers - 1)));
      g.strokeStyle = `rgba(${rgb},${aEach})`;
      g.lineWidth = ww * k;
      g.beginPath();
      pts.forEach(([x, z], j) => (j ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z))));
      g.stroke();
    }
  };

  // dirt lanes (muted, soft edges, no rims)
  for (const p of PATHS) {
    const c = catmull(p.pts, 10).map(([x, z], i) => [x + Math.sin(i * 0.7) * 0.25, z + Math.cos(i * 0.5) * 0.25]);
    band(c, p.w * 1.6, '88,70,46', 0.10, 7, 2.3);
    band(c, p.w * 1.1, '102,82,54', 0.16, 4, 1.4);
    // wheel-ruts / worn core
    band(c, p.w * 0.45, '120,98,66', 0.10, 3, 1.5);
  }
  // spawn clearing trampled earth
  blob('96,78,52', 0.45, 6, 3, 5.5);

  // river banks: damp mud then dark bed
  const rc = RIVER_CURVE;
  band(rc, RIVER.w + 1.6, '40,50,34', 0.1, 6, 1.8);
  band(rc, RIVER.w + 1.0, '78,68,48', 0.5, 1, 1);
  band(rc, RIVER.w + 0.3, '30,40,34', 0.7, 1, 1);
  band(rc, RIVER.w - 0.2, '8,34,38', 0.95, 1, 1);

  // cliff footprints: AO darkening + dark mossy damp strip
  for (const w of WALLS) {
    band(w.pts, w.t + 1.2, '4,16,14', 0.09, 8, 2.9);
    band(w.pts, w.t + 0.4, '3,12,10', 0.5, 1, 1);
  }

  // grass speckle for micro-texture
  const dots = ['#2d5a30', '#173a24', '#3b6b34', '#0f2a1e', '#456e30', '#27482a'];
  for (let i = 0; i < 70000; i++) {
    g.globalAlpha = R(0.12, 0.4);
    g.fillStyle = dots[(rng() * dots.length) | 0];
    const x = rng() * px, y = rng() * px;
    g.fillRect(x, y, R(1, 2.6), R(2, 6));
  }
  g.globalAlpha = 1;

  // muted pebbles
  for (let i = 0; i < 260; i++) {
    const x = R(-size / 2 + 2, size / 2 - 2), z = R(-size / 2 + 2, size / 2 - 2);
    const w = R(0.07, 0.17) * k, h = w * R(0.6, 0.85), rot = R(0, 3);
    g.fillStyle = 'rgba(8,16,12,0.45)';
    g.beginPath(); g.ellipse(X(x) + 1, Z(z) + h * 0.4, w, h, rot, 0, 6.3); g.fill();
    g.fillStyle = rng() < 0.5 ? '#6a6a5c' : '#585a4d';
    g.beginPath(); g.ellipse(X(x), Z(z), w, h, rot, 0, 6.3); g.fill();
  }

  // outer fade so the play-field edge melts into the cliffs
  return { canvas: cv };
}
