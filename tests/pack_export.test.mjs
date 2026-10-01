// K-R98: export as pack (map/core/pack-export.mjs): clean, round-trips byte for byte, user names in, chat state out, size limits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { exportPack, MAX_EXPORT } from '../map/core/pack-export.mjs';
import { deriveAutoPack } from '../map/core/card-read.mjs';
import { parsePack } from '../map/tavern/pack-runtime-v2.mjs';
import { validate2 } from '../map/core/pack-v2.mjs';
import { implicitViews } from '../map/core/pack-v2-view.mjs';

const fx = n => JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/cardread/' + n + '.json', import.meta.url)), 'utf8'));
const pack = () => deriveAutoPack(fx('en_harbour').src).pack, dock = () => pack().nodes[1].id;
const grown = () => [{ id: 'g_abc', name: 'Harbour Office', alias: ['Harbour Office'], parent: dock() }];

test('export validates clean as a foreign pack and carries the grown nodes and the card credits', () => {
  const r = exportPack(pack(), { grown: grown(), card: { name: 'Saltmere', creator: 'fx', version: '1', url: 'https://example.test/post' } });
  assert.deepEqual(r.problems, []); assert.ok(r.fitsCard && r.bytes === new TextEncoder().encode(r.text).length);
  const m = JSON.parse(r.text); assert.deepEqual(validate2(m, { trusted: false }).problems, []);
  assert.ok(m.nodes.some(n => n.id === 'g_abc' && n.parent === dock()), 'the grown node keeps its g_ id (K-R10)');
  assert.deepEqual(m.credits.card, { creator: 'fx', name: 'Saltmere', url: 'https://example.test/post', version: '1' });
  assert.equal(m.id, pack().id, 'the id is kept (Z-06)');
  assert.deepEqual(Object.keys(m).slice(0, 4), ['id', 'schema', 'title', 'lang'], 'canonical key order'); assert.deepEqual(Object.keys(m.nodes[1]).slice(0, 4), ['id', 'name', 'parent', 'alias']);
  assert.equal(JSON.parse(r.compact).nodes.length, m.nodes.length); assert.ok(!r.compact.includes('\n'));
});

test('export -> import -> export is byte-identical, and the import is clean', () => {
  const a = exportPack(pack(), { grown: grown(), userAliases: [{ word: 'the pier', node: dock() }], card: { name: 'Saltmere' } });
  const i = parsePack(a.text, { cap: MAX_EXPORT }); assert.deepEqual(i.problems, []); assert.ok(i.pack);
  const b = exportPack(i.pack, { userAliases: [{ word: 'the pier', node: dock() }], card: { name: 'Saltmere' } });
  assert.equal(b.text, a.text);
  assert.equal(exportPack(i.pack, {}).text, a.text, 'without the options the file still holds everything');
});

test('the user\'s names become aliases of their nodes; a name for a node that does not exist is dropped; no duplicates', () => {
  const m = JSON.parse(exportPack(pack(), { userAliases: [{ word: 'the pier', node: dock() }, { word: 'LANTERN docks', node: dock() }, { word: 'ghost', node: 'nope' }, { word: '', node: dock() }, { word: 'x'.repeat(61), node: dock() }] }).text);
  const d = m.nodes.find(n => n.id === dock());
  assert.deepEqual(d.alias, ['lantern docks', 'docks', 'the pier']); assert.ok(!JSON.stringify(m).includes('ghost'));
  const bare = JSON.parse(exportPack(pack(), { userAliases: [{ word: 'the lodge', node: 'root' }] }).text).nodes.find(n => n.id === 'root');
  assert.deepEqual(bare.alias, ['Saltmere Harbour Tales', 'the lodge'], 'a node with no alias list keeps its name as a word when one is added');
});

test('stash, fog, ignore list, ledger, chat state, shipped-only fields and implicit views are left out; explicit views stay', () => {
  const p = { ...pack(), stash: [1], fog: { a: 1 }, explored: {}, ignore: ['x'], ledger: {}, chat: 'c', cdn: { repo: 'a/b' }, legacy: { chat_var: 'x' } };
  let m = JSON.parse(exportPack({ ...p, views: implicitViews(pack()) }).text);
  for (const k of ['stash', 'fog', 'explored', 'ignore', 'ledger', 'chat', 'cdn', 'legacy', 'views']) assert.ok(!(k in m), k + ' is out');
  m = JSON.parse(exportPack({ ...p, views: { root: { kind: 'schematic', layout: 'list' } } }).text);
  assert.deepEqual(m.views, { root: { kind: 'schematic', layout: 'list' } });
});

test('over 1 MB: written, marked as not fitting a card; over 8 MB: refused and nothing is written', () => {
  const fat = n => ({ ...pack(), nodes: [...pack().nodes, ...Array.from({ length: n }, (_, i) => ({ id: 'e_' + i, name: 'N' + i, parent: 'root', alias: ['N' + i], desc: 'd'.repeat(3900) }))] });
  const mid = exportPack(fat(300)); assert.deepEqual(mid.problems, []); assert.equal(mid.fitsCard, false); assert.ok(mid.bytes > 1 << 20 && mid.bytes < MAX_EXPORT);
  const big = exportPack(fat(2400)); assert.equal(big.text, ''); assert.deepEqual(big.problems.map(p => p.code), ['limit-size']); assert.equal(big.fitsCard, false);
});

test('a pack with a problem is not exported: the problems are listed and no text is written', () => {
  const bad = exportPack({ ...pack(), nodes: [...pack().nodes, { id: 'q_bad', name: 'Q', parent: 'missing_parent' }] });
  assert.equal(bad.text, ''); assert.ok(bad.problems.length >= 1);
  assert.equal(exportPack(null).text, '');
});
