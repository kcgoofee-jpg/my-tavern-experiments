// Kernel contract v2 on the touchstone pack map/packs/minimal (docs/kernel-schema.md appendix B.1): tree, locate, views,
// events, roster, items, defaults, validation and trust. Each case is named after its input.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTree, vocabulary, locate, unmapped, viewOf, positionOf, scopeOf, levelsOf, describe } from '../map/core/nodes.mjs';
import { validate2, resolveBlocks, withDefaults, typeOf, fieldValue, entityRows, stashRows, escapeHost } from '../map/core/pack-v2.mjs';
import { fnv36 } from '../map/core/lexicon.mjs';
import { rows, dcOf, rowId } from '../map/core/stash.mjs';
import { scan } from '../map/core/pickup.mjs';
import { RosterSystem } from '../map/core/roster.mjs';

const DIR = fileURLToPath(new URL('../map/packs/minimal/', import.meta.url));
const read = p => JSON.parse(fs.readFileSync(DIR + p, 'utf8'));
const { manifest, problems: resolveProblems } = await resolveBlocks(read('manifest.json'), async p => read(p));
const { pack, problems } = validate2(manifest, { trusted: true });
const full = withDefaults(pack);
const tree = buildTree(pack.nodes, { title: pack.title });
const vocab = vocabulary(tree, { lang: pack.lang, lexicon: pack.lexicon });
const L = (text, opts) => locate(text, tree, vocab, opts);

test('the minimal pack resolves and validates without a problem', () => {
  assert.deepEqual(resolveProblems, []);
  assert.deepEqual(problems, []);
  assert.deepEqual(validate2(manifest, { trusted: false }).problems, []);
});

test('tree: 5 nodes, root harrow, depth 3, children, ancestors, isAncestor', () => {
  assert.equal(tree.ids().length, 5);
  assert.equal(tree.root, 'harrow');
  assert.equal(tree.maxDepth(), 3);
  assert.deepEqual(tree.children('brindle'), ['docks', 'market']);
  assert.deepEqual(tree.ancestors('inn'), ['docks', 'brindle', 'harrow']);
  assert.equal(tree.isAncestor('brindle', 'inn'), true);
  assert.equal(tree.isAncestor('inn', 'brindle'), false);
  assert.equal(tree.isAncestor('inn', 'inn'), false);
  assert.deepEqual(describe(tree, pack.views), { nodes: 5, depth: 3, types: { region: 1, town: 1, district: 2, building: 1 }, grown: 0, views: { schematic: 1 } });
});

test('tree healing: two roots get __root; missing parent; cycle', () => {
  const two = buildTree([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], { title: 'T' });
  assert.equal(two.root, '__root'); assert.deepEqual(two.children('__root'), ['a', 'b']); assert.equal(two.get('__root').name, 'T'); assert.deepEqual(two.problems, []);
  const miss = buildTree([{ id: 'a' }, { id: 'b', parent: 'zz' }]);
  assert.equal(miss.root, 'a'); assert.equal(miss.parent('b'), 'a'); assert.equal(miss.problems.length, 1); assert.equal(miss.problems[0].code, 'parent-missing');
  const cyc = buildTree([{ id: 'a' }, { id: 'b', parent: 'c' }, { id: 'c', parent: 'b' }]);
  assert.equal(cyc.problems.length, 1); assert.equal(cyc.problems[0].code, 'cycle'); assert.equal(cyc.parent('b'), 'a'); assert.equal(cyc.parent('c'), 'b');
  const all = buildTree([{ id: 'a', parent: 'b' }, { id: 'b', parent: 'a' }]);
  assert.equal(all.root, '__root'); assert.equal(all.problems.length, 1);
});

