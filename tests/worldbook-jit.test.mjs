// W6 世界书 JIT 水合（map/tavern/worldbook-jit.mjs）：条目范围数据驱动（strategy.keys ∩ 激活集，无发明元数据）、
// 主权纪律（无 eden_id 不碰 / 用户手动关的 markIgnore 永不再碰 / constant 永不 JIT / 已 ignore 的跳过）、
// applyPlan 变更描述（jit 标记翻转）、哈希水位（激活集没变不写）、与 spatial.activationOf 的端到端对拍、
// 模块纯度。见 docs/plans/llm-campaign.md W6 / 裁决 9-10；夹具全中性合成数据。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as J from '../map/tavern/worldbook-jit.mjs';
import * as S from '../map/tavern/spatial-contract.mjs';

const ent = (id, keys, { enabled = true, jit, ignore, type } = {}) => ({
  uid: Math.abs(keys.length * 7 + id.length) || 3, enabled, name: id,
  strategy: { type: type || (keys.length ? 'selective' : 'constant'), keys },
  extra: { eden_id: id, ...(jit !== undefined ? { eden_jit: jit } : {}), ...(ignore ? { eden_jit_ignore: 1 } : {}) },
});
const NAMES = new Set(['霓虹市场', '执法局总局', '下层']);

test('计划：词表 ∩ 激活集——进门 enable / 出门 disable / 无关不动 / constant 与无 eden_id 永不碰', () => {
  const entries = [
    { uid: 1, name: '用户自己的条目', enabled: true, strategy: { type: 'selective', keys: ['霓虹市场'] }, extra: {} },   // 无 eden_id
    ent('map.place.market', ['霓虹市场', '夜市']),
    ent('map.place.rust', ['铁锈外环']),
    ent('map.rules.generic', [], { type: 'constant' }),   // constant
  ];
  const p = J.planActivation(entries, NAMES);
  assert.deepEqual(p.enable, []);          // market 本来就开着（在激活集）→ untouched
  assert.deepEqual(p.disable, ['map.place.rust']);
  assert.deepEqual(p.markIgnore, []);
  assert.equal(p.untouched, 3);            // 用户条目 + constant + 本来就开着的 market
  // 玩家从市场走向别处：market 与 rust 都该关（JIT 关）
  const p2 = J.planActivation(entries, new Set(['玫瑰园']));
  assert.deepEqual(p2.disable, ['map.place.market', 'map.place.rust']);
  assert.deepEqual(p2.enable, []);
});

test('主权：用户手动关的（无 jit 标记）→ markIgnore；已 ignore 的跳过；JIT 自己关的可以再开', () => {
  const entries = [
    ent('map.a', ['霓虹市场'], { enabled: false }),                       // 用户关的
    ent('map.b', ['霓虹市场'], { enabled: false, jit: 1 }),               // JIT 关的
    ent('map.c', ['霓虹市场'], { enabled: false, ignore: true }),         // 已 ignore
    ent('map.d', ['铁锈外环'], { enabled: false, jit: 1 }),               // JIT 关的、不在激活集 → 不动
  ];
  const p = J.planActivation(entries, NAMES);
  assert.deepEqual(p.markIgnore, ['map.a']);
  assert.deepEqual(p.enable, ['map.b']);
  assert.deepEqual(p.disable, []);
  assert.equal(p.ignored, 1);
});

test('applyPlan：变更描述带 jit 标记翻转（disable 记 eden_jit=1、enable 清 0、markIgnore 记 ignore）', () => {
  const entries = [ent('map.a', ['霓虹市场'], { enabled: false, jit: 1 }), ent('map.b', ['铁锈外环']), ent('map.c', ['铁锈外环'], { enabled: false })];
  const plan = J.planActivation(entries, NAMES);
  const m = J.applyPlan(entries, plan);
  assert.deepEqual(m.find(x => x.id === 'map.a'), { id: 'map.a', enabled: true, extra: { eden_jit: 0 } });
  assert.deepEqual(m.find(x => x.id === 'map.b'), { id: 'map.b', enabled: false, extra: { eden_jit: 1 } });
  const m2 = J.applyPlan(entries, J.planActivation(entries, new Set()));
  assert.deepEqual(m2.find(x => x.id === 'map.c'), { id: 'map.c', enabled: false, extra: { eden_jit_ignore: 1 } });   // 用户关的 → 下轮起永不再碰
});

