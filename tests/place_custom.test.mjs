// PLACE-1a (D44, docs/place-record.md section 5): the player's changes lie over the pack's record field by field, restore and undo work,
// a story tag and a manual edit order by floor, old keys (standard names) migrate to node ids, and the chat's custom book is one index + one entry per place.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPack } from '../tools/place_records.mjs';
import * as P from '../map/core/place-record.mjs';
import * as CR from '../map/core/custom-record.mjs';
import * as CB from '../map/core/custom-book.mjs';
import * as V from '../map/tavern/mvu-readers.mjs';

const PACK = loadPack('eden'), ID = 'room_b2_03';
const base = P.placeRecord(PACK, ID);
const set = (c, k, p) => { const r = V.setCustom(c, k, p); assert.ok(r, `setCustom ${k} ${JSON.stringify(p)}`); return r; };

test('normCustom heals the new fields: description, facts, base fingerprints, floor, undo list', () => {
  const long = '字'.repeat(500), facts = Array.from({ length: 20 }, (_, i) => `事实${i}`.padEnd(150, '。'));
  const c = V.normCustom({ items: { a: { 类: 'room', 说明: long, 事实: [...facts, '事实0'.padEnd(150, '。'), ''], 基于: { desc: 'abc', name: 'BAD KEY!', x: 'y' }, 楼: 7.5 }, b: { 说明: ' 一句 ', 楼: 4 } } });
  assert.equal([...c.items.a.说明].length, 400); assert.equal(c.items.a.事实.length, 12); assert.ok(c.items.a.事实.every(f => [...f].length <= 120));
  assert.deepEqual(c.items.a.基于, { desc: 'abc' }); assert.equal(c.items.a.楼, undefined); assert.equal(c.items.b.说明, '一句'); assert.equal(c.items.b.楼, 4);
  assert.equal(V.normCustom({ items: { a: { 类: 'room' } } }).items.a, undefined, 'an item with nothing to keep is dropped as before');
  assert.deepEqual(V.normCustom(V.normCustom(c)), c, 'idempotent');
  const u = V.normCustom({ items: {}, 撤销: Array.from({ length: 30 }, (_, i) => ({ key: 'k' + i, prev: null, at: i })) }); assert.equal(u.撤销.length, 20); assert.equal(u.撤销[0].key, 'k10');
});

test('overlay: the player\'s fields win field by field, the pack record is never changed', () => {
  let c = V.normCustom({});
  c = set(c, ID, { name: '审问室', desc: '只留一盏灯。', kind: 'room', source: 'manual' });
  const r = P.placeRecord(PACK, ID, c);
  assert.equal(r.name, '审问室'); assert.equal(r.baseName, '惩罚室'); assert.ok(r.alias.includes('惩罚室')); assert.equal(r.desc, '只留一盏灯。');
  assert.equal(r.access, base.access, 'a field the player did not touch stays the pack\'s'); assert.deepEqual(r.facts, base.facts); assert.deepEqual(r.edited.sort(), ['desc', 'name']);
  assert.equal(P.placeRecord(PACK, ID).desc, base.desc, 'the pack\'s own record is untouched'); assert.equal(P.placeRecord(PACK, ID).name, '惩罚室');
  c = set(c, ID, { facts: ['门是单向的', '门是单向的', '  '], note: '审讯' });
  const r2 = P.placeRecord(PACK, ID, c); assert.deepEqual(r2.facts, ['门是单向的']); assert.equal(r2.use, '审讯');
  assert.match(P.entryText(r2, { lead: '本聊天里以此为准。' }), /^<地点·审问室>\n本聊天里以此为准。\n审问室：伊甸庄园 地下二层。只留一盏灯。用途：审讯。事实：门是单向的。出入：主人 \/ 女仆长 \/ 被带去的人。\n<\/地点·审问室>$/);
  assert.equal(P.placeRecord(PACK, '惩罚室', c)?.id, undefined, 'an unknown id is null');
});

test('an old key (the standard name) still finds the place', () => {
  const c = set(V.normCustom({}), '惩罚室', { desc: '旧键写的说明', kind: 'room' });
  const r = P.placeRecord(PACK, ID, c); assert.equal(r.desc, '旧键写的说明'); assert.equal(r.itemKey, '惩罚室');
  const c2 = set(V.normCustom({}), ID, { name: '审问室', kind: 'room' }); assert.equal(P.placeRecord(PACK, ID, c2).itemKey, ID);
  const c3 = set(V.normCustom({}), '惩罚室', { alias: '刑房', kind: 'room' }); assert.ok(P.placeRecord(PACK, ID, c3).alias.includes('刑房'));
});

