// core/transit-spec.mjs (K-R107): the healing of every part of the block, one case per problem code, limits, mode merge, option clamps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normTransit, TRANSIT_LIMITS, FUNCTIONS, TRIP_CLASSES, DEFAULT_MODES, DEFAULT_OPTIONS, modeLabel, lineName, stationName, functionLabelKey } from '../map/core/transit-spec.mjs';
import { RAW, norm } from './transit_fixture.mjs';

const S = (id, o = {}) => ({ id, view: 'v', at: [0.1, 0.1], name: id, ...o });
const base = o => ({ stations: [S('a'), S('b'), S('c')], ...o });
const codes = r => r.problems.map(p => p.code);
const line = o => ({ id: 'l', name: 'L', mode: 'maglev', color: '#112233', stops: ['a', 'b', 'c'], min: 2, ...o });

test('constants are frozen and complete', () => {
  assert.ok(Object.isFrozen(TRANSIT_LIMITS) && Object.isFrozen(FUNCTIONS) && Object.isFrozen(TRIP_CLASSES) && Object.isFrozen(DEFAULT_MODES) && Object.isFrozen(DEFAULT_OPTIONS));
  assert.deepEqual({ ...TRANSIT_LIMITS }, { stations: 300, lines: 24, stops: 80, links: 600, districts: 64, modes: 8, pts: 200, bytes: 262144 });
  assert.equal(FUNCTIONS.length, 13); assert.equal(FUNCTIONS.at(-1), 'other');
  assert.deepEqual(Object.keys(DEFAULT_MODES), ['walk', 'metro', 'maglev', 'air']);
  assert.equal(functionLabelKey('civic'), 'transit.fn.civic');
});

test('a sound block comes back whole; a healed block heals to itself', () => {
  const r = norm(); assert.deepEqual(r.problems, []);
  assert.equal(r.transit.stations.length, 6); assert.deepEqual(r.transit.options, DEFAULT_OPTIONS);
  assert.deepEqual(r.transit.lines[1].min, [3, 2]); assert.equal(r.transit.lines[0].wait, 0);
  const again = normTransit(r.transit, { nodes: () => true, views: () => true });
  assert.deepEqual(again.transit, r.transit); assert.deepEqual(again.problems, []);
});

test('transit-invalid: not an object, or no station survives', () => {
  for (const v of [null, undefined, 5, 'x', [], {}, { stations: [] }, { stations: [{ id: 'A' }] }]) { const r = normTransit(v); assert.equal(r.transit, null); assert.deepEqual(codes(r).slice(-1), ['transit-invalid']); }
});
test('transit-limit: each count is capped, the block size refuses', () => {
  const many = n => Array.from({ length: n }, (_, i) => S('s' + i));
  const r = normTransit({ stations: many(301) }); assert.equal(r.transit.stations.length, 300); assert.ok(codes(r).includes('transit-limit'));
  const l = normTransit(base({ lines: Array.from({ length: 25 }, (_, i) => line({ id: 'l' + i })) })); assert.equal(l.transit.lines.length, 24);
  const k = normTransit(base({ links: Array.from({ length: 601 }, () => ({ from: 'a', to: 'b', mode: 'walk', min: 1 })) })); assert.equal(k.transit.links.length, 600);
  const d = normTransit(base({ districts: Array.from({ length: 65 }, (_, i) => ({ id: 'd' + i, name: 'D', view: 'v', node: 'n', function: 'civic' })) })); assert.equal(d.transit.districts.length, 64);
  const s = normTransit(base({ lines: [line({ stops: many(81).map(x => x.id) })] }));
  assert.equal(s.transit.lines.length, 0, 'the stops beyond 80 are cut; the ids are not stations here, so the line is dropped');
  assert.ok(codes(s).includes('transit-limit'));
  const big = normTransit(base({ 'x-note': 'x'.repeat(262144) })); assert.equal(big.transit, null); assert.equal(big.problems[0].code, 'transit-limit');
  const m = normTransit(base({ modes: Object.fromEntries(Array.from({ length: 6 }, (_, i) => ['m' + i, { label: 'M', trip: 'road' }])) }));
  assert.equal(Object.keys(m.transit.modes).length, 8); assert.ok(m.problems.some(p => p.code === 'transit-limit' && p.id === 'm4'));
  const pts = normTransit(base({ districts: [{ id: 'd', name: 'D', view: 'v', function: 'civic', pts: Array.from({ length: 201 }, () => [0.1, 0.1]) }] })); assert.equal(pts.transit.districts.length, 0);
});
test('transit-duplicate: a repeated id is dropped (stations, lines, districts)', () => {
  const r = normTransit(base({ stations: [S('a'), S('a'), S('b')], lines: [line({ stops: ['a', 'b'] }), line({ stops: ['a', 'b'] })], districts: [{ id: 'd', name: 'D', view: 'v', node: 'a', function: 'civic' }, { id: 'd', name: 'E', view: 'v', node: 'a', function: 'civic' }] }));
  assert.equal(r.transit.stations.length, 2); assert.equal(r.transit.lines.length, 1); assert.equal(r.transit.districts.length, 1);
  assert.equal(codes(r).filter(c => c === 'transit-duplicate').length, 3);
});

