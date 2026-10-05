// TURN-IDS（docs/turn-ids.md）单测：词表行 idsText 的排法与预算、注入写入口径（固定 id、先撤再注）、
// 校验三入口（地点 / 人物 / 事件）与诊断环（默认关 = 一律原样放行）、parseHereTag 的守卫接线、
// 项 4：正在生成的那一楼不进窗口（readMsgs 第三参），非选中 swipe 的文字与变量不进读取（适配层契约）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { idsText, idsPrompt, applyIds, createTurnIds, TURN_IDS_ID, RING_MAX, BUDGET } from '../map/tavern/turn-ids.mjs';
import * as I from '../map/tavern/interaction-modes.mjs';
import { ContextPipeline } from '../map/tavern/context.mjs';
import { createNativeAdapter } from '../map/tavern/host-native.mjs';

const span = s => `<span style="display:none">${s}</span>`;

// ---------------- 词表行 ----------------
test('idsText: current place first, deduped; the line teaches the exact writings and caps at the budget', () => {
  const t = idsText({ here: '天城·中层·霓虹街', places: ['天城·中层·霓虹街', '天城·中层·商业区'], names: ['雷恩', '绫濑遥'] });
  assert.ok(t.startsWith('[本轮标签词表] 地点：天城·中层·霓虹街、天城·中层·商业区；人物：雷恩、绫濑遥'), t);
  assert.ok(t.includes('只能照抄'), t); assert.ok(t.includes('不要自造'), t);
  assert.equal(idsText({ here: '', places: [], names: [] }), '');
  // 没地点只有人物也成行
  assert.match(idsText({ here: '', places: [], names: ['雷恩'] }), /^\[本轮标签词表\] 人物：雷恩/);
});
test('idsText: over budget trims characters first, then places, but never the current place; hopeless budgets give up', () => {
  const many = Array.from({ length: 40 }, (_, i) => '地点' + i + '区' + '·'.repeat(0) + '很长很长很长');
  const names = Array.from({ length: 20 }, (_, i) => '人物名' + i);
  const line = idsText({ here: '当前地点', places: many, names, budget: 80 });
  assert.ok(line && line.includes('当前地点'), line);
  const full = idsText({ here: '当前地点', places: many, names });
  assert.ok(I.tokens(full) <= BUDGET, 'default budget respected: ' + I.tokens(full));
  assert.ok(full.indexOf('当前地点') < full.indexOf(many[1]), 'current place leads the list');
  // 词表本身超过预算且砍无可砍（只剩提示句也超）：宁可不注入
  assert.equal(idsText({ here: '当前地点', places: [], names: [], budget: 5 }), '');
});

// ---------------- 注入通道 ----------------
test('idsPrompt / applyIds: fixed id at depth 0, withdraw-then-inject, empty content withdraws only', () => {
  assert.deepEqual(idsPrompt('行', 0), { id: TURN_IDS_ID, position: 'in_chat', depth: 0, role: 'system', content: '行', should_scan: false });
  assert.equal(idsPrompt('行', 99).depth, 20); assert.equal(idsPrompt('行', -3).depth, 0);
  const calls = [];
  const fn = k => args => calls.push([k, args]);
  assert.equal(applyIds(fn, '行', 0), true);
  assert.deepEqual(calls, [['uninjectPrompts', [TURN_IDS_ID]], ['injectPrompts', [idsPrompt('行', 0)]]]);
  calls.length = 0; assert.equal(applyIds(fn, '', 0), true);
  assert.deepEqual(calls, [['uninjectPrompts', [TURN_IDS_ID]]], '空内容 = 只撤，不注');
  assert.equal(applyIds(() => undefined, '行'), false, '宿主没有 injectPrompts：静默 false');
});

