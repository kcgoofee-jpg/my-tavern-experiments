// Part 9-2：fx 槽位粒子引擎（map/three/particles.mjs + shaders.mjs）的 node 单测。
// 全用假 THREE：测的是「预算 / 开关 / draw call / 槽位注册」这些策略，GPU 行为由浏览器探针守。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FX_TYPES, FX_PRESETS, FX_SLOT, fxBudget, createFX, fxDescriptor, registerFX } from '../map/three/particles.mjs';
import { UNIFORM_SETS, uniformsIn, PRECIP_VS, PRECIP_FS, AURORA_VS, AURORA_FS } from '../map/three/shaders.mjs';
import { LayerRegistry, SLOTS } from '../map/core/layer-registry.mjs';

// ---------------- 假 three ----------------
class V3 { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } }
class V2 { constructor(x = 0, y = 0) { this.x = x; this.y = y; } }
class Col { constructor(r = 0, g = 0, b = 0) { this.r = r; this.g = g; this.b = b; } }
class Obj {
  constructor() { this.children = []; this.visible = true; this.position = { set: (x, y, z) => { this.pos = [x, y, z]; } }; this.parent = null; }
  add(o) { this.children.push(o); o.parent = this; }
  remove(o) { this.children = this.children.filter(c => c !== o); o.parent = null; }
}
const fakeTHREE = () => ({
  Group: class extends Obj { constructor() { super(); this.isGroup = true; } },
  Points: class extends Obj { constructor(g, m) { super(); this.isPoints = true; this.geometry = g; this.material = m; } },
  Mesh: class extends Obj { constructor(g, m) { super(); this.isMesh = true; this.geometry = g; this.material = m; } },
  BufferGeometry: class { constructor() { this.attributes = {}; this.disposed = false; }
    setAttribute(n, a) { this.attributes[n] = a; } dispose() { this.disposed = true; } },
  BufferAttribute: class { constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.count = array.length / itemSize; } },
  PlaneGeometry: class { constructor(w, h) { this.w = w; this.h = h; this.attributes = {}; this.disposed = false; } dispose() { this.disposed = true; } },
  ShaderMaterial: class { constructor(o = {}) { Object.assign(this, o); this.uniforms = o.uniforms || {}; this.disposed = false; } dispose() { this.disposed = true; } },
  Vector3: V3, Vector2: V2, Color: Col, AdditiveBlending: 'additive', DoubleSide: 'double',
});
const fakeScene = () => new (fakeTHREE().Group)();
const spin = (fx, n = 20, dt = .1) => { let last = null; for (let i = 0; i < n; i++) last = fx.update(dt); return last; };

test('fx：粒子预算随画质 / 面积缩放，省流到底与未知类型都是 0', () => {
  const full = fxBudget('rain', { quality: 1, area: 1 });
  assert.equal(full, FX_PRESETS.rain.count);
  assert.equal(fxBudget('rain', { quality: 0 }), 0, '省流到底一个都不画');
  assert.equal(fxBudget('rain', { quality: .5 }), Math.round(full * .5));
  assert.equal(fxBudget('rain', { quality: 1, area: 4, cap: 1000 }), 1000, '封顶防低端机爆掉');
  assert.equal(fxBudget('aurora', { quality: 1 }), 0, '极光是平面，不计粒子数');
  assert.equal(fxBudget('nope', { quality: 1 }), 0);
  assert.equal(fxBudget('none', { quality: 1 }), 0);
});

