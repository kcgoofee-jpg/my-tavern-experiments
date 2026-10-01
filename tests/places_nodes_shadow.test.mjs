// Shadow run (plan S3-3 T1): where a person or a trip end is drawn. The old rules (a frozen copy of map/characters-view.mjs `where` before the switch: registry `kind`
// checks, the world place found by its name in the world list, the district by the written text) against app/spot.mjs `drawPlace` over the node tree.
// Corpus: every place of the recorded session fixtures (who is where, the trip ends) and a wider sweep of every name and alias of both shipped packs.
// Also the item places: every stash row names a landmark node that sits on the map the row names (K-R45), and a hidden row shows where the
// current location places the player.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeHere } from '../map/app/place-resolver.mjs';
import { makeRuntime } from '../map/app/nodes-runtime.mjs';
import { drawPlace } from '../map/app/spot.mjs';
import { hash01 } from '../map/core/event-geo.mjs';
import { positionOf } from '../map/core/nodes.mjs';
import { normStash } from '../map/core/stash.mjs';
import { edenInputs, townInputs, J } from './helpers/eden-inputs.mjs';
import { sessionPlaces } from './helpers/session-places.mjs';

const toImg = (x, y) => [(x / 1600 - .0075) / .985, (y / 1000 - .015) / .97];   // app/util.mjs
function setup(inputs) {
  const rt = makeRuntime(inputs), here = makeHere(inputs), maps = inputs.maps.maps, g = rt.geo();
  const world = [...(inputs.world?.places || []), ...(inputs.world?.fiefs || [])];   // the old rule looked at places and fiefs only
  const zone = (mid, place) => { const p = g.place(place), sp = p && g.spot(p.node); return sp && sp.map === mid ? { nx: sp.x + (hash01(place) - .5) * .03, ny: sp.y + (hash01(place + '~') - .5) * .04, approx: true } : null; };   // app events `zoneXY`
  const env = { hasMap: id => !!maps[id], isScene: rt.isScene, standIn: rt.standIn, spot: n => g.spot(n), zone };
  // the rules before the switch (map/characters-view.mjs `where`; the landmark's point is added by the caller in both worlds)
  const legacy = (r, text) => {
    if (!r || !maps[r.map]) return null;
    if (maps[r.map].kind === 'estate') { const s = rt.standIn(r.map); if (!s) return { map: r.map, estate: true }; r = { ...r, map: s.map, marker: s.marker }; }
    if (r.marker) return { map: r.map, marker: r.marker };
    if (r.place) { const p = world.find(q => q.name === r.place); if (p) { const [nx, ny] = toImg(p.x, p.y); return { map: r.map, nx, ny }; } }
    const z = zone(r.map, text); return z ? { map: r.map, ...z } : { map: r.map };
  };
  return { rt, here, maps, env, legacy, names: [...new Set(rt.tree.ids().flatMap(id => { const n = rt.tree.get(id); return [n.name, ...(n.alias || [])]; }).filter(s => typeof s === 'string' && s))] };
}
const same = (a, b) => JSON.stringify(Object.keys(a || {}).sort()) === JSON.stringify(Object.keys(b || {}).sort())
  && Object.entries(a || {}).every(([k, v]) => (typeof v === 'number' ? Math.abs(v - b[k]) < 2e-6 : v === b[k]));
function run(S, texts) {
  const rows = [], stat = { n: 0, same: 0, placed: 0 };
  for (const text of texts) {
    const r = S.here.here(text), o = S.legacy(r, text), n = drawPlace(r, text, S.env);
    stat.n++; if (n) stat.placed++;
    if (same(o, n)) stat.same++; else rows.push({ text, node: r?.node, map: r?.map, place: r?.place, old: o, now: n });
  }
  return { rows, stat };
}
const EDEN = setup(edenInputs()), TOWN = setup(townInputs());

