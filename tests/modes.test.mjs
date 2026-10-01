// 交互方式 (a) 紧凑状态注入、(d) 标签对账、(e) 最小检查点（map/tavern/modes.mjs）：假的酒馆助手注入表 + 假聊天数组，走 swipe / 重生 / 重载。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as M from '../map/tavern/modes.mjs';
import { pickStat } from '../map/tavern/snapshot.mjs';
import { loadEventGeo } from '../map/tavern/event-geo-load.mjs';
import * as F from './helpers/s43_frozen.mjs';
import { HOST_SRC } from './_host_src.mjs';
const HOST = HOST_SRC;   // P2：标签对账在桥里，接线在入口

// 酒馆助手注入：按 id 存（TH inject.ts：同 id 覆盖）；pagehide 时 TH 自己全撤
function fakeTH() {
  const inj = new Map();
  const api = { injectPrompts: a => { for (const p of a) inj.set(p.id, p); return { uninject: () => a.forEach(p => inj.delete(p.id)) }; }, uninjectPrompts: ids => ids.forEach(i => inj.delete(i)) };
  return { fn: n => api[n] || null, inj, reload() { inj.clear(); } };
}
// 聊天：[{ role, swipe, vars: [每个 swipe 的变量] }]
const chatOf = floors => i => { const f = floors[i]; return f ? { vars: f.vars?.[f.swipe ?? 0], system: false, role: f.role } : null; };
const stat = (place, extra = {}) => ({ stat_data: { 世界: { 当前地点: place, 当前时刻: '21:00' }, 在场人物: ['安娜'], ...extra } });

function lineFor(floors, type) {
  const r = M.snapFor(pickStat, chatOf(floors), floors.length - 1, { type });
  const sd = r.stat || {};
  return M.stateLine({ here: sd.世界?.当前地点, present: sd.在场人物, time: sd.世界?.当前时刻, trips: [], state: r.state });
}

test('(a) 一行状态：字段、预算、未确认、跳过卡里已有的字段', () => {
  const l = M.stateLine({ here: '伊甸庄园·书房', present: ['安娜', '莉莉'], time: '1月3日 21:00', trips: [{ from: '中层·霓虹街', to: '伊甸庄园', live: true }], state: 'ok' });
  assert.equal(l, '[地图状态] 地点：伊甸庄园·书房；在场：安娜、莉莉；时间：1月3日 21:00；行程：中层·霓虹街→伊甸庄园（途中）');
  assert.ok(M.tokens(l) <= 150);
  assert.match(M.stateLine({ here: 'A', present: ['B'], state: 'stale' }), /地点：A（未确认）；在场：B（未确认）/);
  assert.match(M.stateLine({ here: 'A', state: 'pending' }), /（未确认）/);
  // 预算：先砍行程再砍名单，地点留着
  const many = Array.from({ length: 30 }, (_, i) => '人物' + i), tr = Array.from({ length: 5 }, (_, i) => ({ from: '起点' + i, to: '终点' + i }));
  const small = M.stateLine({ here: '天城·中层·天城执法局总局', present: many, time: '21:00', trips: tr, state: 'ok' }, 40);
  assert.ok(M.tokens(small) <= 40, small); assert.match(small, /天城执法局总局/); assert.doesNotMatch(small, /行程/);
  // 卡的提示词里已经引用了当前地点 / 整个 stat_data
  const skip = M.cardHas(['当前位置：{{get_message_variable::stat_data.世界.当前地点}}'], { location: '世界.当前地点' });
  assert.deepEqual(skip, { here: true, time: false, present: false, trips: false });
  assert.doesNotMatch(M.stateLine({ here: 'A', time: 'T', state: 'ok', skip }), /地点/);
  assert.deepEqual(M.cardHas(['<%= getvar("stat_data") %>']), { here: true, time: true, present: true, trips: false });
  assert.deepEqual(M.cardHas([]), {});
  assert.equal(M.stateLine({ state: 'none' }), '');
});

