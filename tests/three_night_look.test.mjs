// ESTATE-MODES-1 D38 / A4：夜里那层「太阳落掉」与窗光（map/three/night-look.mjs）的 node 单测。
// 测的是策略与接线（哪些材质夜里发光、强度怎么随时段走、补丁注入了什么），不是 three 本身（浏览器探针守）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nightOf, glowOf, isGlowMaterial, patchSurface, patchBackFace, applyNightFlat, applyGlow } from '../map/three/night-look.mjs';
import { envAt } from '../map/three/daynight.mjs';

const hh = (h, m = 0) => ({ day: 1, min: h * 60 + m });
// ---------------- 假 three ----------------
class Color {
  constructor() { this.r = this.g = this.b = 0; this.space = null; }
  setRGB(r, g, b, space) { this.r = r; this.g = g; this.b = b; this.space = space; return this; }
}
const T = { Color, SRGBColorSpace: 'srgb', LinearSRGBColorSpace: 'srgb-linear' };
/** 走一遍 onBeforeCompile，返回注入后的两段 shader 与写进 uniform 的值 */
const compile = (mat) => { const sh = { uniforms: {}, vertexShader: 'void main(){\n#include <common>\n#include <begin_vertex>\n}', fragmentShader: 'void main(){\n#include <common>\n#include <color_fragment>\n#include <dithering_fragment>\n}' };
  mat.onBeforeCompile(sh); return sh; };
const mat = () => ({ onBeforeCompile: null, customProgramCacheKey: null, userData: {} });

test('night-look：抹平强度夜里满档、黄昏一半、清晨 / 正午不动', () => {
  assert.equal(nightOf(envAt(hh(0, 30))), 1, '深夜把烘焙的日光对比全抹平');
  assert.ok(nightOf(envAt(hh(18, 15))) > 0 && nightOf(envAt(hh(18, 15))) < 0.5, '黄昏轻轻压一半');
  assert.equal(nightOf(envAt(hh(6, 30))), 0, '清晨是烘焙的那盏光，不动');
  assert.equal(nightOf(envAt(hh(12, 30))), 0);
  assert.equal(nightOf(null), 0, '没有环境参数就当白天');
});

test('night-look：窗光强度夜 1、黄昏刚起、清晨 / 正午 0（夜里才亮窗）', () => {
  assert.equal(glowOf(envAt(hh(0, 30))), 1);
  const dusk = glowOf(envAt(hh(18, 15)));
  assert.ok(dusk > 0 && dusk < 0.5, `黄昏零星窗光：${dusk}`);
  assert.equal(glowOf(envAt(hh(12, 30))), 0);
  assert.equal(glowOf(envAt(hh(6, 30))), 0);
  assert.equal(glowOf(null), 0);
});

test('night-look：夜里发光的材质 = 清单 x-night-glow 点名的 ∪ 材质名里的窗 / 玻璃', () => {
  assert.equal(isGlowMaterial('m_win_glow', []), true, '材质名认得出窗');
  assert.equal(isGlowMaterial('m_house_glass', null), true);
  assert.equal(isGlowMaterial('house.window', null), true);
  assert.equal(isGlowMaterial('m_house_shell', ['m_house_shell']), true, '清单点名也算（包数据可以自定义材质名）');
  assert.equal(isGlowMaterial('m_house_shell', ['m_other']), false, '清单点了别的就不算');
  assert.equal(isGlowMaterial('m_ground', ['m_ground']), true, '清单点名优先于名字');
  assert.equal(isGlowMaterial('m_ground', ['m_rock']), false, '地面不会因为名字里没有窗就发亮');
  assert.equal(isGlowMaterial('m_site_w', ['m_rock']), false, '名字里的 w 不是窗');
  assert.equal(isGlowMaterial('', ['m_win']), false, '没名字的材质不猜');
  assert.equal(isGlowMaterial(null, null), false);
});

