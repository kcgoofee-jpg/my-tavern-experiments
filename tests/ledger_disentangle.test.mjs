// W11 四域结算账本（map/core/ledger.mjs）：受限 DSL 解卷（OP_LOOT / OP_ROUTINE / OP_EVENT 微语法）、
// 四域独立校验（throw-not-coerce、坏指令只丢自己不连坐）、LayerRegistry 槽位隔离分发、景深环境域只吃本地
// 确定性事实、漏项审计只补单项缺口 patch、语义不明确走待结算、水位幂等、模块纯度。
// 见 docs/plans/llm-campaign.md §W11；夹具全中性合成数据。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as L from '../map/core/ledger.mjs';
import * as LY from '../map/core/layer-registry.mjs';

const src = () => readFileSync(fileURLToPath(new URL('../map/core/ledger.mjs', import.meta.url)), 'utf8');

test('四域与槽位：域 → LayerRegistry 槽位一一对应，槽位互不相同且都在 SLOTS 里', () => {
  assert.deepEqual(L.DOMAINS, ['assets', 'npc', 'events', 'depth']);
  const slots = L.DOMAINS.map(d => L.SLOT_OF[d]);
  assert.equal(new Set(slots).size, slots.length);            // 槽位隔离：四域不挤同一个槽
  for (const s of slots) { assert.ok(LY.SLOTS.includes(s)); LY.slotZ(s); }   // 写错的槽位名在加载期就会炸
  assert.equal(L.slotOf('assets'), 'markers');
  assert.equal(L.slotOf('nope'), null);
  assert.deepEqual(L.LEDGER_OPS, ['OP_LOOT', 'OP_ROUTINE', 'OP_EVENT']);
  assert.equal(L.domainOf('OP_LOOT'), 'assets');
  assert.equal(L.domainOf('OP_DEPTH'), null);   // 景深环境没有指令形
});

test('解卷微语法：三个受限指令各自落域，保序、量化坐标、同输入同输出', () => {
  const text = 'OP_LOOT(item-1, 0.51234, 0.3) OP_ROUTINE(甲, 书房) OP_EVENT(alert, 2, 0.1, 0.2)';
  const p = L.unmarshal(text);
  assert.deepEqual(p.domains.assets, [{ domain: 'assets', op: 'OP_LOOT', id: 'item-1', at: [0.512, 0.3] }]);
  assert.deepEqual(p.domains.npc, [{ domain: 'npc', op: 'OP_ROUTINE', npc: '甲', room: '书房' }]);
  assert.deepEqual(p.domains.events, [{ domain: 'events', op: 'OP_EVENT', type: 'alert', level: 2, at: [0.1, 0.2] }]);
  assert.equal(p.dropped.total, 0);
  assert.deepEqual(L.unmarshal(text), p);                     // 确定性
  assert.equal(L.unmarshal(text).hash, p.hash);
  assert.equal(L.unmarshal('').hash, '');
  assert.deepEqual(L.unmarshal('没什么可解卷的一段正文').domains.assets, []);
  assert.deepEqual(L.unmarshal('OP_LOOT("item,2", 0.5, 0.5)').domains.assets[0].id, 'item,2');   // 引号内逗号不切分
});

test('独立校验（throw-not-coerce）：坏指令只丢自己不连坐，按域计数', () => {
  const p = L.unmarshal('OP_LOOT(ok-1, 0.2, 0.2) OP_LOOT(bad, 5, 0.2) OP_ROUTINE(甲) OP_EVENT(notatype, 1, 0, 0)');
  assert.deepEqual(p.domains.assets.map(x => x.id), ['ok-1']);   // 坐标出界的坏指令没影响好指令
  assert.deepEqual(p.domains.npc, []);                          // 少参数 → 丢
  assert.deepEqual(p.domains.events, []);                        // type 不在白名单 → 丢
  assert.deepEqual(p.dropped, { assets: 1, npc: 1, events: 1, depth: 0, total: 3 });
  assert.equal(L.unmarshal('OP_LOOT(x, 0.1, 0.1, 3)').domains.assets[0].id, 'x');   // 多余参数剥掉，不算错
  assert.equal(L.unmarshal('OP_EVENT(alert, 2.5, 0, 0)').dropped.events, 1);        // level 必须整数
  assert.equal(L.unmarshal('OP_ROUTINE(甲, 书房').dropped.total, 1);               // 括号没闭合：整段丢弃
});

