// I-19: the state line only looks at texts that reach the model; I-16: the three states of the credits page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modelTexts, injectReason } from '../map/tavern/model-texts.mjs';
import { cardHas, stateLine } from '../map/tavern/interaction-modes.mjs';
import { cardState, cardStateText } from '../map/app/card-state.mjs';

const PATHS = { location: '世界.当前地点', time: '世界.当前时刻', present: '在场人物' };
const SCRIPT = 'const loc = stat_data.世界.当前地点; const t = getvar("世界.当前时刻"); stat_data.在场人物.forEach(x => x);';
const has = (t, p) => ({ ...NONE, ...cardHas(t, p) });   // cardHas returns {} when there is no text at all
const NONE = { here: false, time: false, present: false, trips: false }, ALL = { here: true, time: true, present: true, trips: false };

test('only a display script / regex script references the paths: nothing is skipped', () => {
  const card = { description: '一座庄园。', extensions: { regex_scripts: [{ replaceString: `<script>${SCRIPT}</script>` }], tavern_helper: { scripts: [{ content: SCRIPT }] } }, first_mes: SCRIPT, mes_example: SCRIPT };
  const sk = has(modelTexts({ card }), PATHS);
  assert.deepEqual(sk, NONE);
  const line = stateLine({ here: '大厅', present: ['甲'], time: '03:18', trips: [], state: 'ok', skip: sk });
  assert.match(line, /地点：大厅.*在场：甲.*时间：03:18/);
});

test('a worldbook entry with the whole stat_data macro skips everything; a disabled entry does not count', () => {
  const on = { character_book: { entries: [{ enabled: true, content: '状态：{{get_message_variable::stat_data}}' }] } };
  assert.deepEqual(has(modelTexts({ card: on }), PATHS), ALL);
  const off = { character_book: { entries: [{ enabled: false, content: '{{get_message_variable::stat_data}}' }] } };
  assert.deepEqual(has(modelTexts({ card: off }), PATHS), NONE);
  assert.deepEqual(has(modelTexts({ card: {}, books: [[{ enabled: true, content: '{{get_message_variable::stat_data}}' }]] }), PATHS), ALL, 'bound book');
  assert.deepEqual(has(modelTexts({ card: {}, books: [[{ enabled: true, content: '{{get_message_variable::stat_data}}', extra: { eden_id: 'x' } }]] }), PATHS), NONE, 'our own entries do not count');
});

test('model-visible sources: description, personality, scenario, system prompt, post-history, note, enabled preset prompts', () => {
  const t = modelTexts({ card: { description: 'a', personality: 'b', scenario: 'c', system_prompt: 'd', post_history_instructions: 'e' }, note: 'n', preset: [{ content: 'p1', enabled: true }, { content: 'p2', enabled: false }, { content: 'p3' }] });
  assert.deepEqual(t, ['a', 'b', 'c', 'd', 'e', 'n', 'p1', 'p3']);
  assert.deepEqual(modelTexts(), []); assert.deepEqual(modelTexts({ card: null, books: 5, preset: 'x' }), []);
});

test('a direct stat_data.<path> reference in the description skips only that field', () => {
  assert.deepEqual(has(modelTexts({ card: { description: '地点见 stat_data.世界.当前地点' } }), PATHS), { ...NONE, here: true });
});

test('injection preview reasons: switch off / all skipped / nothing yet / text means no reason', () => {
  assert.equal(injectReason({ on: false, text: 'x' }), 'off');
  assert.equal(injectReason({ on: true, text: '[地图状态] 地点：甲' }), '');
  assert.equal(injectReason({ on: true, text: '', skip: { here: true, time: true, present: true } }), 'skipped');
  assert.equal(injectReason({ on: true, text: '', skip: { here: true } }), 'empty');
  assert.equal(injectReason({ on: true, text: '' }), 'empty');
});

test('credits page states: no host / host without card info / card info present', () => {
  assert.deepEqual(cardState({ embedded: false, card: null }), { kind: 'no_host' });
  assert.equal(cardStateText(cardState({ embedded: false, card: null }))[1], '未接入酒馆，读不到角色卡信息');
  const nc = cardState({ embedded: true, card: null, tried: ['bridge', 'context'] });
  assert.deepEqual(nc, { kind: 'no_card', tried: ['bridge', 'context'] });
  const [k, zh, v] = cardStateText(nc);
  assert.equal(k, 's.lic_no_card'); assert.ok(!zh.includes('未接入酒馆')); assert.equal(v.tiers, 'bridge / context'); assert.match(zh, /重新打开地图/);
  assert.deepEqual(cardState({ embedded: true, card: null, tried: [] }), { kind: 'no_card', tried: ['none'] });
  assert.deepEqual(cardState({ embedded: true, card: null }), { kind: 'no_card', tried: ['none'] });
  assert.deepEqual(cardState({ embedded: true, card: { name: 'x' } }), { kind: 'ok' }); assert.equal(cardStateText({ kind: 'ok' }), null);
});
