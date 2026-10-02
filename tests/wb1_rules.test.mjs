// WB-1 (D43): the add-on after the setting rewrite. Builder output = committed ship; every entry enabled; the JIT gives back what it disabled;
// the parsers accept the near-misses models write; the rules entry carries one worked example per parser and each example's form parses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as E from '../map/tavern/events-parse.mjs';
import * as C from '../map/tavern/characters-parse.mjs';
import * as V from '../map/tavern/mvu-readers.mjs';
import * as I from '../map/tavern/interaction-modes.mjs';
import * as W from '../map/tavern/worldbook-sync.mjs';
import * as J from '../map/tavern/worldbook-jit.mjs';
import { packGeo } from '../tools/eden_geo.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const rd = p => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const SHIP = rd('map/data/worldbook_addon.json');
const RULES = SHIP.entries.find(e => e.id === 'map.link-rules');
const PACK_EX = rd('map/packs/eden/overlay.v2.json').llm['x-tag-examples'];
const span = s => `<span style="display:none">${s}</span>`;
E.setGeo(packGeo('eden'));

test('builder output equals the committed ship', { timeout: 120000 }, () => {
  const d = mkdtempSync(join(tmpdir(), 'wb1-'));
  try {
    const r = spawnSync('python3', ['tools/build_worldbook_addon.py', '--ship', '--out', join(d, 'book.json')], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, EDEN_SHIP_OUT: join(d, 'ship.json') } });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(readFileSync(join(d, 'ship.json'), 'utf8')), SHIP, 'rerun tools/build_worldbook_addon.py --ship');
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('every entry is enabled (the readme excepted); keyword entries stay keyword-triggered; three constants, the rules at depth 2', () => {
  assert.ok(SHIP.entries.every(e => e.enabled === true || e.id === 'map.readme'));
  const con = SHIP.entries.filter(e => e.strategy.type === 'constant').map(e => e.id);
  assert.deepEqual(con, ['map.link-rules', 'map.event-types', 'map.current-location']);
  assert.ok(SHIP.entries.filter(e => !con.includes(e.id) && e.id !== 'map.readme').every(e => e.strategy.type === 'selective' && e.strategy.keys.length > 0));
  assert.deepEqual(RULES.position, { type: 'at_depth', role: 'system', depth: 2, order: 900 });
  assert.ok(!SHIP.entries.some(e => e.id === 'map.character-location'), 'merged into the rules');
  assert.equal(SHIP.aliases.ids['map.character-location'], 'map.link-rules');
  for (const id of ['tiancheng.lore.tier-upper', 'tiancheng.lore.tier-mid', 'tiancheng.lore.tier-lower']) assert.ok(SHIP.entries.some(e => e.id === id), id);
});

test('the rules entry: short, one block per tag, no older wording', () => {
  const t = RULES.content, cjk = [...t].filter(c => c >= '一' && c <= '鿿').length;
  assert.ok(cjk <= 600, `${cjk} Chinese characters`);
  for (const h of ['【地点】', '【人物】', '【事件】', '【事实】', '【改名 / 用途】', '【物品】', '【提醒】']) assert.ok(t.includes(h), h);
  assert.doesNotMatch(t, /多数楼层一个标签都没有|data-tcmap/);
  const here = SHIP.entries.find(e => e.id === 'map.current-location').content;
  assert.doesNotMatch(here, /⌖/, 'the vocabulary entry teaches no tag');
});

test('the OOC templates use the rules words', () => {
  const zh = rd('map/i18n/zh.json');
  for (const [id, h] of [['place', '【地点】'], ['chars', '【人物】'], ['event', '【事件】'], ['items', '【物品】']]) {
    assert.ok(zh['ooc.tpl.' + id].includes(h), id); assert.ok(zh['ooc.tpl.' + id].includes('地图标签') || id === 'items', id);
  }
  assert.ok(RULES.content.includes('地图标签'));
  assert.ok(E.isExample('⌖类型｜层·地点｜等级｜一句话｜发布方'), 'the event template line is an example');
});

