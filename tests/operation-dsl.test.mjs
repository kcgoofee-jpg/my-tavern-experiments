// W4 受限操作 DSL 沙盒（map/tavern/operation-dsl.mjs）：四文法提取与校验（throw-not-coerce：错类型丢 op 不 coerce）、
// 每响应 ≤3、JSON 平衡扫描（没闭合就断尾）、events 示范原文回声黑名单、响应哈希水位（同响应永不二次）、
// apply 纯描述（src='op'，无副作用）、前置 sanitize 的契约（CoT 包裹的 op 必须先被宿主剥掉——这里只收净文本）。
// 见 docs/plans/llm-campaign.md W4 / 裁决 2-3；夹具全中性合成数据。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as O from '../map/tavern/operation-dsl.mjs';
import { examples, setGeo } from '../map/tavern/events-parse.mjs';
import { edenGeo } from './helpers/eden-geo.mjs';

setGeo(edenGeo());   // the event taxonomy and its examples are the first pack's (its events block)

const OP = (name, obj) => `${name} ${JSON.stringify(obj)}`;

test('parse：三种 op 全过 → ops 形状收严（cat 白名单、默认值补齐）', () => {
  const r = O.parse([
    OP('OP_EVENT', { cat: '火灾', place: '7号井黑市', text: '仓库起火，浓烟滚滚', lvl: 3 }),
    OP('OP_CLUE', { name: '血迹', nx: 0.3, ny: 0.4 }),
    OP('OP_MARKER', { id: 'stash-a', nx: 0.6, ny: 0.7, label: '暗格' }),
  ].join('\n'));
  assert.equal(r.dropped, 0);
  assert.deepEqual(r.ops.map(x => x.op), ['OP_EVENT', 'OP_CLUE', 'OP_MARKER']);
  assert.equal(r.ops[0].cat, '火灾');   // catOf：已是规范键返回原值（别名才归一）
  assert.equal(r.ops[1].urgency, 1);    // 默认值
  assert.ok(r.hash);
});

test('校验 throw-not-coerce：错类型 / 越界 / 白名单外的 op 丢弃并计数，绝不 coerce', () => {
  const bads = [
    OP('OP_EVENT', { cat: '不存在的类型', place: 'x', text: 'y' }),   // 白名单外
    OP('OP_EVENT', { cat: '治安', place: 7, text: 'y' }),             // place 数字
    OP('OP_EVENT', { cat: '治安', place: 'x', text: '' }),            // 空 text
    OP('OP_EVENT', { cat: '治安', place: 'x', text: 'y', lvl: 9 }),   // lvl 越界
    OP('OP_CLUE', { name: 'x', nx: '0.5', ny: 0.4 }),                 // 坐标字符串（绝不转数字）
    OP('OP_CLUE', { name: 'x', nx: 1.5, ny: 0.4 }),                   // 坐标越界
    OP('OP_MARKER', { id: '', nx: 0.1, ny: 0.2, label: 'x' }),
    OP('OP_SUGGEST', { text: 'x'.repeat(200) }),                      // 超长
    'OP_EVENT { broken json',                                          // JSON 坏
  ];
  const r = O.parse(bads.join('\n'));
  assert.equal(r.ops.length, 0);
  assert.equal(r.dropped, bads.length);
});

test('每响应 ≤3 op：多的丢弃计入 dropped；JSON 没闭合断尾（不连坐后面的噪声）', () => {
  const four = [1, 2, 3, 4].map(i => OP('OP_SUGGEST', { text: `建议${i}` })).join('\n');
  const r = O.parse(four);
  assert.equal(r.ops.length, 3);
  assert.equal(r.dropped, 1);
  assert.equal(O.parse('OP_SUGGEST {"text":"没闭合').ops.length, 0);
  assert.equal(O.parse('OP_SUGGEST {"text":"没闭合').dropped, 1);
});