test('fx：雨 = 一个 Points（1 次 draw call），顶点数据一次性烘进 buffer', () => {
  const T = fakeTHREE(), scene = fakeScene();
  const fx = createFX({ THREE: T, scene, box: [50, 30, 50], quality: 1 });
  fx.setFXType('rain', .8);
  const r = fx.update(.1);
  assert.equal(r.type, 'rain', '每帧结果带当前类型（宿主据此决定要不要跟着重绘）');
  assert.equal(r.drawCalls, 1, '降水只占一次 draw call');
  assert.equal(r.particles, FX_PRESETS.rain.count);
  const pts = fx.object.children[0];
  assert.equal(pts.isPoints, true);
  assert.equal(fx.object.children.length, 1, '一种效果一个对象');
  assert.equal(pts.frustumCulled, false, '着色器里回绕，CPU 包围盒不准，不剔除');
  assert.equal(pts.geometry.attributes.position.count, FX_PRESETS.rain.count);
  assert.equal(pts.geometry.attributes.aSeed.count, FX_PRESETS.rain.count);
  assert.equal(pts.material.transparent, true); assert.equal(pts.material.depthWrite, false);
  assert.equal(pts.material.uniforms.uStreak.value, FX_PRESETS.rain.streak, '雨是竖条（streak）');
  assert.ok(pts.material.uniforms.uOpacity.value > 0 && pts.material.uniforms.uOpacity.value < FX_PRESETS.rain.opacity, '强度渐入');
  const d = fx.describe();
  assert.deepEqual([d.type, d.drawCalls, d.active], ['rain', 1, true]);
});

test('fx：极光 = 一个加色混合平面（1 次 draw call）；切类型才重建，改强度不重建', () => {
  const T = fakeTHREE(), scene = fakeScene();
  const fx = createFX({ THREE: T, scene });
  fx.setFXType('aurora', 1);
  const r = spin(fx, 30);
  assert.equal(r.drawCalls, 1);
  const mesh = fx.object.children[0];
  assert.equal(mesh.isMesh, true);
  assert.equal(mesh.material.blending, 'additive');
  assert.deepEqual(mesh.pos, FX_PRESETS.aurora.plane.position);
  assert.ok(Math.abs(mesh.material.uniforms.uIntensity.value - FX_PRESETS.aurora.opacity) < .01, 'fade 2.4s，30 帧（3s）后已满强度 × 预设不透明度');
  assert.ok(mesh.material.uniforms.uTime.value > 0, '时间在推进');

  fx.setIntensity(.4);                      // 改强度：同一对象，不重建
  fx.update(.1);
  assert.equal(fx.object.children[0], mesh);
  fx.setFXType('snow', .5);                 // 换类型：重建
  fx.update(.1);
  assert.notEqual(fx.object.children[0], mesh);
  assert.equal(mesh.geometry.disposed || mesh.material.disposed, true, '旧的几何 / 材质被释放');
  assert.equal(fx.object.children.length, 1);
});

test('fx：关掉时开销瞬时归零（对象摘出、不再传 uniform、draw call = 0）', () => {
  const T = fakeTHREE(), scene = fakeScene();
  const fx = createFX({ THREE: T, scene, quality: 1 });
  const first = fx.update(.1);                       // 从没开过：第一行就返回
  assert.deepEqual([first.active, first.drawCalls, first.skipped], [false, 0, true]);

  fx.setFXType('rain', 1);
  spin(fx, 10);
  assert.equal(fx.describe().drawCalls, 1);
  fx.setFXType('none');                              // 剧情结束：衰减到零
  const mid = fx.update(.2);
  assert.ok(mid.intensity > 0 && mid.intensity < 1, '是衰减，不是硬切');
  let end = null, stopped = false;
  for (let i = 0; i < 20; i++) { end = fx.update(.1); if (end.stopped) stopped = true; }   // stopped 只出现在真正归零那一帧
  assert.deepEqual([end.active, end.drawCalls], [false, 0]);
  assert.equal(stopped, true, '归零那一帧会显式报 stopped');
  assert.equal(fx.object.children.length, 0, '对象从场景里摘掉了');
  assert.equal(fx.describe().drawCalls, 0);
  assert.equal(fx.update(.1).skipped, true, '之后每帧都是零开销的早退');
  assert.ok(fx.stats().skipped > 10, `归零之后的帧都在早退（skipped=${fx.stats().skipped}）`);
});

