// tests/transit_look.test.mjs — probe asserting TRANSIT-LOOK requirements:
// 1. All 37 transit segments in tc_mid exist in x-paths
// 2. Line-to-rail distance from all sample points on rail lines has median <= 3 px at 1440
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const rd = p => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

// Catmull-Rom spline evaluator matching blender/tiancheng_mid.py
function catmull(pts, n = 200) {
  const P = [pts[0], ...pts, pts[pts.length - 1]];
  const out = [];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    for (let step = 0; step < n; step++) {
      const t = step / n;
      const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t * t + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t ** 3);
      const y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t * t + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t ** 3);
      out.push([x, y]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

test('transit-look: all 37 segments defined in tc_mid x-paths', () => {
  const ov = rd('map/packs/eden/overlay.v2.json');
  const xpaths = ov?.transit?.['x-paths']?.tc_mid;
  assert.ok(xpaths, 'tc_mid x-paths must exist');
  assert.equal(Object.keys(xpaths).length, 37, 'must define all 37 segments (31 line segments + 6 links)');

  // Verify all lines in the pack have their segment polylines in x-paths
  for (const l of ov.transit.lines) {
    for (let i = 0; i < l.stops.length - 1; i++) {
      const fwd = `${l.stops[i]}|${l.stops[i + 1]}`;
      const rev = `${l.stops[i + 1]}|${l.stops[i]}`;
      assert.ok(xpaths[fwd] || xpaths[rev], `missing segment polyline for ${fwd}`);
    }
  }
});

test('transit-look: rail line segments snap to rendered rails with median distance <= 3 px at 1440', () => {
  const ROUTES = [
    [[-16.5, -1.6], [-9, -0.4], [-3.5, 2.6], [2, 3.2], [8, 1.4], [16.5, 2.8]],
    [[-7, -10.5], [-4.6, -4], [-2.2, 1.0], [-4.2, 6.5], [-2.5, 10.5]],
    [[3.2, -10.5], [3.45, -7.4], [4.3, -5.0], [6.0, 1.8], [9.4, 5.2], [12.5, 10.5]],
    [[-16.5, 7.2], [-8.4, 4.9], [-1.5, 7.8], [6.5, 6.4], [16.5, 8.4]],
    [[-16.5, -7.0], [-7.5, -6.2], [0, -3.8], [5.2, -5.35], [10, -4.4], [16.5, -6.0]],
    [[-13.6, 10.5], [-12.6, 3], [-13.5, -3], [-11.8, -10.5]],
  ];

  const cam = rd('map/data/cam/tc_mid_obl.json');
  const { right: r, up: u, frame: { centre_m: c, w_m, h_m } } = cam;

  const railSplinesPx = [];
  ROUTES.forEach((route, k) => {
    const pts = catmull(route, 200);
    const zt = 0.22 + 0.05 * (k % 3);
    const z_m = (zt + 0.03) * 100 + 410.0;
    const pxPts = [];
    for (const p of pts) {
      const worldPt = [p[0] * 100.0, p[1] * 100.0, z_m];
      const dX = [worldPt[0] - c[0], worldPt[1] - c[1], worldPt[2] - c[2]];
      const xc = dX[0] * r[0] + dX[1] * r[1] + dX[2] * r[2];
      const yc = dX[0] * u[0] + dX[1] * u[1] + dX[2] * u[2];
      const uNorm = xc / w_m + 0.5;
      const vNorm = 0.5 - yc / h_m;
      pxPts.push([uNorm * 1440.0, vNorm * 900.0]);
    }
    railSplinesPx.push(pxPts);
  });

  const ov = rd('map/packs/eden/overlay.v2.json');
  const xpaths = ov.transit['x-paths'].tc_mid;
  const lineSegKeys = new Set();
  for (const l of ov.transit.lines) {
    for (let i = 0; i < l.stops.length - 1; i++) {
      lineSegKeys.add(`${l.stops[i]}|${l.stops[i + 1]}`);
    }
  }

  const allDists = [];
  for (const segKey of lineSegKeys) {
    const [a, b] = segKey.split('|');
    const pts = xpaths[segKey] || xpaths[`${b}|${a}`];
    assert.ok(pts, `missing polyline for ${segKey}`);
    const segPx = pts.map(p => [p[0] * 1440.0, p[1] * 900.0]);
    for (const pt of segPx) {
      let minD = Infinity;
      for (const spline of railSplinesPx) {
        for (const sp of spline) {
          const d = Math.hypot(sp[0] - pt[0], sp[1] - pt[1]);
          if (d < minD) minD = d;
        }
      }
      allDists.push(minD);
    }
  }

  allDists.sort((a, b) => a - b);
  const medianD = allDists[Math.floor(allDists.length / 2)];
  const p90D = allDists[Math.floor(allDists.length * 0.9)];
  assert.ok(allDists.length >= 300, `sampled ${allDists.length} points along rail lines`);
  assert.ok(medianD <= 3.0, `median distance ${medianD.toFixed(3)} px must be <= 3 px at 1440`);
  assert.ok(p90D <= 3.0, `90th percentile distance ${p90D.toFixed(3)} px must be <= 3 px at 1440`);
});
