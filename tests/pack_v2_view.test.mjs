// Schema-2 packs in the viewer (docs/kernel-schema.md K-R96): implicit views and the projection to the registry shape.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveBlocks, validate2, withDefaults } from '../map/core/pack-v2.mjs';
import { implicitViews, viewsOf, projectV2 } from '../map/core/pack-v2-view.mjs';

const dir = fileURLToPath(new URL('../map/packs/minimal/', import.meta.url));
const get = async p => JSON.parse(readFileSync(dir + p, 'utf8'));
async function minimal(mut) {
  const { manifest } = await resolveBlocks(await get('manifest.json'), get);
  if (mut) mut(manifest);
  const r = validate2(manifest, { trusted: true });
  return withDefaults(r.pack);
}

test('the minimal pack projects to one schematic map (harrow) with its five nodes as markers', async () => {
  const P = await minimal(), { registry, files, problems } = projectV2(P, { base: 'packs/minimal/' });
  assert.deepEqual(problems, []); assert.deepEqual(Object.keys(registry.maps), ['harrow']); assert.equal(registry.start, 'harrow');
  const m = registry.maps.harrow;
  assert.equal(m.kind, 'points'); assert.equal(m.title, 'Harrow'); assert.equal(m.base.type, 'image'); assert.match(m.base.url, /^data:image\/svg\+xml/);
  assert.deepEqual(Object.keys(m.markers).sort(), ['brindle', 'docks', 'harrow', 'inn', 'market']);
  assert.equal(m.markers.inn.name, 'Gull & Lantern Inn'); assert.ok(m.markers.inn.alias.includes('the inn')); assert.ok(m.markers.brindle.alias.includes('布林德尔'));
  assert.equal(m.markers.brindle.sub, 'harbour town'); assert.equal(m.markers.harrow.link, undefined);
  const f = files[m.data]; assert.equal(m.data, 'v2/minimal/harrow.json');
  assert.equal(f.markers.length, 5);
  for (const k of f.markers) assert.ok(k.nx >= 0 && k.nx <= 1 && k.ny >= 0 && k.ny <= 1 && k.r > 0, JSON.stringify(k));
});
test('without a views block every parent gets an implicit schematic map', async () => {
  const P = await minimal(m => { delete m.views; });
  assert.equal(P.views, undefined);
  assert.deepEqual(Object.keys(implicitViews(P)).sort(), ['brindle', 'docks', 'harrow']);
  assert.equal(implicitViews(await minimal()).harrow, undefined, 'a pack with views gets none');
  assert.deepEqual(viewsOf(await minimal()), (await minimal()).views);
  const { registry } = projectV2(P, { base: 'packs/minimal/' });
  assert.deepEqual(Object.keys(registry.maps).sort(), ['brindle', 'docks', 'harrow']);
  assert.deepEqual(registry.maps.harrow.markers.brindle.link, { map: 'brindle', marker: 'brindle' });   // entering a node with children opens its own map
  assert.equal(registry.maps.harrow.markers.inn, undefined);   // depth 2: inn is the third level, it sits on docks' map
  assert.deepEqual(Object.keys(registry.maps.docks.markers).sort(), ['docks', 'inn']);
});
test('a tiles view needs a base; a model3d view is not shown; a path that leaves the base is dropped', async () => {
  const withView = v => minimal(m => { m.views = { harrow: { kind: 'schematic' }, brindle: v }; });
  const t = projectV2(await withView({ kind: 'tiles', src: 'art/b.dzi' }), { base: '' });
  assert.ok(t.problems.some(p => p.code === 'view-tiles-no-base' && p.id === 'brindle')); assert.equal(t.registry.maps.brindle, undefined);
  const ok = projectV2(await withView({ kind: 'tiles', src: 'art/b.dzi' }), { base: 'packs/minimal/' });
  assert.equal(ok.registry.maps.brindle.base, 'packs/minimal/art/b.dzi'); assert.deepEqual(Object.keys(ok.registry.maps.brindle.markers).sort(), ['docks', 'inn', 'market']);
  const d = projectV2(await withView({ kind: 'model3d', src: 'x' }), { base: 'packs/minimal/' });
  assert.ok(d.problems.some(p => p.code === 'view-3d-not-shown')); assert.equal(d.registry.maps.brindle, undefined);   // S7-3: a 3D view with no manifest is still not shown
  for (const src of ['../x.dzi', 'https://x.test/a.dzi', '/etc/a.dzi', 'a/../../b.dzi']) {   // the validator drops these already; the projection re-checks (K-R64)
    const raw = await withView({ kind: 'schematic' }); raw.views.brindle = { kind: 'image', src };
    const o = projectV2(raw, { base: 'packs/minimal/' });
    assert.equal(o.registry.maps.brindle, undefined, src); assert.ok(o.problems.some(p => p.code === 'view-path'), src);
  }
  const img = projectV2(await withView({ kind: 'image', src: 'art/b.png', extent: [800, 500] }), { base: 'packs/minimal/' });
  assert.deepEqual(img.registry.maps.brindle.base, { type: 'image', url: 'packs/minimal/art/b.png' }); assert.deepEqual(img.files['v2/minimal/brindle.json'].extent_m, [800, 500]);
});
test('markers on a framed view take the node positions; a node without one sits near the centre', async () => {
  const P = await minimal(m => { m.views = { brindle: { kind: 'image', src: 'b.png' } }; m.nodes = (typeof m.nodes === 'string' ? [] : m.nodes); });
  const q = structuredClone(P); q.nodes = q.nodes.map(n => (n.id === 'docks' ? { ...n, at: { x: 0.2, y: 0.7 } } : n));
  const { files } = projectV2(q, { base: 'packs/minimal/' }), by = Object.fromEntries(files['v2/minimal/brindle.json'].markers.map(k => [k.id, k]));
  assert.deepEqual([by.docks.nx, by.docks.ny], [0.2, 0.7]); assert.ok(Math.abs(by.market.nx - 0.5) < 0.1 && Math.abs(by.market.ny - 0.5) < 0.1);
});

test('S7-3: a model3d view with a manifest projects to a 3D building page of that pack (the fixture pack), and the v2 runtime calls it a scene', async () => {
  const { readFileSync } = await import('node:fs'), { fileURLToPath } = await import('node:url'), { validate2 } = await import('../map/core/pack-v2.mjs'), { makeRuntimeV2 } = await import('../map/app/nodes-runtime-v2.mjs');
  const pack = validate2(JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/pack3d-min/manifest.json', import.meta.url)), 'utf8')), { trusted: true }).pack;
  const p = projectV2(pack, { base: 'packs/pack3d-min/' });
  assert.deepEqual(p.problems, []); assert.deepEqual(Object.keys(p.registry.maps), ['hall']); assert.equal(p.registry.start, 'hall');
  assert.deepEqual({ ...p.registry.maps.hall }, { title: 'Test Hall', kind: 'estate', src: 'estate/index.html', scene3d: 'packs/pack3d-min/scene/manifest.json', markers: {} });
  assert.equal(makeRuntimeV2(pack, p.registry).isScene('hall'), true); assert.equal(makeRuntimeV2(pack, p.registry).isScene('atrium'), false);
  const bad = projectV2({ ...pack, views: { hall3d: { kind: 'model3d', manifest: '../x/manifest.json' } } }, { base: 'packs/pack3d-min/' });
  assert.ok(bad.problems.some(q => q.code === 'view-path')); assert.deepEqual(Object.keys(bad.registry.maps), []);
});