test('each worked example in the rules parses in its exact form, and a verbatim copy does not land', () => {
  const lines = [...RULES.content.matchAll(/<span style="display:none">([^<]*)<\/span>/g)].map(m => m[1]);
  assert.equal(lines.length, 6);
  const ev = lines.find(l => /^⌖[^ ]+｜/.test(l)), pl = lines.find(l => l.startsWith('⌖地点')), ch = lines.find(l => l.startsWith('⌖人物')),
    fa = lines.find(l => l.startsWith('⌖事实')), rn = lines.find(l => l.startsWith('⌖改名')), us = lines.find(l => l.startsWith('⌖用途'));
  assert.ok(ev && pl && ch && fa && rn && us);
  // the form: swap the free text, everything else exactly as taught
  const evx = E.parseMarks(span(ev.replace(/｜[^｜]+｜([^｜]+)$/, '｜测试标题｜$1')));
  assert.equal(evx.length, 1); assert.equal(evx[0].cat, '网络攻击'); assert.equal(evx[0].layer, '中层'); assert.equal(evx[0].lvl, 2); assert.equal(evx[0].src, '天城一台');
  assert.equal(I.parseHereTag(span(pl.replace('辉光大教堂', '天城执法局总局'))), '天城·中层·天城执法局总局');
  assert.deepEqual(C.parseChars(span(ch.replace('绫濑遥', '某人'))), [{ name: '某人', place: '伊甸庄园·东侧长廊' }]);
  assert.deepEqual(V.parseCustomTags(span(fa.replace('暗门', '暗格'))), [{ op: 'fact', key: '会客厅', value: '暗格通主人专用通道' }]);
  assert.deepEqual(V.parseCustomTags(span(rn.replace('星图室', '画室'))), [{ op: 'name', key: '书房', value: '画室' }]);
  assert.deepEqual(V.parseCustomTags(span(us.replace('整理', '收拾'))), [{ op: 'note', key: '书房', value: '收拾旧地图' }]);
  // verbatim: ignored once the pack's example list is loaded (the host does this in tavern/event-geo-load.mjs)
  C.setExamples(PACK_EX); V.setCustomExamples(PACK_EX); I.configure({ examples: PACK_EX });
  try {
    const all = lines.map(span).join('\n');
    assert.equal(E.parseMarks(all).length, 0); assert.equal(C.parseChars(all).length, 0); assert.equal(V.parseCustomTags(all).length, 0); assert.equal(I.parseHereTag(all), null);
  } finally { C.setExamples([]); V.setCustomExamples([]); I.configure({}); }
});

