// ESTATE-MODES-1 7c / A5b / A5c：分时段天空 + 云海 + 时段调色（map/three/backdrop.mjs）的 node 单测。
// 假 three + 假 canvas：这里测的是「时段 → 配色 / 天空 / 云海位置」这条接线，不是 three 本身（浏览器探针守）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBackdrop, PERIOD_MIN } from '../map/three/backdrop.mjs';
import { envAt, gradeOf } from '../map/three/daynight.mjs';

// ---------------- 假 three / 假 canvas ----------------
class Color {
  constructor(c) { this.r = this.g = this.b = 0; if (c) this.set(c); }
  set(c) { const m = /^#(\w\w)(\w\w)(\w\w)$/.exec(c); this.r = parseInt(m[1], 16) / 255; this.g = parseInt(m[2], 16) / 255; this.b = parseInt(m[3], 16) / 255; return this; }
  setRGB(r, g, b) { this.r = r; this.g = g; this.b = b; return this; }
}
const geo = () => ({ dispose() {}, rotateX() { return this; } });
const T = {
  Color, SRGBColorSpace: 'srgb', DoubleSide: 2,
  ShaderMaterial: class { constructor(o) { this.uniforms = o.uniforms; this.transparent = o.transparent; this.depthWrite = o.depthWrite; } },
  CanvasTexture: class { constructor(image) { this.image = image; this.colorSpace = null; this.needsUpdate = false; } },
  Mesh: class { constructor(g, m) { this.geometry = g; this.material = m; this.position = { x: 0, y: 0, z: 0 }; this.renderOrder = 0; this.name = ''; } },
  CircleGeometry: class { constructor() { return geo(); } },
  Box3: class { constructor() { this.min = { y: 0 }; this.max = { y: 0 }; } setFromObject(o) { this.min = { y: o.minY }; this.max = { y: o.maxY }; return this; } },
};
const mkScene = () => ({ objs: [], background: null, add(o) { this.objs.push(o); }, remove(o) { this.objs = this.objs.filter(x => x !== o); } });
const gradients = [];
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ createLinearGradient: (...stops) => { gradients.push(stops); return { addColorStop() {} }; }, fillRect() {}, drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(64) }) }) }) };

test('backdrop：时钟胶囊的时段 → 昼夜关键帧的时刻（与二维地图同一档，U-FIX-4）', () => {
  assert.deepEqual(PERIOD_MIN, { night: 30, dawn: 390, day: 750, dusk: 1095 });
  for (const [tod, min] of Object.entries(PERIOD_MIN)) assert.equal(envAt({ min }).phase, tod === 'day' ? 'noon' : tod, `${tod} 这一档落在自己的时段里`);
});

test('backdrop：apply 把时段调色写进材质（uTint），并按主题重画天空', () => {
  const scene = mkScene(), bd = createBackdrop({ THREE: T, scene });
  const u = { uTint: { value: new Color() } }, mesh = { material: { userData: { u } } };
  assert.equal(bd.apply({ meshes: [mesh], tod: 'night' }), 'night');
  assert.ok(Math.abs(u.uTint.value.r - gradeOf(envAt({ min: 30 })).tint[0]) < 1e-9, '夜里 tint = daynight 的夜调');
  assert.ok(bd.phase === 'night', '天空记着当前时段');
  assert.equal(bd.apply({ meshes: [mesh], tod: 'night' }), 'night');
  assert.ok(u.uTint.value.b > u.uTint.value.r, '夜幕偏蓝');
  assert.equal(bd.apply({ meshes: [mesh], tod: '' }), 'noon', '没选时段 = 正午（地标查看器没有世界时钟）');
  assert.ok(Math.abs(u.uTint.value.r - 1) < 1e-9, '正午几乎不改色');
  assert.equal(bd.apply({ meshes: [null, {}, { material: { userData: { u: {} } } }], tod: 'dusk' }), 'dusk', '没有 uTint 的网格跳过，不抛');
  assert.ok(gradients.length >= 2, '每次换时段重画一张渐变当场景背景');
  assert.ok(scene.background, '场景背景是那张渐变贴图');
  assert.equal(scene.background.colorSpace, 'srgb');
});

test('backdrop：云海放在岛下（按模型包围盒），换档重放一次', () => {
  const scene = mkScene(), bd = createBackdrop({ THREE: T, scene });
  bd.paint({ phase: 'noon' });
  bd.fit({ minY: 20, maxY: 120 });
  const sea = scene.objs.find(o => o.name === 'cloud_sea');
  assert.ok(sea, '云海进场景');
  assert.equal(sea.position.y, 20 + 100 * 0.18, '在岛底往上一点，不与岛体相交');
  assert.equal(sea.renderOrder, -1, '先画，后面才是岛');
  bd.fit({ minY: 0, maxY: 50 });
  assert.equal(scene.objs.filter(o => o.name === 'cloud_sea').length, 1, '重放不留两层');
});

test('map/three/backdrop.mjs：纯渲染层约束（不碰宿主全局 / 存储）', () => {
  const src = readFileSync(new URL('../map/three/backdrop.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\b(localStorage|sessionStorage|Mvu|SillyTavern)\b/);
  assert.doesNotMatch(src, /地图自设|仓库推断|自设|推断/, '不写来源标签');
});
