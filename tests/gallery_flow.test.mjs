// K-R106 host side: the flow reads the card table at run time, recomputes scenes from the floors, honours the switch, stores nothing; the declaration is healed / checked like every v2 block.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { entitiesBlock } from '../map/core/pack-v2-spec.mjs';
import { profileOf } from '../map/core/profile.mjs';
import { setProfile } from '../map/tavern/pack-profile.mjs';
import { SCHEMA, check } from '../map/core/protocol.mjs';
import { KEYS } from '../map/core/storage.mjs';

const U = (w, c, n) => `https://img.example.test/pics/${w}/${c}/${n}.png`;
const GAL = { id: 'cg', from: 'card-script', path: 'scripts.*.data.characters', name: 'name', sets: 'sets', tag: { categories: ['calm', 'busy'], digits: 3 }, require: { 'img.example.test/pics/': ['/calm/', '/busy/'] } };
const AVATAR = { from: ['card-script'], hosts: ['img.example.test/pics/'] };
const EXT = { scripts: [{ data: { characters: [{ name: 'Aria', sets: { calm: [U('a', 'calm', 1), U('a', 'calm', 2)], busy: [U('a', 'busy', 1)] } }] } }] };

test('declaration: healed like every v2 block (K-R06); the eden pack\'s own declaration is clean', () => {
  const run = v => { const x = { problems: [], ref: id => id }; return { out: entitiesBlock([])(v, 'entities', x), problems: x.problems }; };
  assert.deepEqual(run({ gallery: GAL }).problems, []);
  assert.equal(run({ gallery: GAL }).out.gallery.tag.digits, 3);
  for (const bad of [{ ...GAL, from: 'imagegen' }, { ...GAL, tag: { categories: [] } }, { ...GAL, tag: { categories: ['a'], digits: 9 } }, { ...GAL, tag: { categories: ['a'], open: 'ab' } }, { ...GAL, path: 'a..b' }, { ...GAL, extra: 1 }, { ...GAL, name: undefined }])
    assert.ok(run({ gallery: bad }).problems.length, JSON.stringify(bad).slice(0, 60));
  const eden = JSON.parse(fs.readFileSync(new URL('../map/packs/eden/overlay.v2.json', import.meta.url), 'utf8'));
  assert.deepEqual(run(eden.entities).problems, []);
});
test('profile carries the raw declaration; the wire messages and the switch are registered', () => {
  assert.deepEqual(profileOf({ entities: { gallery: GAL } }).gallery, GAL); assert.equal(profileOf({}).gallery, null);
  assert.ok(SCHEMA['eden-map:media'] && SCHEMA['eden-map:media-ask']);
  assert.equal(check({ type: 'eden-map:media', on: true, scenes: [] }).ok, true); assert.equal(check({ type: 'eden-map:media' }).ok, false); assert.equal(check({ type: 'eden-map:media-ask' }).ok, true);
  assert.deepEqual(KEYS.edenMapGallery, { pref: true, owner: 'map/gallery-view.mjs', def: '1' });
});

const writes = []; const store = new Map();
globalThis.window = globalThis;
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => { writes.push(['set', k]); store.set(k, v); }, removeItem: k => writes.push(['rm', k]) };
let msgs = [];
globalThis.getChatMessages = () => msgs; globalThis.getCharData = async () => ({ data: { extensions: EXT } });
const { createGalleryFlow } = await import('../map/tavern/gallery-flow.mjs');
const wait = ms => new Promise(r => setTimeout(r, ms));
function mk(sw = null) {
  const posts = []; let floorNow = 4;
  const flow = createGalleryFlow({ alive: true, get floorNow() { return floorNow; }, frame: null, life: { dead: false }, lsGet: k => (k === 'edenMapGallery' ? sw : null), post: m => posts.push(m),
    mvuBridge: { chatId: () => 'chat1', floorPlace: (f, raw) => ({ place: raw.includes('<time>') ? 'Hall' : 'Yard' }), rosterRows: () => [{ name: 'Aria·Vale' }] } });
  return { flow, posts, set top(v) { floorNow = v; } };
}
test('flow: the table is read from the card at run time, scenes recomputed from the floors, resent only on change', async () => {
  setProfile(profileOf({ entities: { avatar: AVATAR, gallery: GAL } }));
  msgs = [{ message_id: 2, message: 'a [Aria][calm][2] b <think>[Aria][busy][1]</think>' }, { message_id: 3, message: 'none' }, { message_id: 4, message: '<time>Hall·d·t</time> [Aria][busy][7] [Zed][calm][1]' }];
  const { flow, posts } = mk(null); flow.force(); await wait(50);
  assert.equal(posts.length, 1); const m = posts[0];
  assert.equal(m.type, 'eden-map:media'); assert.equal(m.on, true); assert.deepEqual(m.cats, ['calm', 'busy']); assert.equal(m.chars.length, 1);
  assert.deepEqual(m.scenes.map(s => [s.floor, s.place, s.who, s.cat, s.n, s.url]), [[2, 'Yard', 'Aria·Vale', 'calm', 2, U('a', 'calm', 2)], [4, 'Hall', 'Aria·Vale', 'busy', 7, U('a', 'busy', 1)]]);   // the think block is not text; Zed is not in the table; 7 wraps round 1 picture
  flow.schedule(0); await wait(50); assert.equal(posts.length, 1, 'nothing changed: nothing sent');
  msgs = [...msgs, { message_id: 5, message: '[Aria][calm][1]' }]; flow.schedule(0); await wait(50);
  assert.equal(posts.length, 2); assert.equal(posts[1].chars, undefined, 'the table is not resent when it did not change'); assert.equal(posts[1].scenes.length, 3);
  flow.force(); await wait(50); assert.equal(posts.length, 3); assert.ok(posts[2].chars, 'the viewer asked again: everything is sent again');
});
test('flow: switch off = nothing read or drawn (one clearing message); no storage was written; a pack without a source sends nothing', async () => {
  const { flow, posts } = mk('1'); flow.force(); await wait(40); assert.equal(posts.length, 1);
  const off = mk('0'); off.flow.force(); await wait(40); assert.deepEqual(off.posts, []);   // never on: nothing at all
  const sw = { v: '1' }; const posts2 = []; let fl = 4;
  const f2 = createGalleryFlow({ alive: true, get floorNow() { return fl; }, frame: null, life: { dead: false }, lsGet: () => sw.v, post: m => posts2.push(m), mvuBridge: { chatId: () => 'c', floorPlace: () => ({ place: 'Yard' }), rosterRows: () => [] } });
  f2.force(); await wait(40); sw.v = '0'; f2.force(); await wait(40);
  assert.deepEqual(posts2.map(p => p.on), [true, false]);
  setProfile(profileOf({ entities: { avatar: AVATAR } })); const none = mk(null); none.flow.force(); await wait(40); assert.deepEqual(none.posts, []);
  assert.deepEqual(writes, [], 'no address or table was persisted'); assert.equal(store.size, 0);
});
