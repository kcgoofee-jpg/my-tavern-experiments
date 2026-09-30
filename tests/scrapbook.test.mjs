// 空间化图文见闻录（Part 5-5）node 单测：钉 / 摘 / 按地点翻 / 统计与注入摘要、前缀隔离、纯度。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { norm, pin, unpin, byPlace, countOf, digest, describe, roomIdOf, placeOf, MAX_ITEMS, MAX_TEXT } from '../map/core/scrapbook.mjs';

test('roomId / place：见闻录走自己的前缀，房间图集不串台', () => {
  assert.equal(roomIdOf('主人主卧'), 'sb:主人主卧');
  assert.equal(placeOf('sb:主人主卧'), '主人主卧');
  assert.equal(placeOf('主人主卧'), null, '没有前缀 = 不是见闻录的图集');
  assert.equal(placeOf('sb:'), '');
  assert.equal(placeOf(null), null);
});

test('norm：坏行丢弃、字段裁剪、kind 只认 image / note、图必须有 ref', () => {
  const m = norm({ items: [
    { id: 'a1', place: '主人主卧', kind: 'image', ref: 'i7', at: 12, w: 800, h: 600, bytes: 1200, text: '第一次来' },
    { id: 'a2', place: '大厅', kind: 'note', text: '墙上那幅画不对劲' },
    { id: 'a3', place: '大厅', kind: 'image' },                 // 图没有 ref：丢
    { id: 'a4', kind: 'image', ref: 'x' },                      // 没有地点：丢
    { place: '大厅', kind: 'note' },                            // 没有 id：丢
    { id: 'a5', place: '大厅', kind: 'video', ref: 'y' },       // kind 不认：丢
    null, '垃圾',
  ] });
  assert.deepEqual(m.items.map(r => r.id), ['a1', 'a2']);
  assert.deepEqual(m.items[0], { id: 'a1', place: '主人主卧', map: '', at: 12, kind: 'image', ref: 'i7', w: 800, h: 600, bytes: 1200, text: '第一次来' });
  assert.equal(m.items[1].at, 0, '没写楼层 = 0');
  assert.deepEqual(norm(null).items, []);
  assert.deepEqual(norm({ items: '不是数组' }).items, []);
  assert.equal(norm({ items: [{ id: 'x', place: 'p', kind: 'note', text: '字'.repeat(900) }] }).items[0].text.length, MAX_TEXT);
});

test('pin：自动生成可复现的 ASCII id、重复不写、满了不写、缺关键字段不写', () => {
  let m = norm(null);
  const r1 = pin(m, { place: '大厅', kind: 'note', text: '手记一' });
  assert.equal(r1.ok, true);
  assert.match(r1.id, /^x[0-9a-z]+$/, '自动 id 是 ASCII');
  m = { items: r1.items };
  const again = pin(m, { place: '大厅', kind: 'note', text: '手记一' });
  assert.equal(again.ok, false); assert.equal(again.reason, 'dup');
  assert.equal(again.id, r1.id, '重算出来的 id 一样（同一条内容不会钉两次）');
  assert.deepEqual(pin(m, { kind: 'note', text: '没地点' }), { items: m.items, ok: false, reason: 'place' });
  assert.equal(pin(m, { place: '大厅', kind: 'image' }).reason, 'ref', '图不带 ref 不写');
  const full = { items: Array.from({ length: MAX_ITEMS }, (_, i) => ({ id: 'k' + i, place: '大厅', kind: 'note' })) };
  assert.equal(pin(full, { place: '大厅', kind: 'note', text: 'x' }).reason, 'full');
  const withId = pin(m, { id: 'sb-1', place: '大厅', kind: 'image', ref: 'i9', at: 5, map: 'tc_mid', w: 100, h: 50, bytes: 2000 });
  assert.equal(withId.ok, true); assert.equal(withId.id, 'sb-1');
  assert.deepEqual(withId.items[1], { id: 'sb-1', place: '大厅', map: 'tc_mid', at: 5, kind: 'image', ref: 'i9', w: 100, h: 50, bytes: 2000 });
});

test('unpin：连带把行交回去（调用方据此删 IndexedDB 里的字节）', () => {
  const p = pin(norm(null), { place: '大厅', kind: 'image', ref: 'i1' });
  const m = { items: p.items };
  const r = unpin(m, p.id);
  assert.equal(r.ok, true);
  assert.equal(r.row.ref, 'i1');
  assert.deepEqual(r.items, []);
  assert.equal(unpin(m, '没有这个 id').ok, false);
  assert.equal(unpin(m, '没有这个 id').row, null);
});

test('byPlace / countOf：按地点翻，图在前手记在后；同名的另一张图不算进来', () => {
  let m = norm(null);
  for (const r of [{ place: '大厅', kind: 'note', text: 'A' }, { place: '大厅', kind: 'image', ref: 'i1' },
    { place: '主人主卧', kind: 'image', ref: 'i2' }, { place: '大厅', kind: 'image', ref: 'i3', map: 'tc_mid' }]) m = { items: pin(m, r).items };
  assert.deepEqual(byPlace(m, '大厅').map(r => r.kind), ['image', 'image', 'note'], '图在前、手记在后');
  assert.deepEqual(countOf(m, '大厅'), { images: 2, notes: 1 });
  assert.deepEqual(countOf(m, '主人主卧'), { images: 1, notes: 0 });
  assert.deepEqual(countOf(m, '没有这个地方'), { images: 0, notes: 0 });
  assert.equal(byPlace(m, '大厅', 'tc_mid').length, 3, '限定地图：写了别的图的被排除（没写地图的行照旧在）');
  assert.equal(byPlace(m, '大厅', 'world').length, 2, '别的图：只剩没写地图的那两条');
});

test('digest / describe：给模型只给数量与地点，不给图；空册子 = 空串', () => {
  let m = norm(null);
  m = { items: pin(m, { place: '大厅', kind: 'image', ref: 'i1' }).items };
  m = { items: pin(m, { place: '大厅', kind: 'note', text: 'A' }).items };
  m = { items: pin(m, { place: '主人主卧', kind: 'image', ref: 'i2' }).items };
  const d = digest(m);
  assert.ok(d.startsWith('见闻录：'), d);
  assert.ok(d.includes('大厅（1 图 / 1 手记）'), d);
  assert.ok(d.includes('主人主卧（1 图 / 0 手记）'), d);
  assert.equal(digest(norm(null)), '');
  assert.ok(digest(m, 20).length <= 20);
  assert.deepEqual(describe(m), { items: 3, images: 2, notes: 1, places: 2 });
  assert.deepEqual(describe(norm(null)), { items: 0, images: 0, notes: 0, places: 0 });
});

test('纯度与登记：core 不许碰 DOM / 存储；键在 core/storage.mjs 登记处', () => {
  const src = readFileSync(new URL('../map/core/scrapbook.mjs', import.meta.url), 'utf8').replace(/\/\/[^\n]*/g, '');
  for (const g of ['window', 'document', 'localStorage', 'indexedDB', 'Mvu', 'SillyTavern']) {
    assert.ok(!new RegExp(`\\b${g}\\b`).test(src), `不该出现 ${g}`);
  }
  const st = readFileSync(new URL('../map/core/storage.mjs', import.meta.url), 'utf8');
  assert.match(st, /edenMapScrap/, '见闻录的本机键要登记（预算与清理靠这张表）');
});