const CASES = [
  // input, node, via, word (optional)
  ['Lantern Docks', 'docks', 'alias'], ['the DOCKS', 'docks', 'alias'], ['Gull & Lantern Inn', 'inn', 'alias'], ['Gull and Lantern', 'inn', 'alias'],
  ['Gull ＆ Lantern', 'inn', 'alias'], ['the inn', 'inn', 'alias'], ['dinner at the inn', 'inn', 'alias'], ['the pierced sky', null], ['installed', null],
  ['the piers', 'docks', 'hint', 'pier'], ['Gull and Lantern’s taproom', 'inn', 'alias', 'taproom'],
  ['Brindle, Lantern Docks', 'docks', 'alias'], ['Old Market, Lantern Docks', 'docks', 'alias'], ['market square by Lantern Docks', 'market', 'alias'],
  ['Lantern Docks by the market square', 'docks', 'alias'], ['Harrow', 'harrow', 'alias'],
  ['Brindle taproom', 'inn', 'hint', 'taproom'], ['Old Market taproom', 'market', 'alias'], ['taproom', 'inn', 'hint', 'taproom'], ['a pier', 'docks', 'hint', 'pier'],
  ['Gull & Lantern cellar', 'inn', 'alias', 'cellar'], ['Lantern Docks pier', 'docks', 'alias', 'pier'], ['cellar', 'inn', 'hint'],
  ['Lantern', null], ['overseas', null], ['Lantern Street pier', 'docks', 'hint'], ['abroad, near the docks', 'docks', 'alias'],
  ['nowhere / Old Market', 'market', 'alias'], ['the moon', null], ["{{user}}'s room at the inn", 'inn', 'alias'], ['灯笼码头', 'docks', 'alias'], ['布林德尔', 'brindle', 'alias'],
];
for (const [input, node, via, word] of CASES) {
  test(`locate: ${input}`, () => {
    const r = L(input);
    if (node === null) return assert.equal(r, null);
    assert.equal(r.node, node); assert.equal(r.via, via);
    if (word) assert.equal(r.word, word);
  });
}
test('locate: cellar with here = market / brindle / docks', () => {
  assert.equal(L('cellar', { here: 'market' }).node, 'market');
  assert.equal(L('cellar', { here: 'brindle' }).node, 'market');
  assert.equal(L('cellar', { here: 'docks' }).node, 'inn');
});
test('locate: journeys', () => {
  const a = L('from Old Market to the inn');
  assert.equal(a.node, 'market'); assert.equal(a.transit.from, 'market'); assert.equal(a.transit.to, 'inn');
  const b = L('heading to the inn');
  assert.equal(b.node, 'inn'); assert.equal(b.transit.from, null); assert.equal(b.transit.to, 'inn');
  assert.equal(L('Old Market → the inn').transit.to, 'inn');
});
test('locate: the moon is unmapped, unless ignored', () => {
  assert.equal(unmapped('the moon', tree, vocab), 'the moon');
  assert.equal(unmapped('the moon', tree, vocab, { ignore: ['The Moon'] }), null);
  assert.equal(unmapped('the moon / Old Market', tree, vocab), null);
  assert.equal(unmapped('', tree, vocab), null);
});
test('locate: user alias the Gull -> inn via user; unknown targets are ignored', () => {
  const v = vocabulary(tree, { lang: 'en', custom: [{ word: 'the Gull', node: 'inn' }, { word: 'ghost', node: 'nowhere' }, { word: 'x', node: 'inn', canonical: 'no such word' }] });
  const r = locate('the Gull', tree, v); assert.equal(r.node, 'inn'); assert.equal(r.via, 'user');
  assert.equal(locate('ghost', tree, v), null); assert.equal(locate('x', tree, v), null);
  const w = vocabulary(tree, { lang: 'en', custom: [{ word: 'my secret room', node: 'docks', canonical: 'pier' }] });   // weak: strength of `pier`
  const c = locate('my secret room', tree, w); assert.equal(c.node, 'docks'); assert.equal(c.canonical, 'pier');
});
test('locate: a strong word on two sibling branches is a hint; on a node and its child it stays strong', () => {
  const t = buildTree([{ id: 'r', name: 'R' }, { id: 'a', name: 'North Tower', parent: 'r', alias: ['north tower', 'tower'] }, { id: 'b', name: 'South Tower', parent: 'r', alias: ['south tower', 'tower'] },
    { id: 'p', name: 'Keep', parent: 'r', alias: ['keep'] }, { id: 'c', name: 'Inner Keep', parent: 'p', alias: ['inner keep', 'keep'] }]);
  const v = vocabulary(t, { lang: 'en' });
  const s = locate('the tower', t, v); assert.equal(s.node, 'a'); assert.equal(s.via, 'hint');
  assert.equal(locate('the tower', t, v, { here: 'b' }).node, 'b');
  const k = locate('the keep', t, v); assert.equal(k.node, 'c'); assert.equal(k.via, 'alias');
});
test('locate: zh journeys and a pack lexicon marker', () => {
  const t = buildTree([{ id: 'r', name: 'R', alias: [] }, { id: 'x', name: '东市', parent: 'r' }, { id: 'y', name: '西港', parent: 'r' }]);
  const v = vocabulary(t, { lang: 'zh' });
  const a = locate('从东市到西港', t, v); assert.equal(a.node, 'x'); assert.equal(a.transit.to, 'y');
  assert.equal(locate('前往西港', t, v).transit.from, null);
  const e = vocabulary(t, { lang: 'en', lexicon: { en: { to: ['toward'] } } });
  const m = locate('东市 toward 西港', t, e); assert.equal(m.node, 'x'); assert.equal(m.transit.to, 'y');
});
test('fnv36 is the hash of stash rowId', () => {
  const row = { map: 'm', marker: 'k', place: 'p', name: 'n' };
  assert.equal(rowId(row), 's' + fnv36('m|k|p|n'));
});

