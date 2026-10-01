// S7-1 T7 / T7b (docs/todo.md N10 items 11, 12, 13, 15): plain wording and where things moved. Source-level checks (the browser side is in the s7_shots probe).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const rd = f => fs.readFileSync(fileURLToPath(new URL('../' + f, import.meta.url)), 'utf8');
const zh = JSON.parse(rd('map/i18n/zh.json')), en = JSON.parse(rd('map/i18n/en.json'));

test('(12) the first-run hint has three plain steps; the last one names where settings are at that width', () => {
  const src = rd('map/app/notice-layer.mjs'), fn = src.slice(src.indexOf('export function firstRunHint'), src.indexOf('// 只有关掉或点了按钮才算看过'));
  assert.deepEqual([...new Set([...fn.matchAll(/uiTextOr\('(hint\.[\w.]+)'/g)].map(m => m[1]))].filter(k => !['hint.title', 'hint.settings', 'hint.ok'].includes(k)), ['hint.1', 'hint.2', 'hint.3', 'hint.3d']);
  assert.match(fn, /narrowNow\(\) \? uiTextOr\('hint\.3'/);
  assert.ok(!('hint.4' in zh) && !('hint.1b' in zh) && !('hint.4' in en));
  assert.match(zh['hint.3'], /⋯/); assert.match(zh['hint.3d'], /右上角/);
  assert.doesNotMatch(zh['s.tick_hint'] + zh['s.tick'], /静默|缓存|推演/); assert.doesNotMatch(en['s.tick_hint'] + en['s.tick'], /tick|cache/i);
});
test('(11) hints name the thing and never the default; the night tint has its own title and neutral wording; one shortcut row', () => {
  for (const k of ['s.keys', 's.minimap_hint', 's.inject_hint', 'cu.sync_hint2']) { assert.doesNotMatch(zh[k], /默认/, k); assert.doesNotMatch(en[k], /by default|default off|off by default/i, k); }
  assert.ok(zh['cu.night_t'] && zh['cu.night'] && !/上层|中层/.test(zh['cu.night']) && !/Upper|Middle/.test(en['cu.night']));
  assert.doesNotMatch(rd('map/app/settings-pages.mjs'), /s\.kbd_group/); assert.equal((rd('map/app/settings-pages.mjs').match(/id="kbdBtn"/g) || []).length, 1);
  assert.match(rd('map/app/settings-pages.mjs'), /<details id="devBox">[\s\S]*id="build"[\s\S]*id="optFps"[\s\S]*id="hereDev"/, 'build code, debug FPS and the standalone place input are in the developer group');
});
test('(13) each layer row shows its title as a muted second line (small, not a tooltip only)', () => {
  const s = rd('map/app/layer-host.mjs');
  assert.match(s, /desc = document\.createElement\('small'\)/); assert.match(s, /className = 'lyt'/);
});
test('(15) the roster suffix is gone from the UI (the data still carries the source)', () => {
  assert.doesNotMatch(rd('map/characters-view.mjs'), /from_card/); assert.ok(!('ch.from_card' in zh) && !('ch.from_card' in en));
  assert.match(rd('map/characters-view.mjs'), /<small>\$\{esc\(it\.identity \|\| ''\)\}\$\{c \?/);
});
test('the build line replaces the version number in the sheet: no v0.9.x in the about box', () => {
  const s = rd('map/app/settings.mjs'); assert.doesNotMatch(s, /地图版本'\)\}<\/b> v\$/); assert.match(s, /buildMismatch/);
  const b = rd('map/app/about-build.mjs'); assert.match(b, /export function buildTag/);
});
