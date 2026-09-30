// Shadow run of the two resolvers (plan S3-1): every distinct input the v1 test files feed to resolveHere (here, card_spec, and the
// other tests that call it; recorded at run time) and every place of the recorded session fixtures goes through v1 (map/here.mjs) and through the adapter
// over nodes.locate (map/app/here-v2.mjs); the results must be the same, except the intended divergences of docs/kernel-schema.md
// A.9, each pinned by its example input. A failing row names the input, v1, v2.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildIndex, resolveHere, unmappedName } from '../map/here.mjs';
import { makeHere, readCustom } from '../map/app/here-v2.mjs';
import { sessionPlaces } from './helpers/session-places.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const J = p => JSON.parse(fs.readFileSync(ROOT + p, 'utf8'));
const MAPS = J('map/data/maps.json'), WORLD = J('map/data/world_markers.json'), NAMES = J('map/i18n/en.json').names, PLAN = J('map/data/eden_estate_rooms.json'), MAN = J('map/packs/eden/manifest.json');
const REGISTER = ROOT + 'tests/helpers/here_register.mjs';

function record(file) {   // the resolveHere calls a v1 test file makes, from a child process that swaps in the recorder
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'here-v2-')), out = path.join(dir, 'calls.json');
  try { execFileSync(process.execPath, ['--import', REGISTER, ROOT + 'tests/' + file], { env: { ...process.env, HERE_RECORD: out }, stdio: 'pipe' }); return JSON.parse(fs.readFileSync(out, 'utf8')); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
const engines = new Map(), indexes = new Map();
const engineOf = cfg => { const k = JSON.stringify(cfg); if (!engines.has(k)) engines.set(k, makeHere({ manifest: MAN, maps: MAPS, world: cfg.world ? WORLD : null, names: cfg.names ? NAMES : null, plan: cfg.plan ? PLAN : null, custom: cfg.custom })); return engines.get(k); };
const indexOf = cfg => { const k = JSON.stringify(cfg); if (!indexes.has(k)) indexes.set(k, buildIndex(MAPS, cfg.world ? WORLD : null, cfg.names ? NAMES : null, cfg.custom, cfg.plan ? PLAN : null)); return indexes.get(k); };

const FIELDS = ['level', 'map', 'marker', 'place', 'room', 'std', 'floor', 'restricted', 'custom'];
const pick = r => r && Object.fromEntries(FIELDS.filter(k => r[k] !== undefined).map(k => [k, r[k]]));
/** What the consumers read of a result: the fields above, the two ends of a journey in the same shape, and its texts. */
const core = r => r && { ...pick(r), ...(r.transit ? { transit: { from: pick(r.transit.from), to: pick(r.transit.to), fromText: r.transit.fromText, toText: r.transit.toText, via: r.transit.via } } : {}) };

const cfgOf = c => c.cfg;
// The brief's corpus (here, card_spec) must match fully; the other v1 tests that call resolveHere (canon0928, characters, omissions099,
// transit095 and unmapped096, which sweeps every word of the registry) are a wider sweep: equal too, but for what is pinned below.
const STRICT = ['here.test.mjs', 'card_spec.test.mjs'], WIDE = ['canon0928.test.mjs', 'characters.test.mjs', 'omissions099.test.mjs', 'transit095.test.mjs', 'unmapped096.test.mjs'];
function shadow(files, seen = new Set()) {
  const rows = [], stat = { inputs: 0, equal: 0, mergedSiteWord: 0 };
  for (const c of files.flatMap(record)) {
    const cfg = c.cfg, key = JSON.stringify([c.value, cfg]); if (seen.has(key)) continue; seen.add(key); stat.inputs++;
    const e = engineOf(cfg), v1 = resolveHere(c.value, indexOf(cfg)), v2 = e.here(c.value);
    if (JSON.stringify(core(v1)) !== JSON.stringify(core(v2))) { rows.push({ input: c.value, cfg: JSON.stringify(cfg), v1: core(v1), v2: core(v2) }); continue; }
    const u1 = unmappedName(c.value, indexOf(cfg)), u2 = e.unmapped(c.value);
    if (u1 !== u2) { rows.push({ input: c.value, cfg: JSON.stringify(cfg), unmapped: [u1, u2] }); continue; }
    stat.equal++;
    if (v1 && v2 && v1.word !== v2.word) {   // A.9: a merged single-layer site reports its longest alias (v1: the layer word); everything else has the same word
      if (v1.level === 4 && e.tree.get(v2.node).type === 'site' && v2.word.length > v1.word.length) stat.mergedSiteWord++; else rows.push({ input: c.value, v1word: v1.word, v2word: v2.word });
    }
  }
  return { rows, stat };
}
const strict = shadow(STRICT);
test('shadow: every recorded input of here.test and card_spec gives the same result through both resolvers', t => {
  const { rows, stat } = strict;
  t.diagnostic(`shadow corpus: ${stat.inputs} distinct inputs, ${stat.equal} equal (result and unmapped name), ${stat.mergedSiteWord} merged-site inputs with the longer word (A.9), ${rows.length} unexplained`);
  assert.ok(stat.inputs > 100);
  assert.deepEqual(rows, []);
});
test('shadow, wider sweep: the other v1 tests that call resolveHere; one input differs beyond A.9 (pinned, reported in S3-1)', t => {
  const { rows, stat } = shadow(WIDE, new Set()), rest = rows.filter(r => r.input !== '客房楼');
  t.diagnostic(`shadow wide: ${stat.inputs} distinct inputs, ${stat.equal} equal, ${stat.mergedSiteWord} merged-site inputs with the longer word (A.9), ${rows.length - rest.length} pinned, ${rest.length} unexplained`);
  assert.deepEqual(rest, []);
  // Not in A.9: the estate's area word "客房楼" holds the room word "客房" one code point shorter. The kernel keeps the longest span (the estate);
  // v1 prefers the room when it is at most one code point shorter: a room node with the plan (std, floor), the room word without it.
  assert.deepEqual(rows.map(r => [r.cfg.includes('"plan":true'), r.v1.level, r.v1.std, r.v2.level, r.v2.std]).sort(), [[false, 1, undefined, 2, undefined], [true, 1, '客房', 2, undefined]].sort());
});

// ---- the session fixtures: every floor of the recorded chats, the places the pipeline reads out of them ----
const sessionAll = file => [...new Set(Object.values(sessionPlaces(file)).flat())];
test('shadow: every floor of the session fixtures gives the same result through both resolvers', t => {
  const cfg = { world: true, names: true, plan: false, custom: null }, e = engineOf(cfg), rows = [];
  let n = 0, placed = 0;
  for (const file of ['session_a.json', 'session_b.json']) for (const place of sessionAll(file)) {
    n++; const v1 = resolveHere(place, indexOf(cfg)), v2 = e.here(place);
    if (v2) placed++;
    if (JSON.stringify(core(v1)) !== JSON.stringify(core(v2)) || v1?.word !== v2?.word) rows.push({ file, place, v1: core(v1), v2: core(v2) });
  }
  t.diagnostic(`shadow sessions: ${n} places from the fixtures, ${placed} placed, ${rows.length} unexplained`);
  assert.ok(n >= 4 && placed >= 3);
  assert.deepEqual(rows, []);
});

// ---- the intended divergences of A.9 (a later change of the kernel must be deliberate), through the adapter ----
test('A.9 divergences through the adapter: each example, v1 beside v2', () => {
  const e = engineOf({ world: true, names: true, plan: false, custom: null }), ep = engineOf({ world: true, names: true, plan: true, custom: null });
  const v1 = buildIndex(MAPS, WORLD, NAMES), v1p = buildIndex(MAPS, WORLD, NAMES, null, PLAN);
  // 1. a broad place holding the estate + a room word: the estate (v1: the tier), K-02
  assert.equal(resolveHere('上层 书房', v1).level, 4); assert.deepEqual(pick(e.here('上层 书房')), { level: 1, map: 'eden_estate', room: '上层 书房' });
  // 2. a world name + a room word: the world place (v1: the room), K-02
  assert.equal(resolveHere('奥伦帝国 书房', v1).level, 1); assert.deepEqual(pick(e.here('奥伦帝国 书房')), { level: 5, map: 'world', place: '奥伦帝国' });
  // 3. an ambiguous word that does not overlap a landmark name: the landmark (v1: nothing)
  assert.equal(resolveHere('大学 议会', v1), null); assert.equal(e.here('大学 议会').marker, 'council');
  // 4. no plan, a room word and an area word one code point longer: the same estate, the area word reported (v1: the room word)
  const four = '伊甸庄园 人工湖 浴室'; assert.equal(resolveHere(four, v1).word, '浴室'); assert.equal(e.here(four).word, '人工湖'); assert.equal(e.here(four).map, 'eden_estate');
  // 5. an ambiguous word + an estate room word: the estate, with the plan the room (v1: nothing), K-R16
  assert.equal(resolveHere('大学 书房', v1), null); assert.equal(resolveHere('大学 书房', v1p), null);
  assert.equal(e.here('大学 书房').map, 'eden_estate'); assert.equal(ep.here('大学 书房').std, '主人书房');
  // 6. a merged single-layer site: the same map, the longest alias as the word (v1: the layer word)
  for (const [text, map, w1, w2] of [['大骑士领·圣都', 'site_kavalierki', '圣都', '大骑士领·圣都'], ['圆桌第三席封地', 'site_fief3', '第三席封地', '圆桌第三席封地']]) {
    const a = resolveHere(text, v1), b = e.here(text); assert.deepEqual([a.map, a.word, b.map, b.word, b.level], [map, w1, map, w2, 4]);
  }
});

test('the adapter keeps the public shapes: user names, transit ends, the estate rooms, unmapped, readCustom', () => {
  const custom = { rooms: { 我的秘密书斋: '书房' }, marks: { 蓝塔: '天城执法局总局' }, ignore: ['忽略我'] };
  const c = makeHere({ manifest: MAN, maps: MAPS, world: WORLD, names: NAMES, custom });
  assert.deepEqual(pick(c.here('我的秘密书斋')), { level: 1, map: 'eden_estate', room: '书房', custom: true });
  assert.equal(c.here('天城·中层·蓝塔').marker, 'enforcement_hq'); assert.equal(c.here('我的秘密书斋').via, 'user');
  assert.equal(c.unmapped('忽略我'), null); assert.equal(c.unmapped('别的地方'), '别的地方'); assert.equal(c.unmapped('  '), null);
  assert.deepEqual(c.estate.alias, { 我的秘密书斋: '书房' }); assert.ok(c.estate.std.includes('书房') && c.estate.id === 'eden_estate');
  const tr = makeHere({ manifest: MAN, maps: MAPS, world: WORLD, names: NAMES }).here('从天城下层·7号井到天城中层·天城执法局总局');
  assert.equal(tr.transit.fromText, '天城下层·7号井'); assert.equal(tr.transit.to.marker, 'enforcement_hq'); assert.equal(tr.transit.from.marker, 'well7');
  const en = makeHere({ manifest: MAN, maps: MAPS, world: WORLD, names: NAMES }).here('Eden Manor → Well 7 Black Market');
  assert.deepEqual([en.transit.fromText, en.transit.toText, en.transit.to.marker], ['Eden Manor', 'Well 7 Black Market', 'well7']);   // the ends keep their case
  const store = { m: {}, getItem(k) { return this.m[k] ?? null; }, setItem(k, v) { this.m[k] = v; }, removeItem(k) { delete this.m[k]; } };
  store.setItem('edenMap:chat:c1:custom', JSON.stringify({ rooms: { 书斋: '书房', bad: 3 } }));
  assert.deepEqual(readCustom(store, 'c1'), { rooms: { 书斋: '书房' } }); assert.deepEqual(readCustom(store, ''), { rooms: {} });
});