test('views: viewOf, positionOf, scopeOf, levelsOf', () => {
  const v = viewOf(tree, pack.views, 'inn');
  assert.equal(v.owner, 'harrow'); assert.equal(v.kind, 'schematic'); assert.equal(v.focus, 'inn'); assert.equal(v.view, 'harrow');
  const none = viewOf(tree, undefined, 'inn');
  assert.equal(none.view, null); assert.equal(none.owner, 'harrow'); assert.equal(none.kind, 'schematic');
  assert.equal(positionOf(tree, pack.views, 'inn'), null);
  assert.equal(scopeOf(tree, pack.views, 'inn'), 'harrow');
  assert.deepEqual(levelsOf(tree, pack.views, pack.ui, 'docks'), []);
  const t = buildTree([{ id: 'w', name: 'W' }, { id: 'a', name: 'A', parent: 'w', at: { x: 0.1, y: 0.2 } }, { id: 'b', name: 'B', parent: 'w', anchor: 'reg' }, { id: 'e', name: 'E', parent: 'w', enter: 'a2' }, { id: 'a2', name: 'A2', parent: 'e' }]);
  const vs = { w: { kind: 'tiles', src: 'w.dzi' }, a: { kind: 'tiles', src: 'a.dzi' }, a2: { kind: 'image', src: 'a2.png' } };
  assert.deepEqual(positionOf(t, vs, 'a'), { view: 'w', owner: 'w', at: { x: 0.1, y: 0.2 } });
  assert.deepEqual(positionOf(t, vs, 'b'), { view: 'w', owner: 'w', anchor: 'reg' });
  assert.equal(viewOf(t, vs, 'e').owner, 'a2');
  assert.equal(scopeOf(t, vs, 'a2'), 'a2');
  assert.deepEqual(levelsOf(t, vs, {}, 'a'), []);
  assert.deepEqual(levelsOf(t, vs, { levels: { w: ['a', 'b'] } }, 'a'), ['a', 'b']);
});

test('events: typeOf, life, inject, fx, levels', () => {
  for (const w of ['blaze', 'FIRE', '火灾']) assert.equal(typeOf(w, full.events).type, 'fire', w);
  assert.equal(typeOf('meteor', full.events).type, 'other');
  const h = typeOf('hazard', full.events); assert.equal(h.type, 'other'); assert.equal(h.group, 'hazard'); assert.equal(h.color, '#e0603a');
  assert.equal(L('Lantern Docks').node, 'docks'); assert.equal(L('overseas'), null);
  assert.equal(typeOf('brawl', full.events).life.live, 3);
  for (const k of ['fire', 'festival']) assert.equal(typeOf(k, full.events).life.live, 7, k);
  assert.equal(typeOf('festival', full.events).inject, false); assert.equal(typeOf('fire', full.events).inject, true);
  assert.deepEqual(typeOf('fire', full.events).fx, { block: 'flash', intensity: 0.4, seconds: 1.5 });
  assert.deepEqual(full.events.levels.map(l => l.label), ['over', 'minor', 'serious', 'severe']);
});

