// S7-1 T2: the pure card model (map/app/feature-card.mjs cardModel): icons per state, idle, the template line, consent, saved, text and token lines.
import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window = {};
const { cardModel, ICONS } = await import('../map/app/feature-card.mjs');
const D = { id: 'state', sw: 'thInjOn', cost: true, tpl: true };
test('icons are shapes: working check, not effective bang, idle clock, off dash; each has a label', () => {
  assert.deepEqual(ICONS, { working: '✓', 'not-effective': '!', idle: '◷', off: '–' });
  for (const s of ['working', 'not-effective', 'idle', 'off']) { const m = cardModel(D, { on: s !== 'off', state: s }); assert.equal(m.icon, ICONS[s]); assert.ok(m.iconLabel); assert.equal(m.state, s); }
});
test('the health line: ok with floor, not effective with the fixed reason, idle waits, off', () => {
  assert.equal(cardModel(D, { on: true, state: 'working', floor: 128 }).line, '正常 · 上次生效：第 128 楼');
  assert.equal(cardModel(D, { on: true, state: 'not-effective', reason: 'no-place' }).line, '未生效：当前地点不在任何地图上');
  assert.equal(cardModel(D, { on: true, state: 'idle' }).line, '等待下一次回复');
  assert.equal(cardModel(D, { on: false, state: 'off' }).line, '已关闭');
  assert.equal(cardModel(D, { on: true, state: 'not-effective', reason: 'endpoint', stats: { status: 401 } }).line, '未生效：上次请求失败（HTTP 401）');
});
test('what it does now: the text with its token line; nothing sent says so; the template line names the source', () => {
  const m = cardModel(D, { on: true, state: 'working', text: '[地图状态] 地点：书房', tokens: 9 }, { tplPack: false });
  assert.deepEqual([m.text, m.tokensText, m.tpl], ['[地图状态] 地点：书房', '≈ 9 token', '模板：内核']);
  assert.equal(cardModel(D, { on: true, state: 'working', text: 'x' }, { tplPack: true }).tpl, '模板：本设定包');
  assert.equal(cardModel(D, { on: true, state: 'idle' }).now, '目前没有发送内容');
  assert.equal(cardModel({ id: 'macros' }, { on: true, state: 'working' }).tpl, '');
});
test('the consent block shows while consent is missing; saved shows the receipt; a card without a switch is on', () => {
  const N = { id: 'nav', sw: 'thNav', consent: true };
  assert.equal(cardModel(N, { on: false, state: 'off' }, { consent: false }).needsConsent, true);
  assert.equal(cardModel(N, { on: true, state: 'idle' }, { consent: true }).needsConsent, false);
  assert.equal(cardModel(D, { on: true, state: 'working' }, { saved: true }).saved, '已保存');
  const d = cardModel({ id: 'digest', noSwitch: true }, { on: true, state: 'working' }); assert.deepEqual([d.canSwitch, d.on], [false, true]);
});
test('a host without the interface shows the interface name as the reason, never as sent text', () => {
  const m = cardModel(D, { on: true, state: 'not-effective', reason: 'no-host-api', text: 'injectPrompts' });
  assert.equal(m.text, ''); assert.match(m.line, /injectPrompts/);
});