test('每拍上限：超过 MAX_OPS 的多余指令丢弃并计数（一拍不许倒一坨进来）', () => {
  const p = L.unmarshal('OP_LOOT(a, 0.1, 0.1) OP_LOOT(b, 0.2, 0.2) OP_LOOT(c, 0.3, 0.3) OP_LOOT(d, 0.4, 0.4)');
  assert.equal(L.MAX_OPS, 3);
  assert.deepEqual(p.domains.assets.map(x => x.id), ['a', 'b', 'c']);
  assert.equal(p.dropped.total, 1);
  assert.equal(p.dropped.assets, 1);
});

test('景深环境域：只由本地确定性事实喂入，DSL 写不进来；全缺则不产出', () => {
  assert.equal(L.unmarshal('OP_DEPTH(0.4)').domains.depth.length, 0);   // 白名单外：丢弃
  assert.equal(L.unmarshal('OP_DEPTH(0.4)').dropped.total, 1);
  const p = L.unmarshal('OP_EVENT(alert, 1, 0.5, 0.5)', { env: { fog: 0.6213, haze: 0, tod: 'dusk' } });
  assert.deepEqual(p.domains.depth, [{ domain: 'depth', op: 'OP_ENV', fog: 0.621, haze: 0, tod: 'dusk' }]);
  assert.equal(L.envEntry(null), null);
  assert.equal(L.envEntry({}), null);
  assert.equal(L.envEntry({ fog: 2, haze: -1, tod: '' }), null);   // 越界 / 负值一律不产出，不夹取
  assert.equal(L.envEntry({ fog: 'x' }), null);
});

test('dispatch：分域投递到各自槽位（查看器 / 宿主各取自己那一路）', () => {
  const rows = L.dispatch(L.unmarshal('OP_LOOT(a, 0.1, 0.1) OP_EVENT(alert, 1, 0.2, 0.2)', { env: { fog: 0.5 } }));
  assert.deepEqual(rows.map(r => [r.domain, r.slot]), [['assets', 'markers'], ['npc', 'labels'], ['events', 'events'], ['depth', 'depth-haze']]);
  assert.deepEqual(rows.map(r => r.entries.length), [1, 0, 1, 1]);
  assert.deepEqual(L.dispatch(null).map(r => r.entries.length), [0, 0, 0, 0]);
});

test('漏项审计：确实缺了才补，且只补这一件（不重写整表）；已落盘不重复写', () => {
  const facts = [{ kind: 'loot', id: 'i1', name: '账本', place: '书房', hidden: true, qty: 3, floor: 42 }];
  assert.equal(L.factKey(facts[0]), 'loot|i1|书房||42');
  const miss = L.audit(facts, { assets: {} });
  assert.equal(miss.patches.length, 1);
  assert.deepEqual(L.stripWhy(miss.patches[0]), { domain: 'assets', op: 'OP_LOOT', id: 'i1', name: '账本', key: 'loot|i1|书房||42', place: '书房', hidden: true, qty: 3 });
  assert.ok(miss.patches[0].why);   // 凭据：为什么允许这一次升格（写盘前剥掉）
  assert.equal(miss.pending.length, 0);
  const hit = L.audit(facts, { assets: { i1: '账本' } });
  assert.deepEqual([hit.patches.length, hit.ok], [0, 1]);
  const none = L.audit(facts, {});                       // 那一域没有落盘视图：不下断言
  assert.deepEqual([none.patches.length, none.pending[0].why, none.ok], [0, 'no-landed', 0]);
  const bad = L.audit([{ kind: 'loot', id: 'i2', floor: 1 }], { assets: {} });
  assert.deepEqual([bad.patches.length, bad.pending[0].why], [0, 'unresolved']);   // 认不出的东西：待结算，不猜
  assert.deepEqual(L.audit(null, {}).patches, []);
});

