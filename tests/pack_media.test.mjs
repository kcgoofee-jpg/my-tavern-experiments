// K-R101: pack pictures. map/core/pack-media.mjs (sources, sizes, the https switch) and their place in validate2 (the media block, node and view references, limits by source).
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkMedia, mediaUrl, decodedBytes, srcKind, nodePictures, MAX_PICTURE } from '../map/core/pack-media.mjs';
import { validate2, SOURCE_BYTES } from '../map/core/pack-v2.mjs';
import { projectV2 } from '../map/core/pack-v2-view.mjs';
import { PNG, dataUrl, base } from './helpers/pack_pics.mjs';

const B = 'packs/tide/';
test('allowed: a path under the base, a data URL up to 3 MB, https with the switch on', () => {
  assert.deepEqual(checkMedia({ src: 'art/a.webp' }, { base: B }), { item: { src: 'art/a.webp' }, code: '' });
  assert.equal(mediaUrl({ src: 'art/a.webp' }, { base: B }), B + 'art/a.webp');
  assert.equal(checkMedia({ src: PNG }).code, ''); assert.equal(mediaUrl({ src: PNG }), PNG);
  assert.equal(checkMedia({ src: dataUrl(MAX_PICTURE) }).code, '', 'exactly 3 MB decoded is allowed');
  assert.equal(checkMedia({ src: 'https://cdn.example.test/pics/a.png' }, { remoteOn: true }).code, '');
  assert.equal(mediaUrl({ src: 'https://cdn.example.test/pics/a.png' }, { remoteOn: true }), 'https://cdn.example.test/pics/a.png');
});
test('refused: .., other schemes, svg and html data, a query string, over 3 MB; https with the switch off is a placeholder', () => {
  for (const src of ['../a.png', 'a/../b.png', '/etc/a.png', 'a\\b.png', 'javascript:alert(1)', 'http://cdn.example.test/a.png', 'file:///a.png', 'ftp://x.test/a.png', 'a.svg', 'a.png?x=1', 'https://cdn.example.test/a.png?x=1',
    'https://cdn.example.test/a.png#f', 'https://user@cdn.example.test/a.png', 'data:text/html;base64,PGI+', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,@@@', 'data:image/png,abc', '', 5, null, undefined]) {
    assert.equal(checkMedia({ src }, { base: B, remoteOn: true }).item, null, String(src));
    assert.equal(mediaUrl({ src }, { base: B, remoteOn: true }), null, String(src));
  }
  assert.equal(checkMedia({ src: dataUrl(MAX_PICTURE + 4) }).code, 'media-size');
  assert.equal(checkMedia({ src: 'a/b.png' }, { base: '' }).code, 'media-src', 'a card or file pack has no base: a path is refused');
  const off = checkMedia({ src: 'https://cdn.example.test/a.png', note: 'n' }, { remoteOn: false });
  assert.equal(off.code, 'media-remote-off'); assert.equal(off.item.note, 'n', 'the item stays so its note can show'); assert.equal(mediaUrl(off.item, { remoteOn: false }), null);
  assert.equal(srcKind('data:image/webp;base64,AAAA'), 'data'); assert.equal(decodedBytes('data:image/png;base64,QUJD'), 3); assert.equal(decodedBytes('data:image/png;base64,QUI='), 2);
});
test('nodePictures lists a node\'s pictures in order with their address or null', () => {
  const media = { a: { src: PNG }, b: { src: 'https://cdn.example.test/b.png' }, c: { src: 'x.png' } };
  const r = nodePictures(media, ['b', 'zz', 'a', 'c'], { base: B });
  assert.deepEqual(r.map(x => [x.id, x.url]), [['b', null], ['a', PNG], ['c', B + 'x.png']]);
});

test('validate2: the media block is checked item by item; a bad item is dropped with one problem and never reaches a node or a view', () => {
  const m = { ...base(), media: { ok: { src: PNG, w: 1, h: 1, note: 'n' }, bad1: { src: 'javascript:alert(1)' }, bad2: { src: 'http://x.test/a.png' }, bad3: { src: dataUrl(MAX_PICTURE + 4) }, Bad: { src: PNG }, nosrc: {} } };
  m.nodes[1].media = ['ok', 'bad1', 'zz'];
  const r = validate2(m, { trusted: false, source: 'file' }), codes = r.problems.map(p => p.code + ':' + p.path);
  assert.deepEqual(Object.keys(r.pack.media), ['ok']);
  assert.deepEqual(r.pack.nodes[1].media, ['ok'], 'only existing, valid items stay in a node list');
  for (const p of ['media.bad1.src', 'media.bad2.src', 'media.bad3.src']) assert.ok(r.problems.some(x => x.path === p), p);
  assert.ok(codes.includes('limit-media:media.bad3.src') && codes.some(c => c.startsWith('key:media.Bad')) && codes.includes('missing:media.nosrc'));
  assert.ok(codes.includes('ref-media:nodes[1].media[1]') && codes.includes('ref-media:nodes[1].media[2]'));
  assert.ok(!JSON.stringify(r.problems).includes('base64'), 'a problem never carries a picture');
});
test('validate2: an image view needs src or media; media must exist; the string cap does not cut a data URL but the size limit counts it', () => {
  const m = { ...base(), media: { map: { src: PNG } }, views: { a: { kind: 'image', media: 'map' }, b: { kind: 'image' }, c: { kind: 'image', media: 'nope' }, d: { kind: 'image', src: 'x.png', media: 'nope' } } };
  const r = validate2(m, { trusted: false });
  assert.deepEqual(Object.keys(r.pack.views), ['a', 'd']); assert.equal(r.pack.views.d.media, undefined, 'a missing picture falls back to src');
  const big = { ...base(), media: { x: { src: dataUrl(60000) } } };   // ~80 000 characters, far over the 4000 string cap
  assert.equal(validate2(big, { trusted: false }).pack.media.x.src.length, dataUrl(60000).length);
  const many = { ...base(), media: Object.fromEntries(Array.from({ length: 201 }, (_, i) => ['m' + i, { src: PNG }])) };
  const rm = validate2(many, { trusted: false }); assert.equal(Object.keys(rm.pack.media).length, 200); assert.ok(rm.problems.some(p => p.code === 'too-many' && p.path === 'media'));
  const lots = { ...base(), nodes: base().nodes.map(n => ({ ...n, media: Array.from({ length: 33 }, (_, i) => 'm' + i) })), media: Object.fromEntries(Array.from({ length: 33 }, (_, i) => ['m' + i, { src: PNG }])) };
  assert.equal(validate2(lots, { trusted: false }).pack.nodes[0].media.length, 32);
});
test('limits by source (Z-12, K-R66): 1 MB embedded in a card, 8 MB from a URL or a file, 8 MB for the exporter', () => {
  assert.deepEqual({ ...SOURCE_BYTES }, { card: 1 << 20, url: 8 << 20, file: 8 << 20, export: 8 << 20 });
  const pics = n => ({ ...base(), media: Object.fromEntries(Array.from({ length: n }, (_, i) => ['m' + i, { src: dataUrl(500000 + i) }])) });   // each ~0.67 MB of text
  const three = pics(3);   // ~2 MB
  assert.equal(validate2(three, { trusted: false }).pack, null, 'default and card: 1 MB');
  assert.equal(validate2(three, { trusted: false, source: 'card' }).pack, null);
  assert.deepEqual(validate2(three, { trusted: false, source: 'card' }).problems.map(p => p.code), ['limit-size']);
  for (const source of ['url', 'file', 'export']) assert.ok(validate2(three, { trusted: false, source }).pack, source);
  assert.equal(validate2(pics(13), { trusted: false, source: 'url' }).pack, null, 'over 8 MB is refused even from a URL');
  assert.ok(validate2(three, { trusted: false, maxBytes: 3 << 20 }).pack, 'an explicit maxBytes wins');
});
test('projectV2: a pack picture as the frame of an image view; refused sources leave no map and one problem; https only behind the switch', () => {
  const m = { ...base(), media: { a: { src: PNG }, r: { src: 'https://cdn.example.test/a.png' } }, views: { root: { kind: 'image', media: 'a' }, alpha: { kind: 'image', media: 'r' } } };
  const p = validate2(m, { trusted: false }).pack;
  const off = projectV2(p, { base: '' }); assert.deepEqual(off.registry.maps.root.base, { type: 'image', url: PNG });
  assert.ok(!off.registry.maps.alpha && off.problems.some(x => x.code === 'view-media' && x.id === 'alpha'));
  const on = projectV2(p, { base: '', remoteOn: true }); assert.deepEqual(on.registry.maps.alpha.base, { type: 'image', url: 'https://cdn.example.test/a.png' });
});
