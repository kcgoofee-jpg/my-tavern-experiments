// S8-4b (K-R114): the thematic variant of the automatic schematic. A plain picture (a small tree, an explicit view) stays byte-identical to the stored copy of the minimal pack; a tree of at least 8 nodes
// with at least 2 branches gets hull polygons, one coloured polyline per branch, rings for hubs and dots for leaves, still with no text, and its projected markers carry `rank` 1..3.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveBlocks, validate2, withDefaults } from '../map/core/pack-v2.mjs';
import { projectV2 } from '../map/core/pack-v2-view.mjs';
import { buildTree } from '../map/core/nodes.mjs';
import { layoutSchematic, schematicSvg } from '../map/core/schematic.mjs';
import { thematicModel, PALETTE } from '../map/core/thematic.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const svgOf = reg => Object.values(reg.maps).map(m => decodeURIComponent(m.base.url.replace('data:image/svg+xml;charset=utf-8,', '')));
const NODES = [
  { id: 'city', name: 'Harbour City' },
  { id: 'trade', parent: 'city', name: 'Trade Row' }, { id: 'bazaar', parent: 'trade', name: 'Grand Bazaar' }, { id: 'bank', parent: 'trade', name: 'Old Bank' },
  { id: 'mil', parent: 'city', name: 'Garrison Hill' }, { id: 'barracks', parent: 'mil', name: 'North Barracks' }, { id: 'fort', parent: 'mil', name: 'Sea Fort' },
  { id: 'med', parent: 'city', name: 'Clinic Quarter' }, { id: 'hospital', parent: 'med', name: 'General Hospital' }, { id: 'pharmacy', parent: 'med', name: 'Pharmacy' }, { id: 'lone', parent: 'city', name: 'Lone Tower' },
];
const pack = (extra = {}) => ({ id: 'big', schema: 2, title: 'Big', lang: 'en', nodes: NODES, ...extra });

test('the minimal pack: the schematic picture is byte-identical to the stored copy (5 nodes, below the threshold)', async () => {
  const dir = ROOT + 'map/packs/minimal/', get = async p => JSON.parse(fs.readFileSync(dir + p, 'utf8'));
  const { manifest } = await resolveBlocks(await get('manifest.json'), get), { pack: p } = validate2(manifest, { trusted: true });
  const r = projectV2(withDefaults(p), { base: '' });
  assert.deepEqual(svgOf(r.registry), [fs.readFileSync(ROOT + 'tests/fixtures/minimal_schematic.svg', 'utf8')]);
  for (const f of Object.values(r.files)) for (const m of f.markers) assert.equal(Object.hasOwn(m, 'rank'), false, 'a plain picture has no ranks');
});

test('an implicit view of 11 nodes and 3 branches is thematic: hulls, one line per branch, rings, dots, no text; ranks on the markers', () => {
  const r = projectV2(pack(), { base: '' }), [svg] = svgOf(r.registry);
  assert.equal((svg.match(/<polygon /g) || []).length, 3, 'a hull per branch');
  assert.equal((svg.match(/<path /g) || []).length, 3, 'one coloured line per branch');
  assert.ok(svg.includes(`fill="${PALETTE.commerce}" fill-opacity="0.16"`) && svg.includes(`fill="${PALETTE.military}"`) && svg.includes(`fill="${PALETTE.medical}"`), 'function colours from the generic words');
  assert.ok(svg.includes('stroke-width="6"') && svg.includes('r="9"') && svg.includes('r="6"'));
  assert.doesNotMatch(svg, /<text/);
  const f = Object.values(r.files)[0], rank = Object.fromEntries(f.markers.map(m => [m.id, m.rank]));
  assert.deepEqual(rank, { city: 1, trade: 1, bazaar: 3, bank: 3, mil: 1, barracks: 3, fort: 3, med: 1, hospital: 3, pharmacy: 3, lone: 3 });
  assert.deepEqual(projectV2(pack(), { base: '' }).files, r.files, 'deterministic');
});

test('fewer than 8 nodes, or fewer than 2 branches: the plain picture (no hull, no rank)', () => {
  const small = projectV2(pack({ nodes: NODES.slice(0, 7) }), { base: '' }), flat = projectV2(pack({ nodes: [NODES[0], ...Array.from({ length: 9 }, (_, i) => ({ id: `k${i}`, parent: 'city', name: `Place ${i}` }))] }), { base: '' });
  for (const r of [small, flat]) { const [svg] = svgOf(r.registry); assert.doesNotMatch(svg, /<polygon|<path/); assert.ok(Object.values(r.files)[0].markers.every(m => !('rank' in m))); }
});

test('an explicit view picks with x-style: "thematic"; without it (or "plain") it stays plain', () => {
  const views = style => ({ city: { kind: 'schematic', layout: 'tree', depth: 2, ...(style ? { 'x-style': style } : {}) } });
  assert.match(svgOf(projectV2(pack({ views: views('thematic') }), { base: '' }).registry)[0], /<polygon/);
  assert.doesNotMatch(svgOf(projectV2(pack({ views: views() }), { base: '' }).registry)[0], /<polygon/);
  assert.doesNotMatch(svgOf(projectV2(pack({ views: views('plain') }), { base: '' }).registry)[0], /<polygon/);
});

test('schematicSvg without a model, or with model.on false, is the plain picture', () => {
  const tree = buildTree(NODES, { title: 'x' }), layout = layoutSchematic(tree, 'city', { layout: 'tree', depth: 2 }), plain = schematicSvg(layout, tree);
  assert.equal(schematicSvg(layout, tree, undefined), plain); assert.equal(schematicSvg(layout, tree, { on: false, branches: [], hubs: [], ranks: {} }), plain);
  const m = thematicModel(tree, 'city', layout, { lang: 'en' });
  assert.equal(m.on, true); assert.notEqual(schematicSvg(layout, tree, m), plain);
});
