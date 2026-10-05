// INTERIOR-WINDOWS 对拍：窗内景的面表 / 出射选择 / 图集格坐标，JS ↔ Python ↔ 注入的 GLSL 三方同源。
// Blender 侧（blender/estate/interior_maps.py）按同一张面表出六张箱面图，拼版按同一顺序进图集；
// 着色器里那段 if 链由 FACES 生成，不是手写的 —— 这里查的就是「生成的那段」和「exitOf」走同一条路径。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CELLS, FACES, faceBasis, exitOf, cellUv, interiorGlsl, LOOK, patchInterior, loadInteriors, armInteriors, interiorCount } from '../map/three/interior-look.mjs';

const py = readFileSync(fileURLToPath(new URL('../blender/estate/interior_maps.py', import.meta.url)), 'utf8');
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

test('面表与 Blender 侧逐行同序同值', () => {
  const rows = [...py.matchAll(/dict\(k='(\w+)', n=\(([^)]*)\), up=\(([^)]*)\)\)/g)]
    .map((m) => ({ k: m[1], n: m[2].split(',').map(Number), u: m[3].split(',').map(Number) }));
  assert.equal(rows.length, 6, 'Blender 侧应当有六张箱面');
  assert.deepEqual(rows, FACES.map((f) => ({ k: f.k, n: [...f.n], u: [...f.u] })));
});

test('每张面都是单位正交基，画面水平轴 = n × up（= Blender 相机的 +X）', () => {
  for (const f of FACES) {
    const { e, u } = faceBasis(f);
    assert.ok(Math.abs(Math.hypot(...e) - 1) < 1e-9, `${f.k}: e 不是单位向量`);
    assert.ok(Math.abs(Math.hypot(...f.n) - 1) < 1e-9, `${f.k}: n 不是单位向量`);
    assert.equal(dot(f.n, u), 0, `${f.k}: n 与 up 不垂直`);
    assert.equal(dot(e, f.n), 0, `${f.k}: 画面水平轴与法线不垂直`);
    assert.equal(dot(e, u), 0, `${f.k}: 画面两轴不垂直`);
    assert.deepEqual(cross(u, e).map((v) => v + 0), f.n, `${f.k}: (e, u, n) 不是右手系`);
  }
});

test('exitOf：射线一定从某张面出去，出去点在箱体表面上', () => {
  const seen = new Set();
  for (let i = 0; i < 4000; i++) {
    const o = [Math.random() - 0.5, Math.random() - 0.5, Math.random() * 0.42 - 0.44];   // 起点：入口深度只走前半格（ent ∈ [.12,.42]）
    const L = cross([Math.random() - .5, Math.random() - .5, Math.random() - .5], [1, 1, 1]).map((v) => v + (Math.random() - .5) * 0.2);
    const r = exitOf(o, L);
    seen.add(r.key);
    assert.ok(FACES[r.face] && FACES[r.face].k === r.key, `面号 ${r.face} 与面名 ${r.key} 对不上`);
    const t = [0, 1, 2].flatMap((k) => [(0.5 - o[k]) / L[k], (-0.5 - o[k]) / L[k]]).filter((v) => v > 1e-12);
    const T = Math.min(...t);
    const P = [0, 1, 2].map((k) => o[k] + L[k] * T);
    assert.ok(Math.max(...P.map(Math.abs)) > 0.5 - 1e-9, '出射点不在箱面上');
    const { e, u } = faceBasis(FACES[r.face]);
    assert.ok(Math.abs(dot(P, e) + 0.5 - r.ab[0]) < 1e-9 && Math.abs(dot(P, u) + 0.5 - r.ab[1]) < 1e-6, '画面比例算错了');
    assert.ok(r.ab.every((v) => v >= -1e-9 && v <= 1 + 1e-9), `比例出格了 ${r.ab}`);
  }
  assert.equal(seen.size, 6, `六张面都该被射到，只见到了 ${[...seen]}`);
});

test('cellUv：落在自己那一格内（列 = 类别、行 = 面，行从图集顶往下数所以 v 翻一次）', () => {
  for (const room of [0, 2, CELLS - 1]) {
    for (let face = 0; face < FACES.length; face++) {
      for (const ab of [[0.5, 0.5], [0.02, 0.98], [0.98, 0.02]]) {
        const [x, y] = cellUv({ room, face, ab });
        assert.ok(x > room / CELLS && x < (room + 1) / CELLS, `列跑出去了：${x} 不在第 ${room} 列`);
        assert.ok(y > 1 - (face + 1) / CELLS && y < 1 - face / CELLS, `行跑出去了：${y} 不在第 ${face} 行`);
      }
    }
  }
  assert.deepEqual(cellUv({ room: 1, face: 2, ab: [-9, 9] }), cellUv({ room: 1, face: 2, ab: [0, 1] }), '出格的比例要夹住');
});

