// S7-1 T1: every control id of the settings markup as it was in viewer.html (frozen at origin/preview df3b5f6d / head #261) exists once in the page table, on the page docs/settings-ia.md §3.1 gives it;
// the viewer keeps only the sheet shell; `display` is an alias of `map`; pages are built on first open, not on the boot path.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
globalThis.window = {};   // settings-pages.mjs reads text through the I18N service when asked; the table itself needs nothing
const { TABLE } = await import('../map/app/settings-pages.mjs');
const rd = f => fs.readFileSync(fileURLToPath(new URL('../' + f, import.meta.url)), 'utf8');
const WHERE = {
  home: ['setQ', 'setHits', 'actUp', 'themeSeg', 'langSeg', 'tiers', 'tierWhy', 'handSeg'],
  map: ['rmSeg', 'optNoFx', 'optFog', 'fogRow', 'fogReset', 'optMinimap', 'cvdSeg', 'q3Seg', 'optAuto3d'],
  people: ['optCharStats', 'optCharMore', 'chSrc'], data: ['storBox'], update: ['aboutBox', 'branchBox', 'lineRow', 'linePick', 'lineNow'], license: ['licBox'],
  adv: ['packBox', 'optEdit', 'optPackRemote', 'optKeys', 'kbdBtn', 'kbdHelp', 'optTick', 'hintAgain', 'build', 'optFps'],
};
const idsOf = html => [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
test('every frozen control id is in the table once, on its page (§3.1)', () => {
  const seen = new Map();
  for (const { page, rows } of TABLE) for (const r of rows) for (const id of idsOf(r.h)) { assert.ok(!seen.has(id), 'duplicate id ' + id); seen.set(id, page); }
  for (const [page, ids] of Object.entries(WHERE)) for (const id of ids) assert.equal(seen.get(id), page, `${id} on ${page}`);
});
test('the AI link switches keep their ids in the cards; the moved row sets have their owners', () => {
  const cards = rd('map/app/ai-cards.mjs');
  for (const id of ['thInjOn', 'thMacro', 'thDice', 'thLedgerWrite', 'thSpatial', 'thWbJit', 'thWbXtal', 'thNav', 'thDepth', 'thBudget', 'injSeg', 'thInjPreview']) assert.ok(cards.includes(id), id);
  assert.match(rd('map/custom-names-view.mjs'), /optNight/); assert.match(rd('map/characters-view.mjs'), /optPort/); assert.match(rd('map/gallery-view.mjs'), /optGal/);
});
test('viewer.html keeps only the sheet shell: empty pages, the layer containers, no row markup', () => {
  const v = rd('map/viewer.html');
  for (const p of ['home', 'map', 'people', 'ai', 'data', 'update', 'license', 'adv']) assert.match(v, new RegExp(`<section class="spage" data-page="${p}"`), p);
  for (const id of ['themeSeg', 'optFog', 'storBox', 'packBox', 'injSeg', 'setQ']) assert.ok(!v.includes(`id="${id}"`), id + ' is built by settings-pages.mjs');
  assert.ok(v.split('\n').length < 707, 'viewer.html shrank');
  assert.ok(!/Yehehua/.test(v), 'no card name in the viewer page');
});
test('display is an alias of map; the pages list is the eight groups; setPage builds only an open sheet', () => {
  const s = rd('map/app/settings.mjs');
  assert.match(s, /const ALIAS = \{ display: 'map' \}/);
  for (const p of ['home', 'map', 'people', 'ai', 'data', 'update', 'adv', 'license']) assert.match(s, new RegExp(`\\b${p}: \\['`), p);
  assert.match(s, /if \(\(!quiet \|\| !\$\('#setPop'\)\.hidden\)/);
});
