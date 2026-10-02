// N12：glb 近共面重叠面审计（z-fighting 的几何根源）。
// 用法：node tools/audit_coplanar.mjs <a.glb> [b.glb …] [--eps 0.03] [--json out.json] [--fail] [--baseline tools/coplanar_baseline.json [--update]]
// 读 glb（含 EXT_meshopt_compression / KHR_mesh_quantization），算世界坐标三角形，找「法线平行 + 平面距离 ≤ eps + 二维投影有面积重叠」的三角形对，
// 按（mesh 对 + 平面高度）归并后打印。--fail：有任何一对就以 1 退出。纯 node，不依赖 three。
// --baseline（E-13）：只数「会闪的」——同朝向、顶点色不同、平面距离 ≥ 0.5 mm（`fights`）；超过账本（--slack 0.05 = 留 5% 余量，建模线日常加家具不被卡住）就以 1 退出（--update 写账本，减少时请降账本）。
// 其余的不在门里：背靠背的隐藏面、完全重合的重复面（深度完全相同，谁赢是确定的，不闪）、24 位深度 + 近远平面按场景收紧（N12，0.06 mm 一档）能分开的 0.5–30 mm 间距。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MeshoptDecoder } from '../map/estate/vendor/jsm/libs/meshopt_decoder.module.js';

const CT = { 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] };
const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

export async function readGlb(file) {
  await MeshoptDecoder.ready;
  const b = fs.readFileSync(file);
  let off = 12, json = null, bin = null;
  while (off < b.length) {
    const len = b.readUInt32LE(off), type = b.readUInt32LE(off + 4);
    const d = b.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(d.toString()); else if (type === 0x004e4942) bin = d;
    off += 8 + len;
  }
  const views = json.bufferViews.map((bv) => {
    const mo = bv.extensions?.EXT_meshopt_compression;
    if (mo) {
      const src = bin.subarray(mo.byteOffset || 0, (mo.byteOffset || 0) + mo.byteLength);
      const out = new Uint8Array(mo.count * mo.byteStride);
      MeshoptDecoder.decodeGltfBuffer(out, mo.count, mo.byteStride, new Uint8Array(src), mo.mode, mo.filter || 'NONE');
      return { data: out, stride: bv.byteStride || mo.byteStride };
    }
    return { data: bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength), stride: bv.byteStride };
  });
  const acc = (i) => {
    const a = json.accessors[i], v = views[a.bufferView], [Ctor, sz] = CT[a.componentType], n = NC[a.type];
    const stride = v.stride || sz * n, out = new Float64Array(a.count * n);
    const dv = new DataView(v.data.buffer, v.data.byteOffset, v.data.byteLength);
    const get = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[a.componentType];
    const norm = a.normalized ? { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }[a.componentType] : 0;
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) {
      let x = dv[get]((a.byteOffset || 0) + k * stride + c * sz, true);
      if (norm) x = a.componentType === 5121 || a.componentType === 5123 ? x / norm : Math.max(x / norm, -1);
      out[k * n + c] = x;
    }
    return out;
  };
  return { json, acc };
}

function mulTRS(n) {   // 返回列主序 4x4
  if (n.matrix) return n.matrix.slice();
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
}

