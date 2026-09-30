// Shadow parity of event placement (S3-2, docs/kernel-schema.md K-R24, K-R51, A.5): every place text the event tests and the session fixtures feed in is placed by the
// old regex rules (tests/helpers/events-legacy.mjs, a frozen copy) and by nodes.locate over the first pack's tree with its v2 overlay (core/event-geo.mjs).
// Compared: the layer label, the map, the place text and the spot on the map. Every difference is named by a class below and pinned by an example.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as EVM from '../map/tavern/events.mjs';
import { parseText } from '../map/tavern/msgtext.mjs';
import { spotOf } from '../map/core/event-geo.mjs';
import { legacyPlace, legacyPos, legacyLayerOf, reWords, MAPS } from './helpers/events-legacy.mjs';
import { edenGeo } from './helpers/eden-geo.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const J = p => JSON.parse(fs.readFileSync(ROOT + p, 'utf8'));
const g = edenGeo();
const pointsOf = id => new Map((J(`map/data/${id}.json`).markers || []).map(k => [k.id, { nx: k.nx, ny: k.ny, name: MAPS.maps[id].markers?.[k.id]?.name }]));
const points = { tc_upper: pointsOf('tc_upper'), tc_mid: pointsOf('tc_mid'), tc_low: pointsOf('tc_low') };
const legacyMarkers = Object.fromEntries(Object.entries(points).map(([id, m]) => [id, [...m].map(([k, v]) => ({ id: k, nx: v.nx, ny: v.ny }))]));
const TOL = 0.002;   // of the map width: 6 px on the 3000 px render plane