test('modes: merged over the four kernel defaults; a kernel id keeps its trip class; a new one needs label and trip', () => {
  const r = normTransit(base({ modes: { metro: { label: 'Tube', trip: 'air', color: '#112233', dash: [2, 2], i18n: { en: { label: 'Tube' } } }, ferry: { label: '渡轮', trip: 'road' }, bad1: { label: 'x' }, Bad: { label: 'x', trip: 'road' }, bad2: { label: 'x', trip: 'boat' }, c: { label: 'x', trip: 'road', color: 'red' } } }));
  assert.equal(r.transit.modes.metro.label, 'Tube'); assert.equal(r.transit.modes.metro.trip, 'underground'); assert.deepEqual(r.transit.modes.metro.dash, [2, 2]);
  assert.equal(r.transit.modes.walk.label, '步行'); assert.equal(r.transit.modes.ferry.trip, 'road');
  assert.deepEqual(r.problems.filter(p => p.code === 'transit-mode-invalid').map(p => p.id), ['bad1', 'Bad', 'bad2', 'c']);
  assert.ok(!('bad1' in r.transit.modes) && !('Bad' in r.transit.modes) && !('bad2' in r.transit.modes)); assert.equal(r.transit.modes.c.color, undefined, 'a new mode with a bad colour keeps its label, loses the colour');
  assert.equal(modeLabel(r.transit, 'metro', 'en'), 'Tube'); assert.equal(modeLabel(r.transit, 'walk', 'en-GB'), 'Walk'); assert.equal(modeLabel(r.transit, 'walk', 'zh'), '步行'); assert.equal(modeLabel(r.transit, 'nope', 'en'), 'nope');
  assert.ok(!('modes' in DEFAULT_MODES.metro) && DEFAULT_MODES.metro.i18n.en.label === 'Metro', 'the defaults are not touched');
});