test('漏项审计：NPC 坐标域只补落盘里**缺**的那一项；已有值（哪怕不一样）不覆盖，不抢写；不在册的人待结算', () => {
  const facts = [{ kind: 'routine', npc: '甲', room: '书房', floor: 7 }, { kind: 'routine', npc: '丙', room: '大厅' }, { kind: 'routine', npc: '丁', room: '偏厅' }];
  const r = L.audit(facts, { npc: { 甲: '花园' } });
  assert.deepEqual(r.patches, []);                                   // 甲在册但值不同 → 不覆盖（等那头确认）
  assert.deepEqual(r.pending.map(x => x.why), ['stale-value', 'unknown-npc', 'unknown-npc']);
  assert.equal(L.audit([facts[0]], { npc: { 甲: '书房' } }).ok, 1);
});

test('漏项审计：事件域按 (类型, 级别, 坐标) 判重后追加；白名单外的类型待结算', () => {
  const f = { kind: 'event', type: 'alert', level: 2, at: [0.1, 0.2], floor: 5 };
  const p = L.audit([f], { events: {} }).patches[0];
  assert.deepEqual(L.stripWhy(p), { domain: 'events', op: 'OP_EVENT', type: 'alert', level: 2, at: [0.1, 0.2], key: 'event|alert||0.1,0.2|5' });
  assert.equal(L.audit([f], { events: { 'alert|2|0.1,0.2': true } }).ok, 1);
  assert.deepEqual(L.audit([{ ...f, type: 'boom' }], { events: {} }).pending[0].why, 'unresolved');
});

test('事实权威阶梯：只有 canon / committed / verified 能升格；claim / hypothesis 停在待结算（陈述不自证）', () => {
  assert.deepEqual(L.AUTHORITY, ['canon', 'committed', 'verified', 'claim', 'hypothesis']);
  assert.equal(L.promotable('canon'), true);
  assert.equal(L.promotable(undefined), true);        // 缺省 = 地图侧客观物理判定（verified）
  assert.equal(L.promotable('committed'), true);
  assert.equal(L.promotable('claim'), false);         // 玩家口述 / NPC 自称
  assert.equal(L.promotable('hypothesis'), false);    // 假设句 / 推演草案
  assert.equal(L.promotable('whatever'), false);      // 认不出的来源：fail-closed
  const f = over => ({ kind: 'loot', id: 'i1', name: '账本', place: '书房', floor: 42, ...over });
  assert.equal(L.audit([f({})], { assets: {} }).patches.length, 1);
  assert.equal(L.audit([f({ authority: 'claim' })], { assets: {} }).patches.length, 0);
  assert.deepEqual(L.audit([f({ authority: 'claim' })], { assets: {} }).pending[0].why, 'not-promoted');
  assert.equal(L.audit([f({ src: 'hypothesis' })], { assets: {} }).patches.length, 0);
  assert.equal(L.audit([f({ src: 'committed' })], { assets: {} }).patches.length, 1);
});

test('待结算跨轮携带：未决的域带去下一轮（≤cap）、去重、跨聊天清空', () => {
  const st = { domains: [], floor: null };
  const aud = L.audit([{ kind: 'loot', id: 'i1', name: '账本', authority: 'claim' }, { kind: 'routine', npc: '甲', room: '书房' }, { kind: 'event', type: 'alert', level: 1, at: [0, 0] }], { assets: {}, npc: {} });
  assert.deepEqual(aud.pending.map(x => x.why), ['not-promoted', 'unknown-npc', 'no-landed']);
  assert.deepEqual(L.carry(st, aud.pending), ['assets', 'npc', 'events']);
  assert.equal(L.carryLine(st), '[地图结算·待确认领域] 资产/背包、NPC坐标、世界事件');
  assert.deepEqual(L.carry(st, aud.pending, { cap: 2 }), ['assets', 'npc']);
  assert.deepEqual(L.carry(st, []), []);
  assert.equal(L.carryLine(st), '');
  assert.deepEqual(L.carry(null, [{ kind: 'loot' }]), ['assets']);   // 没给 state 也能用
});

