// Which period base a map shows (core/period-pick.mjs, I-24): band -> file per registered map, the nearest-band fallback, custom bands.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pickPeriod } from '../map/core/period-pick.mjs';
import { DEFAULT_PERIODS } from '../map/core/periods.mjs';

const maps = JSON.parse(readFileSync(fileURLToPath(new URL('../map/data/maps.json', import.meta.url)), 'utf8')).maps;
const BANDS = ['dawn', 'day', 'dusk', 'night'];
const file = (id, tod, bands) => pickPeriod(maps[id].periods, tod, bands).src || maps[id].base;

test('every band picks its own file on tc_upper / tc_mid / tc_low (default bands, and the bands a host sends)', () => {
  const sent = [{ id: 'dawn' }, { id: 'day' }, { id: 'dusk' }, { id: 'night', dark: true }];
  for (const id of ['tc_upper', 'tc_mid', 'tc_low']) for (const b of BANDS) for (const bands of [undefined, [], sent, DEFAULT_PERIODS]) {
    const r = pickPeriod(maps[id].periods, b, bands);
    assert.equal(r.src, maps[id].periods[b], `${id} ${b}`); assert.equal(r.exact, true);
    assert.equal(file(id, b, bands), maps[id].periods[b]);
  }
  assert.equal(new Set(BANDS.map(b => file('tc_upper', b))).size, 4, 'four distinct files on tc_upper');
});

test('parity: day and night are the files they were before; no tod = the base', () => {
  assert.equal(file('tc_mid', 'day'), 'art/tc_mid_day.dzi'); assert.equal(file('tc_mid', 'night'), 'art/tc_mid_night.dzi');
  assert.equal(file('tc_upper', 'day'), 'art/tc_upper.dzi'); assert.equal(file('tc_low', 'night'), 'art/tc_low_night.dzi');
  for (const id of ['tc_upper', 'tc_mid', 'tc_low']) assert.equal(file(id, ''), maps[id].base);
});

test('a map without period variants keeps its single base for every band', () => {
  for (const id of ['world', 'dairy', 'site_fief1']) for (const b of ['', ...BANDS]) {
    const r = pickPeriod(maps[id].periods, b); assert.equal(r.src, null); assert.equal(file(id, b), maps[id].base);
  }
});

test('fallback: the nearest registered band by order; a tie goes to the lighter band, then the earlier', () => {
  const dn = { day: 'D', night: 'N' };
  assert.deepEqual(pickPeriod(dn, 'dawn'), { key: 'day', src: 'D', exact: false });    // night is as near (wraps) but dark
  assert.deepEqual(pickPeriod(dn, 'dusk'), { key: 'day', src: 'D', exact: false });
  assert.equal(pickPeriod(dn, 'night').exact, true);
  assert.equal(pickPeriod({ night: 'N' }, 'dawn').key, 'night', 'only the dark one registered: it is the nearest');
  assert.equal(pickPeriod({ dawn: 'A', dusk: 'U' }, 'night').key, 'dawn', 'night: dusk is 1 before, dawn is 1 after (wraps) -> both light -> earlier');
  assert.equal(pickPeriod({ dawn: 'A', dusk: 'U' }, 'day').key, 'dawn', 'day: tie -> earlier band');
  assert.equal(pickPeriod({ day: 'D' }, 'night').key, 'day');
});

test('unknown band, empty tod or junk variants -> no pick', () => {
  assert.equal(pickPeriod({ day: 'D' }, 'noon').src, null);
  assert.equal(pickPeriod({ day: 'D' }, '').src, null);
  assert.equal(pickPeriod(null, 'day').src, null);
  assert.equal(pickPeriod({ twilight: 'T' }, 'day').src, null, 'a key that is no band of the pack is ignored');
});

test('a pack with its own bands: ids and order come from the pack', () => {
  const bands = [{ id: 'morning' }, { id: 'noon' }, { id: 'evening' }, { id: 'late', dark: true }, { id: 'small', dark: true }];
  const v = { morning: 'M', evening: 'E', late: 'L' };
  assert.deepEqual(pickPeriod(v, 'morning', bands), { key: 'morning', src: 'M', exact: true });
  assert.equal(pickPeriod(v, 'noon', bands).key, 'morning', 'noon: morning and evening are 1 away -> earlier');
  assert.equal(pickPeriod(v, 'small', bands).key, 'morning', 'small: late (dark) and morning (wraps, light) are 1 away -> the lighter');
  assert.equal(pickPeriod({ late: 'L' }, 'small', bands).key, 'late');
  assert.equal(pickPeriod(v, 'day', bands).src, null, 'the default ids mean nothing in this pack');
  assert.equal(pickPeriod({ day: 'D' }, 'morning', bands).src, null, 'default-named variants do not match the custom bands');
});

test('the host clock message carries the pack bands in time order (mvu-readers bandList)', async () => {
  const R = await import('../map/tavern/mvu-readers.mjs');
  const l = R.bandList();
  assert.deepEqual(l.map(b => b.id), BANDS);
  assert.deepEqual(l.filter(b => b.dark).map(b => b.id), ['night']);
});
