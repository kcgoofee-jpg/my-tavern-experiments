// PLACE-1a (D44, docs/place-record.md appendix A): one record per place, the add-on's room entries, the sync, the entry switch.
// The record is computed from the pack's own files (tools/place_records.mjs loadPack); the shipped add-on (map/data/worldbook_addon.json) must match it entry for entry.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadPack } from '../tools/place_records.mjs';
import * as P from '../map/core/place-record.mjs';
import * as S from '../map/tavern/spatial-contract.mjs';
import * as J from '../map/tavern/worldbook-jit.mjs';
import * as W from '../map/tavern/worldbook-sync.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const rd = p => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const SHIP = rd('map/data/worldbook_addon.json'), PACK = loadPack('eden'), REG = rd('map/data/maps.json');
const rec = id => P.placeRecord(PACK, id), byName = n => P.records(PACK).find(r => r.name === n);
const sha = s => crypto.createHash('sha1').update(s).digest('hex');
const entryOf = id => SHIP.entries.find(e => e.id === id);

test('a room: the punishment room record, field by field', () => {
  const r = byName('惩罚室');
  assert.equal(r.id, 'room_b2_03'); assert.equal(r.kind, 'room'); assert.equal(r.type, 'room'); assert.equal(r.parent, 'eden_estate');
  assert.deepEqual(r.floors, [{ id: 'B2', name: '地下二层' }]);
  assert.equal(r.sub, '地下二层 · 伊甸家族府邸'); assert.equal(r.where, '伊甸庄园 地下二层');
  assert.equal(r.desc, '无窗；重型约束立柱、悬吊禁闭笼、束缚惩戒长凳、刑具壁柜'); assert.equal(r.access, '主人 / 女仆长 / 被带去的人');
  assert.deepEqual(r.rows, [{ key: 'area', label: '面积', text: '40 ㎡' }]); assert.deepEqual(r.facts, []);
  assert.deepEqual(r.wb, []);   // no index in the sources: the builder fills the shipped index (see below)
  assert.equal(P.entryText(r), '<地点·惩罚室>\n惩罚室：伊甸庄园 地下二层。无窗；重型约束立柱、悬吊禁闭笼、束缚惩戒长凳、刑具壁柜。出入：主人 / 女仆长 / 被带去的人。\n</地点·惩罚室>');
});

test('rooms that share a node are one record: the tower stairs on three floors, the bedrooms (14 table rows) as one', () => {
  const r = byName('主楼梯（塔楼）');
  assert.equal(r.id, 'room_f1_30'); assert.deepEqual(r.floors.map(f => f.id), ['F1', 'F2', 'F3']);
  assert.equal(r.where, '伊甸庄园 一层 / 二层 / 三层'); assert.equal(r.access, '主人 / 访客 / 住客');
  assert.equal(P.records(PACK).filter(x => x.name === '正式母畜个人寝室').length, 1);
  assert.equal(P.records(PACK).filter(x => x.name === '主楼梯（塔楼）').length, 1);
});

test('a landmark, a building and a place with its own world-book text', () => {
  const l = rec('silver_crown');
  assert.equal(l.kind, 'place'); assert.equal(l.type, 'landmark'); assert.equal(l.parent, 'tc_upper'); assert.equal(l.sub, '议会骑士团总部'); assert.ok(l.alias.includes('骑士团总部'));
  const b = rec('eden_estate');
  assert.equal(b.kind, 'building'); assert.equal(b.parent, 'tc_upper'); assert.equal(b.desc, '浮岛庄园 · 主楼地上三层 + 地下两层'); assert.equal(b.sub, '{{user}} 的庄园', 'the node\'s own subtitle wins over the building words'); assert.ok(b.alias.includes('伊甸家族府邸'));
  const g = rec('greystone'), row = rd('map/data/addon_places.json').places.find(p => p.id === 'greystone');
  assert.equal(g.desc, row.text); assert.equal(g.kind, 'place'); assert.equal(g.parent, 'eden_estate');
  // FIX-3: the record grew a one-line note, so entryText carries it. The shipped add-on entry does NOT: the builder
  // writes these 42 from `text` alone, so nothing new reaches the model until the player edits that place in their chat.
  assert.equal(P.entryText(g), `<地点·灰石旧宅>\n${row.text}\n用途：${row.use}\n</地点·灰石旧宅>`, 'the one source of an entry body shows the note');
  assert.equal(entryOf('map.place.greystone').content, `<地点·灰石旧宅>\n${row.text}\n</地点·灰石旧宅>`, 'the shipped entry text is unchanged');
  const v = rec('zone_vehicle'); assert.equal(v.kind, 'zone'); assert.ok(v.desc.includes('悬浮'));
  assert.ok(P.records(PACK).some(r => r.kind === 'zone' && r.id.startsWith('zone_')), 'outdoor hotspots are records');
});