// ---------------- 校验三入口 + 诊断环 ----------------
const tree = new Set(['天城·中层·霓虹街', '伊甸庄园·书房']);
const TI = over => createTurnIds({ on: () => over, resolve: t => tree.has(t) ? { ok: 1 } : null, floorNow: () => 42 });
test('off = today: nothing is filtered, nothing is recorded (zero behaviour change)', () => {
  const m = TI(false);
  const evs = [{ node: null, text: '火灾' }, { node: { x: 1 }, text: '停电' }];
  assert.equal(m.filterEvents(evs), evs);
  const chs = [{ src: 'tag', name: '雷恩', place: '不存在的地方' }];
  assert.equal(m.filterChars(chs), chs);
  assert.equal(m.checkHere('不存在的地方'), true);
  assert.deepEqual(m.recent(), { on: false, items: [] });
});
test('on: unresolvable writings are held back per kind; the ring says why; a missing tree never blocks', () => {
  const m = TI(true);
  const evs = [{ node: { x: 1 }, text: '停电' }, { node: null, place: '荒野', text: '火灾' }];
  assert.deepEqual(m.filterEvents(evs).map(e => e.text), ['停电']);
  const chs = [
    { src: 'tag', name: '雷恩', place: '不存在的地方' },                 // 拦：地点认不出
    { src: 'tag', name: '绫濑遥', place: '天城·中层·霓虹街' },            // 过
    { src: 'tag', name: '甲', place: '不存在', ooc: true },               // 过：玩家的纠正不校验（D32 优先）
    { src: 'tag', name: '乙', place: '' },                                // 过：没写地点 = 不是地点问题
    { src: 'mvu', name: '丙', place: '不存在的地方' },                     // 过：校验只管模型写的标签
    { src: 'infer', name: '丁', place: null },                            // 过
  ];
  assert.deepEqual(m.filterChars(chs).map(c => c.name), ['绫濑遥', '甲', '乙', '丙', '丁']);
  assert.equal(m.checkHere('天城·中层·霓虹街'), true);
  assert.equal(m.checkHere('不存在的地方'), false);
  const { on, items } = m.recent();
  assert.equal(on, true); assert.equal(items.length, 3);
  assert.deepEqual(items.map(x => [x.kind, x.code]), [['place', 'place-unknown'], ['char', 'char-unresolved'], ['event', 'event-unplaced']], '新的在前');
  assert.ok(items.every(x => x.floor === 42 && typeof x.at === 'number' && !('_k' in x)), items[0]);
  // 节点树没装好（resolve 抛）：一律放行，校验器坏不拦好
  const broken = createTurnIds({ on: () => true, resolve: () => { throw new Error('no geo'); } });
  assert.equal(broken.checkHere('哪里都行'), true); assert.deepEqual(broken.recent().items, []);
});
test('the ring: same rejection replays update the row instead of duplicating (the 80-floor window re-reads every round); cap 16', () => {
  const m = TI(true);
  for (let i = 0; i < 5; i++) m.checkHere('  不存在的地方  ');
  assert.equal(m.recent().items.length, 1, '空白差异去重，只留一条');
  const t0 = m.recent().items[0].at;
  for (let i = 0; i < 40; i++) m.checkHere('不存在的地方' + i);
  const { items } = m.recent();
  assert.equal(items.length, RING_MAX);
  assert.equal(items[0].text, '不存在的地方39'); assert.ok(!items.some(x => x.text === '不存在的地方0'), '超水位的旧条目掉出去');
  assert.ok(items.some(x => x.text === '不存在的地方38' && x.at >= t0));
  m.clear(); assert.deepEqual(m.recent().items, [], '换聊天清环');
});