test('shadow: every place of the session fixtures (people, trip ends, locations) is drawn where it was', t => {
  const texts = ['session_a.json', 'session_b.json'].flatMap(f => Object.values(sessionPlaces(f)).flat());
  const { rows, stat } = run(EDEN, [...new Set(texts)]);
  t.diagnostic(`session places: ${stat.n} distinct, ${stat.placed} placed, ${stat.same} identical, ${rows.length} different`);
  assert.ok(stat.n >= 3 && stat.placed === stat.n);
  assert.deepEqual(rows, []);
  // the two who-is-where places of the fixture: a landmark of the middle tier and a landmark of the upper tier
  assert.deepEqual(drawPlace(EDEN.here.here('中层·霓虹街'), '中层·霓虹街', EDEN.env)?.map, 'tc_mid');
  assert.equal(drawPlace(EDEN.here.here('上层·银冠堡'), '上层·银冠堡', EDEN.env)?.marker, 'silver_crown');
});

test('shadow, wider sweep: every name and alias of both packs; the only difference is a realm (a point of its own, as events draw it)', t => {
  const e = run(EDEN, EDEN.names), w = run(TOWN, TOWN.names);
  t.diagnostic(`eden: ${e.stat.n} words, ${e.stat.placed} placed, ${e.stat.same} identical, ${e.rows.length} different; town: ${w.stat.n} words, ${w.stat.same} identical, ${w.rows.length} different`);
  assert.ok(e.stat.n > 300 && e.stat.same > 300);
  // a realm is a region: the old rules found no entry for it in the world list (places and fiefs) and drew the approximate spot of its district;
  // the node carries its own point, so the point is exact. Nothing else differs.
  const realms = e.rows.filter(r => EDEN.rt.tree.get(r.node)?.type === 'realm');
  assert.deepEqual(e.rows.filter(r => !realms.includes(r)), []);
  assert.ok(realms.every(r => r.now.nx !== undefined && !r.now.approx));
  assert.deepEqual(w.rows, []);
});

test('the viewer answers: the estate draws as its stand-in landmark, a 3D page without one as the estate, a world place as a point', () => {
  const at = text => drawPlace(EDEN.here.here(text), text, EDEN.env);
  assert.deepEqual(at('伊甸庄园·书房'), { map: 'tc_upper', marker: 'eden' });
  assert.deepEqual(at('7号井'), { map: 'tc_low', marker: 'well7' });
  assert.equal(at('光辉联邦').map, 'world'); assert.ok(at('光辉联邦').nx > 0 && at('光辉联邦').nx < 1);
  assert.equal(at('没有这个地方'), null);
  assert.deepEqual(drawPlace({ map: 'nowhere' }, 'x', EDEN.env), null);
  assert.deepEqual(drawPlace({ map: 'm1' }, 'x', { hasMap: () => true, isScene: () => true, standIn: () => null }), { map: 'm1', estate: true });
});

test('item places: every stash row is a landmark node on the map it names; a hidden row shows only where the current location places the player', () => {
  const rows = normStash(J('map/data/stash.json')).items, tree = EDEN.rt.tree;
  assert.ok(rows.length >= 3);
  for (const r of rows) {
    assert.ok(tree.has(r.marker), `${r.id}: no node ${r.marker}`);
    assert.equal(positionOf(tree, EDEN.rt.views, r.marker).view, r.map, `${r.id}: the node sits on another map`);
    assert.equal(EDEN.here.here(r.place)?.marker, r.marker, `${r.id}: the place "${r.place}" does not place at its landmark`);   // what the old highlight compared by name
    assert.equal(EDEN.here.here(r.place)?.map, r.map);
  }
  const hidden = rows.filter(r => r.hidden), at = text => EDEN.here.here(text)?.marker || '';
  for (const r of hidden) for (const other of rows) assert.equal(at(other.place) === r.marker, other === r, `${r.id} visible from "${other.place}"`);
  assert.equal(at('伊甸庄园·书房'), ''); assert.equal(at(''), '');
});
