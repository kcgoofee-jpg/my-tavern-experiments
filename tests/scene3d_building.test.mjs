// S7-3 T1 (docs/kernel-schema.md K-R131, K-R132): the building's words and the room kinds as pack data in a 3D manifest: validation, fallbacks, the first pack's values.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Estate3D } from '../map/core/scene3d-manifest.mjs';
import { KIND_PALETTE } from '../map/core/kind-palette.mjs';

const rd = p => JSON.parse(fs.readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8'));
const EDEN = rd('../map/estate/model/manifest.json'), FIX = rd('./fixtures/pack3d-min/scene/manifest.json'), ROOMS = rd('../map/data/eden_estate_rooms.json');
const base = { id: 'x', glb: 'a.glb' };

test('K-R132: building title and subtitle, the page language picks the entry, plain fields are the fallback', () => {
  const raw = { ...base, building: { title: 'Hall', subtitle: 'sub', i18n: { en: { title: 'The Hall' }, de: { subtitle: 'Unter' } } } };
  assert.deepEqual(Estate3D.building(raw, 'en'), { title: 'The Hall', subtitle: 'sub', summary: '' });
  assert.deepEqual(Estate3D.building(raw, 'de'), { title: 'Hall', subtitle: 'Unter', summary: '' });
  assert.deepEqual(Estate3D.building(raw, 'zh'), { title: 'Hall', subtitle: 'sub', summary: '' });
  assert.deepEqual(Estate3D.validate(raw), []);
});
test('K-R132: neutral fallbacks without the block ("Building", no subtitle, floor ids as labels); a landmark\'s bounding box under `building` is not the block', () => {
  assert.deepEqual(Estate3D.building(base), { title: 'Building', subtitle: '', summary: '' });
  assert.deepEqual(Estate3D.building({ ...base, building: { min: [0, 0, 0], max: [1, 1, 1] } }), { title: 'Building', subtitle: '', summary: '' });
  assert.deepEqual(Estate3D.validate({ ...base, building: { min: [0, 0, 0], max: [1, 1, 1] } }), []);
  assert.deepEqual(Estate3D.floorList({ ...base, floors: ['B1', { id: 'G' }, { id: 'U', label: 'Upper', i18n: { en: { label: 'Upper floor' } } }] }, 'en'), [{ id: 'B1', label: 'B1' }, { id: 'G', label: 'G' }, { id: 'U', label: 'Upper floor' }]);
  assert.deepEqual(Estate3D.floorList({ ...base, floors: [{ id: 'U', label: 'Upper' }] }, 'zh'), [{ id: 'U', label: 'Upper' }]);
});
test('K-R132: a `building.floors` key is rejected; the title must be plain text', () => {
  assert.match(Estate3D.validate({ ...base, building: { title: 'T', floors: [] } }).join(), /building\.floors/);
  assert.match(Estate3D.validate({ ...base, building: { subtitle: 'x' } }).join(), /building\.title/);
  assert.match(Estate3D.validate({ ...base, building: 'T' }).join(), /building/);
  assert.match(Estate3D.validate({ ...base, floors: [{ id: 'a', label: 3 }] }).join(), /floors\[0\]\.label/);
});
test('K-R131: declared kinds carry colour and label (language entry, plain fallback); invalid entries are dropped and reported', () => {
  const raw = { ...base, room_kinds: { work: { color: '#336699', label: 'Work', i18n: { en: { label: 'Workshops' } } }, bad: { color: 'red', label: 'x' }, Worse: { color: '#112233', label: 'y' } } };
  assert.deepEqual(Estate3D.roomKinds(raw, 'en'), [{ id: 'work', color: '#336699', label: 'Workshops', rank: 2 }]);
  assert.deepEqual(Estate3D.roomKinds(raw, 'zh'), [{ id: 'work', color: '#336699', label: 'Work', rank: 2 }]);
  const errs = Estate3D.validate(raw).join('\n'); assert.match(errs, /room_kinds\.bad\.color/); assert.match(errs, /room_kinds\.Worse/);
  assert.match(Estate3D.validate({ ...base, room_kinds: { a: { color: '#112233' } } }).join(), /room_kinds\.a\.label/);
});
test('K-R131: an undeclared kind gets a generated colour from the palette and its id as label, the same every time', () => {
  const a = Estate3D.kindInfo(base, 'lab'), b = Estate3D.kindInfo({ ...base, room_kinds: {} }, 'lab');
  assert.deepEqual(a, b); assert.ok(KIND_PALETTE.includes(a.color)); assert.equal(a.label, 'lab'); assert.equal(a.id, 'lab');
  assert.deepEqual(Estate3D.kindInfo({ ...base, room_kinds: { lab: { color: '#102030', label: 'Lab' } } }, 'lab'), { id: 'lab', color: '#102030', label: 'Lab', rank: 2 });
});
test('the first pack\'s manifest carries today\'s words and colours: title, motto as subtitle, floor names, the five kinds with the medical colour', () => {
  assert.deepEqual(Estate3D.validate(EDEN), []);
  assert.deepEqual(Estate3D.building(EDEN, 'zh'), { title: '伊甸家族府邸', subtitle: '始建约一百九十年 · HORTUS SUPRA NUBES', summary: '浮岛庄园 · 主楼地上三层 + 地下两层' });
  assert.deepEqual(Estate3D.building(EDEN, 'en'), { title: 'Eden Family Seat', subtitle: 'Founded c. 190 years ago · HORTUS SUPRA NUBES', summary: 'Floating-isle estate · house: 3 floors + 2 basements' });
  assert.deepEqual(Estate3D.floorList(EDEN, 'zh').map(f => f.label), ['地下二层', '地下一层', '一层', '二层', '三层']);
  assert.deepEqual(Estate3D.floorList(EDEN, 'en').map(f => f.label), ['Basement 2', 'Basement 1', 'Ground floor', 'First floor', 'Second floor']);
  assert.deepEqual(Estate3D.floorList(EDEN).map(f => f.id), ROOMS.floors.map(f => f.id));
  assert.deepEqual(Object.fromEntries(Estate3D.roomKinds(EDEN, 'zh').map(k => [k.id, k.color])), { card: '#d9c29a', owner: '#a79bb6', support: '#aab3bb', circ: '#e9e4d8', medical: '#8fc7cf' });
  assert.deepEqual(Object.fromEntries(Estate3D.roomKinds(EDEN, 'zh').map(k => [k.id, k.label])), { card: '房间', owner: '主人区域', support: '服务 / 后勤', circ: '走廊 / 楼梯', medical: '医疗中心' });
  for (const kind of new Set(ROOMS.rooms.map(r => r.kind))) assert.ok(Estate3D.roomKinds(EDEN).some(k => k.id === kind), 'declared: ' + kind);   // every kind a room uses is declared: no generated colour in the first pack
});
test('the fixture pack declares neither `building` nor `room_kinds`: neutral words, generated colours for its three kinds', () => {
  assert.deepEqual(Estate3D.validate(FIX), []); assert.equal(FIX.building, undefined); assert.equal(FIX.room_kinds, undefined);
  assert.deepEqual(Estate3D.building(FIX, 'en'), { title: 'Building', subtitle: '', summary: '' });
  assert.deepEqual(Estate3D.floorList(FIX, 'en'), [{ id: 'L1', label: 'L1' }, { id: 'L2', label: 'L2' }]);
  const rooms = rd('./fixtures/pack3d-min/scene/rooms.json').rooms;
  for (const k of new Set(rooms.map(r => r.kind))) assert.ok(KIND_PALETTE.includes(Estate3D.kindInfo(FIX, k).color), k);
});
test('data.extras is resolved against the manifest like the other data paths', () => {
  const n = Estate3D.normalize(EDEN, { base: 'https://x.test/estate/model/' });
  assert.equal(n.data.extras, 'https://x.test/estate/model/extras.json'); assert.equal(n.data.rooms, 'https://x.test/data/eden_estate_rooms.json');
});