// ---- the corpus: tests/events.test.mjs (run against a recording copy of the events module, old rules) and the session fixtures ----
async function recordEventsTest() {
  const helper = pathToFileURL(ROOT + 'tests/helpers/events-record.mjs').href;
  const src = fs.readFileSync(ROOT + 'tests/events.test.mjs', 'utf8').replace(/'\.\.\/map\/tavern\/events\.mjs'/, `'${helper}'`).replace(/'\.\.\/map\//g, `'${pathToFileURL(ROOT + 'map/').href}`);
  const log = console.log; console.log = () => {};
  try { await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(src)); } finally { console.log = log; }
  return globalThis.__eventTap;
}
const fixtureTexts = () => ['session_a.json', 'session_b.json'].flatMap(f => J(`tests/fixtures/sessions/${f}`).messages.map(m => m.raw ?? m.text));
const marksIn = raws => { const m = new Map(); for (const raw of raws) for (const x of EVM.marksOf(raw)) m.set(JSON.stringify([x.loc, x.cat, x.xy]), { loc: x.loc, cat: x.cat, xy: x.xy || '' }); return [...m.values()]; };

const tapped = await recordEventsTest();
const texts = [...tapped.raws.filter(x => typeof x === 'string'), ...fixtureTexts().map(t => parseText(t))];
const corpus = marksIn(texts), here = [...new Set(tapped.heres)];

// ---- one place, both ways ----
function both({ loc, cat = '', xy = '' }) {
  const o = legacyPlace(loc), n = g.place(loc.trim());
  const key = 'k:' + loc;
  const op = o && legacyPos(o, { key, cat, markers: legacyMarkers, xy });
  const np = n && spotOf(g, n, { key, xy, markers: points[n.map], world: n.map === 'world' });
  const nmap = n && (n.ring ? 'ring' : n.map), place = n && g.strip(loc.replace(/\s+/g, '').replace(/[·•・.]/g, '·'), n.owner);
  return { loc, cat, o, n, op, np, nmap, place };
}
function classify(r) {
  const { o, n, op, np, nmap } = r;
  if (!o && !n) return 'K-01 B';                                  // v1 dropped it, v2 lists it without a pin
  if (!o) return 'found';                                         // v1 dropped it, the tree knows the place
  if (!n) return 'lost';
  if (o.layer !== n.layer || op.map !== nmap) return 'tier';
  if (o.place !== r.place) return 'text';
  if (nmap === 'world') return op.none && !np.none ? 'world alias' : op.none === np.none && Math.hypot(op.nx - np.nx, op.ny - np.ny) <= TOL ? 'same' : 'world spot';
  if (Math.hypot(op.nx - np.nx, op.ny - np.ny) <= TOL && !!op.approx === !!np.approx) return 'same';
  return op.marker ? 'marker match' : 'spot';
}
const tally = rows => rows.reduce((m, r) => (m[r.cls] = (m[r.cls] || 0) + 1, m), {});

const rows = corpus.map(m => { const r = both(m); return { ...r, cls: classify(r) }; });
const locs = cls => rows.filter(r => r.cls === cls).map(r => r.loc).sort();

test('corpus: events.test.mjs and the session fixtures are found', () => {
  assert.ok(corpus.length > 250, `corpus ${corpus.length}`);
  assert.ok(here.length >= 10, `locations ${here.length}`);
  console.log('# corpus', corpus.length, 'distinct places; classes', JSON.stringify(tally(rows)), '; locations', here.length);
});
test('parity: no place is lost; the layer label, the map and the place text never change', () => {
  assert.deepEqual(rows.filter(r => ['lost', 'tier', 'text', 'spot', 'world spot'].includes(r.cls)).map(r => [r.cls, r.loc]), []);
  assert.ok(tally(rows).same > 290);
});
test('K-01 B: a place no node holds is listed without a pin (v1 dropped the event)', () => {
  assert.deepEqual(locs('K-01 B'), ['区议会', '某处', '骑士团巡逻据点']);   // "区议会": a root hint hides the shorter 议会; the others name nothing
  for (const loc of ['区议会', '某处', '骑士团巡逻据点']) assert.equal(g.place(loc), null);
});
// The differences below are not in K-01 B or A.9: reported in RESULT S3-2 and raised as Q-11 (docs/todo.md). Each is pinned by its example.
test('difference "found": a place v1 deliberately left unplaced is a node of the tree', () => {
  assert.deepEqual(locs('found'), ['奥伦帝国', '某家族庄园']);
  const oren = rows.find(r => r.loc === '奥伦帝国'), estate = rows.find(r => r.loc === '某家族庄园');
  assert.equal(legacyPlace('奥伦帝国'), null); assert.equal(oren.n.node, 'oren'); assert.equal(oren.n.map, 'world');   // v1: "the capital is the city, not outside it"
  assert.equal(legacyPlace('某家族庄园'), null); assert.equal(estate.n.node, 'eden_estate'); assert.equal(estate.n.via, 'alias');   // "庄园" is an alias of the estate (here.mjs agrees); v1's event rule ignored it
});
test('difference "world alias": a realm named by one of its aliases is pinned (v1 matched names only)', () => {
  assert.deepEqual(locs('world alias'), ['灵枢秘派']);
  const r = rows.find(r => r.loc === '灵枢秘派'); assert.equal(r.op.none, true); assert.equal(r.n.node, 'xl'); assert.equal(r.np.marker, true);
});
test('difference "marker match": v1 took the marker whose name merely contains the place; the tree takes the named node', () => {
  assert.deepEqual(locs('marker match'), ['中层·A', '中层·C', '中层修道院', '悬浮庄园区']);
  const by = loc => rows.find(r => r.loc === loc);
  assert.equal(by('中层·A').op.id, 'old_apartment'); assert.equal(by('中层·A').n.node, 'tc_mid');   // a one-letter placeholder matched any marker with that letter
  assert.equal(by('中层·C').op.id, 'checkpoint_c'); assert.equal(by('中层·C').n.node, 'tc_mid');
  assert.equal(by('中层修道院').op.id, 'iron_cradle'); assert.equal(by('中层修道院').n.node, 'mid_monastery'); assert.equal(by('中层修道院').np.marker, true);   // v1 pinned the convent next door
  assert.equal(by('悬浮庄园区').op.id, 'eden'); assert.equal(by('悬浮庄园区').n.node, 'tc_upper');   // the tier's own longer name wins over the estate word inside it (K-R20)
});
test('current location: the layer of the map that owns the place equals the v1 layer word', () => {
  assert.deepEqual(here.map(h => [h, legacyLayerOf(h), g.layerOf(h)]).filter(([, a, b]) => a !== b), []);
});

// ---- a wider sweep (not asked for): every name and alias of the tree, and every word of the old regexes, placed bare ----
const words = new Set();
for (const id of g.tree.ids()) { const n = g.tree.get(id); if (id !== g.tree.synth) for (const a of n.alias || [n.name]) if (/[\u4e00-\u9fff]/.test(a)) words.add(a); }
for (const k of ['up', 'mid', 'low', 'out', 'ring']) for (const w of reWords(k)) words.add(w);
const sweep = [...words].map(loc => { const r = both({ loc }); return { ...r, cls: classify(r) }; });
test('sweep: bare words never lose a place or change its text', () => {
  const t = tally(sweep); console.log('# sweep', sweep.length, JSON.stringify(t));
  assert.equal(t.lost ?? 0, 0); assert.equal(t.text ?? 0, 0); assert.equal(t.spot ?? 0, 0); assert.equal(t['world spot'] ?? 0, 0);
});
test('sweep: a different map only for places inside a site map, and the mid-tier word 外围', () => {
  const flat = new Set(Object.entries(g.views).filter(([, v]) => v.kind === 'tiles' || v.kind === 'image').map(([k]) => k)), tiers = ['world', 'tc_upper', 'tc_mid', 'tc_low'];
  const odd = sweep.filter(r => r.cls === 'tier' && !(flat.has(r.n.owner) && !tiers.includes(r.n.owner)));
  assert.deepEqual(odd.map(r => r.loc).sort(), ['外围']);   // "外围" is an alias of the mid tier: its district, not the ring (v1: the outside). Places inside a site map (the knights' city, the highland, the holy city) are drawn on that map; v1 knew only their world point
});
