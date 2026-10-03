// DIST-2（I-35 b/c）：运行时文件按包发到 npm，底图与三维模型不在引擎包里。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pkgIndex, pkgOf, pkgUrl, readTable, engineBase, pkgResolverSrc } from '../map/core/pkg-paths.mjs';

// 钉住三件事：路径前缀的归属（前缀长的先命中）、包地址拼得出来、注入页面的那一行解析器与 pkgUrl 同答案。
const rd = f => readFileSync(fileURLToPath(new URL('../' + f, import.meta.url)), 'utf8');
const IDX = pkgIndex(JSON.parse(rd('map/data/assets.json')));
const V = rd('VERSION').trim(), B = 'https://cdn.jsdelivr.net/npm/';
const table = { engine: 'eden-map-engine', index: IDX, bases: Object.fromEntries(['eden-map-engine', ...new Set(IDX.prefixes.map(x => x[1]))].map(p => [p, B + p + '@' + V + '/map/'])) };

test('路径前缀从长到短命中：art/tc_mid 不吃掉 art/tc_mid_obl_day 与它的 _files 目录', () => {
  assert.equal(pkgOf(IDX, 'art/tc_mid.dzi'), 'eden-map-art-tc_mid');
  assert.equal(pkgOf(IDX, 'art/tc_mid_files/12/0_0.jpg'), 'eden-map-art-tc_mid', '_files 跟着层走');
  assert.equal(pkgOf(IDX, 'art/tc_mid_obl_day.dzi'), 'eden-map-art-tc_mid_obl-day');
  assert.equal(pkgOf(IDX, 'art/tc_mid_obl_day_files/12/0_0.jpg'), 'eden-map-art-tc_mid_obl-day');
  assert.equal(pkgOf(IDX, 'art/tc_low_obl_dayshift.dzi'), 'eden-map-art-tc_low_obl_dayshift');
  assert.equal(pkgOf(IDX, 'map/art/tc_mid.dzi'), 'eden-map-art-tc_mid', '带 map/ 前缀也行');
  assert.equal(pkgOf(IDX, 'props/holy_mountain/holy_mountain.glb'), pkgOf(IDX, 'props/holy_mountain/manifest.json'), '同一模型一个包');
  assert.equal(pkgOf(IDX, 'data/maps.json'), '', '引擎包自己的文件不进索引');
  assert.equal(pkgOf(IDX, 'i18n/en.json'), '');
  assert.equal(pkgOf(IDX, 'packs/eden/art/x.dzi'), '', '包目录下的美术跟着引擎包，不改');
  assert.equal(pkgOf(null, 'art/tc_mid.dzi'), '', '没有索引 = 没有包信息');
  const lens = IDX.prefixes.map(x => x[0].length);
  assert.deepEqual(lens, [...lens].sort((a, b) => b - a), '索引已按前缀长度从长到短排好');
});

test('包地址拼得出来，且只换前缀不换文件名', () => {
  assert.equal(pkgUrl(table, 'art/tc_mid.dzi'), B + 'eden-map-art-tc_mid@' + V + '/map/art/tc_mid.dzi');
  assert.equal(pkgUrl(table, 'art/tc_mid_files/9/3_1.jpg'), B + 'eden-map-art-tc_mid@' + V + '/map/art/tc_mid_files/9/3_1.jpg');
  assert.equal(pkgUrl(table, 'data/maps.json'), 'data/maps.json', '引擎包的文件原样返回（照旧按 <base> 取）');
  assert.equal(pkgUrl({ index: IDX, bases: {} }, 'art/tc_mid.dzi'), 'art/tc_mid.dzi', '表里没那个包 = 原样返回，不猜');
  assert.equal(pkgUrl(null, 'art/tc_mid.dzi'), 'art/tc_mid.dzi');
  assert.equal(engineBase(table), B + 'eden-map-engine@' + V + '/map/');
  assert.equal(engineBase({ bases: {} }), '');
});

test('注入页面的那一行解析器与 pkgUrl 同一个答案（viewer.html 首帧 / viewer3d.html 用它）', () => {
  const run = new Function('window', pkgResolverSrc() + 'return window.__edenPkgAt;')({ __edenPkg: table });
  assert.equal(typeof run, 'function');
  for (const p of ['art/tc_mid.dzi', 'art/tc_mid_files/9/3_1.jpg', 'art/tc_mid_obl-day.dzi', 'props/holy_mountain/holy_mountain.glb', 'art/world_1k.jpg', 'data/maps.json', 'map/art/tc_mid.dzi'])
    assert.equal(run(p), pkgUrl(table, p), p);
  assert.equal(run(''), '', '空路径原样');
  assert.equal(run(42), 42, '不是字符串就原样');
  assert.equal(new Function('window', pkgResolverSrc() + 'return window.__edenPkgAt("art/tc_mid.dzi");')({}), 'art/tc_mid.dzi', '没注入表 = 静默照旧');
  assert.equal(readTable({}), null); assert.equal(readTable({ __edenPkg: table }), table);
});

test('索引（map/data/assets.json）自成一套：版本 = VERSION，包名成前缀，底图与模型都归了包', () => {
  const raw = JSON.parse(rd('map/data/assets.json'));
  assert.equal(raw.version, V, '索引里的版本 = VERSION（所有包同版本，运行时按它对）');
  assert.ok(Object.keys(raw.art).length > 10 && Object.keys(raw.props).length > 10);
  const names = new Set([...Object.values(raw.art), ...Object.values(raw.props), ...Object.values(raw.paths)]);
  for (const n of names) assert.match(n, /^eden-map-(art|props)-[a-z0-9_-]+$/, n);
  for (const [prefix, pkg] of Object.entries(raw.paths)) {
    assert.ok(names.has(pkg), prefix + ' 指到一个真实存在的包名');
    if (prefix.startsWith('art/')) assert.ok(Object.values(raw.art).includes(pkg), prefix + ' 指到底图包');
    if (prefix.startsWith('props/')) assert.ok(Object.values(raw.props).includes(pkg), prefix + ' 指到模型包');
  }
  for (const [layer, pkg] of Object.entries(raw.art)) assert.equal(raw.paths['art/' + layer], pkg, 'art 段与 paths 段对得上：' + layer);
  for (const [id, pkg] of Object.entries(raw.props)) assert.equal(raw.paths['props/' + id], pkg, 'props 段与 paths 段对得上：' + id);
});
