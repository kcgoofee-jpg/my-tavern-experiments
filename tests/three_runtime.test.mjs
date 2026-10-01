// Part 3 §3–§5：共享三维运行时（map/three/*）的 node 单测。
// 全部用假 THREE / 假渲染器：这里测的是「策略与接线」，不是 three 本身（three 的行为由浏览器探针守）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRenderer, pickDpr, governor, TIERS } from '../map/three/render-context.mjs';
import { prepare, sphereOf, unionSpheres, distanceMetric } from '../map/three/culling.mjs';
import { createLodController } from '../map/three/lod-controller.mjs';
import { batch, resolveInstance, writeMatrices } from '../map/three/instancing.mjs';
import { detect, createTexRes } from '../map/three/texres.mjs';

// ---------------- 假 three ----------------
class Vec { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; } }
class M4 { constructor() { this.e = new Array(16).fill(0); } copy() { return this; } fromArray(a, i) { this.from = [a, i]; return this; } clone() { return new M4(); } compose() { this.composed = true; return this; } }
const fakeTHREE = () => ({
  WebGLRenderer: class { constructor(o) { this.o = o; this.dpr = 1; this.disposed = false; this.lost = false; }
    setPixelRatio(v) { this.dpr = v; } setSize() {} dispose() { this.disposed = true; } forceContextLoss() { this.lost = true; } getContext() { return { isContextLost: () => this.lost }; } },
  Group: class { constructor() { this.children = []; } add(o) { this.children.push(o); o.parent = this; } remove(o) { this.children = this.children.filter(c => c !== o); } },
  InstancedMesh: class { constructor(g, m, n) { this.isInstancedMesh = true; this.isMesh = true; this.geometry = g; this.material = m; this.count = n; this.instanceMatrix = { needsUpdate: false }; this.set = []; this.disposed = false; this.userData = {}; }
    setMatrixAt(i, m) { this.set.push([i, m]); } computeBoundingSphere() { this.bs = 1; } dispose() { this.disposed = true; } },
  Matrix4: M4, Vector3: Vec, Quaternion: class { setFromEuler() { return this; } }, Euler: class {},
});

test('ctx：像素比按档位 + 画质封顶（省电 1 倍 / 清晰最多 2 倍 / 手机档 1.25）', () => {
  assert.equal(pickDpr('low', '', 3), 1.25);
  assert.equal(pickDpr('mid', '1', 3), 1);
  assert.equal(pickDpr('high', '', 3), 3, 'high 不封顶，用满物理像素比');
  assert.equal(pickDpr('high', '2', 3), 2);
  assert.equal(pickDpr('mid', '', 1), 1);
  assert.equal(TIERS.low.antialias, false, '手机档不开抗锯齿');
});

test('ctx：建渲染器带上下文丢失 / 恢复钩子，dispose 真拆（dispose + forceContextLoss）', () => {
  const T = fakeTHREE();
  const events = {};
  const canvas = { addEventListener: (k, f) => { events[k] = f; }, removeEventListener: k => { delete events[k]; } };
  let lost = 0, restored = 0;
  const ctx = createRenderer({ THREE: T, canvas, tier: 'mid', onLost: () => lost++, onRestored: () => restored++ });
  assert.equal(ctx.dpr > 0, true);
  assert.ok(events.webglcontextlost && events.webglcontextrestored, '两个钩子都挂上了');
  events.webglcontextlost({ preventDefault() { this.pd = true; } });
  assert.equal(lost, 1); assert.equal(ctx.isLost(), true);
  events.webglcontextrestored();
  assert.equal(restored, 1); assert.equal(ctx.isLost(), false);
  assert.equal(ctx.stats().lostCount, 1);
  ctx.setDpr(1); assert.equal(ctx.dpr, 1);
  assert.equal(ctx.dispose(), true);
  assert.ok(ctx.renderer.disposed && ctx.renderer.lost, '拆的时候 dispose + forceContextLoss 都调用了');
  assert.equal(events.webglcontextlost, undefined, '拆完也摘掉监听');
});