test('parser tolerance: space after ⌖, full / half-width separators, extra spaces, hidden spans, a trailing 。', () => {
  // characters
  for (const s of ['⌖ 人物 雷恩 @ 下层·7号井', '⌖人物：雷恩＠下层·7号井', '⌖人物  雷恩  @  下层·7号井。', span('⌖人物 雷恩 @ 下层·7号井'), '<span style="display: none;">⌖人物 雷恩 ＠ 下层·7号井</span>', '<span style="display:none" data-tcmap="人物＝雷恩；地点=下层·7号井。"></span>'])
    assert.deepEqual(C.parseChars(s), [{ name: '雷恩', place: '下层·7号井' }], s);
  // place
  for (const s of ['⌖ 地点 中层·霓虹街', '⌖地点：中层·霓虹街。', span('⌖地点 中层·霓虹街'), '<span style="display: none;">⌖地点  中层·霓虹街</span>'])
    assert.equal(I.parseHereTag(s), '中层·霓虹街', s);
  // custom tags
  for (const s of ['⌖ 改名 客房 -> 画室。', '⌖改名 客房 ＞ 画室', span('⌖改名：客房 → 画室')]) assert.deepEqual(V.parseCustomTags(s), [{ op: 'name', key: '客房', value: '画室' }], s);
  for (const s of ['⌖ 事实 会客厅:暗门通往花园。', span('⌖事实 会客厅：暗门通往花园')]) assert.deepEqual(V.parseCustomTags(s), [{ op: 'fact', key: '会客厅', value: '暗门通往花园' }], s);
  // events, compact and field forms
  for (const s of ['⌖ 火灾｜中层·霓虹街｜3｜仓库起火｜天城一台', '⌖火灾|中层·霓虹街|3|仓库起火|天城一台。', '⌖火灾 ｜ 中层·霓虹街 ｜ 3 ｜ 仓库起火 ｜ 天城一台', span('⌖火灾｜中层·霓虹街｜3｜仓库起火｜天城一台'),
    '<span style="display: none;" data-tcmap="类型＝火灾；地点=中层·霓虹街;标题=仓库起火。;等级=3;来源=天城一台"></span>']) {
    const r = E.parseMarks(s);
    assert.equal(r.length, 1, s); assert.equal(r[0].cat, '火灾', s); assert.equal(r[0].layer, '中层', s); assert.equal(r[0].lvl, 3, s); assert.equal(r[0].text, '仓库起火', s); assert.equal(r[0].src, '天城一台', s);
  }
  assert.equal(E.parseMarks('```\n⌖火灾｜中层·霓虹街｜3｜仓库起火\n```').length, 0, 'code blocks stay examples');
});

test('D43 sync: our entries enabled after an update, whatever the older install left; the JIT keeps only its own while on', () => {
  const ship = { ver: '2+b', entries: [{ id: 'a', name: 'A', content: 'A', enabled: true, strategy: { type: 'selective', keys: ['甲'] } }, { id: 'b', name: 'B', content: 'B', enabled: true, strategy: { type: 'selective', keys: ['乙'] } }, { id: 'c', name: 'C', content: 'C', enabled: true, strategy: { type: 'constant', keys: [] } }] };
  const S = W.shipped(ship);
  const installed = [
    { ...S.entries[0], uid: 1, enabled: false, extra: { ...S.entries[0].extra, eden_jit: 1 } },                 // the JIT switched it off
    { ...S.entries[1], uid: 2, enabled: false, extra: { ...S.entries[1].extra, eden_jit_ignore: 1 } },          // switched off by hand in an older install
    { ...S.entries[2], uid: 3, enabled: false, content: 'C mine', extra: { ...S.entries[2].extra } },            // edited and off
    { uid: 4, name: 'user', content: 'u', enabled: false, extra: {} },                                         // the user's own entry: untouched
  ];
  const off = W.merge(installed, ship);
  assert.deepEqual(off.map(e => e.enabled), [true, true, true, false]);
  assert.equal(off[0].extra.eden_jit, undefined); assert.equal(off[2].content, 'C mine');
  assert.deepEqual(W.plan(installed, ship).enable, ['A', 'B', 'C']); assert.ok(W.plan(installed, ship).changed);
  const on = W.merge(installed, ship, { jit: true });
  assert.deepEqual(on.map(e => e.enabled), [false, true, true, false]);
  assert.deepEqual(W.plan(installed, ship, { jit: true }).enable, ['B', 'C']);
  assert.deepEqual(W.merge(off, ship), off, 'idempotent'); assert.equal(W.plan(off, ship).enable.length, 0);
});

test('D43 JIT off: every entry the JIT disabled comes back, nothing else is touched', () => {
  const ents = [{ enabled: false, extra: { eden_id: 'a', eden_jit: 1 } }, { enabled: false, extra: { eden_id: 'b', eden_jit_ignore: 1 } }, { enabled: true, extra: { eden_id: 'c', eden_jit: 0 } }, { enabled: false, extra: {} }];
  assert.deepEqual(J.restorePlan(ents), [{ id: 'a', enabled: true, extra: { eden_jit: 0 } }]);
  assert.deepEqual(J.restorePlan(null), []);
});