test('night-look：材质补丁把抹平与窗光一次装好（同一块材质两个效果叠加，不互相覆盖）', () => {
  const m = mat(), u = patchSurface(T, m, { flat: { rgb: [.4, .4, .4], srgb: true }, back: [.5, .5, .5], glow: true });
  assert.equal(u.uFlatOn.value, 1, '给了基准色就抹平');
  assert.equal(u.uGlowOn.value, 1, '窗材质自己发光');
  assert.equal(u.uFlat.value.space, 'srgb', '贴图平均色按 sRGB 通道进');
  assert.ok(Math.abs(u.uGlowCol.value.r - 1) < 1e-9 && Math.abs(u.uGlowCol.value.b - .54) < 1e-9, '窗光是暖色（输出空间的值本身，不再转换）');

  const sh = compile(m);
  assert.match(sh.fragmentShader, /uFlat \* diffuse/, '抹平的目标色 = 中间调 × 同一 diffuse');
  assert.match(sh.fragmentShader, /uCut > \.5 && !gl_FrontFacing/, '截面色只在上层真的被剖开时涂');
  assert.match(sh.fragmentShader, /uGlowCol \* \(uGlow \* uGlowOn/, '窗光是一层加光，不是重新照亮烘焙面');
  assert.match(sh.fragmentShader, /step\(\.22, h\)/, '约两成的窗暗着，不是整片均匀发光');
  assert.match(sh.fragmentShader, /float fl = floor\(vWPos\.y/, '按世界坐标分层：每层亮度不同');
  assert.match(sh.vertexShader, /vWPos = \(modelMatrix \* vec4\(transformed, 1\.0\)\)\.xyz;/, '窗光要世界坐标分格');
  assert.equal(Object.keys(sh.uniforms).length, Object.keys(u).length, 'uniform 组整体交给 three');
  assert.equal(m.userData.u, u, 'uniform 组也挂在材质上（与地标查看器一个口径，探针直接读）');
  assert.match(m.customProgramCacheKey(), /-glow/, '带不发光的材质不能共用同一个着色器程序');
});

test('night-look：不发光的材质不注入窗光那几行，剖切内壁只涂背面', () => {
  const a = mat(), ua = patchSurface(T, a, { flat: { rgb: [.2, .2, .2], srgb: false } });
  const sha = compile(a);
  assert.equal(ua.uGlowOn.value, 0);
  assert.doesNotMatch(sha.fragmentShader, /uGlowCol \* \(uGlow/);
  assert.doesNotMatch(sha.fragmentShader, /varying vec3 vWPos/);
  assert.doesNotMatch(sha.vertexShader, /vWPos/, '没有窗光就不用带世界坐标的 varying');
  assert.equal(ua.uFlat.value.space, 'srgb-linear', '顶点色按线性进');

  const b = mat(), ub = patchBackFace(T, b, [.2, .18, .16]);
  const shb = compile(b);
  assert.equal(ub.uFlatOn.value, 0, '只涂背面，不抹平');
  assert.equal(ub.uGlowOn.value, 0);
  assert.equal(ub.uCut.value, 1, '默认就涂（室内体量只在楼层视图里出现）');
  assert.match(shb.fragmentShader, /vec3\(0\.200,0\.180,0\.160\)/);
  assert.match(shb.fragmentShader, /uFlat \* diffuse/, '注入点在同一处，抹平那行仍在（uFlatOn = 0 时是空操作）');
});

test('night-look：applyNightFlat / applyGlow 按时段写 uniform，并报出写到的个数', () => {
  const t1 = { u: patchSurface(T, mat(), {}) }, t2 = { u: patchSurface(T, mat(), { glow: true }) };
  const targets = [t1, t2, { u: null }, null];
  assert.equal(applyNightFlat({ env: envAt(hh(0, 30)), targets }), 2);
  assert.equal(t1.u.uNight.value, 1);
  assert.equal(applyGlow({ env: envAt(hh(0, 30)), targets }), 2);
  assert.equal(t1.u.uGlow.value, 1, '非窗材质也写到（uGlowOn = 0，不发光）');
  assert.equal(applyGlow({ env: envAt(hh(12, 30)), targets }), 2);
  assert.equal(t1.u.uGlow.value, 0, '正午窗光归零');
  assert.equal(applyGlow({ env: null, targets }), 0, '没有环境参数什么都不写');
  assert.equal(applyNightFlat({}), 0);
  assert.equal(applyGlow({ env: envAt(hh(0, 30)) }), 0, '没有目标就什么都不写');
});

test('map/three/night-look.mjs：纯渲染层约束（不碰宿主全局 / 存储）', () => {
  const src = readFileSync(new URL('../map/three/night-look.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\b(localStorage|sessionStorage|Mvu|SillyTavern)\b/);
  assert.doesNotMatch(src, /地图自设|仓库推断|自设|推断/, '不写来源标签');
});
