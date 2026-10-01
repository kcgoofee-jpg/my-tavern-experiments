// K-R101 / K-R67: an overlay of a schema-1 pack may carry `media` and node `media` lists. map/core/overlay-v2.mjs applyOverlayMedia and the compat conversion.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { applyOverlay, applyOverlayMedia } from '../map/core/overlay-v2.mjs';
import { fromV1 } from '../map/core/compat-v1.mjs';
import { PNG } from './helpers/pack_pics.mjs';

const J = p => JSON.parse(readFileSync(fileURLToPath(new URL('../map/' + p, import.meta.url)), 'utf8'));
const inputs = () => { const m = J('packs/eden/manifest.json'); return { manifest: m, maps: J(m.data.maps), world: J(m.data.world), plan: J(m.data.rooms), names: J('packs/eden/names.en.json'), events: m.data.events && m.data.events !== 'builtin' ? J(m.data.events) : null }; };

test('an overlay media block merges by id, field by field; a bad item is skipped and listed', () => {
  const r = applyOverlayMedia({ a: { src: 'a.png', note: 'old', w: 3 } }, { media: { a: { src: 'b.png', note: 'new' }, b: { src: PNG }, Bad: { src: PNG }, c: { note: 'no src' }, d: 'x' } });
  assert.deepEqual(r.media, { a: { src: 'b.png', note: 'new', w: 3 }, b: { src: PNG } });
  assert.deepEqual(r.problems.map(p => [p.code, p.id]), [['overlay-media-invalid', 'Bad'], ['overlay-media-invalid', 'c'], ['overlay-media-invalid', 'd']]);
  assert.deepEqual(applyOverlayMedia(undefined, {}).media, undefined); assert.equal(applyOverlayMedia(undefined, { media: [] }).problems[0].code, 'overlay-media-invalid');
  assert.deepEqual(applyOverlayMedia({ a: { src: 'a.png' } }, null).media, { a: { src: 'a.png' } });
});
test('an overlay may hold media alone, and a node\'s media list is replaced like any other field', () => {
  const nodes = [{ id: 'a', name: 'A', media: ['x'] }, { id: 'b', name: 'B' }];
  assert.deepEqual(applyOverlay(nodes, { schema: 2, media: { x: { src: 'x.png' } } }).problems, []);
  assert.deepEqual(applyOverlay(nodes, { schema: 2, nodes: [{ id: 'a', media: ['y'] }, { id: 'b', media: ['x', 'y'] }] }).nodes.map(n => n.media), [['y'], ['x', 'y']]);
});
test('compat: an overlay media block becomes pack.media and node media; the first pack\'s overlay with "media": {} changes nothing', () => {
  const eden = J('packs/eden/overlay.v2.json'), a = fromV1({ ...inputs(), overlay: eden });
  assert.deepEqual(eden.media, {}, 'the migration put an empty media block into the first pack\'s overlay');
  const without = { ...eden }; delete without.media; const b = fromV1({ ...inputs(), overlay: without });
  assert.deepEqual(a.pack, b.pack); assert.equal(a.pack.media, undefined); assert.deepEqual(a.problems, b.problems);
  const c = fromV1({ ...inputs(), overlay: { ...without, media: { pic: { src: 'art/a.webp' } }, nodes: [...without.nodes, { id: a.pack.nodes[0].id, media: ['pic'] }] } });
  assert.deepEqual(c.pack.media, { pic: { src: 'art/a.webp' } }); assert.deepEqual(c.pack.nodes[0].media, ['pic']);
});