test('ctx：自适应像素比——连续烂帧降一档，缓过来不回升（避免来回震荡）', () => {
  const g = governor({ window: 4, badMs: 55, holdMs: 1000 });
  let now = 0;
  for (let i = 0; i < 4; i++) { now += 100; assert.equal(g.sample(100, now, 2), i < 3 ? null : 1.4, `第 ${i + 1} 帧`); }
  assert.equal(g.sample(100, now + 10, 1.4), null, '冷静期内不再采样');
  for (let i = 0; i < 4; i++) { now += 1200; g.sample(100, now, 1.4); }
  assert.equal(g.sample(16, now + 1200, 1.4), null, '帧距变好不回升');
});

test('culling：包围球与合并；prepare 打开 frustumCulled 并重算（含 InstancedMesh）', () => {
  const s = sphereOf({ min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } });
  assert.ok(Math.abs(s.radius - Math.sqrt(3)) < 1e-6);
  const u = unionSpheres([{ center: { x: 0, y: 0, z: 0 }, radius: 1 }, { center: { x: 10, y: 0, z: 0 }, radius: 2 }]);
  assert.ok(Math.abs(u.radius - 7) < 1e-6, `中点在两球中间，半径包住两端：${u.radius}`);
  assert.equal(sphereOf(null), null); assert.equal(unionSpheres([]), null);

  const T = fakeTHREE();
  let geoComputed = 0;
  const geo = () => ({
    computeBoundingBox() { geoComputed++; this.boundingBox = { min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 2, z: 2 } }; },
    computeBoundingSphere() { this.boundingSphere = { center: new Vec(), radius: 1 }; },
    applyMatrix4() { return this; },
  });
  const mk = (o = {}) => Object.assign({ isMesh: true, frustumCulled: false, geometry: geo(), material: {}, updateWorldMatrix() {} }, o);
  const a = mk(), b = mk({ matrixAutoUpdate: false }), im = new T.InstancedMesh({}, {}, 4);
  const root = { traverse: f => { for (const o of [a, b]) f(o); } };
  const r = prepare({ THREE: T, root, instanced: [im] });
  assert.equal(a.frustumCulled, true); assert.equal(b.frustumCulled, true);
  assert.equal(r.objects, 3); assert.equal(r.instanced, 1);
  assert.ok(geoComputed >= 1, '缺包围体时要算出来');
  assert.equal(im.bs, 1, 'InstancedMesh 填完矩阵后重算包围球');
});

test('culling：正交相机（庄园）用视野宽度折算等效距离，透视用真实距离', () => {
  const d1 = distanceMetric({ camera: { isOrthographicCamera: true, top: 60, bottom: -60, zoom: 1 }, size: 60, viewportWidth: 1000, viewportHeight: 500 });
  assert.equal(d1, 4, '正交没有真实距离：视野 240 宽 / 尺寸 60 = 4 倍');
  const d2 = distanceMetric({ camera: { position: { x: 0, y: 0, z: 90 } }, target: { x: 0, y: 0, z: 0 }, size: 30 });
  assert.equal(d2, 3);
});

test('lod：远 → 中 → 近按距离升档；加载失败保留当前档（画面不出现空洞）', async () => {
  const applied = [];
  const ctl = createLodController({
    placeholder: ({ id }) => ({ name: 'box:' + id, isMesh: true, visible: true }),
    load: async d => (d === 'high' ? { root: { name: 'high' } } : { root: { name: 'low' } }),
    apply: o => applied.push(o.detail),
    bands: { near: 3, mid: 8 },
  });
  ctl.add('m', { root: { name: 'box' }, size: 10, pos: { x: 0, y: 0, z: 0 }, detail: 'far' });
  const cam = { position: { x: 0, y: 0, z: 60 } };   // 6 倍 → 先中档（迟滞：升档要 / 1.12，不够上近档）
  ctl.update({ camera: cam, target: { x: 0, y: 0, z: 0 }, viewportWidth: 1000, viewportHeight: 500 });
  await new Promise(r => setTimeout(r, 20));   // 等异步加载落地
  assert.equal(applied.at(-1), 'low');
  cam.position.z = 20;   // 2 倍 → 近档
  ctl.update({ camera: cam, target: { x: 0, y: 0, z: 0 } });
  await new Promise(r => setTimeout(r, 20));
  assert.equal(applied.at(-1), 'high');
  assert.equal(ctl.describe().counts.near, 1);

  const ctl2 = createLodController({
    load: async () => { throw new Error('404'); },
    apply: o => applied.push('bad:' + o.detail),
    bands: { near: 3, mid: 8 },
  });
  ctl2.add('x', { root: {}, size: 10, detail: 'far' });
  ctl2.update({ camera: { position: { x: 0, y: 0, z: 20 } }, target: { x: 0, y: 0, z: 0 } });
  await new Promise(r => setTimeout(r, 0));
  assert.equal(applied.includes('bad:high'), false, '失败不 apply');
  assert.equal(ctl2.describe().failed, 1);
});

