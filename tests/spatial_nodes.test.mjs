// S3-3 T2: the spatial contract the card script injects (tavern/spatial-contract.mjs) is built over the node tree; what it says stays what the model has always seen.
// tests/fixtures/spatial_golden.json holds what the module gave when it resolved places with the v1 resolver (tests/helpers/spatial-golden.mjs):
//   fixtures  the recorded sessions' places, the whole contract (location, full text, tight-budget text, JIT activation set) -> byte for byte
//   sweep     every name and alias of the first pack (and "layer·landmark") -> one hash of that contract
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { golden, contractOf } from './helpers/spatial-golden.mjs';
import * as S from '../map/tavern/spatial-contract.mjs';

const GOLD = JSON.parse(fs.readFileSync(fileURLToPath(new URL('./fixtures/spatial_golden.json', import.meta.url)), 'utf8'));
const now = await golden();

// The words whose contract changed with the resolver, each with the hash it has now. They differ in where the kernel places a text (docs/kernel-schema.md
// K-R20 / K-R21), not in how a place is worded:
//   placed   v1 built its index for the contract without the world list and the English names, so these were unplaced (no contract): English names of sites
//            and of the second group, and the group's own name
//   longer   a layer word is longer than the landmark word it contains ("Pantheon Tier" holds "Pantheon"): the kernel keeps the longest span; v1 took any landmark
//   tie      two spans of the same length (a landmark and a layer's second name; a site's name and its trail): the kernel takes the deeper / more specific one
const CHANGED = {
  'Dairy parlour': ['placed', '1qbjjzq'], 'Fifth Seat Fief': ['placed', '14u08wl'], 'First Seat Fief': ['placed', 'rit5zv'], 'Fourth Seat Fief': ['placed', 'gfk4f2'],
  'Second Seat Fief': ['placed', '1mdzp1g'], 'Third Seat Fief': ['placed', '1qnvt6p'], 'Kavalierki': ['placed', '1fz8icr'],
  'Yuanyu': ['placed', 'ojg9gs'], 'Yuanyu, the Primal Realm': ['placed', 'ojg9gs'], '原域': ['placed', '1q2nh46'],
  'Pantheon Tier': ['longer', 'x7uvw7'], 'Wild Highlands Tier': ['longer', '1t0lf1'],
  '哥特尖塔与巴洛克穹顶': ['tie', 'kyigzt'], '旷野高地·下山小径': ['tie', '1f70es2'],
};

test('the injected contract for the places of both session fixtures is byte-identical to what v1 resolution gave', () => {
  assert.deepEqual(Object.keys(GOLD.fixtures).sort(), Object.keys(now.fixtures).sort());
  for (const [place, g] of Object.entries(GOLD.fixtures)) assert.deepEqual(now.fixtures[place], g, place);
  const hq = now.fixtures['上层·银冠堡'];   // a landmark with an exit, guards and neighbours: the full shape
  assert.ok(hq.coord.startsWith('[地图空间] {"L":"上层","p":["银冠堡",0.877,0.918],"e":[["伊甸庄园",'));
});

test('sweep: every name and alias of the first pack gives the same contract; the exceptions are pinned by word and class', t => {
  const words = Object.keys(GOLD.sweep), changed = words.filter(w => GOLD.sweep[w] !== now.sweep[w]);
  t.diagnostic(`sweep: ${words.length} words, ${words.length - changed.length} identical, ${changed.length} changed (${Object.keys(CHANGED).length} pinned)`);
  assert.deepEqual(Object.keys(now.sweep).sort(), words.slice().sort());
  assert.deepEqual(changed.sort(), Object.keys(CHANGED).sort());
  for (const [w, [, hash]] of Object.entries(CHANGED)) assert.equal(now.sweep[w], hash, w);
  // the classes are what they say (the old location is not stored, only its hash: checked through the new one)
  for (const w of Object.keys(CHANGED).filter(k => CHANGED[k][0] === 'placed')) assert.ok(contractOf(w).loc, `${w} is placed now`);
  assert.equal(contractOf('Pantheon Tier').loc.markerId, null); assert.equal(contractOf('Pantheon Tier').loc.level, 4);
  assert.equal(contractOf('旷野高地·下山小径').loc.markerId, 'trail_down');
});

test('the six merged sites keep their short layer names: the contract says 圣都, not the long node name', () => {
  const reg = contractOf('大骑士领·圣都').loc;
  assert.equal(reg.mapId, 'site_kavalierki'); assert.equal(reg.name, '圣都');   // v1 word: the layer word
  assert.ok(contractOf('大骑士领·圣都').coord.startsWith('[地图空间] {"L":"圣都","p":["圣都"]'));
  for (const [text, layer] of [['圆桌第三席封地', '第三席封地'], ['圆桌第一席封地', '第一席封地'], ['圆桌第五席封地', '第五席封地']]) {
    const c = contractOf(text); assert.ok(c.coord.startsWith(`[地图空间] {"L":"${layer}","p":["${layer}"]`), c.coord);
  }
});

test('no resolver of v1: the module builds its places from the node tree and stays pure', () => {
  const raw = fs.readFileSync(fileURLToPath(new URL('../map/tavern/spatial-contract.mjs', import.meta.url)), 'utf8');
  assert.doesNotMatch(raw, /here\.mjs|resolveHere|buildIndex/);
  assert.equal(S.locate({ maps: {} }, '无处'), null); assert.equal(S.coordView({ reg: { maps: {} }, here: '无处' }), '');
});
