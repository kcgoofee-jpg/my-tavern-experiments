// N14 a: engine art (map/art) is fetched at a stable key, the last commit that changed map/art (head.json art_sha),
// so two heads that changed only code request identical art URLs; everything else stays at the content commit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { artBase } from '../map/tavern/follow-pin.mjs';
import { artRegistry, rebaseRegistry } from '../map/core/pack.mjs';
import { resolveFollow } from '../map/tavern/branch-follow.mjs';

const ART = 'b'.repeat(40), C1 = '1'.repeat(40), C2 = '2'.repeat(40);
const base = (h, c) => `https://${h}/gh/o/r@${c.slice(0, 12)}/map/`;
const REG = JSON.parse(readFileSync(fileURLToPath(new URL('../map/data/maps.json', import.meta.url)), 'utf8'));

test('artBase: same route and repo, only the commit changes; tags, branches and local bases keep their own key', () => {
  assert.equal(artBase(base('cdn.jsdmirror.com', C1), ART), `https://cdn.jsdmirror.com/gh/o/r@${ART.slice(0, 12)}/map/`);
  assert.equal(artBase(base('cdn.jsdelivr.net', C2), ART.slice(0, 7)), `https://cdn.jsdelivr.net/gh/o/r@${ART.slice(0, 7)}/map/`);
  for (const b of ['https://cdn.jsdelivr.net/gh/o/r@map-v0.9.7/map/', 'https://cdn.jsdelivr.net/gh/o/r@preview/map/', 'http://127.0.0.1:8000/map/'])
    assert.equal(artBase(b, ART), '', b);
  for (const a of ['', null, 'preview', 'xyz']) assert.equal(artBase(base('cdn.jsdelivr.net', C1), a), '', String(a));
});

test('two code-only heads: every art/ path of the registry resolves to the same URL; non-art paths untouched', () => {
  const a = artBase(base('cdn.jsdmirror.com', C1), ART), au = p => (p.startsWith('art/') ? a + p : p);
  const urls = c => { const x = artBase(base('cdn.jsdmirror.com', c), ART), out = [];
    const walk = v => (typeof v === 'string' ? out.push(v) : v && typeof v === 'object' ? Object.values(v).forEach(walk) : 0);
    walk(artRegistry(REG, p => (p.startsWith('art/') ? x + p : p)).maps); return out.filter(u => u.includes('/art/') || u.startsWith('art/')); };
  const u1 = urls(C1), u2 = urls(C2);
  assert.ok(u1.length > 20); assert.deepEqual(u1, u2);
  assert.ok(u1.every(u => u.startsWith(`https://cdn.jsdmirror.com/gh/o/r@${ART.slice(0, 12)}/map/art/`)));
  const r = artRegistry(REG, au);
  assert.equal(r.maps.tc_upper.views.top.base, `https://cdn.jsdmirror.com/gh/o/r@${ART.slice(0, 12)}/map/${REG.maps.tc_upper.views.top.base}`);   // OBLIQUE-CODE: the top base moved into views
  assert.deepEqual(Object.keys(r.maps), Object.keys(REG.maps)); assert.equal(r.groups, REG.groups);
  assert.equal(artRegistry(REG, null), REG, 'no art resolver: the registry as is');
  const town = rebaseRegistry({ maps: { t: { base: 'art/town.dzi' } } }, 'packs/town/');
  assert.equal(artRegistry(town, au).maps.t.base, 'packs/town/art/town.dzi', 'pack art is not engine art');
});

test('resolveFollow carries art_sha as art (and only a commit id)', async () => {
  const get = h => async u => (u.includes('jsdelivr.net/gh') ? h : null);
  assert.equal((await resolveFollow('o/r', 'preview', get({ build: 3, sha: C1, art_sha: ART }), null)).art, ART);
  assert.equal((await resolveFollow('o/r', 'preview', get({ build: 3, sha: C1, art_sha: 'nope' }), null)).art, undefined);
  assert.equal((await resolveFollow('o/r', 'preview', get({ build: 3, sha: C1 }), null)).art, undefined);
});