test('水位 claim：同一件只放行一次；同批重复只留第一条；水位有界', () => {
  const st = { claimed: [], floor: null };
  const a = { domain: 'assets', key: 'k1' }, b = { domain: 'assets', key: 'k2' };
  const r1 = L.claim(st, [a, b], { floor: 9 });
  assert.deepEqual([r1.fresh.length, r1.repeated, st.floor], [2, 0, 9]);
  const r2 = L.claim(st, [a, b, b], {});
  assert.deepEqual([r2.fresh.length, r2.repeated], [0, 3]);
  assert.equal(L.claim(null, [a]).fresh.length, 1);          // 没给 state 也能用（内部重新起一份）
  for (let i = 0; i < 300; i++) L.claim(st, [{ key: 'x' + i }]);
  assert.ok(st.claimed.length <= 200);                       // 长会话内存有界
});

test('水位分支纪律：同楼同分支幂等；同一楼换分支（swipe / 重生成）作废本楼重算；回退剪掉未来', () => {
  const st = { claimed: [], floor: null, branch: null };
  const rows = [{ key: 'k1' }, { key: 'k2' }];
  const r1 = L.claim(st, rows, { floor: 5, branch: '5:0' });
  assert.deepEqual([r1.fresh.length, r1.repeated, r1.pruned], [2, 0, 0]);
  assert.equal(L.claim(st, rows, { floor: 5, branch: '5:0' }).fresh.length, 0);   // 同楼同分支：幂等（同一件不补第二次）
  const re = L.claim(st, rows, { floor: 5, branch: '5:1' });                     // 换了分支：本楼记录作废，重新结算
  assert.deepEqual([re.pruned, re.fresh.length], [2, 2]);
  assert.equal(st.branch, '5:1');
  const back = L.claim(st, rows, { floor: 4, branch: '4:0' });                   // 回退：未来（楼层 > 4）作废
  assert.deepEqual([back.pruned, back.fresh.length], [2, 2]);
  assert.ok(st.claimed.every(c => typeof c === 'object' && c.floor === 4));
  assert.ok(st.claimed.some(c => c.branch === '4:0'));
  // 老格式（裸字符串键）：无从判断分支 → 保留、按旧语义去重（不误删历史水位）
  const legacy = { claimed: ['old'], floor: 9, branch: '9:0' };
  assert.deepEqual([L.claim(legacy, [{ key: 'old' }], { floor: 9, branch: '9:1' }).repeated, legacy.claimed.length], [1, 1]);
});

test('凭据只在审计里：stripWhy 剥掉 why 才是写盘形状（原对象不动）', () => {
  const p = L.audit([{ kind: 'loot', id: 'i1', name: '账本', floor: 1 }], { assets: {} }).patches[0];
  assert.ok(p.why);
  assert.deepEqual(L.stripWhy(p), { domain: 'assets', op: 'OP_LOOT', id: 'i1', name: '账本', key: 'loot|i1|||1' });
  assert.ok(p.why, '原 patch 不被就地改掉');
  assert.deepEqual(L.stripWhy([p])[0].why, undefined);
  assert.deepEqual(L.stripWhy(null), null);
});

test('describe：四域槽位与条数、丢弃数、水位摘要', () => {
  const d = L.describe(L.unmarshal('OP_LOOT(a, 0.1, 0.1) OP_BOGUS()', { env: { fog: 0.5 } }), { claimed: ['k'], floor: 3 });
  assert.deepEqual(d.domains, [
    { domain: 'assets', slot: 'markers', n: 1 }, { domain: 'npc', slot: 'labels', n: 0 },
    { domain: 'events', slot: 'events', n: 0 }, { domain: 'depth', slot: 'depth-haze', n: 1 }]);
  assert.deepEqual([d.dropped, d.floor, d.claimed], [1, 3, 1]);
});

test('模块纯度：core 叶层——不碰宿主全局 / DOM / 存储 / 网络；单文件 ≤400 行', () => {
  const raw = src();
  const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(code, /\b(window|document|localStorage|sessionStorage|fetch|Mvu|SillyTavern|navigator)\b/);
  assert.doesNotMatch(code, /from\s+['"]\.\.\//);            // core 不许反向 import 父级
  assert.ok(raw.split('\n').length <= 400);
});