test('stations: node, view and invalid cases are dropped with their stops and links', () => {
  const r = normTransit({ stations: [S('a'), S('b'), S('c'), { id: 'n1', node: 'ghost' }, { id: 'v1', view: 'ghost', at: [0.5, 0.5], name: 'V' }, { id: 'i1', view: 'v', at: [0.5, 0.5] }, { id: 'i2' }, { id: 'i3', node: 'ok', at: [2, 2], view: 'v' }, { id: 'ok1', node: 'ok' }, { id: 'ok2', node: 'ok', view: 'v', at: [0.2, 0.2], hidden: true }],
    lines: [line({ stops: ['a', 'n1', 'b', 'v1', 'c'], min: [1, 2, 3, 4] }), line({ id: 'm', stops: ['a', 'i1'] })], links: [{ from: 'a', to: 'n1', mode: 'walk', min: 1 }, { from: 'a', to: 'b', mode: 'walk', min: 1 }] },
  { nodes: id => id === 'ok', views: id => id === 'v' });
  assert.deepEqual(r.transit.stations.map(s => s.id), ['a', 'b', 'c', 'i3', 'ok1', 'ok2']);
  assert.deepEqual(['transit-station-node', 'transit-station-view', 'transit-station-invalid'].map(c => codes(r).includes(c)), [true, true, true]);
  assert.deepEqual(r.transit.lines.map(l => [l.id, l.stops, l.min]), [['l', ['a', 'b', 'c'], [3, 7]]], 'minutes of a removed stop join the neighbouring segments; a line left with one stop is gone');
  assert.deepEqual(r.transit.links.map(k => k.to), ['b']);
  assert.ok(codes(r).includes('transit-line-stop') && codes(r).includes('transit-link-invalid'));
  assert.equal(r.transit.stations.find(s => s.id === 'i3').at, undefined, 'a bad drawn position of a node station is dropped');
  assert.equal(r.transit.stations.find(s => s.id === 'ok2').hidden, true);
  assert.equal(normTransit({ stations: [{ id: 'n', node: 'x' }] }).transit.stations[0].node, 'x', 'no predicate: not checked');
});
test('station fields: district must exist, names are one line, i18n kept', () => {
  const r = normTransit({ stations: [S('a', { district: 'nope', i18n: { en: { name: 'A' }, 'x y': { name: 'bad' }, fr: { name: '' } } }), S('b', { name: 'two\nlines' }), S('c', { district: 'd' })], districts: [{ id: 'd', name: 'D', view: 'v', node: 'c', function: 'civic' }] });
  assert.deepEqual(r.transit.stations.map(s => s.id), ['a', 'c']); assert.equal(r.transit.stations[0].district, undefined); assert.deepEqual(r.transit.stations[0].i18n, { en: { name: 'A' } });
  assert.equal(r.transit.stations[1].district, 'd'); assert.ok(codes(r).includes('transit-station-invalid'));
  assert.equal(stationName(r.transit, 'a', 'en'), 'A'); assert.equal(stationName(r.transit, 'a', 'zh'), 'a'); assert.equal(stationName(r.transit, 'ghost', 'en'), 'ghost');
  const node = normTransit({ stations: [{ id: 'k', node: 'keep' }] }).transit;
  assert.equal(stationName(node, 'k', 'en', n => (n === 'keep' ? 'Old Keep' : undefined)), 'Old Keep'); assert.equal(stationName(node, 'k', 'en'), 'k');
});

test('lines: every invalid shape is dropped; min arrays are checked and kept per segment', () => {
  const r = normTransit(base({ lines: [
    line({ id: 'ok', number: '2', i18n: { en: { name: 'Two' } }, wait: 99, oneway: true }), line({ id: 'noname', name: '' }), line({ id: 'nocolor', color: '--ink' }), line({ id: 'nomode', mode: 'zeppelin' }), line({ id: 'Bad' }),
    line({ id: 'one', stops: ['a'] }), line({ id: 'minlen', min: [1] }), line({ id: 'minlo', min: 0.01 }), line({ id: 'minhi', min: 601 }), line({ id: 'badnum', number: 'toolong' }),
    line({ id: 'dupstop', stops: ['a', 'b', 'a', 'c'], min: [1, 2, 3] }), line({ id: 'lp', stops: ['a', 'b', 'c'], min: [1, 2, 3], loop: true }), line({ id: 'lpbad', stops: ['a', 'b', 'c'], min: [1, 2], loop: true }), line({ id: 'str', stops: 'abc' }) ] }));
  assert.deepEqual(r.transit.lines.map(l => l.id), ['ok', 'badnum', 'dupstop', 'lp']);
  assert.equal(r.transit.lines[0].wait, 30); assert.equal(r.transit.lines[0].oneway, true); assert.deepEqual(r.transit.lines[0].min, [2, 2]); assert.equal(r.transit.lines[0].number, '2');
  assert.equal(r.transit.lines[1].number, undefined, 'a bad number is dropped, the line stays');
  assert.deepEqual(r.transit.lines[2].stops, ['a', 'b', 'c']); assert.deepEqual(r.transit.lines[2].min, [1, 5], 'the repeated stop is removed, its minutes join the next segment');
  assert.deepEqual(r.transit.lines[3].min, [1, 2, 3]); assert.equal(r.transit.lines[3].loop, true);
  for (const c of ['transit-line-invalid', 'transit-line-min', 'transit-line-stop']) assert.ok(codes(r).includes(c), c);
  assert.equal(lineName(r.transit, 'ok', 'en'), 'Two'); assert.equal(lineName(r.transit, 'ok', 'zh'), 'L'); assert.equal(lineName(r.transit, 'none', 'zh'), 'none');
});
test('a loop whose first stop is unknown keeps the closing segment', () => {
  const r = normTransit({ stations: [S('a'), S('b'), S('c')], lines: [line({ stops: ['x', 'a', 'b', 'c'], min: [1, 2, 3, 4], loop: true })] });
  assert.deepEqual(r.transit.lines[0].stops, ['a', 'b', 'c']); assert.deepEqual(r.transit.lines[0].min, [2, 3, 5]);
});