test('restore: putting a field back gives the pack\'s text again; the other fields stay', () => {
  let c = set(V.normCustom({}), ID, { name: '审问室', desc: '改过的', facts: ['一条'], kind: 'room' });
  c = set(c, ID, CR.restorePatch(['desc']));
  const r = P.placeRecord(PACK, ID, c); assert.equal(r.desc, base.desc); assert.equal(r.name, '审问室'); assert.deepEqual(r.facts, ['一条']);
  c = set(c, ID, CR.restorePatch(['name', 'facts'])); const r2 = P.placeRecord(PACK, ID, c);
  assert.equal(r2.name, '惩罚室'); assert.deepEqual(r2.facts, base.facts); assert.deepEqual(r2.edited.filter(f => f !== 'aliases'), []);
  assert.equal(c.items[ID], undefined, 'nothing left of the item once every field is restored (the old display name stays an extra name only while kept)');
});

test('undo: each editor change can be taken back, most recent first; twenty are kept', () => {
  let c = V.normCustom({});
  c = set(c, ID, { desc: '一', kind: 'room', undo: true, floor: 3 }); c = set(c, ID, { desc: '二', undo: true, floor: 4 }); c = set(c, 'other', { desc: 'x', kind: 'room', undo: true });
  assert.equal(c.撤销.length, 3);
  const u1 = V.undoCustom(c, ID); assert.equal(u1.items[ID].说明, '一'); assert.equal(u1.items.other.说明, 'x', 'undo of one place leaves the other');
  const u2 = V.undoCustom(u1, ID); assert.equal(u2.items[ID], undefined, 'undoing the first change of a place removes the item'); assert.equal(u2.撤销.length, 1);
  assert.equal(V.undoCustom(u2, ID), null, 'nothing left to undo for this place'); const u3 = V.undoCustom(u2); assert.equal(u3.items.other, undefined); assert.equal(u3.撤销, undefined);
  let d = V.normCustom({}); for (let i = 0; i < 25; i++) d = set(d, ID, { desc: 'v' + i, kind: 'room', undo: true });
  assert.equal(d.撤销.length, 20); let n = 0; while (d.撤销) { d = V.undoCustom(d); n++; } assert.equal(n, 20);
  assert.equal(V.setCustom(c, ID, { desc: '字'.repeat(401) }), null, 'too long is refused, nothing is changed');
});

test('a story tag and a manual edit order by floor: the later one wins', () => {
  let c = set(V.normCustom({}), '书房', { note: '手动写的用途', kind: 'room', source: 'manual', floor: 10 });
  assert.equal(c.items['书房'].楼, 10);
  const r1 = V.applyTags(c, [{ floor: 5, text: '⌖用途 书房：楼5的标签' }], 0, () => 'room'); assert.equal(r1.custom.items['书房'].用途, '手动写的用途', 'an older tag does not overwrite a later manual edit'); assert.equal(r1.applied.length, 0);
  const r2 = V.applyTags(c, [{ floor: 12, text: '⌖用途 书房：楼12的标签' }], 0, () => 'room'); assert.equal(r2.custom.items['书房'].用途, '楼12的标签'); assert.equal(r2.custom.items['书房'].源, '标签'); assert.equal(r2.custom.items['书房'].楼, 12);
  const r3 = V.applyTags(r2.custom, [], 0); assert.equal(r3.custom.items['书房'].用途, '楼12的标签');
  const c2 = set(r2.custom, '书房', { note: '楼15手动', source: 'manual', floor: 15 }); assert.equal(c2.items['书房'].源, '手动');
  assert.equal(V.applyTags(c2, [{ floor: 13, text: '⌖用途 书房：迟到的旧标签' }], 0, () => 'room').custom.items['书房'].用途, '楼15手动');
  const noFloor = V.normCustom({ items: { 书房: { 类: 'room', 用途: '旧数据', 源: '手动' } } });
  assert.equal(V.applyTags(noFloor, [{ floor: 2, text: '⌖用途 书房：标签' }], 0, () => 'room').custom.items['书房'].用途, '标签', 'old data without a floor behaves as before');
});

