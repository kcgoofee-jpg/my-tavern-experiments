// DRAWER-1: hide an event, items folded by pickup place, no repeated buttons, "not an item", self / body stop words, quiet top-bar status.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as P from '../map/core/pickup.mjs';
import { SELF_WORDS } from '../map/core/vocab.mjs';
import { itemOf, mergeRows, foldByPlace } from '../map/core/entities.mjs';
import * as S from '../map/tavern/stash-store.mjs';
import * as RC from '../map/tavern/stash-recompute.mjs';
import * as PR from '../map/core/protocol.mjs';
const R = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// ---- pickup stop words ----
test('self and body words never become items; real things still do', () => {
  for (const t of ['握住了自己。', '他抓起了自己，', '拿起自己的手。', '拿起……肉棒，', '拿起肉棒。', 'She grabs herself.']) assert.deepEqual(P.names(t), [], t);
  assert.deepEqual(P.names('拿起凶器。'), ['凶器']);
  assert.deepEqual(P.names('他捡起一块暗红晶石。'), ['暗红晶石']);
  assert.deepEqual(P.names('拿起自身的衣服。'), ['衣服']);
});
test('the stop list is data (vocab.SELF_WORDS) and a pack extends it through not_items; SCAN_VER moved so old rows are replayed', () => {
  assert.ok(SELF_WORDS.zh.includes('自己') && SELF_WORDS.zh.includes('肉棒'));
  assert.ok(P.SCAN_VER >= 5);
  assert.deepEqual(P.names('拿起凶器。', { vocab: { not_items: ['凶器'] } }), []);
});
test('a row scanned with the old rules is replayed once and the stop word row goes', () => {
  const msgs = [{ msgIndex: 3, text: '他抓起一块暗红晶石，又拿起自己的手。', place: '南侧地窖' }];
  let st = RC.recompute(msgs, {});
  assert.deepEqual(Object.values(st.items).map(r => r.name), ['暗红晶石']);
  const old = S.put(st, { name: '自己', src: 'text', carried: true, msgIndex: 3, mark: 'zz.4' }).stash;   // a row an older build made
  const r = RC.step({ ...old, since: 3, upTo: 3 }, msgs, {});
  assert.deepEqual(Object.values(r.stash.items).map(x => x.name), ['暗红晶石']);
});

// ---- not-item list ----
test('the not-item list hides names from every reader, keeps the rows for a restore, and is an input of the recompute', () => {
  let st = S.put(S.empty(0), { name: '晶石', src: 'text', carried: true, msgIndex: 1 }).stash;
  st = S.put(st, { name: '凶器', src: 'text', carried: true, msgIndex: 2 }).stash;
  const r = S.setNotItem(st, '晶石', true); assert.equal(r.changed, true);
  assert.deepEqual(S.rows(r.stash).map(x => x.name), ['凶器']);
  assert.deepEqual(S.wireRows(r.stash).map(x => x.名), ['凶器']);
  assert.ok(!S.digestLine(r.stash).includes('晶石'));
  assert.deepEqual(S.notItemNames(r.stash), ['晶石']);
  assert.equal(S.setNotItem(r.stash, '晶石', true).changed, false, 'idempotent');
  const back = S.setNotItem(r.stash, '晶石', false);
  assert.deepEqual(S.rows(back.stash).map(x => x.name).sort(), ['凶器', '晶石']);
  assert.deepEqual(S.norm(JSON.parse(JSON.stringify(r.stash))).notItems, ['晶石'], 'survives the chat variable round trip');
  // recompute: same messages + same list = same rows
  const msgs = [{ msgIndex: 1, text: '她捡起一块晶石。' }, { msgIndex: 2, text: '她拿起凶器。' }];
  const a = RC.recompute(msgs, { notItems: ['晶石'] }), b = RC.recompute(msgs, { notItems: ['晶石'] });
  assert.deepEqual(S.rows(a).map(x => x.name), ['凶器']);
  assert.deepEqual(S.rows(a), S.rows(b));
  assert.deepEqual(S.rows(RC.recompute(msgs, {})).map(x => x.name).sort(), ['凶器', '晶石']);
});
test('a name the store no longer holds drops out of the hidden list', () => {
  const st = S.setNotItem(S.put(S.empty(0), { name: '晶石', src: 'text', carried: true, msgIndex: 1 }).stash, '晶石').stash;
  const gone = S.remove(st, '晶石', 5).stash;
  assert.deepEqual(S.notItemNames(gone), []);
});