/** 世界坐标三角形：[{ mesh, prim, p: Float64Array(9) }] */
export async function worldTris(file) {
  const { json, acc } = await readGlb(file);
  const tris = [];
  const walk = (ni, parent) => {
    const n = json.nodes[ni], m = mulM(parent, mulTRS(n));
    if (n.mesh != null) {
      json.meshes[n.mesh].primitives.forEach((pr, pi) => {
        if ((pr.mode ?? 4) !== 4) return;
        const pos = acc(pr.attributes.POSITION), idx = pr.indices != null ? acc(pr.indices) : null;
        const W = new Float64Array(pos.length);
        for (let k = 0; k < pos.length / 3; k++) {
          const x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2];
          W[k * 3] = m[0] * x + m[4] * y + m[8] * z + m[12]; W[k * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]; W[k * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
        }
        const col = pr.attributes.COLOR_0 != null ? acc(pr.attributes.COLOR_0) : null, cn = col ? col.length / (pos.length / 3) : 0;
        const nt = (idx ? idx.length : pos.length / 3) / 3;
        for (let t = 0; t < nt; t++) {
          const i = [0, 1, 2].map((c) => (idx ? idx[t * 3 + c] : t * 3 + c));
          const cc = col ? [0, 1, 2].map((k) => (col[i[0] * cn + k] + col[i[1] * cn + k] + col[i[2] * cn + k]) / 3) : null;
          tris.push({ mesh: n.name || ('mesh' + n.mesh), prim: pi, mat: pr.material, col: cc, p: Float64Array.from([...W.subarray(i[0] * 3, i[0] * 3 + 3), ...W.subarray(i[1] * 3, i[1] * 3 + 3), ...W.subarray(i[2] * 3, i[2] * 3 + 3)]) });
        }
      });
    }
    (n.children || []).forEach((c) => walk(c, m));
  };
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const sc = json.scenes[json.scene ?? 0];
  sc.nodes.forEach((n) => walk(n, I));
  return { tris, json };
}
function mulM(a, b) { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; }

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** 两个近共面三角形在平面内的二维投影是否有面积重叠（SAT，穿透 > tol 才算；仅共边 / 共点不算） */
function overlap2d(A, B, nrm, tol) {
  const ax = Math.abs(nrm[0]) > Math.abs(nrm[1]) && Math.abs(nrm[0]) > Math.abs(nrm[2]) ? 0 : Math.abs(nrm[1]) > Math.abs(nrm[2]) ? 1 : 2;
  const [u, v] = ax === 0 ? [1, 2] : ax === 1 ? [0, 2] : [0, 1];
  const P = (T) => [[T[u], T[v]], [T[3 + u], T[3 + v]], [T[6 + u], T[6 + v]]];
  const a = P(A), b = P(B);
  for (const T of [a, b]) for (let i = 0; i < 3; i++) {
    const p = T[i], q = T[(i + 1) % 3], ex = q[0] - p[0], ey = q[1] - p[1], l = Math.hypot(ex, ey) || 1, nx = -ey / l, ny = ex / l;
    let amin = 1e30, amax = -1e30, bmin = 1e30, bmax = -1e30;
    for (const s of a) { const d = s[0] * nx + s[1] * ny; amin = Math.min(amin, d); amax = Math.max(amax, d); }
    for (const s of b) { const d = s[0] * nx + s[1] * ny; bmin = Math.min(bmin, d); bmax = Math.max(bmax, d); }
    if (Math.min(amax, bmax) - Math.max(amin, bmin) <= tol) return false;
  }
  return true;
}

/** 找近共面重叠对。返回 [{ a, b, d, same (法线同向), nrm, c (重叠中心) }] */
export function findCoplanar(tris, { eps = 0.03, cell = 4, minArea = 1e-4, tol = 2e-3 } = {}) {
  const meta = tris.map((t) => {
    const p = t.p, e1 = sub([p[3], p[4], p[5]], [p[0], p[1], p[2]]), e2 = sub([p[6], p[7], p[8]], [p[0], p[1], p[2]]);
    const c = cross(e1, e2), l = Math.hypot(...c);
    if (l < 2 * minArea) return null;
    const n = [c[0] / l, c[1] / l, c[2] / l];
    return { n, d0: dot(n, [p[0], p[1], p[2]]), lo: [Math.min(p[0], p[3], p[6]) - eps, Math.min(p[1], p[4], p[7]) - eps, Math.min(p[2], p[5], p[8]) - eps], hi: [Math.max(p[0], p[3], p[6]) + eps, Math.max(p[1], p[4], p[7]) + eps, Math.max(p[2], p[5], p[8]) + eps] };
  });
  const grid = new Map(), out = [];
  const key = (x, y, z) => x + ',' + y + ',' + z;
  tris.forEach((t, i) => {
    const m = meta[i]; if (!m) return;
    for (let x = Math.floor(m.lo[0] / cell); x <= Math.floor(m.hi[0] / cell); x++) for (let y = Math.floor(m.lo[1] / cell); y <= Math.floor(m.hi[1] / cell); y++) for (let z = Math.floor(m.lo[2] / cell); z <= Math.floor(m.hi[2] / cell); z++) {
      const k = key(x, y, z); (grid.get(k) || grid.set(k, []).get(k)).push(i);
    }
  });
  const seen = new Set();
  for (const list of grid.values()) {
    for (let ii = 0; ii < list.length; ii++) for (let jj = ii + 1; jj < list.length; jj++) {
      const i = list[ii], j = list[jj], k = i < j ? i * 4e6 + j : j * 4e6 + i;
      const A = meta[i], B = meta[j];
      const nd = dot(A.n, B.n); if (Math.abs(nd) < 0.9995) continue;
      if (A.lo[0] > B.hi[0] || B.lo[0] > A.hi[0] || A.lo[1] > B.hi[1] || B.lo[1] > A.hi[1] || A.lo[2] > B.hi[2] || B.lo[2] > A.hi[2]) continue;
      // 平面距离：B 三个顶点到 A 平面的距离都 ≤ eps
      const pb = tris[j].p; let dmax = 0, dmin = 1e9;
      for (let c = 0; c < 3; c++) { const d = Math.abs(dot(A.n, [pb[c * 3], pb[c * 3 + 1], pb[c * 3 + 2]]) - A.d0); dmax = Math.max(dmax, d); dmin = Math.min(dmin, d); }
      if (dmax > eps) continue;
      if (seen.has(k)) continue; seen.add(k);
      if (!overlap2d(tris[i].p, pb, A.n, tol)) continue;
      const pa = tris[i].p;
      const ca = tris[i].col, cb = tris[j].col, dc = ca && cb ? Math.max(Math.abs(ca[0] - cb[0]), Math.abs(ca[1] - cb[1]), Math.abs(ca[2] - cb[2])) : 0;   // 没有顶点色（贴图材质）= 不判颜色差
      out.push({ a: i, b: j, d: dmax, dc, same: nd > 0, nrm: A.n, c: [(pa[0] + pa[3] + pa[6] + pb[0] + pb[3] + pb[6]) / 6, (pa[1] + pa[4] + pa[7] + pb[1] + pb[4] + pb[7]) / 6, (pa[2] + pa[5] + pa[8] + pb[2] + pb[5] + pb[8]) / 6] });
    }
  }
  return out;
}