test('chainOf and nearby: the ancestors end with the floor; nearby rooms are on the same floor, the closest first', () => {
  const c = P.chainOf(PACK, 'room_b2_03');
  assert.deepEqual(c.map(x => x.name).slice(-2), ['伊甸庄园', '地下二层']); assert.equal(c.at(-1).floor, 'B2'); assert.ok(c.length >= 3);
  assert.deepEqual(P.chainOf(PACK, 'room_f1_30').map(x => x.name).at(-1), '伊甸庄园', 'a three-floor room ends at the building');
  const n = P.nearby(PACK, 'room_b2_03', 8), plan = rd('map/data/eden_estate_rooms.json'), onB2 = new Set(plan.rooms.filter(r => r.floor === 'B2').map(r => r.node));
  assert.ok(n.length > 0 && n.length <= 8); assert.ok(n.every(x => onB2.has(x.id) && x.id !== 'room_b2_03'));
  assert.deepEqual(P.nearby(PACK, 'room_b2_03', 8), n, 'deterministic');
  const m = P.nearby(PACK, 'silver_crown', 5); assert.ok(m.length > 0 && m.every(x => rec(x.id)?.parent === 'tc_upper'));
});

test('the shipped add-on has exactly one entry per room record with text, its body is entryText(record); name-only rooms have none', () => {
  const rooms = P.records(PACK).filter(r => r.kind === 'room'), withText = rooms.filter(P.hasText), bare = rooms.filter(r => !P.hasText(r));
  assert.ok(withText.length >= 70 && bare.length >= 12, `${withText.length} with text, ${bare.length} name-only`);
  const names = new Set(SHIP.entries.map(e => e.name)), seen = new Set();
  for (const r of withText) {
    const ids = SHIP.index[r.id]; assert.ok(Array.isArray(ids) && ids.length === 1, `${r.name}: index`);
    const e = entryOf(ids[0]); assert.ok(e, `${r.name}: entry ${ids[0]}`);
    if (e.id.startsWith('map.room.')) { assert.equal(e.id, 'map.room.' + r.id.replace(/_/g, '-')); assert.equal(e.content, P.entryText(r), r.name); assert.equal(e.name, `地点-${r.name}`); assert.ok(e.strategy.keys.includes(r.name)); seen.add(e.id); }
    else assert.equal(e.name, `地点-${r.name}`, 'a record that already has a place entry points at it (no second entry)');
  }
  assert.equal(SHIP.entries.filter(e => e.id.startsWith('map.room.')).length, seen.size, 'no room entry without a record');
  for (const r of bare) { assert.equal(SHIP.index[r.id], undefined, r.name); assert.ok(!names.has(`地点-${r.name}`) || P.records(PACK).some(x => x.name === r.name && P.hasText(x)), r.name); }
  assert.equal(SHIP.category['map.room.room-b2-03'], 'places');
});

test('every landmark and place with text points at the entry that carries it (index)', () => {
  assert.deepEqual(SHIP.index.greystone, ['map.place.greystone']);
  assert.deepEqual(SHIP.index.silver_crown, ['map.bearing.upper']); assert.deepEqual(SHIP.index.radiance_cathedral, ['map.place.radiance-cathedral'], 'a place with its own entry points at it');
  const addon = new Set(PACK.addon.map(p => p.id)), mid = Object.keys(REG.maps.tc_mid.markers).find(k => !addon.has(k) && REG.maps.tc_mid.markers[k].wb_list !== false);
  assert.deepEqual(SHIP.index[mid], ['map.bearing.mid'], `${mid}: a landmark is described by its layer's bearing entry`);
  for (const [id, ids] of Object.entries(SHIP.index)) { assert.ok(P.records(PACK).some(r => r.id === id), `${id} is a record`); for (const e of ids) assert.ok(entryOf(e), `${id} -> ${e}`); }
});

