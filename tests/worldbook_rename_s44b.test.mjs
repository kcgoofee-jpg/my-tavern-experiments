// S4-4b：世界书条目改名（地图补充-* → 地点-*，天城常识-位置未写 → 天城常识-其他机构）只改名字：
// 编号集合不变、名字只按前缀规则变、内容只在下面的句子表里变；旧名字的已装书按 eden_id 原地更新（不重复、不碰用户条目）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as W from '../map/tavern/wbsync.mjs';

const rd = p => JSON.parse(readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8'));
const before = rd('./fixtures/worldbook_addon_before_s44b.json');
const after = rd('../map/data/worldbook_addon.json');

// 句子表：旧句 → 新句（只这些句子允许变）
const SENTENCES = [['卡里没写层与位置，写到时只写机构名，不要自行定位。', '没有固定的层与位置，写到时只写机构名，不要自行定位。']];
const renamed = n => n.replace(/^地图补充-/, '地点-').replace(/^天城常识-位置未写$/, '天城常识-其他机构');
// 地点条目正文的包装标签同理改名：<地图补充·名> → <地点·名>（2026-10-01 编排复核补上）
const applySentences = s => SENTENCES.reduce((t, [a, b]) => t.split(a).join(b), s).replace(/<(\/?)地图补充·/g, '<$1地点·');
const { hashText } = W;

test('条目编号集合前后相同，顺序相同', () => {
  assert.deepEqual(after.entries.map(e => e.id), before.entries.map(e => e.id));
});

test('名字只按前缀规则变；其余字段（内容除句子表外）不变', () => {
  let n = 0;
  for (const [i, b] of before.entries.entries()) {
    const a = after.entries[i];
    assert.equal(a.name, renamed(b.name), b.id);
    if (a.name !== b.name) n++;
    assert.equal(a.content, applySentences(b.content), `${b.id} 内容`);
    const strip = ({ name, content, ...r }) => r;
    assert.deepEqual(strip(a), strip(b), `${b.id} 其余字段（关键词 / 顺序 / 位置）`);
  }
  assert.equal(n, 42);
  assert.ok(!after.entries.some(e => /^地图补充-/.test(e.name)));
  assert.ok(!after.entries.some(e => /地图补充/.test(e.content)));
});

test('别名表：键只按前缀规则变，编号不变', () => {
  assert.deepEqual(after.aliases.ids, Object.fromEntries(Object.entries(before.ids).map(([k, v]) => [renamed(k), v])));
  assert.equal(after.aliases.ids['天城常识-其他机构'], 'tiancheng.lore.unplaced');
});

test('wbsync：旧名字的已装书按 eden_id 原地更新，不重复，用户条目不动', () => {
  const ver = before.ver || 'old';
  const installed = before.entries.map((e, i) => ({ uid: 10 + i, name: e.name, enabled: true, content: e.content, strategy: e.strategy, position: e.position, extra: { eden_id: e.id, eden_ver: ver, eden_hash: hashText(e.content) } }));
  const mine = { uid: 900, name: '我自己的条目', enabled: true, content: '用户写的', extra: {} };
  const out = W.merge([...installed, mine], after);
  const own = out.filter(e => e.extra?.eden_id);
  assert.equal(own.length, before.entries.length, '没有重复');
  assert.equal(new Set(own.map(e => e.extra.eden_id)).size, own.length);
  assert.deepEqual(out.find(e => e.uid === 900), mine, '用户条目原样');
  for (const [i, b] of before.entries.entries()) {
    const e = own.find(x => x.extra.eden_id === b.id);
    assert.equal(e.name, renamed(b.name), b.id);
    assert.equal(e.uid, 10 + i, `${b.id} uid 保持（原地更新）`);
  }
  const p = W.plan(installed, after);
  assert.equal(p.add.length, 0); assert.equal(p.retire.length, 0); assert.equal(p.update.length, 42);
});