test('roster: entityRows, chat place, fieldValue', () => {
  const r = entityRows(pack.entities, tree);
  assert.equal(r.length, 2);
  assert.equal(r[0].name, 'Mara'); assert.equal(r[0].location, 'inn'); assert.equal(r[0].role, 'innkeeper');
  assert.equal(r[1].name, 'Tobin'); assert.equal(r[1].location, 'market');
  const sys = new RosterSystem(); sys.use('fallback', { rows: () => r });
  assert.deepEqual(sys.rows().map(x => [x.name, x.role, x.location]), [['Mara', 'innkeeper', 'inn'], ['Tobin', 'fishmonger', 'market']]);
  assert.equal(L('the taproom').node, 'inn');
  const [role, trust] = pack.entities.fields;
  assert.deepEqual(fieldValue(trust, { trust: 60 }), { value: 60, min: 0, max: 100, band: 'friendly' });
  assert.equal(fieldValue(trust, { trust: 140 }).value, 100);
  assert.equal(fieldValue(role, { role: 'innkeeper' }), 'innkeeper');
  assert.equal(fieldValue(trust, {}), null); assert.equal(fieldValue(role, {}), null);
  assert.deepEqual(fieldValue(trust, { trust: [45, 'note'] }), { value: 45, min: 0, max: 100, band: 'friendly' });
  const lad = { field: 'tier', kind: 'ladder', scan: true, ladder: [{ label: 'low', match: ['minor'] }, { label: 'high', match: ['major', 'grand master'] }] };
  assert.deepEqual(fieldValue(lad, { tier: 'Low' }), { index: 0, label: 'low' });
  assert.deepEqual(fieldValue(lad, { tier: 'a Grand Master of arts' }), { index: 1, label: 'high' });
  assert.deepEqual(fieldValue(lad, { other: 'minor thing' }), { index: 0, label: 'low' });
  assert.equal(fieldValue({ ...lad, scan: false }, { other: 'minor thing' }), null);
  assert.equal(fieldValue({ field: 'k', kind: 'tag' }, { k: true }), 'yes'); assert.equal(fieldValue({ field: 'k', kind: 'tag' }, { k: 7 }), '7');
});

test('items: stashRows, dcOf, rows, pickup', () => {
  const s = stashRows(pack.items, tree, pack.views);
  assert.equal(s.items.length, 1); assert.equal(s.items[0].map, ''); assert.equal(s.items[0].marker, 'inn'); assert.equal(s.items[0].place, 'Gull & Lantern Inn');
  assert.equal(dcOf(s.items[0]), 15);
  assert.equal(rows(s, { marker: 'inn' }).length, 1);
  assert.ok(scan('Mara picked up the Brass Key.', { known: ['Brass Key'] }).some(f => f.name === 'Brass Key'));
  assert.equal(stashRows({ stash: [{ name: 'x', node: 'nowhere' }] }, tree, pack.views).items.length, 0);
});

test('defaults: withDefaults of a bare pack is the exact object', () => {
  assert.deepEqual(withDefaults({ id: 'x', schema: 2, title: 'X' }), {
    id: 'x', schema: 2, title: 'X',
    vars: { periods: [{ id: 'dawn', start: '05:00' }, { id: 'day', start: '07:00' }, { id: 'dusk', start: '17:00' }, { id: 'night', start: '20:00', dark: true }] },
    events: {
      groups: [{ id: 'other' }], types: { other: { group: 'other' } }, fx_presets: {},
      levels: [{ value: 0, label: 'over', i18n: { zh: { label: '结束' } } }, { value: 1, label: 'minor', i18n: { zh: { label: '轻微' } } },
        { value: 2, label: 'serious', i18n: { zh: { label: '严重' } } }, { value: 3, label: 'severe', i18n: { zh: { label: '危急' } } }],
      closed: [], examples: [], life: { live: 7, after: 20, fade: 40, merge: 15, per_msg: 3 },
    },
    items: { stash: [] }, ui: { start: '__root' },
  });
  assert.equal(full.ui.start, 'brindle'); assert.ok(full.events.types.other); assert.equal(full.events.groups.at(-1).id, 'other');
});

