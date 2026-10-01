import test from 'node:test';
import assert from 'node:assert/strict';
import { appliesHint } from '../map/core/applies-hint.mjs';
import { appliesTo } from '../map/core/layer-spec.mjs';

const names = { view: v => ({ tc_mid: '中层', tc_low: '下层' })[v], node: n => ({ keep: '要塞' })[n], period: p => ({ night: '夜间', dawn: '清晨' })[p], kind: k => ({ tiles: '平面地图' })[k] };
const ctx = { view: 'tc_low', kind: 'schematic', owner: 'x', ancestors: [], nodeType: 'room', period: 'day', dark: false, count: 3 };

test('each key names what is missing in plain words', () => {
  assert.equal(appliesHint({ views: ['tc_mid'] }, ctx, names), '只在 中层 视图');
  assert.equal(appliesHint({ kinds: ['tiles'] }, ctx, names), '只在 平面地图 视图');
  assert.equal(appliesHint({ nodes: ['keep'] }, ctx, names), '只在 要塞 及其下级');
  assert.equal(appliesHint({ node_types: ['city'] }, ctx, names), '只在特定类型的地点');
  assert.equal(appliesHint({ periods: ['night', 'dawn'] }, ctx, names), '只在 夜间、清晨');
  assert.equal(appliesHint({ dark: true }, ctx, names), '只在夜间');
  assert.equal(appliesHint({ dark: false }, { ...ctx, dark: true }, names), '只在白天');
  assert.equal(appliesHint({ mvu: { path: 'a.b.c', truthy: true } }, ctx, names), '仅在特定状态下');
});
test('a key that holds yields no part; nothing failing -> null; data alone -> null (the row is hidden, nothing to explain)', () => {
  assert.equal(appliesHint({ views: ['tc_low'] }, ctx, names), null);
  assert.equal(appliesHint({}, ctx, names), null); assert.equal(appliesHint(undefined, ctx, names), null);
  assert.equal(appliesHint({ data: true }, { ...ctx, count: 0 }, names), null);
  assert.equal(appliesTo({ data: true }, { ...ctx, count: 0 }), false);   // appliesTo says "no", the hint says "nothing to explain"
});
test('at most two parts, joined by a middle dot, in the order views, kinds, nodes, node types, periods, dark, state', () => {
  const h = appliesHint({ views: ['tc_mid'], kinds: ['tiles'], periods: ['night'], dark: true }, ctx, names);
  assert.equal(h, '只在 中层 视图 · 只在 平面地图 视图');
  assert.equal(h.split(' · ').length, 2);
});
test('output never carries an id, a slash or a path: an unnamed id becomes a generic word', () => {
  const bare = appliesHint({ views: ['tc_secret/x'], kinds: ['model3d'], nodes: ['a.b.c'], periods: ['late'] }, ctx, {});
  assert.doesNotMatch(bare, /[\/\\]|[a-z]{3,}|\./); assert.equal(bare, '只在 特定 视图 · 只在 特定 视图');
  assert.doesNotMatch(appliesHint({ nodes: ['a.b.c'] }, ctx, { node: () => 'a/b' }), /[\/.]/);
  assert.equal(appliesHint({ periods: ['late'] }, ctx, {}), '只在 特定时段');
});
test('the caller supplies the templates (i18n); a missing template falls back to the plain Chinese text', () => {
  assert.equal(appliesHint({ dark: true }, ctx, { t: k => (k === 'lyr.only_night' ? 'Night only' : null) }), 'Night only');
  assert.equal(appliesHint({ views: ['tc_mid'] }, ctx, { ...names, t: (k, v) => (k === 'lyr.only_view' ? `Only in ${v.x}` : null) }), 'Only in 中层');
});