test('哈希水位：同一激活集不重写；集合变化才写；与 spatial.activationOf 端到端', () => {
  const REG = { maps: { tc_mid: { kind: 'points', layer: { name: '中层' }, data: 'data/x.json', markers: { market: { name: '霓虹市场' }, hq: { name: '执法局总局' } } } } };
  const PTS = { markers: [{ id: 'market', nx: 0.5, ny: 0.5 }, { id: 'hq', nx: 0.55, ny: 0.52 }] };
  const active = S.activationOf(REG, '霓虹市场', { tc_mid: PTS }, { near: 1 });
  const h = J.hashOf(active);
  assert.equal(J.shouldWrite({ floor: 3, hash: h }, h), false);
  assert.equal(J.shouldWrite({ floor: 3, hash: h }, J.hashOf(new Set(['书房']))), true);
  assert.equal(J.shouldWrite(null, h), true);
  // 端到端：激活集真正来自几何 + 出口，plan 据此开关
  const entries = [ent('map.place.market', ['霓虹市场'], { enabled: false, jit: 1 }), ent('map.place.hq', ['执法局总局'])];
  const p = J.planActivation(entries, active);
  assert.deepEqual(p.enable, ['map.place.market']);   // hq 是最近邻 → 在激活集里（jit 关过的可再开）
  assert.deepEqual(p.disable, []);                     // hq 自己也活跃
});

test('FIX-3：计划报的是这一轮之后书里的状态（on / off），不是增删量；增删量只在 enable / disable 的长度里', () => {
  const entries = [ent('map.a', ['霓虹市场']), ent('map.b', ['铁锈外环']), ent('map.c', ['夜市'], { enabled: false, jit: 1 })];
  const p = J.planActivation(entries, NAMES);   // 夜市不在集合里 → 该关；铁锈外环该关
  assert.equal(p.on, 1, '只有霓虹市场开着');
  assert.equal(p.off, 2, '铁锈外环与夜市关着');
  assert.deepEqual(p.disable, ['map.b']);
  // 用户手动关的条目记 ignore，仍然算在 off 里
  const p2 = J.planActivation([...entries, ent('map.d', ['玫瑰园'], { enabled: false })], NAMES);
  assert.equal(p2.off, 3); assert.deepEqual(p2.markIgnore, ['map.d']); assert.equal(p2.on, 1);
});

test('FIX-3：没钉在具体地点（pinned=false）时一个条目都不开关，但用户手动关的照旧记 ignore', () => {
  const entries = [ent('map.a', ['霓虹市场']), ent('map.b', ['夜市'], { enabled: false, jit: 1 }), ent('map.c', ['玫瑰园'], { enabled: false })];
  const bare = J.planActivation(entries, new Set(['伊甸庄园']), { pinned: false });
  assert.deepEqual(bare.enable, []); assert.deepEqual(bare.disable, [], '场地名不是「整本书都没人要」');
  assert.deepEqual(bare.markIgnore, ['map.c']);
  assert.equal(bare.on, 1); assert.equal(bare.off, 2);
  // 同一个集合，钉住了就照常开关（默认 pinned=true，旧调用方不变）
  const pinned = J.planActivation(entries, new Set(['伊甸庄园']), { pinned: true });
  assert.deepEqual(pinned.disable, ['map.a']);
});

test('模块纯度：不碰 DOM / 全局 / 存储 / 网络（剥注释后扫，与看门狗同口径）', () => {
  const raw = readFileSync(fileURLToPath(new URL('../map/tavern/worldbook-jit.mjs', import.meta.url)), 'utf8');
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(src, /\b(window|document|localStorage|sessionStorage|fetch|Mvu|SillyTavern|navigator)\b/);
  assert.ok(raw.split('\n').length < 400);
});
