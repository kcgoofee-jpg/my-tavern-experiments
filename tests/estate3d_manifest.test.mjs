// P3-A 任务 2（docs/reviews/architecture_and_stream_perf.md §7）：Estate3D Manifest 标准契约 ——
// Schema 校验 / 未知字段容错 / 路径解析与档位兜底、庄园与 54 个地标清单的账实对拍、运行时解耦机检。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { Estate3D } from '../map/core/estate3d.mjs';

const root = new URL('../map/', import.meta.url);
const rd = (p, base = root) => JSON.parse(readFileSync(new URL(p, base), 'utf8'));
const estateManifest = rd('estate/model/manifest.json');
const estateBase = new URL('estate/model/', root).href;

test('Schema：describe 固定六键 { id, glbPath, floors, hotspots, budget, license }（庄园清单）', () => {
  const d = Estate3D.describe(estateManifest);
  assert.deepEqual(Object.keys(d).sort(), ['budget', 'floors', 'glbPath', 'hotspots', 'id', 'license']);
  assert.equal(d.id, 'eden-estate');
  assert.equal(d.glbPath, 'site.glb', '主部件（第一个 glb 部件）std 档相对路径');
  assert.deepEqual(d.floors, ['B2', 'B1', 'F1', 'F2', 'F3']);
  assert.deepEqual(d.hotspots, [], '庄园的室外热点在 data.zones 文件里，不进清单');
  assert.equal(d.budget.anisotropy, 8);
  assert.equal(d.license.credit.zh.includes('CC0'), true);
});
test('glb 三形写法与地标旧字段兼容；档位兜底：low 缺失回落 std', () => {
  assert.equal(Estate3D.resolveGlb({ id: 'x', glb: 'a.glb' }), 'a.glb');
  assert.equal(Estate3D.resolveGlb({ id: 'x', glb: 'a.glb', glb_low: 'a_low.glb' }, 'low'), 'a_low.glb', 'glb + glb_low 旧写法');
  assert.equal(Estate3D.resolveGlb({ id: 'x', glb: { std: 'a.glb' } }, 'low'), 'a.glb', 'low 档缺失 → std 兜底');
  assert.equal(Estate3D.resolveGlb({ id: 'x', glb: { std: 'a.glb', low: 'a_low.glb' } }, 'low'), 'a_low.glb');
  const multi = { id: 'x', glb: { site: { std: 's.glb', low: 's_low.glb' }, house: { std: 'h.glb' } } };
  assert.equal(Estate3D.resolveGlb(multi, 'std', 'house'), 'h.glb');
  assert.equal(Estate3D.resolveGlb(multi, 'low', 'house'), 'h.glb', '多部件逐部件兜底');
  assert.equal(Estate3D.resolveGlb(multi, 'std', 'nope'), 's.glb', '未知部件回落主部件（无 main 时取第一个）');
  assert.equal(Estate3D.resolveGlb({ id: 'x' }, 'std'), null);
});
test('路径解析：base（清单 URL）把相对路径解析成绝对地址；data 同样解析', () => {
  const n = Estate3D.normalize(estateManifest, { base: estateBase });
  assert.equal(n.ok, true);
  assert.equal(n.parts.site.std, estateBase + 'site.glb');
  assert.equal(n.parts.site.low, estateBase + 'site_low.glb');
  assert.equal(n.data.rooms, new URL('../../data/eden_estate_rooms.json', estateBase).href);
  assert.equal(n.data.zones, estateBase + 'zones.json');
});
test('容错与兜底：未知字段原样保留不报错；缺 id / 缺 glb 报错不抛；describe glbPath 归 null', () => {
  const raw = { id: 'x', glb: 'a.glb', custom_field: { a: 1 }, groups: {}, note: '留着' };
  const n = Estate3D.normalize(raw);
  assert.equal(n.ok, true);
  assert.equal(n.manifest, raw, '原清单引用保留');
  assert.deepEqual(n.errors, []);
  const bad = Estate3D.normalize({ glb: 'a.glb' });
  assert.equal(bad.ok, false); assert.equal(bad.errors.length, 1); assert.match(bad.errors[0], /id/);
  const bad2 = Estate3D.normalize({ id: 'x' });
  assert.equal(bad2.ok, false); assert.match(bad2.errors[0], /glb/);
  assert.equal(Estate3D.normalize('junk').ok, false);
  assert.equal(Estate3D.describe({ id: 'x' }).glbPath, null);
  assert.equal(Estate3D.describe(null).id, null);
});
test('账实对拍：庄园清单的 glb / data 文件都真实存在，floors 与 eden_estate_rooms.json 一致', () => {
  const rooms = rd('data/eden_estate_rooms.json');
  assert.deepEqual(estateManifest.floors, rooms.floors.map(f => f.id), '清单 floors = 房间数据的楼层顺序');
  const n = Estate3D.normalize(estateManifest, { base: estateBase });
  for (const p of ['site', 'house']) for (const t of ['std', 'low']) assert.ok(existsSync(new URL(n.parts[p][t])), `estate ${p}.${t}`);
  for (const k of ['rooms', 'zones', 'galleries']) assert.ok(existsSync(new URL(n.data[k])), `estate data.${k}`);
});
test('账实对拍：54 个地标清单全部合格——id = 目录名、glb 文件在盘、热点 id 唯一', () => {
  const dirs = readdirSync(new URL('props/', root)).filter(d => !d.endsWith('.html') && !d.startsWith('.'));
  let checked = 0;
  for (const dir of dirs) {
    const p = new URL(`props/${dir}/manifest.json`, root);
    if (!existsSync(p)) continue;
    checked++;
    const m = JSON.parse(readFileSync(p, 'utf8'));
    const n = Estate3D.normalize(m);
    assert.deepEqual(n.errors, [], dir);
    const d = Estate3D.describe(m);
    assert.equal(d.id, m.id, `${dir}: describe id = 清单 id`);
    assert.ok(existsSync(new URL(`props/${dir}/${d.glbPath}`, root)), `${dir}: ${d.glbPath}`);
    const hs = d.hotspots;
    assert.equal(new Set(hs).size, hs.length, `${dir}: 热点 id 不重复`);
    if (m.glb_low) assert.ok(existsSync(new URL(`props/${dir}/${m.glb_low}`, root)), `${dir}: ${m.glb_low}`);
  }
  assert.equal(checked, 54);
});
test('Part 3：三维页用共享运行时（map/three/*），自己不再 new WebGLRenderer', () => {
  const v3d = readFileSync(new URL('props/viewer3d.html', root), 'utf8');
  assert.doesNotMatch(v3d, /new\s+THREE\.WebGLRenderer\s*\(/, '渲染器只能由 map/three/ctx.mjs 建');
  for (const m of ['three/map/ctx.mjs', 'three/map/culling.mjs', 'three/map/lod.mjs', 'three/map/instancing.mjs', 'three/map/texres.mjs'])
    assert.match(v3d, new RegExp(m.replace(/\//g, '\\/')), `缺共享运行时模块 ${m}`);
  assert.match(v3d, /"three\/map\/":\s*"\.\.\/three\/"/, 'importmap 要能解析 three/map/');
  assert.match(v3d, /frustumCulled/, '显式打开视锥体裁剪（共享运行时里做）');
});

test('Part 3：KTX2 / Basis 转码器随仓库（与 vendored three 同版本），LICENSE 里写明来源', () => {
  const dir = new URL('estate/vendor/jsm/libs/basis/', root);
  for (const f of ['basis_transcoder.js', 'basis_transcoder.wasm']) {
    const p = new URL(f, dir);
    assert.ok(existsSync(p), `缺转码器 ${f}`);
    assert.ok(readFileSync(p).length > 1024, `${f} 是空壳`);
  }
  const lic = readFileSync(new URL('estate/vendor/LICENSE', root), 'utf8');
  assert.match(lic, /basis_transcoder/, 'LICENSE 要写明转码器来源与许可');
  const v3d = readFileSync(new URL('props/viewer3d.html', root), 'utf8');
  assert.match(v3d, /KTX2Loader/, 'KTX2 备选加载管线要接上');
  assert.match(v3d, /jsm\/libs\/basis\//, '转码器路径指向 vendored 目录');
});

test('运行时解耦机检：查看器代码不写死 / 不拼装模型地址，加载与摘要走 Estate3D 契约', () => {
  const main = readFileSync(new URL('estate/main.js', root), 'utf8');
  assert.doesNotMatch(main, /url\(\s*['"]model\/['"]\s*\+/, '不许拼装 model/ 前缀');
  assert.doesNotMatch(main, /['"]\.\.\/data\/(eden_estate_rooms|room_galleries)\.json['"]/, '数据文件路径来自清单 data');
  assert.doesNotMatch(main, /MAN\.(site|house)\b/, 'glb 地址一律经 M3D.parts（清单解析结果）');
  assert.match(main, /Estate3D\.normalize/); assert.match(main, /Estate3D\.describe/);
  const v3d = readFileSync(new URL('props/viewer3d.html', root), 'utf8');
  assert.doesNotMatch(v3d, /\|\|\s*'dairy'/, '不许内置默认模型');
  assert.doesNotMatch(v3d, /MAN\.glb_low/, 'glb 地址一律经 Estate3D.resolveGlb（含档位兜底）');
  assert.match(v3d, /Estate3D\.resolveGlb/);
});
