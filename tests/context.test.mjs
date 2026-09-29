// P2 解耦第二步：map/tavern/context.mjs（ContextPipeline）的 node 单测——无浏览器、无酒馆，直接喂数据。
// 覆盖：readMsgs（规范化 / 缓存 / 指纹 / EJS 与 CoT 剥离 / 「正文优化」丢标签补回 / 缓存修剪）、
// round（轮次签名去重、事件收集、人物栏与在场表楼层、新事态数）、customTags（应用 / 撤销-重放 / prev 记录 / 收紧）、
// computeTrips（每楼地点序列、变量优先 JSONPatch 兜底、按 (楼层, 原文, 映射) 缓存、签名去重）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { ContextPipeline, hashText } from '../map/tavern/context.mjs';
import * as EVM from '../map/tavern/events.mjs';
import * as CHM from '../map/tavern/characters.mjs';
import * as TRm from '../map/tavern/trips.mjs';
import { normCustom, rosters as mvuRosters } from '../map/tavern/mvu.mjs';

const F = (id, message, extra) => ({ message_id: id, message, extra });

test('readMsgs：指纹与缓存；EJS 模板源码、思考链、变量更新块不进解析文本', () => {
  const P = new ContextPipeline();
  const msgs = P.readMsgs([
    F(1, '正文<% ⌖火灾｜示例｜2｜模板里的不算 %>'),
    F(2, '<think>草稿 ⌖人物 甲 @ 中层·霓虹街</think>推门。<span style="display:none">⌖人物 乙 @ 下层·7号井</span><UpdateVariable>{"世界":{}}</UpdateVariable>'),
  ], 2);
  assert.equal(msgs.length, 2);
  assert.ok(!msgs[1].text.includes('甲'), 'CoT 里的人物标签不进 text（G1）');
  assert.ok(msgs[1].text.includes('乙'), '正文里的标签保留');
  assert.ok(!msgs[1].text.includes('UpdateVariable'), '变量更新块剥掉');
  assert.ok(msgs[1].raw.includes('UpdateVariable'), 'raw 留完整原文（行程读 JSONPatch 用）');
  assert.ok(!msgs[0].raw.includes('⌖'), 'EJS 模板源码剥掉');
  assert.ok(/^[0-9a-z]+$/.test(msgs[0].h.split('.')[0]), '指纹是 36 进制');
  // 缓存：原文没变复用同一对象；变了重建
  const again = P.readMsgs([F(2, msgs[1].raw ? P.msgCache.get(2).msg : '')], 2);
  assert.equal(again[0], msgs[1], '原文没变：缓存命中（同一对象）');
  const rebuilt = P.readMsgs([F(2, '全新的原文')], 2);
  assert.notEqual(rebuilt[0], msgs[1]); assert.equal(rebuilt[0].text, '全新的原文');
  // 「正文优化」改写：extra._acu_original_content 里丢掉的 ⌖ 标签补回
  const fixed = P.readMsgs([F(3, '改写后的正文', { _acu_original_content: '原文\n⌖人物 丙 @ 上层·银冠堡' })], 3);
  assert.ok(fixed[0].text.includes('丙'), '丢掉的标签从原文补回');
  // 空输入 / lastId 无效
  assert.deepEqual(P.readMsgs(null, -1), []);
  // 缓存修剪：超过窗口 ×2 时清掉窗口外的（第二次读取只带窗口内的楼层，模拟宿主的范围请求）
  const big = new ContextPipeline({ scan: 2 });
  big.readMsgs([F(1, 'a'), F(2, 'b'), F(3, 'c'), F(4, 'd'), F(5, 'e')], 5);
  big.readMsgs([F(4, 'd'), F(5, 'e')], 5);
  assert.ok(!big.msgCache.has(1) && big.msgCache.has(5), '窗口外的缓存清掉');
});

test('round：签名没变跳过；变了 → 事件 / 人物 / 名册 / 新事态数', () => {
  const P = new ContextPipeline();
  const base = { floorNow: 2, msgs: P.readMsgs([F(0, '旧'), F(1, '⌖火灾｜中层·霓虹街｜2｜仓库起火'), F(2, '<span style="display:none">⌖人物 雷恩 @ 下层·7号井</span>')], 2),
    stSig: '{}', dbSig: '', varSig: 'v1', custVer: 0, customChat: 'c', chatId: 'c', seen: -1, wbState: '',
    hasReg: false, hasCHM: true, hasMV: true, hasTRm: true, hasHereMod: false, hereNow: '中层·霓虹街', collect: EVM.collect,
    charsDeps: { mvuChars: [], known: ['雷恩'], dbCharacters: [], collectChars: CHM.collectChars,
      rosters: mvuRosters({ 世界: { 当前地点: '中层·霓虹街' }, 主角: {} }), reputation: null, presentKey: '' } };
  const r1 = P.round(base);
  assert.equal(r1.changed, true);
  assert.equal(r1.events.length, 1); assert.equal(r1.fresh, 1, '没读过 → 有未读');
  assert.ok(r1.chars.some(c => c.name === '雷恩' && c.place === '下层·7号井'));
  assert.equal(r1.roster.members.items.length, 16, '名册带设定兜底');
  assert.equal(P.round(base).changed, false, '输入全没变 → 跳过');
  const r1b = P.round({ ...base, seen: r1.events[0].last });
  assert.equal(r1b.changed, true, '读过了（seen 前进）→ 轮次重算');
  assert.equal(r1b.fresh, 0, '读过 → 未读清零');
  // 人物栏：MVU 在场表 + 数据库人物表合并、MVU 优先；在场表楼层扫描
  const r2 = P.round({ ...base, charsDeps: { ...base.charsDeps,
    mvuChars: [{ name: '安娜', place: '书房', present: true }], dbCharacters: [{ name: '安娜', place: '别处' }, { name: '丙', place: '大门' }],
    presentKey: '在场人物' } });
  const m = Object.fromEntries(r2.chars.map(c => [c.name, c]));
  assert.equal(m.安娜.place, '书房', 'MVU 有的人以 MVU 为准（数据库同名不覆盖）');
  assert.equal(m.丙.place, '大门', '数据库人物表补进人物栏');
});