test('validate2: refuses schema 3 and a missing title; repairs and drops ids', () => {
  assert.equal(validate2({ id: 'xx', schema: 3, title: 'X' }).pack, null);
  assert.equal(validate2({ id: 'xx', schema: 2 }).pack, null);
  assert.equal(validate2('nope').pack, null);
  const r = validate2({ id: 'xx', schema: 2, title: 'X', nodes: [{ id: 'root', name: 'R' }, { id: 'Inn', name: 'Inn', parent: 'root' }, { id: 'room', name: 'Room', parent: 'Inn' }] }, { trusted: true });
  assert.equal(r.problems.length, 1); assert.equal(r.problems[0].code, 'id-repaired');
  assert.deepEqual(r.pack.nodes.map(n => [n.id, n.parent]), [['root', undefined], ['inn', 'root'], ['room', 'inn']]);
  const d = validate2({ id: 'xx', schema: 2, title: 'X', nodes: [{ id: 'root', name: 'R' }, { id: '☃', name: 'Snow', parent: 'root' }] }, { trusted: true });
  assert.equal(d.problems.length, 1); assert.deepEqual(d.pack.nodes.map(n => n.id), ['root']);
  const dup = validate2({ id: 'xx', schema: 2, title: 'X', nodes: [{ id: 'a', name: 'A' }, { id: 'a', name: 'B' }] }, { trusted: true });
  assert.equal(dup.problems.length, 1); assert.equal(dup.pack.nodes.length, 1);
});

const ok = [x => x, x => Object.assign(x, { 'x-note': 1, _c: 2 }), x => x.nodes.push({ id: 'isle', name: 'Isle' }),
  x => Object.assign(x.nodes[3], { alias: ['the inn'], hints: ['Gull & Lantern Inn'] }),
  x => (x.ui.theme.tokens = { '--accent': 'var(--ink)', '--r-s': '4px', '--fs-body': '1.1rem', '--line': '#c0c0c0' }),
  x => (x.ui.levels = { brindle: ['docks', 'market'] })];
const badCases = [
  x => delete x.title, x => (x.surprise = 1), x => (x.schema = 3), x => (x.nodes[4].id = 'docks'), x => (x.nodes[3].parent = 'nowhere'), x => (x.nodes[0].parent = 'inn'),
  x => (x.nodes[3].view = 'missing'), x => (x.nodes[1].enter = 'inn'), x => (x.nodes[3].id = 'Inn'), x => (x.nodes[3].canon = 'card'), x => (x.nodes[3].alias = ['the inn']),
  x => (x.nodes[3].at = { x: 0.5, y: 0.5, view: 'nope' }), x => (x.views.harrow = { kind: 'panorama' }), x => (x.views.harrow.open = 'always'),
  x => (x.events.types.fire.group = 'nope'), x => (x.events.types.fire.fx = 'sparkle'), x => (x.items.stash[0].node = 'nowhere'), x => (x.entities.fields[1].kind = 'bar'),
  x => (x.entities.avatar = { from: ['card-script'], hosts: ['com'] }), x => (x.layers = [{ id: 'patrol', type: 'line', slot: 'sky' }]),
  x => (x.vars.periods[0].start = '25:00'), x => (x.vars.periods[0].start = '23:00'), x => (x.ui.start = 'nowhere'), x => (x.ui.levels = { brindle: ['docks', 'nowhere'] }),
  x => (x.ui.theme.tokens = { '--accent': 'url(https://x)' }), x => (x.ui.theme.tokens = { '--accent': '"red"' }), x => (x.ui.theme.tokens = { '--z-top': '1' }),
  x => (x.llm.worldbook.entries[0].keys = ['/a+/i']), x => (x.cdn = { npm: '../evil' }), x => (x.layers = '%2e%2e/evil.json'),
];
test('validate2 accepts the good variants and flags every bad one (the corpus of pack_schema_v2.test.mjs)', () => {
  const run = f => { const x = JSON.parse(JSON.stringify(manifest)); f(x); return validate2(x, { trusted: true }).problems.length; };
  ok.forEach((f, i) => assert.equal(run(f), 0, `good ${i}`));
  badCases.forEach((f, i) => assert.ok(run(f) > 0, `bad ${i}: ${f}`));
  assert.equal(badCases.length, 30);
});