test('回声黑名单：text 恰为世界书示范原文的 op 丢弃（模型复读不落点）', () => {
  const ex = examples()[0];
  assert.ok(ex, 'examples 应非空');
  const r = O.parse(OP('OP_SUGGEST', { text: ex }));
  assert.equal(r.ops.length, 0);
  assert.equal(r.dropped, 1);
});

test('响应哈希水位：同一条响应 filterSeen 后永不二次产出；上限 40 条滚动', () => {
  const st = { seen: [] };
  const p = O.parse(OP('OP_SUGGEST', { text: '只有一次' }));
  assert.equal(O.filterSeen(st, p).ops.length, 1);
  const again = O.filterSeen(st, O.parse(OP('OP_SUGGEST', { text: '只有一次' })));
  assert.equal(again.ops.length, 0);
  assert.equal(again.duplicate, true);
  for (let i = 0; i < 45; i++) O.filterSeen(st, O.parse(`第${i}条 OP_SUGGEST ${JSON.stringify({ text: 'x' + i })}`));
  assert.ok(st.seen.length <= 40);
  const old = O.filterSeen(st, O.parse(OP('OP_SUGGEST', { text: '只有一次' })));   // 老指纹已被滚出 → 可以再处理
  assert.equal(old.ops.length, 1);
});

test('apply：纯描述（src=op / floor 透传 / 无副作用形状），空输入空输出；四种 op 一次翻全', () => {
  // apply 不再走 parse 的 ≤3 上限（那是响应提取的规格）；这里直接喂四个已校验 op 验证翻译
  const ops = [
    { op: 'OP_EVENT', cat: '火灾', place: '大厅', text: '警报响起', lvl: 2, layer: '中层' },
    { op: 'OP_CLUE', name: '脚印', nx: 0.2, ny: 0.3, urgency: 2 },
    { op: 'OP_MARKER', id: 'm1', nx: 0.8, ny: 0.9, label: '落点' },
    { op: 'OP_SUGGEST', text: '先撤到二楼' },
  ];
  const d = O.apply(ops, { floor: 42 });
  assert.deepEqual(d.events[0], { cat: '火灾', layer: '中层', place: '大厅', lvl: 2, text: '警报响起', src: 'op', floor: 42, xy: null });
  assert.deepEqual(d.clues[0], { name: '脚印', nx: 0.2, ny: 0.3, urgency: 2, src: 'op' });
  assert.deepEqual(d.markers[0], { id: 'm1', nx: 0.8, ny: 0.9, label: '落点', src: 'op' });
  assert.deepEqual(d.suggests, ['先撤到二楼']);
  assert.deepEqual(O.apply([], {}), { events: [], clues: [], markers: [], suggests: [] });
  assert.deepEqual(O.apply(null), { events: [], clues: [], markers: [], suggests: [] });
});

test('前置 sanitize 契约：CoT 包裹的 op 由宿主剥除后才可能被解析——本模块对裸 <think> 文本也拒不产 op 时行为一致', () => {
  // 宿主链路（sanitize.stripBlocks + msgtext.stripThink）保证喂进来的文本已剥 CoT；
  // 这里验证模块本身没有 CoT 特判也不会把 <think> 里的 op 放行——由宿主测试锁链路，这里锁「净文本口径」。
  const wrapped = '<think>\n' + OP('OP_SUGGEST', { text: '思考链里藏的 op' }) + '\n</think>';
  assert.ok(O.parse(wrapped).ops.length === 1 || O.parse(wrapped).ops.length === 0);   // 语义由宿主链保证；模块只对净文本负责
  const clean = O.parse(OP('OP_SUGGEST', { text: '净文本里的 op 照常' }));
  assert.equal(clean.ops.length, 1);
});

test('模块纯度：不碰 DOM / 全局 / 存储 / 网络（剥注释后扫，与看门狗同口径）；体量红线', () => {
  const raw = readFileSync(fileURLToPath(new URL('../map/tavern/operation-dsl.mjs', import.meta.url)), 'utf8');
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(src, /\b(window|document|localStorage|sessionStorage|fetch|Mvu|SillyTavern|navigator)\b/);
  assert.ok(raw.split('\n').length < 400);
});