/** 按（mesh 对、朝向、平面类型、平面高度 0.05 m 档）归并成可读的行 */
export function summarize(tris, pairs) {
  const g = new Map();
  for (const p of pairs) {
    const A = tris[p.a], B = tris[p.b], ax = Math.abs(p.nrm[1]) > 0.9 ? 'horiz' : 'vert';
    const lvl = ax === 'horiz' ? 'y=' + (Math.round(p.c[1] / 0.05) * 0.05).toFixed(2) : 'n=' + p.nrm.map((x) => x.toFixed(1)).join(',');
    const names = [A.mesh, B.mesh].sort().join(' x ');
    const k = `${names} | ${ax} ${p.same ? 'same-dir' : 'opposed'} | ${lvl}`;
    const r = g.get(k) || g.set(k, { key: k, n: 0, vis: 0, exact: 0, dmin: 1e9, dmax: 0, at: p.c }).get(k);
    r.n++; if (p.dc > 0.03) r.vis++; if (p.d < 0.0005) r.exact++; r.dmin = Math.min(r.dmin, p.d); r.dmax = Math.max(r.dmax, p.d);
  }
  return [...g.values()].sort((x, y) => y.vis - x.vis || y.n - x.n);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), files = [];
  let eps = 0.03, jout = null, fail = false, base = null, update = false, slack = 0;
  for (let i = 0; i < args.length; i++) { if (args[i] === '--eps') eps = +args[++i]; else if (args[i] === '--json') jout = args[++i]; else if (args[i] === '--fail') fail = true; else if (args[i] === '--baseline') base = args[++i]; else if (args[i] === '--update') update = true; else if (args[i] === '--slack') slack = +args[++i]; else files.push(args[i]); }
  let total = 0; const all = {}, counts = {};
  for (const f of files) {
    const { tris } = await worldTris(f);
    const pairs = findCoplanar(tris, { eps });
    const rows = summarize(tris, pairs);
    counts[f] = { pairs: pairs.length, fights: pairs.filter((p) => p.same && p.dc > 0.03 && p.d >= 0.0005).length };
    total += pairs.length; all[f] = { tris: tris.length, pairs: pairs.length, groups: rows };
    const vis = pairs.filter((p) => p.dc > 0.03).length, same = pairs.filter((p) => p.same).length;
    console.log(`\n${f}: ${tris.length} triangles, ${pairs.length} near-coplanar overlapping pairs (eps ${eps} m; ${same} same-direction, ${vis} with different vertex colour = visible fights), ${rows.length} groups`);
    for (const r of rows.slice(0, 60)) console.log(`  ${String(r.n).padStart(6)} (colour-differs ${String(r.vis).padStart(5)}, exact ${String(r.exact).padStart(5)})  d ${r.dmin.toFixed(4)}..${r.dmax.toFixed(4)}  ${r.key}  @(${r.at.map((x) => x.toFixed(1)).join(', ')})`);
  }
  if (jout) fs.writeFileSync(jout, JSON.stringify(all, null, 1));
  console.log(`\ntotal pairs: ${total}`);
  if (fail && total) process.exit(1);
  if (base) {
    const key = (f) => path.relative(process.cwd(), path.resolve(f));
    const cur = Object.fromEntries(Object.entries(counts).map(([f, c]) => [key(f), c]));
    if (update) { fs.writeFileSync(base, JSON.stringify(cur, null, 1) + '\n'); console.log('baseline written: ' + base); }
    else {
      const ledger = JSON.parse(fs.readFileSync(base, 'utf8')); let bad = 0;
      for (const [f, c] of Object.entries(cur)) {
        const b = ledger[f]; if (!b) { console.log(`✗ ${f}: not in the baseline (run with --update)`); bad++; continue; }
        const ok = c.fights <= Math.floor(b.fights * (1 + slack)); if (!ok) bad++;
        console.log(`${ok ? '✓' : '✗'} ${f}: flicker candidates (same direction, different colour, >= 0.5 mm) ${c.fights} (baseline ${b.fights}${slack ? `, headroom ${slack * 100}%` : ''})${c.fights < b.fights ? ' — lower the baseline with --update' : ''}; all near-coplanar pairs ${c.pairs} (baseline ${b.pairs}, informational)`);
      }
      if (bad) process.exit(1);
    }
  }
}