test('trust: cdn, legacy, x-page, features, theme tokens, worldbook text and keys of a foreign pack', () => {
  const x = JSON.parse(JSON.stringify(manifest));
  Object.assign(x, { cdn: { npm: 'pkg' }, legacy: { chat_var: 'eden_map' }, features: { events: true, fog: false } });
  x.views.harrow['x-page'] = 'estate/index.html';
  x.ui.theme.tokens = { '--accent': 'url(https://x)', '--line': 'red;x', '--ink': '"a"', '--bg': '#fff', '--muted': 'var(--accent)' };
  x.llm.worldbook.entries[0].content = 'a {{setvar::a::b}} b <% x %> {{user}} {{char}}';
  x.llm.worldbook.entries[0].keys = ['/a+/i', 'harbour'];
  const f = validate2(x, { trusted: false }).pack;
  assert.equal(f.cdn, undefined); assert.equal(f.legacy, undefined); assert.equal(f.views.harrow['x-page'], undefined);
  assert.deepEqual(f.features, { fog: false });
  assert.deepEqual(f.ui.theme.tokens, { '--bg': '#fff', '--muted': 'var(--accent)' });
  const e = f.llm.worldbook.entries[0];
  assert.ok(!e.content.includes('{{setvar') && !e.content.includes('<%') && !e.content.includes('%>'));
  assert.ok(e.content.includes('{{user}}') && e.content.includes('{{char}}'));
  assert.deepEqual(e.keys, ['harbour']);
  const t = validate2(x, { trusted: true }).pack;   // a shipped pack keeps cdn and legacy, but reserved legacy names go
  assert.deepEqual(t.cdn, { npm: 'pkg' }); assert.equal(t.legacy.chat_var, 'eden_map');
  assert.equal(validate2({ ...x, legacy: { chat_var: 'stat_data' } }, { trusted: true }).pack.legacy.chat_var, undefined);
  assert.equal(escapeHost('{{user}}'), '{{user}}');
});
test('trust: a foreign pack cannot take a shipped id; limits cut arrays, strings and nesting', () => {
  assert.equal(validate2(manifest, { trusted: false, shipped: ['minimal'] }).pack, null);
  assert.ok(validate2(manifest, { trusted: true, shipped: ['minimal'] }).pack);
  const many = validate2({ id: 'xx', schema: 2, title: 'X', nodes: Array.from({ length: 1200 }, (_, i) => ({ id: `n${i}`, name: `N${i}` })) }).pack;
  assert.equal(many.nodes.length, 1000);
  const long = validate2({ id: 'xx', schema: 2, title: 'X', nodes: [{ id: 'a', name: 'A', desc: 'x'.repeat(5000) }] }).pack;
  assert.equal([...long.nodes[0].desc].length, 4000);
  let deep = {}; for (let i = 0; i < 20; i++) deep = { 'x-d': deep };
  assert.equal(validate2({ id: 'xx', schema: 2, title: 'X', 'x-deep': deep }).pack, null);
  const shared = validate2({ id: 'xx', schema: 2, title: 'X', nodes: Array.from({ length: 10 }, (_, i) => ({ id: `n${i}`, name: `N${i}`, alias: [`N${i}`, 'shared'] })) }).pack;
  assert.equal(shared.nodes.filter(n => n.alias.includes('shared')).length, 8);
  const wb = validate2({ id: 'xx', schema: 2, title: 'X', llm: { worldbook: { entries: Array.from({ length: 20 }, (_, i) => ({ id: `e${i}`, name: 'E', content: 'c' })) } } }).pack;
  assert.equal(wb.llm.worldbook.entries.length, 16);
});
test('resolveBlocks refuses bad paths and failed fetches', async () => {
  const r = await resolveBlocks({ id: 'x', schema: 2, title: 'X', nodes: '../evil.json', ui: 'ui.json', events: '/abs.json' }, async p => { throw new Error(p); });
  assert.deepEqual(r.problems.map(p => p.path).sort(), ['events', 'nodes', 'ui']);
  assert.equal(r.manifest.nodes, undefined);
});
