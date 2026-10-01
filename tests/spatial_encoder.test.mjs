// W1 空间坐标契约（map/tavern/spatial-contract.mjs）：确定性（同输入字节级同输出）、token 预算降级阶梯、
// 坐标量化、邻接纪律（routes 不作邻接源）、JIT 激活集底座、注入守卫、模块纯度机检。
// 夹具全中性合成数据。见 docs/plans/llm-campaign.md W1。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as S from '../map/tavern/spatial-contract.mjs';
import { tokens } from '../map/tavern/interaction-modes.mjs';

const REG = { maps: {
  tc_mid: { kind: 'points', layer: { name: '中层', sub: '霓虹与执法' }, data: 'data/tc_mid.json',
    markers: { market: { name: '霓虹市场' }, hq: { name: '执法局总局', link: { map: 'tc_low' } }, park: { name: '悬空公园' } } },
  tc_low: { kind: 'points', layer: { name: '下层' }, markers: {} },
  eden_estate: { kind: 'estate', title: '庄园', rooms: ['书房', '长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长的房间'], areas: [], alias: [], markers: {} },
} };
const PTS = { markers: [
  { id: 'market', nx: 0.51234, ny: 0.33321 },
  { id: 'hq', nx: 0.55, ny: 0.36, ax: 0.551234, ay: 0.360987 },
  { id: 'park', nx: 0.9, ny: 0.9 },
], routes: [ { kind: 'patrol', label: '巡逻甲', from: 'a', pts: [[0.5, 0.35], [0.6, 0.4]] } ] };
const VIEW = { reg: REG, here: '霓虹市场', pointsByMap: { tc_mid: PTS }, t: 0.5 };

test('locate：地标 → 层级 3 落点；层名 → 层级 4；庄园房间 → 层级 1；认不出 → null', () => {
  const m = S.locate(REG, '霓虹市场');
  assert.equal(m.level, 3); assert.equal(m.mapId, 'tc_mid'); assert.equal(m.markerId, 'market'); assert.equal(m.name, '霓虹市场');
  const lay = S.locate(REG, '下层');
  assert.equal(lay.level, 4); assert.equal(lay.mapId, 'tc_low'); assert.equal(lay.markerId, null);
  const room = S.locate(REG, '书房');
  assert.equal(room.level, 1); assert.equal(room.mapId, 'eden_estate'); assert.equal(room.name, '书房');
  assert.equal(S.locate(REG, '不存在的地方'), null);
  assert.equal(S.locate(null, 'x'), null);
});

test('coordIndex：3 位量化、ax/ay 校正位优先、坏行丢弃', () => {
  const ci = S.coordIndex(PTS);
  assert.equal(ci.market.nx, 0.512); assert.equal(ci.market.ny, 0.333);
  assert.equal(ci.hq.nx, 0.551); assert.equal(ci.hq.ny, 0.361);
  assert.deepEqual(S.coordIndex({ markers: [{ id: 'bad' }, { id: 'nan', nx: 'x', ny: null }, null] }), {});
});

test('coordView：确定性（两次调用字节级一致）+ 紧凑契约形状', () => {
  const a = S.coordView(VIEW), b = S.coordView({ ...VIEW });
  assert.equal(a, b);
  assert.ok(a.startsWith('[地图空间] '));
  const v = JSON.parse(a.slice('[地图空间] '.length));
  assert.deepEqual(Object.keys(v), ['L', 'p', 'e', 'g', 'n']);   // 键序固定
  assert.equal(v.L, '中层');
  assert.deepEqual(v.p, ['霓虹市场', 0.512, 0.333]);
  assert.ok(v.e.some(x => x[0] === '执法局总局' && x[3] === '下层'));   // link 显式出口带目标层
  assert.ok(v.g.length >= 1 && v.g.every(x => x.length === 5 && x[3] >= 0 && x[3] < 360 && x[4] > 0));   // 守卫锥：朝向归一、半径在
  assert.ok(!v.n.some(x => x[0] === '执法局总局'));   // 出口不再重复进邻近
});