test('generic names carry secondary keys (the building, any); specific names do not', () => {
  const store = entryOf('map.room.room-b2-06'), spec = entryOf('map.room.room-b2-03');
  assert.equal(P.records(PACK).find(r => r.id === 'room_b2_06').name, '储藏室');
  assert.equal(store.strategy.keys_secondary.logic, 'and_any'); assert.ok(store.strategy.keys_secondary.keys.includes('伊甸庄园'));
  assert.equal(spec.strategy.keys_secondary, undefined);
  for (const e of SHIP.entries.filter(x => x.id.startsWith('map.room.'))) { assert.equal(e.strategy.type, 'selective'); assert.ok(e.strategy.keys.length > 0); assert.equal(e.position.type, 'at_depth'); assert.equal(e.position.depth, 1); assert.equal(e.position.role, 'system'); assert.equal(e.enabled, true); }   // WB-2 (D45): depth 1, order band 1000+
});

test('the constant entries and the older place entries read exactly as at head #301 (the injected text did not change)', () => {
  const H = { 'map.link-rules': '507d3fb31eec2dc6bb159837150d0f36070993d5', 'map.event-types': '667685e0804768f13399bd049d9f430a47890479', 'map.current-location': 'a63cd990a9bcdd401e27af8296cd297cccc3c6b2' };
  for (const [id, h] of Object.entries(H)) assert.equal(sha(entryOf(id).content), h, id);
  const places = SHIP.entries.filter(e => e.id.startsWith('map.place.'));
  assert.equal(places.length, 42); assert.equal(sha(places.map(e => e.id + e.content).join('|')), '458a610740ea45b56dce7163ab6a357e18739907');
  assert.deepEqual(SHIP.entries.filter(e => e.strategy.type === 'constant').map(e => e.id), ['map.link-rules', 'map.event-types', 'map.current-location']);
});

test('JIT: with the player in the punishment room the B2 room entries are on and the F1 ones off; in the city none is on', () => {
  const place = P.floorIndex(rd('map/data/eden_estate_rooms.json')), plan = rd('map/data/eden_estate_rooms.json');
  const entries = SHIP.entries.map(e => ({ ...e, enabled: true, extra: { eden_id: e.id } }));
  const inRoom = S.activationOf(REG, '伊甸庄园·惩罚室', {}, { place }), p = J.planActivation(entries, inRoom);
  const on = id => !p.disable.includes(id), roomEntries = entries.filter(e => e.id.startsWith('map.room.'));
  const b2 = roomEntries.filter(e => plan.rooms.filter(r => r.node === e.id.replace('map.room.', '').replace(/-/g, '_')).some(r => r.floor === 'B2'));
  const f1 = roomEntries.filter(e => { const fl = plan.rooms.filter(r => r.node === e.id.replace('map.room.', '').replace(/-/g, '_')).map(r => r.floor); return fl.includes('F1') && !fl.includes('B2'); });
  assert.ok(b2.length >= 5 && f1.length >= 5, `${b2.length} B2, ${f1.length} F1 entries`);
  assert.ok(b2.every(e => on(e.id)), 'B2 room entries stay on'); assert.ok(f1.every(e => !on(e.id)), 'F1 room entries are switched off');
  assert.ok(on('map.room.room-b2-03'));
  assert.ok(inRoom.has('伊甸庄园'), 'the building name is in the set');
  const city = J.planActivation(entries, S.activationOf(REG, '天城·中层·天城执法局总局', {}, { place }));
  assert.ok(roomEntries.every(e => city.disable.includes(e.id)), 'in the city no room entry stays on');
  assert.deepEqual([...S.activationOf(REG, '伊甸庄园·惩罚室', {})], ['伊甸庄园·惩罚室'], 'without a room table the set is what it was');
});

