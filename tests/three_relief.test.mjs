// Part 9-3：2.5D 浮雕材质（map/three/relief.mjs）的 node 单测 + 资产清单对拍。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RELIEF_DEFAULTS, RELIEF_UNIFORM_SETS, reliefFromManifest, createReliefMaterial, updateRelief, describe } from '../map/three/relief.mjs';
import { UNIFORM_SETS, uniformsIn, RELIEF_VS, RELIEF_FS } from '../map/three/shaders.mjs';
import { envAt } from '../map/three/daynight.mjs';

const hh = (h, m = 0) => ({ day: 1, min: h * 60 + m });

// ---------------- 假 three ----------------
class V3 { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } }
class Col { constructor(r = 1, g = 1, b = 1) { this.r = r; this.g = g; this.b = b; } setRGB(r, g, b) { this.r = r; this.g = g; this.b = b; return this; } }
const fakeTHREE = () => ({
  Vector3: V3, Color: Col,
  DataTexture: class { constructor(px, w, h) { this.px = px; this.w = w; this.h = h; this.isTexture = true; this.needsUpdate = false; } },
  ShaderMaterial: class { constructor(o = {}) { Object.assign(this, o); this.uniforms = o.uniforms || {}; } },
});

test('relief：清单驱动取图（map/art/relief/relief.json 与实际文件对得上）', () => {
  const man = JSON.parse(readFileSync(new URL('../map/art/relief/relief.json', import.meta.url), 'utf8'));
  assert.equal(man.schema, 1);
  assert.ok(man.size[0] >= 256 && man.size[1] === man.size[0]);
  const r = reliefFromManifest(man);
  assert.equal(r.id, 'manor_facade');
  assert.deepEqual(r.files, {
    height: 'manor_facade_height.png', normal: 'manor_facade_normal.png', rough: 'manor_facade_rough.png',
  });
  assert.equal(r.parallax, .05); assert.equal(r.normalScale, .85);
  for (const f of Object.values(r.files)) {   // 三张图真的在仓库里
    const buf = readFileSync(new URL('../map/art/relief/' + f, import.meta.url));
    assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${f} 应是 PNG`);
    assert.equal(buf.readUInt32BE(16), man.size[0], `${f} 的 IHDR 宽度与清单一致`);
    assert.equal(buf.readUInt32BE(20), man.size[1], `${f} 的高度也要对得上（不是被裁过的图）`);
    assert.ok(buf.length > 1000, `${f} 不是空图`);
  }
  assert.equal(reliefFromManifest(man, 'nope'), null);
  assert.equal(reliefFromManifest(null), null);
});

test('relief：材质建好即带齐 uniform，缺图用 1×1 常量兜底（绝不出现未绑定纹理的黑面）', () => {
  const T = fakeTHREE();
  const m = createReliefMaterial({ THREE: T, parallax: .08, normalScale: .5 });
  assert.deepEqual(Object.keys(m.uniforms).sort(), [...RELIEF_UNIFORM_SETS.relief].sort(), 'uniform 名单与着色器一致');
  assert.equal(m.uniforms.uParallax.value, .08);
  assert.equal(m.uniforms.uNormalScale.value, .5);
  assert.equal(m.uniforms.uUseHeight.value, 0, '没给高度图 → 视差采样走常量，不偏移');
  assert.equal(m.uniforms.uAlbedo.value.isTexture, true, '缺 albedo 也要有兜底贴图');
  assert.equal(m.uniforms.uNormal.value.px[2], 255, '法线兜底是 (128,128,255) 的中性法线');

  const T2 = fakeTHREE();
  const tex = { isTexture: true };
  const m2 = createReliefMaterial({ THREE: T2, maps: { albedo: tex, normal: tex, rough: tex, height: tex } });
  assert.equal(m2.uniforms.uAlbedo.value, tex, '真贴图优先');
  assert.equal(m2.uniforms.uUseHeight.value, 1, '有高度图就开视差');
  assert.equal(m2.uniforms.uHeight.value, tex);
  assert.equal(createReliefMaterial({ THREE: null }), null, '没有 three 就安静退场');
});

test('relief：昼夜环境驱动浮雕光照——夜里自发光抬头、正午归零、光向跟着太阳走', () => {
  const T = fakeTHREE();
  const m = createReliefMaterial({ THREE: T });
  const night = envAt(hh(0, 30)), noon = envAt(hh(12, 30));

  assert.equal(updateRelief(m, night), 5, '五组参数都写进去了');
  const u = m.uniforms;
  for (const [i, k] of ['x', 'y', 'z'].entries()) assert.ok(Math.abs(u.uLightDir.value[k] - night.sun.dir[i]) < 1e-9, `光向 ${k} 跟着太阳`);
  assert.ok(u.uLightColor.value.r > 0 && u.uLightColor.value.r < 1, '月光不是白炽：光色 × 低强度');
  assert.ok(Math.abs(u.uEmissive.value - RELIEF_DEFAULTS.emissiveScale) < 1e-9, '深夜立面自发光抬头（窗里透出的光）');
  const nightAmbient = u.uAmbient.value;

  updateRelief(m, noon);
  assert.equal(u.uEmissive.value, 0, '正午没有自发光');
  assert.ok(u.uLightColor.value.r > .9, '正午光色接近中性');
  assert.ok(u.uAmbient.value > nightAmbient, '正午环境光更亮');
  assert.equal(updateRelief({ uniforms: {} }, noon), 0, '没有 uniform 就什么都不写');
  assert.equal(updateRelief(m, null), 0);

  const d = describe(m);
  assert.equal(d.useHeight, false); assert.equal(d.normalScale, .85);
  assert.equal(describe(null), null);
});

test('relief：着色器 uniform 契约 + 纯渲染层约束', () => {
  const src = readFileSync(new URL('../map/three/relief.mjs', import.meta.url), 'utf8');
  assert.deepEqual(uniformsIn(RELIEF_VS + RELIEF_FS).filter(k => !['u', 'uv'].includes(k)), [...UNIFORM_SETS.relief].sort(),
    '浮雕着色器用到的 uniform 与 UNIFORM_SETS.relief 对得上');
  assert.match(RELIEF_VS, /varying vec2 vUv/);
  assert.match(RELIEF_FS, /dFdx\(vWorld\)/, '切线基用屏幕导数，UV 不对齐也站得住');
  assert.match(RELIEF_FS, /uParallax > 0\.0001/, '视差为 0 时整段跳过');
  for (const m of src.matchAll(/\bfrom\s+(['"])([^'"]+)\1/g)) {
    if (!m[2].startsWith('.')) continue;
    assert.equal(/\bapp\/|\btavern\/|\bestate\//.test(m[2]), false, `不许 import ${m[2]}`);
  }
  assert.doesNotMatch(src, /\b(localStorage|sessionStorage|Mvu|SillyTavern|document|window)\b/);
});
