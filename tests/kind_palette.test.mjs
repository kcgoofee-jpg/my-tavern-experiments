// S7-3 T1 (docs/kernel-schema.md K-R131): the generated colours of undeclared room kinds. Each reads at >= 3:1 on both theme surfaces and every pair is >= 20 apart
// (CIE76 in Lab) for normal vision and under protan, deutan and tritan simulation (the usual full-severity simulation matrices, applied in linear RGB).
import test from 'node:test';
import assert from 'node:assert/strict';
import { KIND_PALETTE, kindColor } from '../map/core/kind-palette.mjs';

const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const LAB = ([r, g, b]) => {
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116), [fx, fy, fz] = [X, Y, Z].map(f);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};
const M = { p: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]], d: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  t: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]] };
const sim = (l, k) => M[k].map(row => Math.max(0, Math.min(1, row[0] * l[0] + row[1] * l[1] + row[2] * l[2])));
const views = h => { const l = rgb(h).map(lin); return [LAB(l), ...['p', 'd', 't'].map(k => LAB(sim(l, k)))]; };

test('the palette has eight valid colours, each at >= 3:1 on both theme surfaces', () => {
  assert.equal(KIND_PALETTE.length, 8); assert.equal(new Set(KIND_PALETTE).size, 8);
  for (const c of KIND_PALETTE) { assert.match(c, /^#[0-9a-f]{6}$/); assert.ok(ratio(rgb(c), rgb('#151b20')) >= 3, c + ' on dark'); assert.ok(ratio(rgb(c), rgb('#f8f5ee')) >= 3, c + ' on light'); }
});
test('every pair is at least 20 apart, for normal vision and under protan, deutan and tritan simulation', () => {
  let min = 1e9;
  for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) {
    const a = views(KIND_PALETTE[i]), b = views(KIND_PALETTE[j]);
    for (let k = 0; k < 4; k++) min = Math.min(min, Math.hypot(...a[k].map((v, n) => v - b[k][n])));
  }
  assert.ok(min >= 20, 'smallest distance ' + min.toFixed(2));
});
test('a kind id picks its colour by a stable hash: the same id, the same colour, always one of the eight', () => {
  const ids = ['hall', 'work', 'rest', 'lab', 'store', 'yard', 'x', 'y'];
  for (const id of ids) { assert.equal(kindColor(id), kindColor(id)); assert.ok(KIND_PALETTE.includes(kindColor(id)), id); }
  assert.ok(new Set(ids.map(kindColor)).size >= 4, 'the hash spreads the ids');
});
