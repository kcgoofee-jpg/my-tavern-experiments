// 数据源注册表（map/tavern/sources.mjs，arch-v2 §6 第 8 步）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SOURCES, summarize, byId } from '../map/tavern/sources.mjs';

test('登记项齐全、id 唯一、有中英文名', () => {
  assert.deepEqual(SOURCES.map(s => s.id), ['mvu', 'db', 'tags', 'vars']);
  for (const s of SOURCES) { assert.ok(s.label && s.label_en && s.feeds.length); assert.equal(byId(s.id), s); }
});
test('summarize 与 v0.9.6 形状兼容，另加 list', () => {
  const r = summarize({ hasMvu: true, mode: 'mvu', here: 'x', chars: [{ src: 'mvu' }, {}, { src: 'mvu' }], varMap: { a: 1 }, vars: true });
  assert.equal(r.location, 'mvu'); assert.deepEqual(r.mvu, { present: true, mode: 'mvu' }); assert.deepEqual(r.characters, { mvu: 2, infer: 1 });
  assert.deepEqual(r.list.filter(x => x.active).map(x => x.id), ['mvu', 'tags', 'vars']);
  const d = summarize({ hasMvu: false, mode: 'tags', db: { tables: 3, location: true }, here: 'y', hereFromDb: true });
  assert.equal(d.location, 'db'); assert.deepEqual(d.list.filter(x => x.active).map(x => x.id), ['db', 'tags']);
  assert.equal(summarize().location, 'none');
});
test('接线：宿主 sources() 走注册表；设置页显示在读的来源；i18n 有每个来源的名字', () => {
  assert.match(readFileSync(new URL('../map/tavern/eden-map.js', import.meta.url), 'utf8'), /SRCm\.summarize\(ctx\)/);
  assert.match(readFileSync(new URL('../map/app/storage-ui.mjs', import.meta.url), 'utf8'), /s\.src_list/);
  for (const l of ['zh', 'en']) { const d = JSON.parse(readFileSync(new URL(`../map/i18n/${l}.json`, import.meta.url), 'utf8')); for (const s of SOURCES) assert.ok(d['s.src_' + s.id], l + ' ' + s.id); }
});