test('token 预算：默认档 ≤120；小档降级到只剩 p；小到放不下 p → 空串（不输出坏 JSON）', () => {
  const full = S.coordView(VIEW);
  assert.ok(tokens(full) <= 120, `默认档超预算：${tokens(full)}`);
  const small = S.coordView({ ...VIEW, budget: 25 });
  const v = JSON.parse(small.slice('[地图空间] '.length));
  assert.deepEqual(Object.keys(v), ['L', 'p']);   // 阶梯：f→n→g→e 全砍光，p 永远保留
  assert.ok(tokens(small) <= 25);
  assert.equal(S.coordView({ ...VIEW, budget: 20, here: '长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长长的房间' }), '');
  assert.equal(S.coordView({ ...VIEW, here: '不存在' }), '');
});

test('守卫按距离排序；fog 可选字段；routes 不当邻接源（出口只来自 link）', () => {
  const v = JSON.parse(S.coordView(VIEW).slice('[地图空间] '.length));
  assert.ok(v.g.length >= 1 && v.g.every(x => x.length === 5));
  const withFog = JSON.parse(S.coordView({ ...VIEW, fog: 0.62 }).slice('[地图空间] '.length));
  assert.equal(withFog.f, 0.62);
  const noFog = JSON.parse(S.coordView({ ...VIEW, fog: 0.62, budget: 25 }).slice('[地图空间] '.length));
  assert.ok(!('f' in noFog) && !('e' in noFog));   // 降级先砍雾
  // 邻接纪律：patrol routes 不产生「出口」，e 只认 link 字段
  assert.equal(v.e.filter(x => x[0] === '巡逻甲').length, 0);
});

test('activationOf（W6 底座）：自身 + 出口目标层 + 同层最近 near 个；认不出 → 空集', () => {
  const near1 = S.activationOf(REG, '霓虹市场', { tc_mid: PTS }, { near: 1 });
  assert.ok(near1.has('霓虹市场') && near1.has('执法局总局') && near1.has('下层'));
  assert.ok(!near1.has('悬空公园'));   // near=1 只取最近一个（hq 比 park 近），park 不入集
  const nearAll = S.activationOf(REG, '霓虹市场', { tc_mid: PTS }, { near: 5 });
  assert.ok(nearAll.has('悬空公园'));
  assert.equal(S.activationOf(REG, '不存在', {}).size, 0);
  assert.equal(S.activationOf(null, 'x').size, 0);
});

test('applySpatial：先撤同 id 再注入；空内容只撤；没有 injectPrompts 接口 → false', () => {
  const calls = [];
  const fn = name => name === 'uninjectPrompts' ? (ids => calls.push(['un', ids])) : (items => calls.push(['in', items]));
  assert.equal(S.applySpatial(fn, '[地图空间] {}', 2), true);
  assert.deepEqual(calls, [['un', ['eden-map-spatial']], ['in', [S.spatialPrompt('[地图空间] {}', 2)]]]);
  calls.length = 0;
  assert.equal(S.applySpatial(fn, '', 2), true);
  assert.deepEqual(calls, [['un', ['eden-map-spatial']]]);
  assert.equal(S.applySpatial(() => null, 'x', 2), false);
  const p = S.spatialPrompt('x', 99);
  assert.equal(p.id, 'eden-map-spatial'); assert.equal(p.depth, 20); assert.equal(p.role, 'system'); assert.equal(p.should_scan, false);
});

test('模块纯度：不碰 DOM / 全局 / 存储 / 网络 / 酒馆（机械扫描源码，剥离注释后扫——与看门狗同口径）', () => {
  const raw = readFileSync(fileURLToPath(new URL('../map/tavern/spatial-contract.mjs', import.meta.url)), 'utf8');
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(src, /\b(window|document|localStorage|sessionStorage|fetch|Mvu|SillyTavern|navigator)\b/);
  const lines = raw.split('\n').length;
  assert.ok(lines < 400, `文件 ${lines} 行，超 400 红线`);
});
