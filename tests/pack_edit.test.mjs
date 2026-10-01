// K-R100: edit mode. app/pack-edit.mjs (operations, draft storage) and core/pack-draft.mjs (applying the draft, overlay export), with the exporter of K-R98.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditor, saveDraft, loadDraft, DRAFT_PREFIX } from '../map/app/pack-edit.mjs';
import { applyDraft, draftOverlay, overlayText, emptyDraft, isEmptyDraft } from '../map/core/pack-draft.mjs';
import { applyOverlay } from '../map/core/overlay-v2.mjs';
import { exportPack, MAX_EXPORT } from '../map/core/pack-export.mjs';
import { parsePack } from '../map/tavern/pack-runtime-v2.mjs';
import { validate2 } from '../map/core/pack-v2.mjs';
import { buildTree } from '../map/core/nodes.mjs';
import { PNG, PNG2, base } from './helpers/pack_pics.mjs';

const ed = (o = {}) => { const log = []; const e = createEditor({ pack: base(), onChange: d => log.push(JSON.stringify(d)), ...o }); e.log = log; return e; };

test('move writes at with its view; the position is clamped to the picture and a bad one is refused', () => {
  const e = ed();
  assert.deepEqual(e.move('alpha', { x: 0.31234567, y: 0.5, view: 'v' }), { ok: true, id: 'alpha' });
  assert.deepEqual(e.applied().nodes.find(n => n.id === 'alpha').at, { x: 0.3123, y: 0.5, view: 'v' });
  for (const at of [{ x: 1.2, y: 0.5, view: 'v' }, { x: 0.5, y: 0.5 }, { x: 'a', y: 0, view: 'v' }, null, { x: 0.5, y: 0.5, view: 'V!' }]) assert.equal(e.move('alpha', at).ok, false);
  assert.equal(e.move('nope', { x: 0, y: 0, view: 'v' }).code, 'node'); assert.equal(e.log.length, 1, 'a refused operation changes nothing and does not notify');
});
test('reparent refuses the node itself, a descendant and the root; the tree stays valid', () => {
  const e = ed();
  assert.equal(e.reparent('alpha', 'alpha').code, 'cycle'); assert.equal(e.reparent('alpha', 'beta').code, 'cycle'); assert.equal(e.reparent('root', 'gamma').code, 'root'); assert.equal(e.reparent('alpha', 'nope').code, 'node');
  assert.deepEqual(e.reparent('beta', 'gamma'), { ok: true, id: 'beta' });
  const t = buildTree(e.applied().nodes, { title: 'Tide' }); assert.equal(t.parent('beta'), 'gamma'); assert.deepEqual(t.problems, []);
  assert.equal(e.reparent('gamma', 'beta').code, 'cycle', 'a cycle through the new parent is refused too');
});
test('addAlias: trimmed, 1-60 code points, no duplicates of the name or of an alias; the name stays a word', () => {
  const e = ed();
  assert.equal(e.addAlias('alpha', '  the first  ').ok, true);
  assert.deepEqual(e.applied().nodes.find(n => n.id === 'alpha').alias, ['Alpha', 'the first']);
  assert.equal(e.addAlias('alpha', 'THE FIRST').code, 'dup'); assert.equal(e.addAlias('alpha', 'alpha').code, 'dup'); assert.equal(e.addAlias('alpha', '').code, 'word'); assert.equal(e.addAlias('alpha', 'x'.repeat(61)).code, 'word'); assert.equal(e.addAlias('alpha', 'a\nb').code, 'word');
  assert.equal(validate2(e.applied(), { trusted: false }).problems.length, 0);
});
test('addPlace: id e_<hash>, under an existing parent, with a position; the same name under the same parent is refused', () => {
  const e = ed(), r = e.addPlace('alpha', 'Boathouse', { x: 0.4, y: 0.4, view: 'v' });
  assert.ok(r.ok && /^e_[a-z0-9]+$/.test(r.id));
  const n = e.applied().nodes.find(x => x.id === r.id); assert.deepEqual([n.name, n.parent, n.at], ['Boathouse', 'alpha', { x: 0.4, y: 0.4, view: 'v' }]);
  assert.equal(e.addPlace('alpha', 'Boathouse').code, 'dup'); assert.equal(e.addPlace('nope', 'X').code, 'node'); assert.equal(e.addPlace('alpha', '').code, 'name'); assert.equal(e.addPlace('alpha', 'Q', { x: 2, y: 0, view: 'v' }).code, 'at');
  assert.equal(e.addPlace('gamma', 'Boathouse').ok, true, 'another parent gives another id');
  assert.equal(e.move(r.id, { x: 0.1, y: 0.1, view: 'v' }).ok, true, 'a new place can be moved and given names like any node'); assert.equal(e.addAlias(r.id, 'the boats').ok, true);
  assert.deepEqual(e.applied().nodes.find(x => x.id === r.id).alias, ['Boathouse', 'the boats']);
});
test('setStart, attach and detach: pictures belong to the pack, need an existing item, are limited per node and not repeated', () => {
  const e = ed(); assert.equal(e.setStart('beta').ok, true); assert.equal(e.applied().ui.start, 'beta'); assert.equal(e.setStart('nope').code, 'node');
  assert.equal(e.attach('alpha', 'm_x').code, 'media'); const p = e.addPicture({ src: PNG, w: 1, h: 1, note: 'quay' });
  assert.ok(p.ok); assert.equal(e.addPicture({ src: PNG }).id, p.id, 'the same picture is one item'); assert.equal(e.addPicture({ src: 'javascript:1' }).code, 'src'); assert.equal(e.addPicture({ src: 'https://x.test/a.png' }).code, 'src', 'only inline pictures enter a draft');
  assert.equal(e.attach('alpha', p.id).ok, true); assert.equal(e.attach('alpha', p.id).code, 'dup');
  assert.deepEqual(e.applied().nodes.find(n => n.id === 'alpha').media, [p.id]); assert.equal(e.applied().media[p.id].note, 'quay');
  assert.equal(e.detach('alpha', p.id).ok, true); assert.equal(e.applied().nodes.find(n => n.id === 'alpha').media, undefined);
});
test('useAsMap: an image view framed by the picture; the children get their current positions as first at in the new frame', () => {
  const e = ed(), p = e.addPicture({ src: PNG, w: 400, h: 200 });
  const r = e.useAsMap('root', p.id, { alpha: { x: 0.25, y: 0.5 }, gamma: { x: 0.75, y: 0.5 }, root: { x: 0, y: 0 }, nope: { x: 0, y: 0 }, beta: { x: 2, y: 0 } });
  assert.ok(r.ok); const a = e.applied(), v = a.views.root;
  assert.deepEqual([v.kind, v.media, v.extent], ['image', p.id, [1600, 800]]); assert.deepEqual(a.views.v, { kind: 'image', src: 'v.png' }, 'other views stay');
  assert.deepEqual(a.nodes.find(n => n.id === 'alpha').at, { x: 0.25, y: 0.5, view: 'root' }); assert.equal(a.nodes.find(n => n.id === 'beta').at, undefined); assert.equal(a.nodes.find(n => n.id === 'root').at, undefined);
  assert.equal(validate2(a, { trusted: false }).problems.length, 0); assert.equal(e.useAsMap('root', 'nope').code, 'media');
});
test('a pack with no views keeps its implicit views when the draft adds one', () => {
  const p = base(); delete p.views; const e = createEditor({ pack: p }), m = e.addPicture({ src: PNG });
  e.useAsMap('alpha', m.id, {}); const v = e.applied().views;
  assert.deepEqual(Object.keys(v).sort(), ['alpha', 'root']); assert.equal(v.root.kind, 'schematic'); assert.equal(v.alpha.kind, 'image');
});
test('the draft applied is the overlay merge (K-R67): same nodes as applyOverlay of the draft overlay; the input pack is not touched', () => {
  const e = ed(), before = JSON.stringify(base());
  e.move('gamma', { x: 0.9, y: 0.9, view: 'v' }); e.addAlias('beta', 'the cove'); e.reparent('beta', 'gamma'); e.addPlace('root', 'Jetty', { x: 0.1, y: 0.9, view: 'v' });
  const a = applyDraft(base(), e.draft), o = applyOverlay(base().nodes, draftOverlay(e.draft, base()));
  assert.deepEqual(a.pack.nodes, o.nodes); assert.deepEqual(a.problems, []); assert.equal(JSON.stringify(base()), before);
  assert.equal(isEmptyDraft(emptyDraft()), true); assert.equal(isEmptyDraft(e.draft), false);
});
test('discard empties the draft and notifies', () => {
  const e = ed(); e.move('alpha', { x: 0.5, y: 0.5, view: 'v' }); e.addPicture({ src: PNG });
  e.discard(); assert.equal(e.isEmpty(), true); assert.deepEqual(e.applied(), base()); assert.equal(e.log.length, 3);
});
test('draft storage: the text holds no picture bytes; the bytes come back from the picture store; a lost picture drops its item', async () => {
  const e = ed(), m = e.addPicture({ src: PNG, w: 1, h: 1 }); e.attach('alpha', m.id); e.move('gamma', { x: 0.5, y: 0.5, view: 'v' });
  const kv = new Map(), store = { get: k => kv.get(k) ?? null, set: (k, v) => kv.set(k, v), remove: k => kv.delete(k) }, bytes = new Map(), pics = { read: async id => bytes.get(id) ?? null, write: async (id, u) => bytes.set(id, u), clear: async keep => { for (const k of [...bytes.keys()]) if (!keep.includes(k)) bytes.delete(k); } };
  await saveDraft('tide', e.draft, { store, pics });
  assert.ok(kv.has(DRAFT_PREFIX + 'tide') && !kv.get(DRAFT_PREFIX + 'tide').includes('base64') && bytes.get(m.id) === PNG);
  const d = await loadDraft('tide', { store, pics }); assert.deepEqual(d, e.draft);
  bytes.clear(); const lost = await loadDraft('tide', { store, pics }); assert.deepEqual(Object.keys(lost.media), []); assert.equal(applyDraft(base(), lost).pack.nodes.find(n => n.id === 'alpha').media?.length, 1, 'the list is cleaned by validate2, not here');
  assert.equal(validate2(applyDraft(base(), lost).pack, { trusted: false }).pack.nodes[1].media, undefined);
  await saveDraft('tide', emptyDraft(), { store, pics }); assert.equal(kv.has(DRAFT_PREFIX + 'tide'), false);
  kv.set(DRAFT_PREFIX + 'tide', '{broken'); assert.deepEqual(await loadDraft('tide', { store, pics }), emptyDraft());
});
test('export of the draft -> re-import -> same tree, positions, aliases and pictures; exporting the import again is byte-identical', () => {
  const e = ed(), m = e.addPicture({ src: PNG, w: 1, h: 1, note: 'quay' }), m2 = e.addPicture({ src: PNG2 });
  e.useAsMap('root', m2.id, { alpha: { x: 0.3, y: 0.3 }, gamma: { x: 0.6, y: 0.4 } }); e.move('alpha', { x: 0.35, y: 0.32, view: 'root' }); e.reparent('beta', 'gamma'); e.addAlias('gamma', 'the green'); e.attach('beta', m.id); e.setStart('alpha');
  const a = exportPack(base(), { draft: e.draft, card: { name: 'Tide' } });
  assert.deepEqual(a.problems, []); const file = JSON.parse(a.text);
  const i = parsePack(a.text, { cap: MAX_EXPORT }); assert.deepEqual(i.problems, []); assert.ok(i.pack);
  const sig = p => ({ tree: p.nodes.map(n => [n.id, n.parent ?? null, n.at ?? null, n.alias ?? null, n.media ?? null]), media: p.media, views: p.views, start: p.ui?.start });
  assert.deepEqual(sig(i.pack), sig(e.applied())); assert.equal(file.media[m.id].note, 'quay'); assert.equal(file.views.root.media, m2.id);
  assert.equal(exportPack(i.pack, {}).text, a.text);
  const near = (x, y) => Math.abs(x - y) <= 0.005; assert.ok(near(i.pack.nodes.find(n => n.id === 'alpha').at.x, 0.35));
});
test('overlay export of a shipped pack: the K-R67 shape with only the changes, pictures included, no views; merging it over the pack gives the draft\'s nodes', () => {
  const e = ed(), m = e.addPicture({ src: PNG }); e.move('alpha', { x: 0.5, y: 0.5, view: 'v' }); e.addAlias('alpha', 'the first'); e.attach('beta', m.id); e.addPlace('root', 'Jetty', { x: 0.1, y: 0.9, view: 'v' }); e.useAsMap('root', m.id);
  const ov = JSON.parse(overlayText(e.draft, base()));
  assert.equal(ov.schema, 2); assert.equal(ov.views, undefined); assert.ok(ov.media[m.id]);
  assert.deepEqual(ov.nodes.map(n => n.id).sort(), ['alpha', 'beta', ov.nodes.find(n => n.name === 'Jetty').id].sort());
  assert.deepEqual(ov.nodes.find(n => n.id === 'alpha'), { id: 'alpha', at: { x: 0.5, y: 0.5, view: 'v' }, alias: ['the first'] });
  const merged = applyOverlay(base().nodes, ov); assert.deepEqual(merged.problems, []);
  assert.deepEqual(merged.nodes.find(n => n.id === 'beta').media, [m.id]); assert.equal(merged.nodes.find(n => n.name === 'Jetty').parent, 'root');
});
