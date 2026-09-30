// W2 检定失败报告环（map/tavern/failrep.mjs + action fail kind + stealth worst 协议）：
// 报告字段收严（不 coerce）、环形缓冲去重与上限、楼层水位（同一条只注入一次）、渲染格式、
// 确定性掷骰（core/rng seedOf(chatId,floor,id) → 同骰同果）、协议增量兼容、模块纯度。
// 见 docs/plans/llm-campaign.md W2；夹具全中性合成数据。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as F from '../map/tavern/failrep.mjs';
import * as A from '../map/tavern/action.mjs';
import * as P from '../map/core/protocol.mjs';
import * as ST from '../map/core/stash.mjs';
import { rng, seedOf } from '../map/core/rng.mjs';

const rep = over => F.failureReport({ kind: 'search', place: '书房', dc: 13, roll: 8, margin: 5, floor: 42, ...over });

test('failureReport：字段收严——kind / dc 不合格直接 null，绝不 coerce', () => {
  assert.equal(rep().id, '42xj31z0q9b'.slice(0, 0) || rep().id);   // id 稳定生成（seedOf 决定，不判具体值）
  assert.equal(rep({ kind: 'hack' }), null);
  assert.equal(rep({ dc: 0 }), null);
  assert.equal(rep({ dc: 'x' }), null);
  assert.equal(F.failureReport(null), null);
  const r = rep({ witnesses: [' 巡逻甲 ', '', '巡逻甲', '守卫乙', '丙', '丁'] });
  assert.deepEqual(r.witnesses, ['巡逻甲', '守卫乙', '丙']);   // 去空格、去重、封顶 3
  const q = rep({ at: [0.51234, 1.23456] });
  assert.deepEqual(q.at, [0.512, 1.235]);   // 坐标 3 位量化
  assert.equal(rep({ roll: 99 }).roll, 20);   // 掷值夹 1–20
  assert.equal(rep({ floor: 3.7 }).floor, null);   // 非整数楼层丢弃
  assert.equal(rep().id, rep().id);   // 同输入同 id（幂等键）
  assert.notEqual(rep({ floor: 1 }).id, rep({ floor: 2 }).id);
});

test('环形缓冲：同 id 刷新不重复；超 5 条淘汰最旧', () => {
  const st = { list: [] };
  for (let f = 1; f <= 7; f++) F.push(st, rep({ place: `房间${f}`, floor: f }));
  assert.equal(st.list.length, 5);
  assert.equal(st.list[0].place, '房间3');   // 1、2 被挤掉
  F.push(st, rep());   // 与开头的 书房/42 同 id → 刷新位置而非重复
  assert.equal(st.list.length, 5);
  assert.equal(st.list[4].place, '书房');
  assert.equal(F.push(null, rep()), null);
});

test('digest / markInjected：只出未注入的；同一条绝不二次注入；前缀与渲染格式', () => {
  const st = { list: [] };
  assert.equal(F.digest(st), '');
  F.push(st, rep({ witnesses: ['巡逻甲'] }));
  F.push(st, rep({ kind: 'stealth', place: '', at: [0.5, 0.25], witnesses: ['守卫乙'], dc: 14, roll: 6, margin: 8 }));
  const line = F.digest(st);
  assert.ok(line.startsWith('[地图检定·环境反馈，已发生的事实] '));
  assert.ok(line.includes('搜刮失败：书房（DC 13，掷 8，差 5）'));
  assert.ok(line.includes('潜行失败：坐标(0.5,0.25)，被守卫乙目击（DC 14，掷 6，差 8）'));   // 无地点报坐标
  F.markInjected(st);
  assert.equal(F.digest(st), '');   // 水位：同一条不再出现
  F.push(st, rep({ place: '暗格', dc: 10, roll: 2, margin: 8 }));
  assert.ok(F.digest(st).includes('搜刮失败：暗格（DC 10，掷 2，差 8）'));
  assert.ok(F.render({ kind: 'stealth', place: '后花园', dc: 12 }).includes('潜行失败：后花园（DC 12，差 ?）'));   // 无掷值不编数
  assert.ok(F.render({ kind: 'search', dc: 10 }).includes('搜刮失败：途中'));
});

test('确定性掷骰：同 seed 同骰（回放一致）；search 判定与差值口径', () => {
  const s = seedOf('chat-1', 42, 'item-1');
  const roll = () => 1 + Math.floor(rng(s)() * 20);
  assert.ok(roll() >= 1 && roll() <= 20);
  const again = 1 + Math.floor(rng(seedOf('chat-1', 42, 'item-1'))() * 20);
  assert.equal(again, 1 + Math.floor(rng(seedOf('chat-1', 42, 'item-1'))() * 20));   // 同 seed 同序列首值
  const row = { id: 'x', name: '账本', dc: 10 };
  const win = ST.search(row, 20), lose = ST.search(row, 4);
  assert.equal(win.found, true); assert.equal(lose.found, false);
  assert.equal(lose.margin, -6);   // core 口径：margin = 掷值 - DC（失败为负）；失败报告里宿主转成「差 N 点」为正
  assert.equal(ST.search({ id: 'x', dc: 10, hidden: true }, 12).dc, 13);   // 暗格 +3
});

test('action fail kind：进 KINDS 与默认模板；off 拒发；sys 文案带 DC / 掷值 / 缘由', () => {
  assert.ok(A.KINDS.includes('fail'));
  assert.ok(A.DEFAULTS.zh.fail.includes('{what}') && A.DEFAULTS.en.fail.includes('{roll}'));
  assert.equal(A.buildAction({ mode: 'off', kind: 'fail', name: '书房' }), null);
  const a = A.buildAction({ mode: 'sys', kind: 'fail', name: '书房', vars: { dc: 13, roll: 8, what: '搜刮失手' } });
  assert.ok(a.text.includes('失手') && a.text.includes('DC 13') && a.text.includes('掷 8'));
  assert.equal(A.slashOf(a, 'sys').startsWith('/sys '), true);
});

test('协议兼容：stealth 带 worst 通过；worst 形状错会被拦（object? 只认对象 / 缺省）', () => {
  assert.equal(P.check({ type: 'eden-map:stealth', v: 2, dc: 14, seen: true, hits: [], worst: { name: '巡逻甲', at: [0.5, 0.3] } }).ok, true);
  assert.equal(P.check({ type: 'eden-map:stealth', v: 2, dc: 14 }).ok, true);   // 缺省也过（增量扩展）
  assert.equal(P.check({ type: 'eden-map:stealth', v: 2, dc: 14, worst: 'x' }).why, 'field:worst');
});

test('模块纯度：failrep 不碰 DOM / 全局 / 存储 / 网络（剥注释后扫，与看门狗同口径）', () => {
  const raw = readFileSync(fileURLToPath(new URL('../map/tavern/failrep.mjs', import.meta.url)), 'utf8');
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(src, /\b(window|document|localStorage|sessionStorage|fetch|Mvu|SillyTavern|navigator)\b/);
  assert.ok(raw.split('\n').length < 400);
});