test('migrateKeys: standard names become node ids; what the tree cannot name keeps its key; nothing is lost; running twice changes nothing', () => {
  const byName = new Map(P.records(PACK).filter(r => r.kind === 'room').map(r => [r.name, r.id])), idOf = n => byName.get(n) || null;
  let c = V.normCustom({});
  c = set(c, '惩罚室', { name: '审问室', kind: 'room', undo: true }); c = set(c, '某个树里没有的地方', { desc: '留着', kind: 'landmark' }); c = set(c, ID, { desc: '已在 id 下的说明', kind: 'room' });
  const m = CR.migrateKeys(c, idOf);
  assert.equal(m.moved, 1); assert.ok(m.custom.items[ID] && !m.custom.items['惩罚室']);
  assert.equal(m.custom.items[ID].名, '审问室'); assert.equal(m.custom.items[ID].说明, '已在 id 下的说明', 'both items\' fields are kept (the id one wins a clash)');
  assert.equal(m.custom.items['某个树里没有的地方'].说明, '留着'); assert.equal(m.custom.撤销[0].key, ID);
  assert.equal(P.placeRecord(PACK, ID, V.normCustom(m.custom)).name, '审问室');
  const again = CR.migrateKeys(m.custom, idOf); assert.equal(again.moved, 0); assert.deepEqual(again.custom, m.custom);
});

test('a changed pack text is noticed: the fingerprints kept at save time differ from the pack\'s text now', () => {
  let c = set(V.normCustom({}), ID, { name: '审问室', desc: '我的说明', kind: 'room', base: CR.baseOf(base), floor: 2 });
  assert.deepEqual(P.placeRecord(PACK, ID, c).stale, []);
  const changed = { ...PACK, nodes: PACK.nodes.map(n => (n.id === ID ? { ...n, desc: '包里新写的说明', name: '惩罚室（新）' } : n)) };
  const r = P.placeRecord(changed, ID, c); assert.deepEqual(r.stale.sort(), ['desc', 'name']); assert.equal(r.desc, '我的说明', 'the player\'s text still wins');
  assert.ok(CR.baseOf(P.placeRecord(changed, ID)).desc !== CR.baseOf(base).desc);
  const f = set(V.normCustom({}), ID, { facts: ['a'], kind: 'room', base: CR.baseOf(base) }); assert.deepEqual(P.placeRecord(PACK, ID, f).stale, [], 'facts the pack never had are not stale');
});

test('the chat\'s custom book: a constant index of names (at most 220 characters) + one keyword entry per place with text; sync off only disables', () => {
  let c = V.normCustom({});
  c = set(c, ID, { name: '审问室', desc: '只留一盏灯。', facts: ['门是单向的'], kind: 'room' });
  c = set(c, '书房', { name: '星图室', kind: 'room' });                                  // a rename only: in the index, no entry of its own
  c = set(c, '地下酒窖', { note: '存放旧酒', alias: '酒窖入口', kind: 'room' });          // use line + extra name: an entry (the pack knows nothing of it)
  const es = V.wbEntries(c, { pack: PACK }), idx = es[0];
  assert.equal(idx.name, V.WB_ENTRY); assert.equal(idx.strategy.type, 'constant'); assert.equal(idx.enabled, true);
  assert.ok([...idx.content].length <= 220 && /惩罚室|room_b2_03/.test(idx.content) && idx.content.includes('书房→星图室'), idx.content); assert.ok(!idx.content.includes('只留一盏灯'), 'names only');
  const places = es.slice(1); assert.equal(places.length, 2);
  const a = places.find(e => e.extra.eden_place === ID), r = P.placeRecord(PACK, ID, c);
  assert.equal(a.content, P.entryText(r, { lead: '本聊天里以此为准。' }), 'the body is the same generator as the add-on\'s');
  assert.ok(a.strategy.keys.includes(ID) && a.strategy.keys.includes('审问室') && a.strategy.keys.includes('惩罚室')); assert.equal(a.position.type, 'after_character_definition'); assert.ok(a.position.order > 903);
  const b = places.find(e => e.extra.eden_place === '地下酒窖'); assert.match(b.content, /用途：存放旧酒/); assert.ok(b.strategy.keys.includes('酒窖入口'));
  const many = {}; for (let i = 0; i < 30; i++) many['地点' + i] = { 类: 'room', 名: '新名字' + i };
  assert.ok([...CB.indexText(V.normCustom({ items: many })).replace(/\s+$/, '')].length <= 220);
  const off = V.wbEntries(c, { on: false, pack: PACK }); assert.equal(off.length, es.length); assert.ok(off.every(e => e.enabled === false), 'turning the sync off disables every entry, deletes none');
  const empty = V.wbEntries(V.normCustom({})); assert.equal(empty.length, 1); assert.equal(empty[0].enabled, false); assert.equal(V.wbHasContent(V.normCustom({})), false); assert.equal(V.wbHasContent(c), true);
  const noPack = V.wbEntries(c); assert.match(noPack.find(e => e.extra?.eden_place === ID).content, /只留一盏灯/, 'without the pack the player\'s own text still goes into the book');
  assert.equal(V.wbContent(c).includes('地图自定义'), true, 'the older single-entry text function is still there');
});