test('注入的 GLSL 与 exitOf 同一条路径：六个分支、系数取自同一张表', () => {
  const glsl = interiorGlsl({ day: true });
  assert.equal((glsl.match(/AB = vec2\(dot\(/g) || []).length, FACES.length, 'GLSL 的分支数与面表对不上');
  for (const f of FACES) {
    const { e, u } = faceBasis(f);
    assert.ok(glsl.includes(`vec3(${e.map((v) => v.toFixed(1)).join(', ')})`), `GLSL 里没有 ${f.k} 的水平轴`);
    assert.ok(glsl.includes(`vec3(${u.map((v) => v.toFixed(1)).join(', ')})`), `GLSL 里没有 ${f.k} 的竖直轴`);
  }
  assert.ok(glsl.includes('uIntTexDay'), 'day=true 就要混白天那张');
  assert.ok(!interiorGlsl({}).includes('uIntTexDay'), 'day=false 不该多绑一张图');
  assert.ok(LOOK.gainNight > LOOK.gainDay && LOOK.amtNight > LOOK.amtDay, '夜里的窗内景要比白天显眼（白天只当反光）');
});

// 生成式 GLSL 的语法面：向量的分量必须走点号（Lx 在 GLSL 里是未声明标识符，整段着色器编译失败），
// 并且只用 GLSL ES 1.0 也有的写法（mix(vec,vec,bvec) / greaterThan 只在 3.0 有，WebGL1 上下文会挂）。
test('注入的 GLSL 语法过得了：分量走点号、不用 ES 3 专有的选择写法', () => {
  const glsl = interiorGlsl({ day: true });
  assert.equal((glsl.match(/L\.[xyz] [<>] 0\./g) || []).length, FACES.length, '六个方向判定都要写成 L.x 这种');
  assert.equal((glsl.match(/\bTa\.[xyz]\b/g) || []).length, FACES.length * 4 + 3, '出射距离的比较也要写成 Ta.x');
  assert.ok(!/else\s+else/.test(glsl), '分支链拼出了 else else（链的分隔和前缀重复了）');
  const code = glsl.replace(/\/\/[^\n]*/g, '');            // 注释里提到这些词是解释为什么不用它，不算
  for (const bad of ['greaterThan', 'lessThan', 'bvec']) assert.ok(!code.includes(bad), `GLSL ES 3 专有写法 ${bad} 会让 WebGL1 编译失败`);
  assert.ok(/step\(vec3\(1e-6\), abs\(L\)\)/.test(glsl), '出口距离要用 step 选，无穷远那面才留得住');
});

// 取货路径：清单点名了图集就必须真的发请求。manager 传 null 时 three 的默认参数不管用（默认值只认 undefined），
// itemStart 抛错被 get() 的 catch 吞成 null —— 页面上一张图也不发，探针只看到 uIntOn 停在 0。这里用假 THREE 钉住。
test('loadInteriors：按清单发请求，图到位 armInteriors 才开窗', async () => {
  const asked = [];
  const THREE = {
    TextureLoader: class { load(u, cb) { asked.push(u); const t = { image: { width: 3072 } }; setTimeout(() => cb(t), 0); return t; } },
    NoColorSpace: 'ns', ClampToEdgeWrapping: 1001, LinearMipmapLinearFilter: 1008,
    DataTexture: class { constructor(d, w) { this.image = { width: w }; } }, Vector3: class { copy() { return this; } },
  };
  const base = 'http://x/map/estate/model/';
  const block = { night: 'interior_night.jpg', night_low: 'interior_night_low.jpg', day: 'interior_day.jpg' };
  const n0 = interiorCount();
  const u = patchInterior(THREE, { userData: { u: { uGlow: { value: 1 } } } }, { day: true });
  assert.ok(u, '挂过窗光补丁的材质才该拿到窗内景 uniform');
  assert.equal(await loadInteriors(THREE, null, base), null, '清单没点名 = 不发请求，窗退回平光');
  const tex = await loadInteriors(THREE, block, base, { aniso: 8 });
  assert.deepEqual(asked, [base + 'interior_night.jpg', base + 'interior_day.jpg'], '夜和昼各发一次请求');
  assert.equal(tex.night.image.width, 3072);
  assert.equal(u.uIntOn.value, 0, '图到之前是关着的');
  await loadInteriors(THREE, block, base, { low: true });
  assert.deepEqual(asked.slice(2), [base + 'interior_night_low.jpg', base + 'interior_day.jpg'], '低档先取 _low，缺的档回落');
  assert.equal(armInteriors(null), 0, '没图就不动');
  assert.ok(armInteriors(tex) >= 1 && u.uIntOn.value === 1, '图到了就要打开');
  assert.equal(u.uIntTex.value, tex.night);
  assert.equal(u.uIntTexDay.value, tex.day);
  assert.equal(interiorCount(), n0 + 1);
});
