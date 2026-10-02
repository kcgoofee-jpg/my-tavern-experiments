// U-FIX-5 (TT sweep-1 P2 batch): the pure parts — the place field's 「楼 · 房间」 (H2-01), the creator note without tool paths (S-04),
// neutral data-page words (S-02), the stale debug flag (S-05), Esc from the viewer naming its source (X-01). Browser parts: tools/browser/ufix_r1.mjs --only=ufix5.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chainOf } from '../map/tavern/spatial-contract.mjs';
import { cleanNotes, pick } from '../map/tavern/card-source.mjs';
import { summarize, SOURCES } from '../map/tavern/data-source-registry.mjs';
import { KEYS } from '../map/core/storage.mjs';
import { check } from '../map/core/protocol.mjs';

const R = p => fileURLToPath(new URL('../' + p, import.meta.url));
const reg = JSON.parse(readFileSync(R('map/data/maps.json'), 'utf8'));

test('H2-01: a room alone, or with its building, reads 「楼 · 房间」; a place that is not a room is left to the caller', () => {
  assert.equal(chainOf(reg, '主卧'), '伊甸庄园 · 主卧');
  assert.equal(chainOf(reg, '伊甸庄园·主卧'), '伊甸庄园 · 主卧');
  assert.equal(chainOf(reg, '天城议会'), null);
  assert.equal(chainOf(reg, ''), null);
});

test('S-04: a tool path in the creator note is not shown; a plain note is untouched', () => {
  assert.equal(cleanNotes('作者原创（参数见 tavern/scripts/tune_x_card.py）。欢迎游玩'), '作者原创。欢迎游玩');
  assert.doesNotMatch(cleanNotes('本卡由 tools/a/b.sh 调整'), /\.sh/);
  assert.equal(cleanNotes('plain note, v1.5'), 'plain note, v1.5');
  assert.doesNotMatch(pick({ data: { name: 'x', creator_notes: '<p>see scripts/tune.py</p>' } }).notes, /tune\.py/);
});

test('S-02: the chat-variable source has a neutral label; the summary keeps its ids for the page to word', () => {
  assert.doesNotMatch(SOURCES.find(s => s.id === 'vars').label, /[a-z_]{4,}/);
  const s = summarize({ hasMvu: true, mode: 'mvu', chars: [{ src: 'infer' }, { src: 'mvu' }] });
  assert.deepEqual(s.characters, { infer: 1, mvu: 1 });
  const zh = JSON.parse(readFileSync(R('map/i18n/zh.json'), 'utf8'));
  for (const k of ['s.mode_mvu', 's.mode_mvu_partial', 's.mode_tags', 's.chsrc_infer', 's.chsrc_mvu', 's.chsrc_tag', 's.chsrc_other']) assert.ok(zh[k] && !/infer|_/.test(zh[k]), k);
});

test('S-05: the debug fps flag lives under a new key (a stale edenMapFps = 1 is ignored), default off', () => {
  assert.equal(KEYS.edenMapDebugFps?.def, '0');
  assert.ok(!('edenMapFps' in KEYS));
});

test('X-01: eden-map:esc may name its source; the host closes the replay bar first on a key Esc', () => {
  assert.equal(check({ type: 'eden-map:esc', from: 'key' }).ok, true); assert.equal(check({ type: 'eden-map:esc' }).ok, true); assert.equal(check({ type: 'eden-map:esc', from: 3 }).ok, false);
  assert.equal(check({ type: 'eden-map:clock', view: 'day' }).ok, true);
  assert.match(readFileSync(R('map/tavern/eden-map.js'), 'utf8'), /e\.data\.from === 'key' && !TL\.tlEl\.hidden\) TL\.tlExit\(\)/);
});