test('customTags：应用新楼标签、记录 prev；原文变了倒序撤销重放', () => {
  const P = new ContextPipeline();
  let custom = normCustom(null);
  const kindOf = () => 'room';
  const msgs = P.readMsgs([F(4, '推进。⌖改名 旧仓库 → 藏书阁'), F(5, '⌖用途 藏书阁：夜里看星图')], 5);
  const r1 = P.customTags(custom, msgs, 5, kindOf);
  assert.equal(r1.applied.length, 2); assert.ok(!('藏书阁' in r1.custom.items), '改名是显示名，key 仍是标准名');
  assert.equal(r1.custom.items.旧仓库.名, '藏书阁');
  assert.equal(r1.tag.floor, 5); assert.deepEqual(r1.tag.log.map(l => l.op), ['name', 'note']);
  assert.equal(r1.tag.log[0].prev, '', '第一次改：prev 是空');
  custom = r1.custom; P.tag = r1.tag;
  // 没有新楼、原文没变 → null（不写）
  assert.equal(P.customTags(custom, msgs, 5, kindOf), null);
  // 第 5 楼原文改了（指纹对不上）→ 撤销那一楼的标签，按新原文重放
  const msgs2 = P.readMsgs([F(4, '推进。⌖改名 书房 → 星图室'), F(5, '改写：⌖改名 书房 → 天文台')], 5);
  const r2 = P.customTags(custom, msgs2, 5, kindOf);
  assert.ok(r2.undone >= 1, '改过的楼先撤销');
  assert.equal(r2.custom.items.书房.名, '天文台', '按新原文重放');
  // 删楼回退：tag.floor 跟着 floorNow 收缩
  const P3 = new ContextPipeline(); P3.tag = { floor: 9, log: [], seen: {} };
  P3.customTags(custom, [], 6, kindOf);
  assert.equal(P3.tag.floor, 6);
});

test('computeTrips：变量地点优先、JSONPatch 兜底、缓存与签名去重', () => {
  const P = new ContextPipeline();
  // 楼层原文：第 0 楼有 JSONPatch（变量读不到时兜底），第 1、2 楼靠 perFloorStat 给地点
  const msgs = P.readMsgs([
    F(0, '出发<UpdateVariable>[{"op":"replace","path":"/世界/当前地点","value":"伊甸庄园·书房"}]</UpdateVariable>'),
    F(1, '走了一段'), F(2, '到达'),
  ], 2);
  const perFloorStat = f => (f >= 1 ? { 世界: { 当前地点: f === 1 ? '中层·霓虹街' : '伊甸庄园' } } : null);   // 桥的 perFloorStat 返回的就是解包后的 stat_data
  const d = { TRm, CHM, perFloorStat, mvuGet: (s, p) => s?.世界?.当前地点, varMap: { location: '世界.当前地点', time: '世界.当前时刻' },
    keywords: TRm.DEFAULT_KEYWORDS, fantasy: false, parseTransit: () => null };
  const r1 = P.computeTrips(msgs, d);
  assert.equal(r1.changed, true);
  const player = r1.trips.filter(t => !t.who);
  assert.ok(player.some(t => t.to === '伊甸庄园'), '最新目的地来自那一楼的变量');
  assert.ok(player.some(t => t.from && t.to && t.from !== t.to), '有位移段');
  assert.equal(P.computeTrips(msgs, d).changed, false, '输入没变 → 签名去重');
  // 每楼的行程解析按 (楼层, 原文, 映射) 缓存：那一楼的变量由那一楼的原文决定——同一楼原文没变时
  // perFloorStat 的返回变了也走缓存（与抽出前 eden-map.js 的行为一致），只有原文 / 映射变了才重算
  const r2 = P.computeTrips(msgs, { ...d, perFloorStat: f => (f >= 1 ? { 世界: { 当前地点: '下层·7号井' } } : null) });
  assert.equal(r2.changed, false, '同一楼原文没变 → 行程缓存命中，不重算');
  const rebuilt = P.computeTrips(P.readMsgs([F(0, '出发'), F(1, '走了一段'), F(2, '到达')], 2), d);
  assert.equal(rebuilt.changed, true, '原文变了 → 重算');
  void hashText;
});
