import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextRoute } from '../map/tavern/tile-route.mjs';

const lines = [{ key: 'vpn' }, { key: 'cn' }];
test('picks the other route', () => {
  assert.equal(nextRoute({ lines, current: 'cn', swappable: true }), 'vpn');
  assert.equal(nextRoute({ lines, current: 'vpn', swappable: true }), 'cn');
  assert.equal(nextRoute({ lines, current: null, swappable: true }), 'vpn');
});
test('no switch when not loaded from a CDN, with one route, or right after a switch', () => {
  assert.equal(nextRoute({ lines, current: 'cn', swappable: false }), null);
  assert.equal(nextRoute({ lines: [{ key: 'cn' }], current: 'cn', swappable: true }), null);
  assert.equal(nextRoute({ lines: [], current: 'cn', swappable: true }), null);
  assert.equal(nextRoute({ lines, current: 'cn', swappable: true, lastAt: 1000, now: 5000 }), null);
  assert.equal(nextRoute({ lines, current: 'cn', swappable: true, lastAt: 1000, now: 1000 + 130000 }), 'vpn');
});
