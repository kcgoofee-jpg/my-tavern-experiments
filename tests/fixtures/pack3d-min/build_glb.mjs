// Writes scene/scene.glb: the 3D model of the fixture pack pack3d-min (S7-3): two floor slabs and three room boxes, vertex colours, no textures.
// A GLB is written here by hand (no Blender, no dependency): node tests/fixtures/pack3d-min/build_glb.mjs [out.glb]. tests/pack3d_fixture.test.mjs checks the committed file against this output.
// Layout metres (x east, y north, z up) become glTF (x, z, -y), as the estate page reads them.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = process.argv[2] || fileURLToPath(new URL('./scene/scene.glb', import.meta.url));   // node build_glb.mjs [out.glb]
const box = (x0, x1, y0, y1, z0, z1, rgb) => {   // layout box -> { P, N, C, I } with 24 vertices
  const v = (x, y, z) => [x, z, -y], P = [], N = [], C = [], I = [];
  const faces = [[[0, 0, 1], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [[0, 0, -1], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [x0, y0, z0]],
    [[0, -1, 0], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [[0, 1, 0], [x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1]],
    [[-1, 0, 0], [x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1]], [[1, 0, 0], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]];
  for (const [n, ...q] of faces) { const b = P.length / 3; for (const p of q) { P.push(...v(...p)); N.push(...v(...n)); C.push(...rgb); } I.push(b, b + 1, b + 2, b, b + 2, b + 3); }
  return { P: new Float32Array(P), N: new Float32Array(N), C: new Float32Array(C), I: new Uint16Array(I) };
};
const MESHES = [
  ['slab_L1', box(-12, 12, -8, 8, -0.3, 0, [0.62, 0.6, 0.56])], ['slab_L2', box(-12, 4, -8, 8, 3.7, 4, [0.66, 0.63, 0.58])],
  ['room_atrium', box(-12, 0, -8, 8, 0, 3.4, [0.78, 0.74, 0.66])], ['room_workshop', box(0, 12, -8, 8, 0, 3.4, [0.62, 0.68, 0.74])], ['room_loft', box(-12, 4, -8, 8, 4, 7.4, [0.74, 0.66, 0.7])],
];
const pad = b => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)]);
const chunks = [], views = [], accs = [], prims = [], nodes = [];
let off = 0;
const add = (arr, target, comp, type, minmax) => {
  const b = pad(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength));
  views.push({ buffer: 0, byteOffset: off, byteLength: arr.byteLength, target }); chunks.push(b); off += b.length;
  const a = { bufferView: views.length - 1, componentType: comp, count: arr.length / ({ VEC3: 3, SCALAR: 1 }[type]), type };
  if (minmax) { const n = arr.length / 3, lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], arr[i * 3 + k]); hi[k] = Math.max(hi[k], arr[i * 3 + k]); } a.min = lo; a.max = hi; }
  accs.push(a); return accs.length - 1;
};
for (const [name, m] of MESHES) {
  const p = add(m.P, 34962, 5126, 'VEC3', true), n = add(m.N, 34962, 5126, 'VEC3'), c = add(m.C, 34962, 5126, 'VEC3'), i = add(m.I, 34963, 5123, 'SCALAR');
  prims.push({ name, primitives: [{ attributes: { POSITION: p, NORMAL: n, COLOR_0: c }, indices: i, material: 0 }] }); nodes.push({ name, mesh: prims.length - 1 });
}
const bin = Buffer.concat(chunks);
const json = { asset: { version: '2.0', generator: 'tests/fixtures/pack3d-min/build_glb.mjs' }, scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes, meshes: prims, materials: [{ name: 'flat', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.9 } }], accessors: accs, bufferViews: views, buffers: [{ byteLength: bin.length }] };
const js = Buffer.from(JSON.stringify(json)), jp = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
const head = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + jp.length + 8 + bin.length, 8);
jh.writeUInt32LE(jp.length, 0); jh.writeUInt32LE(0x4e4f534a, 4); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
fs.writeFileSync(OUT, Buffer.concat([head, jh, jp, bh, bin]));
console.log('wrote', OUT, fs.statSync(OUT).size, 'bytes');