test('fx：reduced-motion——飘动类整个不开，极光冻结成静图', () => {
  const T = fakeTHREE(), scene = fakeScene();
  const fx = createFX({ THREE: T, scene, reducedMotion: true, quality: 1 });
  const r = fx.setFXType('rain', 1);
  assert.deepEqual([r.type, r.blocked], ['none', true]);
  assert.equal(fx.update(.1).drawCalls, 0, '雨被拦下：一个粒子都不画');
  assert.equal(fx.describe().blocked, true);

  fx.setFXType('aurora', 1);
  const a = spin(fx, 10);
  assert.equal(a.drawCalls, 1, '极光保留（不飘动，只是流光）');
  assert.equal(a.time, 0, '时间冻结：不推进');
  assert.ok(a.intensity > 0, '强度照样渐入（渐变不属于动效敏感项）');

  const fx2 = createFX({ THREE: fakeTHREE(), scene: fakeScene(), quality: 1 });
  fx2.setFXType('snow', 1); spin(fx2, 10);
  assert.ok(fx2.describe().intensity > 0);
  fx2.setReduced(true);                              // 运行中打开「减少动态效果」
  assert.equal(fx2.describe().type, 'none', '已经在飘的雪立刻停');
  assert.equal(createFX({ THREE: null }), null, '没有 three 就安静退场，不抛');
});

test('fx：正交相机（庄园）关掉点精灵的距离衰减，不然粒子被距离缩成尘埃', () => {
  const T = fakeTHREE();
  const p = createFX({ THREE: T, scene: fakeScene() });
  p.setFXType('rain', 1); p.update(.1);
  assert.equal(p.object.children[0].material.uniforms.uAtten.value, 1, '默认透视：按距离衰减');
  const o = createFX({ THREE: T, scene: fakeScene(), ortho: true });
  o.setFXType('rain', 1); o.update(.1);
  assert.equal(o.object.children[0].material.uniforms.uAtten.value, 0, '正交：点大小固定，只看 uSize × 像素比');
  assert.match(PRECIP_VS, /uAtten/, '顶点着色器里真的用了这个 uniform');
});

test('fx：每场景 overrides 微调（大场景的雨调大 / 极光当天幕），不动全局预设', () => {
  const T = fakeTHREE(), scene = fakeScene();
  const fx = createFX({ THREE: T, scene, overrides: { rain: { size: 7, opacity: .5 }, aurora: { plane: { size: [900, 320], position: [0, 210, -420] } } } });
  fx.setFXType('rain', 1); spin(fx, 10);
  const u = fx.object.children[0].material.uniforms;
  assert.equal(u.uSize.value, 7); assert.ok(Math.abs(u.uOpacity.value - .5) < 1e-9);
  assert.equal(u.uStreak.value, FX_PRESETS.rain.streak, '没覆盖的字段仍用全局预设');
  fx.setFXType('aurora', 1); fx.update(.1);
  assert.deepEqual(fx.object.children[0].pos, [0, 210, -420]);
  assert.equal(fx.object.children[0].geometry.w, 900);
  assert.equal(FX_PRESETS.rain.size, 2.6, '全局预设没被就地改脏');
  assert.equal(FX_PRESETS.aurora.plane.position[1], 70);
});