test('FIX-3: the shipped book really does have an entry at the player\'s place (the activation set is not empty), and a coarse place word switches nothing', () => {
  const place = P.floorIndex(rd('map/data/eden_estate_rooms.json'));
  const entries = SHIP.entries.map(e => ({ ...e, extra: { eden_id: e.id }, enabled: true }));
  const run = (here, extra = {}) => {
    const act = S.activationSet(REG, here, {}, { place });
    return { act, plan: J.planActivation(entries, act.names, { pinned: act.pinned }) };
  };
  // 庄园里的一个房间：钉住了，玩家自己那间与同层的条目开着，别的楼层关掉
  const room = run('伊甸庄园·大厅');
  assert.equal(room.act.pinned, true);
  assert.ok(room.act.names.has('大厅'));
  assert.ok(!room.plan.disable.includes('map.room.room-f1-34'), 'the room the player is in stays on');
  assert.ok(room.plan.on > 0, 'the round leaves entries on');
  // 城里一个标记点：钉住了，那一处与近邻的条目开着
  const city = run('天城·中层·7号井黑市');
  assert.equal(city.act.pinned, true);
  assert.ok(city.plan.on > 0 && city.plan.enable.length >= 0);
  // 只写出场地名 / 层名：没钉住，一个条目都不动（不再一次把整本书关掉）
  for (const bare of ['伊甸庄园', '天城上层']) {
    const b = run(bare);
    assert.equal(b.act.pinned, false, bare);
    assert.deepEqual(b.plan.disable, [], `${bare}: nothing switched off`);
    assert.deepEqual(b.plan.enable, [], `${bare}: nothing switched on`);
  }
});

test('FIX-3: every place with its own world-book text has a record-level note, written only with words that text already has', () => {
  const places = rd('map/data/addon_places.json').places;
  assert.equal(places.length, 42, 'the add-on place table');
  for (const p of places) {
    assert.ok(p.use && p.use.length >= 8, `${p.id}: no record note`);
    assert.ok(p.use.length <= 90, `${p.id}: the note is a sentence, not a paragraph (${p.use.length})`);
    assert.ok(p.text.length > p.use.length, `${p.id}: the note is a condensation, not a copy of the text`);
    // 不发明：说明里的每个字都在这一处自己的 text 里出现过（改写顺序可以，不许生词）
    for (const c of new Set([...p.use].filter(x => /[一-鿿]/.test(x)))) assert.ok(p.text.includes(c), `${p.id}: 「${c}」 is not in its own text`);
    const rec = P.placeRecord(PACK, p.id);
    assert.equal(rec.use, p.use, `${p.id}: the record does not carry the note`);
    assert.equal(rec.desc, p.text, `${p.id}: the text is still the description`);
    assert.ok(P.hasText(rec), `${p.id}: hasText`);
  }
  // 世界书条目正文仍然只有 text：说明是记录上的字段，不是注进模型的东西
  const e = entryOf(`map.place.${places[0].id}`);
  assert.ok(e && e.content === `<地点·${places[0].name}>\n${places[0].text}\n</地点·${places[0].name}>`, 'the shipped place entry is still the text alone');
});

test('sync: keys_secondary travels with a shipped entry; a changed list is an update; an unchanged book needs no write', () => {
  const ship = { ver: '1+a', entries: [{ id: 'map.room.x', name: '地点-x', content: 'c', strategy: { type: 'selective', keys: ['x'], keys_secondary: { logic: 'and_any', keys: ['b1'] } }, position: { type: 'before_character_definition', order: 5 }, enabled: true }] };
  const book = W.merge(null, ship); assert.deepEqual(book[0].strategy.keys_secondary, { logic: 'and_any', keys: ['b1'] });
  assert.equal(W.plan(book, ship).changed, false);
  const ship2 = { ...ship, entries: [{ ...ship.entries[0], strategy: { ...ship.entries[0].strategy, keys_secondary: { logic: 'and_any', keys: ['b1', 'b2'] } } }] };
  assert.deepEqual(W.plan(book, ship2).update, ['地点-x']); assert.deepEqual(W.merge(book, ship2)[0].strategy.keys_secondary.keys, ['b1', 'b2']);
  const bare = book.map(e => ({ ...e, strategy: { type: 'selective', keys: ['x'] } }));   // a tavern that stores no secondary list: nothing to compare, no churn
  assert.equal(W.plan(bare, ship).changed, false);
});

