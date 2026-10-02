// 迷雾探索（core/depth.mjs + app/fog.mjs + 宿主 eden_map.探索）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { norm, visit, known, count, MAX_PER_MAP } from '../map/core/exploration-ledger.mjs';
import { HOST_SRC } from './_host_src.mjs';

test('norm：坏数据不抛，只留合法 id / 名字，去重', () => {
  assert.deepEqual(norm(null), {}); assert.deepEqual(norm([1]), {}); assert.deepEqual(norm('x'), {});
  assert.deepEqual(norm({ tc_low: ['a', 'a', ' b ', 3, ''], 'bad id!': ['x'], tc_mid: 'no' }), { tc_low: ['a', 'b'] });
});
test('visit：记一次、重复不变、限量、不改原对象', () => {
  const a = {}; const r = visit(a, 'tc_low', '货运站'); assert.ok(r.changed); assert.deepEqual(a, {});
  assert.equal(visit(r.ex, 'tc_low', '货运站').changed, false); assert.ok(known(r.ex, 'tc_low', '货运站')); assert.equal(count(r.ex), 1);
  let e = {}; for (let i = 0; i < MAX_PER_MAP + 5; i++) e = visit(e, 'm', 'p' + i).ex; assert.equal(e.m.length, MAX_PER_MAP); assert.equal(e.m.at(-1), 'p' + (MAX_PER_MAP + 4));
  assert.equal(visit({}, '../x', 'a').changed, false);
});
test('接线：默认开（2026-09-28 起）、按聊天存 eden_map.探索、协议登记', () => {
  const rd = f => readFileSync(new URL('../map/' + f, import.meta.url), 'utf8');
  const v = rd('viewer.html'), sp = rd('app/settings-pages.mjs'), h = HOST_SRC, p = rd('core/protocol.mjs'), s = rd('core/storage.mjs');
  assert.match(v, /<script type="module" src="app\/fog\.mjs"/); assert.match(sp, /id="optFog"|'optFog'/); assert.doesNotMatch(sp, /id="optFog"[^>]*checked/);
  assert.match(s, /edenMapFog: \{ pref: true, owner: 'app\/fog\.mjs', def: '1' \}/);
  assert.match(h, /探索: explored/); assert.match(h, /eden-map:explore'/);
  for (const k of ['eden-map:explore', 'eden-map:explore-reset', 'eden-map:fog']) assert.ok(p.includes(`'${k}'`), k);
});