test('fx：注册进 LayerRegistry 的第 9 槽（fx），可见性与卸载都经 registry 调度', () => {
  const reg = new LayerRegistry();
  const T = fakeTHREE(), scene = fakeScene();
  const { engine, layer } = registerFX(reg, { THREE: T, scene, quality: 1, id: 'particles3d', order: 40 });
  assert.equal(SLOTS.indexOf(FX_SLOT), SLOTS.length - 2, 'fx 是倒数第二槽（上面只有交互层）');
  assert.equal(layer.slot, 'fx'); assert.equal(layer.kind, 'canvas');
  assert.deepEqual(reg.layersInSlot('fx').map(r => r.id), ['particles3d']);
  assert.ok(reg.describe().activeLayers.includes('particles3d'));

  assert.equal(reg.mountAll({ scene }), 1);
  assert.equal(engine.object.parent, scene, 'mount 把粒子挂进场景');
  engine.setFXType('aurora', 1); spin(engine, 30);
  assert.equal(engine.describe().drawCalls, 1);
  reg.setVisible('particles3d', false);
  assert.equal(engine.object.visible, false, '菜单 / 设置关掉 → 粒子层隐藏');
  reg.setVisible('particles3d', true);
  engine.update(.1);
  assert.equal(engine.object.visible, true);
  assert.equal(reg.unregister('particles3d'), true);
  assert.equal(engine.object.children.length, 0, 'unregister 顺带把 GPU 资源拆掉');
});

test('fx：被宿主挪到别处（挂相机当天幕）的效果，关掉时也从那个 parent 摘干净', () => {
  const T = fakeTHREE(), scene = fakeScene(), camera = new (T.Group)();
  const fx = createFX({ THREE: T, scene });
  fx.setFXType('aurora', 1); spin(fx, 10);
  const mesh = fx.object.children[0];
  camera.add(mesh);                                   // 宿主把它挪到相机下（庄园的极光天幕）
  assert.equal(mesh.parent, camera);
  fx.setVisible(false);                               // 菜单 / 设置关掉：挂在相机上的那个也得跟着藏
  assert.equal(mesh.visible, false);
  fx.setVisible(true);
  fx.update(.1);
  assert.equal(mesh.visible, true);
  fx.setFXType('none');
  spin(fx, 30);
  assert.equal(camera.children.length, 0, '关掉时按对象自己的 parent 摘，别留下一个已 dispose 的网格');
  assert.equal(fx.describe().drawCalls, 0);
});

test('fx：着色器 uniform 契约——源码里用到的 uniform 与实际传入的一一对上', () => {
  const inSrc = [...new Set([...uniformsIn(PRECIP_VS + PRECIP_FS)])].sort();
  assert.deepEqual(inSrc, [...UNIFORM_SETS.precip].sort(), '降水着色器的 uniform 名单');
  assert.deepEqual([...new Set([...uniformsIn(AURORA_VS + AURORA_FS)])].sort(), [...UNIFORM_SETS.aurora].sort());

  const T = fakeTHREE(), scene = fakeScene();
  const fx = createFX({ THREE: T, scene, quality: 1 });
  for (const [type, keys] of [['rain', UNIFORM_SETS.precip], ['aurora', UNIFORM_SETS.aurora]]) {
    fx.setFXType(type, 1); fx.update(.1);
    const u = fx.object.children[0].material.uniforms;
    for (const k of keys) assert.ok(k in u, `${type} 缺少 uniform ${k}`);
  }
  assert.deepEqual(FX_TYPES, ['none', 'rain', 'snow', 'sand', 'aurora']);
  assert.throws(() => fxDescriptor({ slot: 'nope' }), /不在 SLOTS/, '槽位写错要当场拦下');
});

test('map/three：纯渲染层约束（fx 模块不许 import app / tavern，不许碰宿主全局）', () => {
  for (const f of ['particles.mjs', 'shaders.mjs', 'daynight.mjs']) {
    const src = readFileSync(new URL('../map/three/' + f, import.meta.url), 'utf8');
    for (const m of src.matchAll(/\bfrom\s+(['"])([^'"]+)\1/g)) {
      const p = m[2];
      if (!p.startsWith('.')) continue;
      assert.equal(/\bapp\/|\btavern\/|\bestate\//.test(p), false, `${f} 不许 import ${p}`);
    }
    assert.doesNotMatch(src, /\b(localStorage|sessionStorage|Mvu|SillyTavern|document|window)\b/, f);
  }
});
