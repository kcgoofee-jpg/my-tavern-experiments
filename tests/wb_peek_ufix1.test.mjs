// U-FIX-1（TT sweep-1 D4-01）：地点卡「世界书档案」不许露出脚本 / 模板正文。
// 夹具是发布件本身（map/data/worldbook_addon.json）里的三条层方位条目（EJS），加一条普通地点条目对照。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { peekItems, peekSummary, isTemplate } from '../map/core/wb-peek.mjs';

const book = JSON.parse(readFileSync(fileURLToPath(new URL('../map/data/worldbook_addon.json', import.meta.url)), 'utf8'));
const entries = Object.values(book.entries || book);
const tpl = entries.filter(e => isTemplate(e.content));
const CODE = /<%|%>|=>|\bconst\b|getvar|\.includes\(|\[TOPO|[{}]/;

test('three layer entries are templates (fixture sanity)', () => {
  assert.equal(tpl.length, 3);
});

test('no template entry leaks script text for any of its trigger words', () => {
  for (const e of tpl) for (const k of e.strategy?.keys || e.key || []) {
    for (const it of peekItems(entries, k)) assert.doesNotMatch(it.summary, CODE, `${k} → ${it.summary.slice(0, 60)}`);
  }
});

test('a landmark named in a template entry gets its readable line', () => {
  const e = tpl.find(x => /"[^"]+：天城/.test(x.content));
  const name = JSON.parse(`"${e.content.match(/\[\["([^"]+)"/)[1]}"`);
  const s = peekSummary(e.content, name);
  assert.ok(s && s.startsWith(name), s);
  assert.doesNotMatch(s, CODE);
});

test('template with no prose for this name is skipped, plain entry is kept and unwrapped', () => {
  assert.equal(peekSummary('<% if (a > b) { %>x<% } %>', '某地'), null);
  assert.equal(peekSummary('<地点·甲> 甲：一座塔 {{user}} 常去。 </地点·甲>', '甲'), '甲：一座塔 常去。');
  const items = peekItems([{ name: 'S', content: '<% const t = "x"; if (a > 1) { %>y<% } %>', strategy: { keys: ['某地'] } },
    { name: 'P', content: '<地点·某地> 某地：河边。 </地点·某地>', strategy: { keys: ['某地'] } }], '某地');
  assert.deepEqual(items, [{ name: 'P', summary: '某地：河边。' }]);
});

test('machine blocks are stripped from layer overview prose', () => {
  const s = peekSummary('<% const t = "层甲（高处）；[TOPO: 城/层甲 -> 连通: 一、二]。"; %>', '层甲');
  assert.equal(s, '层甲（高处）。');
});

test('a layer name gets the layer overview, not a neighbour landmark', () => {
  for (const e of tpl) {
    const k = (e.strategy?.keys || e.key || []).find(x => /^.层$/.test(x)) || '';
    if (!k) continue;
    const [it] = peekItems([e], k);
    assert.ok(it && !/^[^：]{1,24}：/.test(it.summary), `${k} → ${it?.summary}`);
  }
});
