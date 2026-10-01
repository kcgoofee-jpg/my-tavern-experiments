// Where a base image sits (core/base-frame.mjs, N10-P0): one world unit wide whatever the pixel count; period DZIs keep the view's shape.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { baseFrame, aspectDrift } from '../map/core/base-frame.mjs';

const root = fileURLToPath(new URL('../map/', import.meta.url));
const maps = JSON.parse(readFileSync(root + 'data/maps.json', 'utf8')).maps;
const dziSize = src => { const m = readFileSync(root + src, 'utf8').match(/Width="(\d+)"\s+Height="(\d+)"/); return [+m[1], +m[2]]; };

test('baseFrame: always unit width at the origin, aspect from the extent', () => {
  assert.deepEqual(baseFrame([3000, 1875]), { x: 0, y: 0, width: 1, aspect: 0.625 });
  assert.deepEqual(baseFrame([1600, 1600]), { x: 0, y: 0, width: 1, aspect: 1 });
  for (const bad of [undefined, null, [], [0, 5], [5, 0], ['a', 'b'], [NaN, 1], [Infinity, 1]]) assert.deepEqual(baseFrame(bad), { x: 0, y: 0, width: 1, aspect: 0 });
});

test('aspectDrift: pixel count does not matter, shape does', () => {
  assert.equal(aspectDrift([3000, 1875], [16000, 10000]), 0);
  assert.equal(aspectDrift([3000, 1875], [8000, 5000]), 0);
  assert.ok(aspectDrift([3000, 1875], [8000, 4000]) > 0.15);
  assert.equal(aspectDrift(undefined, [8000, 5000]), 0);
  assert.equal(aspectDrift([3000, 1875], [0, 0]), 0);
});

test('every period base of tc_upper / tc_mid / tc_low has the view shape (<= 0.5 %)', () => {
  for (const id of ['tc_upper', 'tc_mid', 'tc_low']) {
    const m = maps[id];
    for (const src of [m.base, ...Object.values(m.periods)]) assert.ok(aspectDrift(m.view.extent_m, dziSize(src)) <= 0.005, `${id} ${src}`);
  }
});
