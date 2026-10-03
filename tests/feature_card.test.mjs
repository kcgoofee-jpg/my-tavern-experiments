// S7-1 T2: the pure card model (map/app/feature-card.mjs cardModel): icons per state, idle, the template line, consent, saved, text and token lines.
// FIX-3 (COPY-1): the four state icons are names in the one icon set (map/ui/icons.js), not text glyphs; the glyphs are gone from the source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
globalThis.window = {};
const { cardModel, ICONS, testVerdict } = await import('../map/app/feature-card.mjs');
const D = { id: 'state', sw: 'thInjOn', cost: true, tpl: true };
test('icons are shapes: working check, not effective alert, idle waiting clock, off barred circle; each has a label', () => {
  assert.deepEqual(ICONS, { working: 'check', 'not-effective': 'alert', idle: 'wait', off: 'off' });
  const src = readFileSync(fileURLToPath(new URL('../map/app/feature-card.mjs', import.meta.url)), 'utf8');
  assert.doesNotMatch(src, /[✓◷–]/, 'no text glyphs left in the feature card');
  // every name must exist in the one icon set, and the four must be four different shapes
  const icons = readFileSync(fileURLToPath(new URL('../map/ui/icons.js', import.meta.url)), 'utf8');
  const paths = Object.fromEntries([...icons.matchAll(/^\s{4}(\w+):\s*'([^']+)'/gm)].map(m => [m[1], m[2]]));
  const shapes = Object.values(ICONS).map(n => paths[n]);
  for (const n of Object.values(ICONS)) assert.ok(shapes.includes(paths[n]) && paths[n], `icons.js has no glyph for ${n}`);
  assert.equal(new Set(shapes).size, 4, 'the four states are four different shapes');
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

test('consent gate: only the answer with the nonce of the request just sent counts; a stale ok never unlocks (passSig unchanged)', () => {
  let passSig = '', asked = null;
  const apply = t => { const v = testVerdict(t, asked); if (v.pass) passSig = asked.sig; if (v.take) asked = null; return v; };
  asked = { sig: 'A', nonce: 'n1' }; apply({ ok: true, nonce: 'n1' }); assert.equal(passSig, 'A');
  passSig = ''; asked = { sig: 'B', nonce: 'n2' };
  assert.deepEqual(apply({ ok: true, nonce: 'n1' }), { take: false, pass: false }); assert.equal(passSig, '', 'the stale ok from the earlier test is ignored');
  assert.equal(testVerdict({ ok: true }, asked).take, false); assert.equal(testVerdict({ ok: true, nonce: 'n2' }, null).take, false);
  assert.deepEqual(apply({ ok: false, nonce: 'n2' }), { take: true, pass: false }); assert.equal(asked, null);
});
test('the consent form shows the no-consent reason, not "off", while consent is missing', () => {
  const m = cardModel({ id: 'nav', sw: 'thNav', consent: true }, { on: false, state: 'off' }, { consent: false });
  assert.equal(m.line, '还没有同意');
});
