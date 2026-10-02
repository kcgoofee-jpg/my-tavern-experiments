// S7-2 T7 (I-06, U-13, U-23): the camera settings of the 3D pages. Idle rotation is runtime state and never writes the key; the wheel mapping is a table; reduced motion disables idle
// rotation. Plus the protocol rows added by S7-2 (eden-map:visible, estate:dispose / estate:disposed, estate:camera with wheelZoom and rm).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { wheelAction, rotateOn, makeIdleTimer } from '../map/ui/camera-controls.js';
import { check } from '../map/core/protocol.mjs';
import { KEYS } from '../map/core/storage.mjs';

const rd = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('wheel mapping table: pinch always zooms, Alt rotates, plain wheel zooms by default (D33) and pans when the setting is off (Shift pans when on)', () => {
  const E = (o = {}) => ({ ctrlKey: false, altKey: false, shiftKey: false, ...o });
  const table = [
    [E({ ctrlKey: true }), false, 'pinch'], [E({ ctrlKey: true }), true, 'pinch'], [E({ altKey: true }), false, 'rotate'], [E({ altKey: true }), true, 'rotate'],
    [E(), false, 'pan'], [E({ shiftKey: true }), false, 'pan'], [E(), true, 'zoom'], [E({ shiftKey: true }), true, 'pan'],
  ];
  for (const [e, on, want] of table) assert.equal(wheelAction(e, on), want, JSON.stringify([e, on]));
  assert.equal(wheelAction(E()), 'zoom', 'the setting defaults to on (D33)');
});
test('rotation: the setting or the idle flag turns it on; reduced motion turns it off whatever else is set', () => {
  assert.equal(rotateOn({}), false); assert.equal(rotateOn({ setting: true }), true); assert.equal(rotateOn({ idle: true }), true);
  assert.equal(rotateOn({ setting: true, idle: true, rm: true }), false); assert.equal(rotateOn({ idle: true, rm: true }), false);
});
test('the idle timer drives runtime state only: it fires onIdle / onActive and writes no storage key', () => {
  const written = []; const prev = globalThis.localStorage; globalThis.localStorage = { setItem: (...a) => written.push(a), getItem: () => null };
  const calls = []; const t = makeIdleTimer(5, () => calls.push('idle'), () => calls.push('active'));
  t.markActive();
  return new Promise(res => setTimeout(() => { assert.deepEqual(calls, ['idle']); t.markActive(); assert.deepEqual(calls, ['idle', 'active']); t.dispose(); globalThis.localStorage = prev; assert.deepEqual(written, []); res(); }, 40));
});
test('neither 3D page writes edenMap3dAutoRotate any more (the old setAutoRotate wrote it on every idle rotation)', () => {
  for (const f of ['map/estate/main.js', 'map/props/viewer3d.html']) { const s = rd(f); assert.doesNotMatch(s, /setItem\([^)]*3dAutoRotate/, f); assert.doesNotMatch(s, /function setAutoRotate/, f); assert.match(s, /rotateOn\(/, f); assert.match(s, /wheelAction\(/, f); }
});
test('the new storage key is registered (default on since D33, owner the camera module) and the settings rows exist', () => {
  assert.deepEqual(KEYS.edenMap3dWheelZoom, { owner: 'ui/camera-controls.js', def: '1' });
  assert.match(rd('map/app/settings-pages.mjs'), /opt3dWheel/); assert.match(rd('map/app/settings-wire.mjs'), /edenMap3dWheelZoom/);
});
test('protocol: eden-map:visible, estate:dispose / estate:disposed and estate:camera (wheelZoom, rm) are registered with typed fields', () => {
  assert.ok(check({ type: 'eden-map:visible', on: false, v: 2 }).ok); assert.equal(check({ type: 'eden-map:visible', on: 'no', v: 2 }).why, 'field:on');
  assert.ok(check({ type: 'estate:dispose', v: 2 }).ok); assert.ok(check({ type: 'estate:disposed', v: 2 }).ok);
  assert.ok(check({ type: 'estate:camera', wheelZoom: true, rm: false, autoRotate: true, v: 2 }).ok); assert.ok(check({ type: 'estate:camera', v: 2 }).ok);
  assert.equal(check({ type: 'estate:camera', wheelZoom: 1, v: 2 }).why, 'field:wheelZoom'); assert.equal(check({ type: 'estate:camera', rm: 'x', v: 2 }).why, 'field:rm');
});