// ---- folds ----
const row = (name, place, msgIndex, qty) => itemOf({ id: name + msgIndex, name, place, msgIndex, ...(qty ? { qty } : {}) }, () => null, 'text');
test('same-name rows merge into one with the summed quantity, newest first', () => {
  const m = mergeRows([row('晶石', '地窖', 3), row('凶器', '地窖', 9), row('晶石', '地窖', 7, 2)]);
  assert.deepEqual(m.map(r => [r.name, r.qty, r.floor]), [['凶器', 1, 9], ['晶石', 3, 7]]);
});
test('foldByPlace: one group per pickup place, the newest pickup first, no place last, header count = units', () => {
  const g = foldByPlace([row('A', '地窖', 3), row('B', '厨房', 8), row('C', '', 99), row('D', '地窖', 5, 2)]);
  assert.deepEqual(g.map(x => [x.place, x.units, x.floor]), [['厨房', 1, 8], ['地窖', 3, 5], ['', 1, 99]]);
  assert.deepEqual(g[1].rows.map(r => r.name), ['D', 'A']);
});

// ---- viewer markup: no repeated buttons, hide icons, protocol ----
test('the Items tab has no per-row text button for the map; rows and place headers are the jump target', () => {
  const v = R('../map/stash-view.mjs');
  assert.ok(!/button\(uiTextOr\('cu\.fly'/.test(v), 'the text button is gone');
  assert.ok(!/it\.found_at/.test(v), 'the "found at" line is gone (the group header says it)');
  assert.match(v, /itgo/); assert.match(v, /foldByPlace/); assert.match(v, /hideBtn\(r\.name/);
  assert.match(v, /edenMap:chat:' \+ \(chatId \|\| 'local'\) \+ ':itgrp/, 'fold state is kept per chat in local storage');
});
test('events: an icon-only hide button per row, a quiet hidden-N toggle, hidden events leave all()', () => {
  const v = R('../map/events-view.mjs');
  assert.match(v, /HX\.hideBtn\(evKey\(e\)/); assert.match(v, /HX\.hiddenToggle/); assert.match(v, /raw\(\)\.filter\(e => !isHid\(e\)\)/);
  assert.ok(v.split('\n').length <= 400, 'file stays within the length ratchet');
});
test('the hide controls are icon-only with an aria-label', async () => {
  globalThis.window = globalThis.window || {}; globalThis.document = globalThis.document || { getElementById: () => null };
  const H = await import('../map/hide-ui.mjs');
  const b = H.hideBtn('k|a|1', '隐藏这条');
  assert.match(b, /aria-label="隐藏这条"/); assert.match(b, /<svg/); assert.ok(!/>[^<]*隐藏这条[^<]*</.test(b.replace(/<button[^>]*>/, '')), 'no visible text');
  assert.equal(H.hiddenToggle(0, false), ''); assert.match(H.hiddenToggle(2, false), /data-hidtoggle/);
  assert.match(H.hiddenRow('k', 'x'), /data-restore="k"/);
});
test('protocol: eden-map:hide (viewer -> host) and eden-map:hidden (host -> viewer) are declared; the chat variable keeps the keys', () => {
  const pr = R('../map/core/protocol.mjs');
  assert.match(pr, /'eden-map:hide': \[VIEWER_TO_HOST, \{ kind: 'string', key: 'string', on: 'boolean\?' \}\]/);
  assert.match(pr, /'eden-map:hidden': \[HOST_TO_VIEWER, \{ events: 'array\?' \}\]/);
  const rs = R('../map/tavern/root-store.mjs');
  assert.match(rs, /evHide/); assert.match(rs, /\.\.\.\(evHide\.length \? \{ evHide \} : \{\}\)/);
  assert.match(R('../map/tavern/stash-flow.mjs'), /notItems: stashStoreModule\.notItemNames\(stash\)/);
});

// ---- top bar ----
test('top bar: no decorative red dot; the status mark is hidden when loaded, a spinner while loading, a red dot (opens the line picker) when failed', () => {
  const h = R('../map/tavern/host-lifecycle.mjs');
  assert.ok(!/\.em-here::before/.test(h), 'the decorative dot is gone');
  assert.match(h, /\.em-dot\[data-st="ok"\] \{ display: none; \}/);
  assert.match(h, /\.em-dot\[data-st="loading"\][^}]*animation: em-spin/);
  assert.match(h, /\.em-dot\[data-st="fail"\][^}]*var\(--em-alert\)/);
  assert.match(h, /dot\.dataset\.st === 'fail'\) root\.querySelector\('\.em-line'\)\?\.click\(\)/);
  assert.match(h, /viewerStuck\(\) \? 'fail'/, 'HEADER-1: the viewer\'s stuck load shows on the host dot');
  assert.match(h, /prefers-reduced-motion: reduce\) \{ #\$\{ID\} \.em-bar \.em-dot\[data-st="loading"\]/);
});

test('HEADER-1: 「身体」 / 「身子」 are not items (the 「身」 start is read as a quantifier and leaves one character); a counted quantifier still keeps a one-character item', () => {
  for (const t of ['抚摸着她的身体。', '挺起身子，抱住她。', '她拿起身子', '他抓起身体']) assert.deepEqual(P.names(t), [], t);
  assert.deepEqual(P.names('他拿起一把刀。'), ['刀']);
  assert.deepEqual(P.names('拿起一身华服。'), ['华服']);
  assert.ok(P.SCAN_VER >= 6);
});