test('lod：镜头飞走时迟到的加载结果被丢弃（generation token）', async () => {
  let release = null;
  const gate = new Promise(r => { release = r; });
  const applied = [];
  const ctl = createLodController({ load: async d => { await gate; return { root: { d } }; }, apply: o => applied.push(o.detail), bands: { near: 3, mid: 8 } });
  ctl.add('m', { root: {}, size: 10, pos: { x: 0, y: 0, z: 0 }, detail: 'far' });
  ctl.update({ camera: { position: { x: 0, y: 0, z: 20 } }, target: { x: 0, y: 0, z: 0 } });
  ctl.remove('m');   // 镜头飞走：模型已经不在视野里了
  release();
  await new Promise(r => setTimeout(r, 10));
  assert.deepEqual(applied, []);
  assert.equal(ctl.describe().rejectedLoads, 1);
});

test('instancing：同几何 + 同材质合成一个 InstancedMesh；排除集里的（热点 / 墙体）一件都不合', () => {
  const T = fakeTHREE();
  const g1 = { uuid: 'g1' }, g2 = { uuid: 'g2' }, m1 = { uuid: 'm1' };
  const mk = (n, g, m, o = {}) => Object.assign({ isMesh: true, name: n, geometry: g, material: m, visible: true, updateWorldMatrix() {} }, o);
  const hot = mk('hot', g1, m1), wall = mk('wall', g1, m1), a = mk('a', g1, m1), b = mk('b', g1, m1), c = mk('c', g2, m1), d = mk('d', g1, m1);
  const out = batch({ THREE: T, meshes: [hot, wall, a, b, c, d], exclude: new Set([hot, wall]) });
  assert.equal(out.groups.length, 1, '只剩 g1|m1 一组（a/b/d）');
  assert.equal(out.groups[0].count, 3);
  assert.deepEqual(out.groups[0].ids, ['a', 'b', 'd']);
  assert.equal(a.visible, false, '原件不参与渲染');
  assert.equal(hot.visible, true, '热点不合批');
  assert.equal(resolveInstance(out.groups[0], 1), 'b');
  assert.equal(resolveInstance(out.groups[0], 9), null);
  assert.equal(out.unbatch(), 4, '还原：原件恢复可见（返回保留的原件数，含只有一件的那组）');
  assert.equal(a.visible, true);
});

test('instancing：只有一件的组不合；矩阵写入后重算包围体（否则剔除会算错）', () => {
  const T = fakeTHREE();
  const g = { uuid: 'g' }, m = { uuid: 'm' };
  const only = { isMesh: true, name: 'solo', geometry: g, material: m, visible: true, updateWorldMatrix() {} };
  assert.equal(batch({ THREE: T, meshes: [only] }).groups.length, 0);
  const two = [only, { isMesh: true, name: 'x', geometry: g, material: m, visible: true, updateWorldMatrix() {} }];
  const out = batch({ THREE: T, meshes: two });
  const im = out.groups[0].mesh;
  const n = writeMatrices({ THREE: T, mesh: im, items: [{ tx: 1, ty: 2, tz: 3 }, { tx: 4, ty: 5, tz: 6 }] });
  assert.equal(n, 2); assert.equal(im.instanceMatrix.needsUpdate, true); assert.equal(im.bs, 1);
  const flat = new Float32Array(32);
  assert.equal(writeMatrices({ THREE: T, mesh: im, flat, withWorker: true }), 2, '后台线程给的 matrix buffer 也能直接写');
  assert.equal(writeMatrices({ THREE: T, mesh: { isInstancedMesh: false } }), 0);
});