// ---------------- parseHereTag 的守卫（setHereGuard） ----------------
test('the here-guard: a rejected tag reads as if it was never written; examples and the off guard keep working', () => {
  try {
    I.configure({ examples: ['天城·中层·辉光大教堂'] });   // 示范表存的是裸写法（同包 llm["x-tag-examples"]）
    const raw = span('⌖地点 天城·中层·不存在区');
    assert.equal(I.parseHereTag(raw), '天城·中层·不存在区', '没装守卫 = 原样');
    I.setHereGuard(p => !p.includes('不存在'));
    assert.equal(I.parseHereTag(raw), null, '被拦下：等于没写（当前地点走 MVU / 预设兜底）');
    assert.equal(I.parseHereTag(span('⌖地点 天城·中层·霓虹街')), '天城·中层·霓虹街');
    assert.equal(I.parseHereTag(span('⌖地点 天城·中层·辉光大教堂')), null, '示范照抄仍然不上图（守卫与示范表并存）');
    const seen = []; I.setHereGuard(p => { seen.push(p); return true; });
    I.parseHereTag(span('⌖地点 天城·中层·商业区'));
    assert.deepEqual(seen, ['天城·中层·商业区'], '守卫收到清洗后的写法');
  } finally { I.setHereGuard(null); I.configure({}); }
});

// ---------------- 项 4：生成中的楼与非选中 swipe ----------------
const F = (id, message, extra) => ({ message_id: id, message, extra });
test('readMsgs(list, lastId, generating): the streaming assistant floor never enters the window; user and finished floors do', () => {
  const P = new ContextPipeline();
  const list = [F(3, '上一层。' + span('⌖地点 天城·中层·霓虹街')), F(4, '这一层正在被写 ⌖地点 天城·下层·半')];
  const done = P.readMsgs(list, 4);
  assert.deepEqual(done.map(m => m.floor), [3, 4], '默认（没在生成）：最新楼照常进窗口');
  const half = P.readMsgs(list, 4, true);
  assert.deepEqual(half.map(m => m.floor), [3], '生成中：顶上的助手楼整楼不进（半截标签永不解析）');
  assert.deepEqual(P.readMsgs(list, 4, false).map(m => m.floor), [3, 4], 'GENERATION_ENDED 后重算：写完的楼照常进来');
  const userTop = [F(3, '助手楼。'), F(4, '玩家刚打的字 ⌖地点 不该被丢')]; userTop[1].is_user = true;
  assert.deepEqual(P.readMsgs(userTop, 4, true).map(m => m.floor), [3, 4], '顶楼是玩家楼：不动');
  const sysTop = [F(3, '助手楼。'), Object.assign(F(4, '系统提示'), { is_system: true })];
  assert.deepEqual(P.readMsgs(sysTop, 4, true).map(m => m.floor), [3, 4], '顶楼是系统楼：不动');
  const older = [F(2, 'a'), F(3, 'b'), F(4, 'c')];
  assert.deepEqual(P.readMsgs(older, 9, true).map(m => m.floor), [2, 3, 4], '顶楼不是 lastId 那条（事件没对上）：不猜、不丢');
});
test('swipes: the adapter hands out the selected swipe only — mes text and variables[swipe_id] (contract pinned at the boundary)', () => {
  const chat = [{ name: 'A', is_user: false, mes: '选中的这条 ⌖地点 天城·中层·霓虹街', swipes: ['另一条 ⌖地点 天城·下层·旧', '选中的这条 ⌖地点 天城·中层·霓虹街'], swipe_id: 1, variables: [{ stat_data: { 世界: { 当前地点: '旧' } } }, { stat_data: { 世界: { 当前地点: '霓虹街' } } }] }];
  const A = createNativeAdapter({ chat });
  const f = A.chat.floorAt(0);
  assert.equal(f.swipe_id, 1); assert.equal(f.mes, f.swipes[f.swipe_id], 'mes 恒等于选中的 swipe（酒馆的模型；地图只读 mes）');
  // readFloor 契约（mvu-bridge.mjs:113 同式）：变量按 swipe_id 取，未选中的旧版本不进状态
  const vars = f.variables?.[f.swipe_id ?? 0];
  assert.equal(vars.stat_data.世界.当前地点, '霓虹街');
  assert.deepEqual(A.chat.messages({ first_message: 0, last_message: -1 }).map(m => m.message), [f.mes], '窗口读到的正文 = 选中 swipe');
});