test('links: bad ends, mode, minutes and self links are dropped', () => {
  const r = normTransit(base({ links: [{ from: 'a', to: 'b', mode: 'walk', min: 2, oneway: true }, { from: 'a', to: 'z', mode: 'walk', min: 1 }, { from: 'a', to: 'a', mode: 'walk', min: 1 }, { from: 'a', to: 'b', mode: 'x', min: 1 }, { from: 'a', to: 'b', mode: 'walk', min: 0 }, { from: 'a', to: 'b', mode: 'walk', min: 700 }, 5] }));
  assert.equal(r.transit.links.length, 1); assert.equal(r.transit.links[0].oneway, true); assert.equal(codes(r).filter(c => c === 'transit-link-invalid').length, 6);
});

test('districts: shapes, function fallback, danger clamp, node and view checks', () => {
  const D = o => ({ id: 'd', name: 'D', view: 'v', function: 'civic', pts: [[0, 0], [1, 0], [1, 1]], ...o });
  const r = normTransit(base({ districts: [D({ id: 'a1' }), D({ id: 'a2', function: 'swamp', danger: 7.4 }), D({ id: 'a3', function: undefined, danger: 'x' }), D({ id: 'a4', pts: undefined, node: 'a' }), D({ id: 'a5', pts: undefined, node: 'a', r: 0.2 }),
    D({ id: 'b1', pts: [[0, 0], [1, 0]] }), D({ id: 'b2', pts: [[0, 0], [1, 0], [2, 1]] }), D({ id: 'b3', pts: undefined }), D({ id: 'b4', name: '' }), D({ id: 'b5', view: 'nope' }), D({ id: 'b6', pts: undefined, node: 'ghost' }), D({ id: 'a6', node: 'a' }), D({ id: 'B7' })] }),
  { nodes: id => id !== 'ghost', views: id => id === 'v' });
  assert.deepEqual(r.transit.districts.map(d => d.id), ['a1', 'a2', 'a3', 'a4', 'a5', 'a6']);
  assert.deepEqual(r.transit.districts.slice(1, 3).map(d => [d.function, d.danger]), [['other', 3], ['other', 0]]);
  assert.deepEqual(r.transit.districts.slice(3, 5).map(d => d.r), [0.06, 0.2]); assert.equal(r.transit.districts[5].node, 'a'); assert.ok(r.transit.districts[5].pts);
  assert.equal(codes(r).filter(c => c === 'transit-district-invalid').length, 9);
});

test('options and style are clamped; extensions are carried', () => {
  const r = normTransit(base({ options: { transfer_min: 99, walk_m_per_min: 1, access_max_min: -5, detour: 'x' }, style: { width: 20, labels: false, functions: { civic: { color: '#aabbcc' }, nature: { color: '--ok' }, nope: { color: '#112233' }, medical: { color: 'red' } } }, _note: 1, 'x-a': { b: 1 }, junk: 1 }));
  assert.deepEqual(r.transit.options, { transfer_min: 30, walk_m_per_min: 20, access_max_min: 0, detour: 1.25 });
  assert.deepEqual(r.transit.style, { width: 8, labels: false, functions: { civic: { color: '#aabbcc' }, nature: { color: '--ok' } } });
  assert.equal(r.transit._note, 1); assert.deepEqual(r.transit['x-a'], { b: 1 }); assert.ok(!('junk' in r.transit));
  assert.equal(normTransit(base()).transit.style.width, 4); assert.equal(normTransit(base()).transit.style.labels, true);
});

test('the fixture network: a view and node predicate drop what is not in the pack', () => {
  const r = normTransit(RAW, { nodes: id => id !== 'light', views: id => id === 'town_hill' });
  assert.ok(!r.transit.stations.some(s => s.id === 'light' || s.id === 'pier' || s.id === 'fish'));
  assert.deepEqual(r.transit.links.map(l => `${l.from}-${l.to}`), ['clock-keep']);
  assert.deepEqual(r.transit.lines.map(l => l.id), ['t2']);
});