test('(a) 注入生命周期：普通 / swipe / 重生 / 重载都只有一条，内容跟着正确的楼走', () => {
  const T = fakeTH();
  const floors = [{ role: 'assistant', vars: [stat('中层·霓虹街')] }, { role: 'user', vars: [stat('中层·霓虹街')] }];
  // 普通发送：最后一楼是用户楼
  M.applyState(T.fn, lineFor(floors, 'normal'), 2);
  assert.equal(T.inj.size, 1); assert.equal(T.inj.get(M.STATE_ID).depth, 2); assert.equal(T.inj.get(M.STATE_ID).should_scan, false);
  assert.match(T.inj.get(M.STATE_ID).content, /地点：中层·霓虹街；/);
  // 回复写了新地点
  floors.push({ role: 'assistant', swipe: 0, vars: [stat('伊甸庄园·书房')] });
  M.applyState(T.fn, lineFor(floors, 'normal'), 2);
  assert.equal(T.inj.size, 1); assert.match(T.inj.get(M.STATE_ID).content, /伊甸庄园·书房/);
  // swipe：被替换的那一楼（书房）不能当生成前的状态 → 回到用户楼（霓虹街），且不标未确认
  floors[2].swipe = 1; floors[2].vars[1] = undefined;
  let l = lineFor(floors, 'swipe'); M.applyState(T.fn, l, 2);
  assert.equal(T.inj.size, 1); assert.match(l, /地点：中层·霓虹街；/); assert.doesNotMatch(l, /未确认/);
  // 重新生成同理
  l = lineFor(floors, 'regenerate'); M.applyState(T.fn, l, 3);
  assert.equal(T.inj.size, 1); assert.equal(T.inj.get(M.STATE_ID).depth, 3); assert.match(l, /中层·霓虹街/);
  // 新 swipe 还没有变量、又不是在生成（被杀）→ 普通读法取上一份并标未确认
  l = lineFor(floors, 'normal'); assert.match(l, /中层·霓虹街（未确认）/);
  // 重载：TH 在 pagehide 时撤掉所有注入；新实例启动时注入一次 → 还是一条
  T.reload(); assert.equal(T.inj.size, 0);
  M.applyState(T.fn, l, 2); M.applyState(T.fn, l, 2); assert.equal(T.inj.size, 1);
  // 关掉开关 = 撤掉
  M.applyState(T.fn, '', 2); assert.equal(T.inj.size, 0);
  // 没有注入接口：不抛
  assert.equal(M.applyState(() => null, 'x', 2), false);
  // 宿主接线：GENERATION_AFTER_COMMANDS 带 type；默认开；设置里深度 / 上限
  assert.match(HOST, /GENERATION_AFTER_COMMANDS, \(type\) => \{[^\n]*stateInject\(typeof type === 'string' \? type : 'normal'\)/);
  assert.match(HOST, /lsGet\('edenMapStateInj'\) !== '0'/);
});

// S4-3：写法模板与地点前缀是设定包的数据；宿主经 loadEventGeo 装入（第一个包：overlay llm["x-tag-examples"] 与各组的世界图地点名）
const MAP_DIR = new URL('../map/', import.meta.url);
await loadEventGeo({ fetchJSON: async rel => { try { return JSON.parse(readFileSync(new URL(rel, MAP_DIR), 'utf8')); } catch (e) { return null; } }, packId: 'eden' });

test('S4-3：没装设定包数据时对账是中性的（没有模板、没有前缀），装入后与以前的常量同一结果', async () => {
  M.configure({});
  assert.equal(M.parseHereTag('<span style="display:none">⌖地点 层·地点</span>'), '层·地点'); assert.equal(M.samePlace('天城', '天城·中层'), true);   // 没有前缀可去：两边各自带着「天城」
  await loadEventGeo({ fetchJSON: async rel => { try { return JSON.parse(readFileSync(new URL(rel, MAP_DIR), 'utf8')); } catch (e) { return null; } }, packId: 'eden' });
  assert.equal(M.samePlace('天城', '天城·中层'), false);   // 装入后开头的大区名不参与比较（旧规则同）
  for (const ex of F.EX) assert.equal(M.parseHereTag(`⌖地点 ${ex}`), null, ex);   // 旧常量里的三个模板都认
  assert.equal(M.parseHereTag('⌖地点 天城·别的写法'), '天城·别的写法');
  // 前缀：旧的只去掉开头的「天城」；现在是每个组的世界图地点名——只会多认（旧规则说同一处的，新规则一定也说同一处）
  const texts = ['天城·中层·霓虹街', '中层·霓虹街', '天城中层', '伊甸庄园·书房', '书房', '天城', '', '圣都·大教堂', '大教堂', '天城 · 下层 · 7号井', '7号井', '霓虹街'];
  for (const a of texts) for (const b of texts) { const old = (x => x && (F.norm(b) ? (x.includes(F.norm(b)) || F.norm(b).includes(x)) : false))(F.norm(a)); if (old) assert.ok(M.samePlace(a, b), `${a} ~ ${b}`); }
  for (const t of ['天城·中层·霓虹街', '天城中层']) assert.equal(M.samePlace(t, F.norm(t)), true);
});
test('(d) 标签对账：MVU 为准；本楼没快照时用正文标签；冲突列出', () => {
  assert.equal(M.parseHereTag('走进书房。<span style="display:none">⌖地点 伊甸庄园·书房</span>'), '伊甸庄园·书房');
  assert.equal(M.parseHereTag('<span data-tcmap="地点=霓虹街;层=中层"></span>'), '中层·霓虹街');
  assert.equal(M.parseHereTag('<span data-tcmap="人物=安娜;地点=中层·霓虹街"></span>'), null, '人物标签不算玩家地点');
  assert.equal(M.parseHereTag('<span style="display:none">⌖地点 层·地点</span>'), null, '写法模板不算');
  assert.equal(M.parseHereTag('⌖地点 A。然后 ⌖地点 B'), 'B', '取最后一个');
  assert.equal(M.parseHereTag('```\n⌖地点 代码里\n```'), null);
  assert.deepEqual(M.reconcile({ place: '天城·中层·霓虹街', state: 'ok' }, '中层·霓虹街'), { place: '天城·中层·霓虹街', source: 'mvu', conflict: null });
  assert.deepEqual(M.reconcile({ place: '伊甸庄园·书房', state: 'ok' }, '中层·霓虹街'), { place: '伊甸庄园·书房', source: 'mvu', conflict: { mvu: '伊甸庄园·书房', tag: '中层·霓虹街' } });
  assert.deepEqual(M.reconcile({ place: '伊甸庄园·书房', state: 'stale' }, '中层·霓虹街'), { place: '中层·霓虹街', source: 'tag', conflict: null });
  assert.deepEqual(M.reconcile({ place: '', state: 'none' }, null), { place: '', source: 'none', conflict: null });
  assert.deepEqual(M.conflicts([{ floor: 3, mvu: '伊甸庄园·书房', raw: '⌖地点 伊甸庄园·书房' }, { floor: 5, mvu: '伊甸庄园·书房', raw: '⌖地点 中层·霓虹街' }, { floor: 6, mvu: 'X', raw: '没有标签' }]),
    [{ floor: 5, mvu: '伊甸庄园·书房', tag: '中层·霓虹街' }]);
  assert.match(HOST, /MDm\.reconcile\(\{ place: v, state: snapState \}, t\)/);
  assert.match(HOST, /checkFacts\.conflicts = conflictsNow\(\)/);
});

test('(e) 检查点：只在确认时前进、幂等；启动对照 match / ahead / swiped / missing', () => {
  let cp = M.nextCheckpoint(null, { floor: 4, top: 4, swipe: 1, state: 'ok' });
  assert.deepEqual(cp, { 楼: 4, swipe: 1 });
  assert.equal(M.nextCheckpoint(cp, { floor: 4, top: 4, swipe: 1, state: 'ok' }), cp, '没变：同一对象（不写）');
  assert.equal(M.nextCheckpoint(cp, { floor: 4, top: 5, swipe: 0, state: 'stale' }), cp, '没确认：不动');
  assert.equal(M.nextCheckpoint(cp, { floor: 5, top: 5, swipe: 0, state: 'pending' }), cp);
  assert.deepEqual(M.nextCheckpoint(cp, { floor: 6, top: 6, swipe: 0, state: 'ok' }), { 楼: 6, swipe: 0 });
  const rf = floors => i => floors[i] || null;
  const base = [{ role: 'assistant', swipe: 0, hasStat: true }, { role: 'user', swipe: 0, hasStat: true }, { role: 'assistant', swipe: 1, hasStat: true }];
  assert.deepEqual(M.resume({ 楼: 2, swipe: 1 }, rf(base), 2), { reason: 'match', floor: 2 });
  assert.deepEqual(M.resume({ 楼: 2, swipe: 1 }, rf([...base, { role: 'user', swipe: 0, hasStat: true }, { role: 'assistant', swipe: 0, hasStat: false }]), 4), { reason: 'ahead', floor: 2 }, '被杀在生成 / 解析中途');
  assert.deepEqual(M.resume({ 楼: 2, swipe: 0 }, rf(base), 2), { reason: 'swiped', floor: 2 });
  assert.deepEqual(M.resume({ 楼: 7, swipe: 0 }, rf(base), 2), { reason: 'missing', floor: 7 });
  assert.deepEqual(M.resume(null, rf(base), 2), { reason: 'none', floor: -1 });
  assert.match(HOST, /\.\.\.\(cp \? \{ 检查点: cp \} : \{\}\)/, '检查点写在 eden_map 里（随 saveRoot 幂等写）');
  assert.match(HOST, /checkpointResume\(v\.检查点\)/);
});