test('entryState: synced / edited in the tavern / pending', () => {
  const ship = { ver: '1+a', entries: [{ id: 'map.room.x', name: 'n', content: 'body', strategy: { type: 'selective', keys: ['x'] }, position: { type: 'before_character_definition', order: 5 } }] };
  const S1 = W.shipped(ship).entries[0], book = W.merge(null, ship);
  assert.equal(W.entryState(book[0], S1), 'synced'); assert.equal(W.entryState(null, S1), 'pending');
  assert.equal(W.entryState({ ...book[0], content: 'mine' }, S1), 'edited');
  assert.equal(W.entryState({ ...book[0], extra: { ...book[0].extra, eden_ver: '0+old' } }, S1), 'pending');
});

test('the room entries cost: numbers for the report', () => {
  const rooms = SHIP.entries.filter(e => e.id.startsWith('map.room.')), chars = rooms.reduce((n, e) => n + e.content.length, 0);
  assert.ok(rooms.length >= 70); assert.ok(chars < 7000, `${chars} characters`);
  const con = SHIP.entries.filter(e => e.strategy.type === 'constant').reduce((n, e) => n + e.content.length, 0); assert.equal(con, 762 + 879 + 999, 'the constant part did not grow');
});

test('schema 2: nodes may carry facts and access (K-R134); a bad value is dropped with one problem; a pack-owned record shows them', async () => {
  const { validate2 } = await import('../map/core/pack-v2.mjs');
  const m = { schema: 2, id: 'tiny', title: 'Tiny', nodes: [{ id: 'town', name: 'Town' }, { id: 'hall', name: 'Hall', parent: 'town', type: 'room', desc: 'A hall.', facts: ['It has a door.', 'It is cold.'], access: 'Staff only' },
    { id: 'bad', name: 'Bad', parent: 'town', facts: 'not a list', access: 5 }] };
  const r = validate2(m, { trusted: false, source: 'file' }), hall = r.pack.nodes.find(n => n.id === 'hall'), bad = r.pack.nodes.find(n => n.id === 'bad');
  assert.deepEqual(hall.facts, ['It has a door.', 'It is cold.']); assert.equal(hall.access, 'Staff only');
  assert.equal(bad.facts, undefined); assert.equal(bad.access, undefined); assert.ok(r.problems.some(p => /facts/.test(p.path)) && r.problems.some(p => /access/.test(p.path)), JSON.stringify(r.problems));
  const rec = P.placeRecord({ nodes: r.pack.nodes }, 'hall'); assert.deepEqual([rec.kind, rec.desc, rec.facts, rec.access], ['room', 'A hall.', ['It has a door.', 'It is cold.'], 'Staff only']);
  assert.equal(P.entryText(rec, { lang: 'en' }), '<Place·Hall>\nHall. A hall. Facts: It has a door.; It is cold. Access: Staff only.\n</Place·Hall>');
});

test('an overlay may carry facts and access for a node (K-R134): merged over the converted node, checked by check_overlay', async () => {
  const { applyOverlay } = await import('../map/core/overlay-v2.mjs');
  const r = applyOverlay(PACK.nodes, { schema: 2, nodes: [{ id: 'room_b2_03', facts: ['一条事实'], access: '只有主人' }] });
  const n = r.nodes.find(x => x.id === 'room_b2_03'); assert.deepEqual([n.facts, n.access, r.problems], [['一条事实'], '只有主人', []]);
  const rec2 = P.placeRecord({ ...PACK, nodes: r.nodes }, 'room_b2_03'); assert.deepEqual(rec2.facts, ['一条事实']); assert.equal(rec2.access, '只有主人', 'the node\'s own access wins over the room table');
  const src = readFileSync(join(ROOT, 'tools/check_overlay.mjs'), 'utf8'); assert.ok(/facts must be a list of at most 12/.test(src) && /access must be a string/.test(src));
});