test('texres：能力探测 + KTX2 挂不上就原路径（绝不出黑页）', async () => {
  const caps = detect({ renderer: { extensions: { has: k => k === 'WEBGL_compressed_texture_astc' } }, isWebGL2: true });
  assert.equal(caps.astc, true); assert.equal(caps.any, true); assert.equal(caps.etc1, false, 'WebGL2 下 ETC1 不可用');
  assert.equal(detect({ renderer: {} }).any, false);

  const T = createTexRes({ renderer: { extensions: { has: () => false }, info: { memory: { textures: 3, geometries: 4 } } }, enableKtx2: true });
  assert.equal(T.mode, 'off', '没有可用压缩格式 → 直接不挂');
  assert.equal(await T.attach({ setKTX2Loader() {} }), false);

  let inited = false;
  const T2 = createTexRes({
    renderer: { extensions: { has: () => true }, info: { memory: { textures: 1, geometries: 1 } } },
    KTX2Loader: class { constructor() { return this; } setTranscoderPath() { return this; } detectSupport() { return this; } async init() { inited = true; } },
    transcoderPath: 'vendor/jsm/libs/basis/',
  });
  const loader = { setKTX2Loader: () => {} };
  assert.equal(await T2.attach(loader), true);
  assert.equal(inited, true); assert.equal(T2.mode, 'on');
  assert.equal(T2.stats().geometries, 1);
  T2.dispose(); assert.equal(T2.mode, 'off');

  const T3 = createTexRes({
    renderer: { extensions: { has: () => true } },
    KTX2Loader: class { constructor() { throw new Error('no transcoder'); } },
    transcoderPath: 'x/',
  });
  assert.equal(await T3.attach(loader), false, '转码器 404 → 回原贴图路径');
  assert.equal(T3.mode, 'fallback');
});

test('texres：资源清单与释放（几何 / 贴图字节 + disposeTree 摘掉贴图）', () => {
  const T = createTexRes({ renderer: { extensions: { has: () => false } } });
  const tex = { isTexture: true, image: { width: 1024, height: 1024 } };
  const mesh = { isMesh: true, name: 'walls_ext', geometry: { attributes: { position: { count: 300, itemSize: 3 } }, index: { count: 900 } }, material: { map: tex }, userData: { detail: 'mid' } };
  const root = { traverse: f => f(mesh) };
  const list = T.resources(root, { estimateTexture: () => 1000, estimateGeometry: () => 200 });
  assert.equal(list.length, 1); assert.equal(list[0].bytes, 1200); assert.equal(list[0].kind, 'mid');
  assert.equal(T.track(tex, 999), 999);
  assert.equal(T.disposeTree(root), 1, '贴图被 dispose 并移出跟踪');
  assert.equal(T.stats().tracked, 0);
});

test('map/three/*：纯叶子层约束（不许反向 import 到 app / tavern，不许碰宿主全局）', () => {
  for (const f of readdirSync(new URL('../map/three/', import.meta.url))) {
    if (!f.endsWith('.mjs')) continue;
    const src = readFileSync(new URL('../map/three/' + f, import.meta.url), 'utf8');
    for (const m of src.matchAll(/\bfrom\s+(['"])([^'"]+)\1/g)) {
      const p = m[2];
      if (!p.startsWith('.')) continue;
      assert.equal(/\bapp\/|\btavern\//.test(p), false, `${f} 不许 import ${p}`);
      assert.ok(!/^(\.\.\/)+$/.test(p), `${f} 的 import 路径不完整：${p}`);
    }
    assert.doesNotMatch(src, /\b(localStorage|sessionStorage|Mvu|SillyTavern)\b/, f);
  }
});
