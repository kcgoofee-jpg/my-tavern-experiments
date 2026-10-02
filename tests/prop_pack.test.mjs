// S8-3 (K-R88, E-03): the pure rules of the local prop pack: type from the bytes, the technical limits, ids, placements. Fixtures are built here (no files).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sniff, checkProp, propId, normPlacement, normPlacements, PROP_LIMITS } from '../map/core/prop-pack.mjs';

const enc = s => new TextEncoder().encode(s);
const glb = (version = 2) => { const b = new Uint8Array(12); b.set(enc('glTF')); new DataView(b.buffer).setUint32(4, version, true); new DataView(b.buffer).setUint32(8, 12, true); return b; };
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const webp = () => { const b = new Uint8Array(16); b.set(enc('RIFF')); b.set(enc('WEBP'), 8); return b; };
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8"/></svg>';

test('sniff: glb needs `glTF` and version 2; png the 8-byte signature; webp RIFF..WEBP; svg an <svg root', () => {
  assert.equal(sniff(glb()), 'glb');
  assert.equal(sniff(glb(1)), null, 'a glb of version 1 is not accepted');
  assert.equal(sniff(PNG), 'png');
  assert.equal(sniff(webp()), 'webp');
  assert.equal(sniff(enc(SVG), 'a.svg'), 'svg');
  assert.equal(sniff(enc('<?xml version="1.0"?>\n<!-- c -->\n' + SVG)), 'svg', 'xml declaration and comment before the root');
  assert.equal(sniff(enc('﻿' + SVG)), 'svg', 'a byte order mark');
  assert.equal(sniff(enc('<html><svg/></html>')), null);
  assert.equal(sniff(enc('hello world, plain text')), null);
  assert.equal(sniff(Uint8Array.from([1, 2, 3])), null);
  assert.equal(sniff(new Uint8Array(0)), null);
  assert.equal(sniff(enc(SVG), 'notes.txt'), null, 'a name that says it is not an svg');
  assert.equal(sniff(Uint8Array.from([0xff, 0xfe, 0xfd, 0xfc, 0xfb, 0x3c])), null, 'bytes that are not UTF-8 text');
});

test('checkProp: size caps per type (glb 8 MB, images 1 MB, svg 256 KB), unknown types refused', () => {
  assert.deepEqual(checkProp({ type: 'glb', bytes: PROP_LIMITS.glb }), { ok: true, problems: [] });
  assert.deepEqual(checkProp({ type: 'glb', bytes: PROP_LIMITS.glb + 1 }).problems, ['prop-size']);
  assert.equal(checkProp({ type: 'png', bytes: 1 << 20 }).ok, true);
  assert.equal(checkProp({ type: 'png', bytes: (1 << 20) + 1 }).ok, false);
  assert.equal(checkProp({ type: 'webp', bytes: (1 << 20) + 1 }).ok, false);
  assert.equal(checkProp({ type: 'svg', bytes: 262144, text: SVG }).ok, true);
  assert.equal(checkProp({ type: 'svg', bytes: 262145, text: SVG }).ok, false);
  assert.equal(checkProp({ type: 'png', bytes: 0 }).ok, false);
  assert.deepEqual(checkProp({ type: 'gif', bytes: 5 }).problems, ['prop-type']);
  assert.deepEqual(checkProp().problems, ['prop-type']);
});

test('checkProp: an svg with a script, a foreignObject, an on-handler or a javascript: link is refused (the refusal cases)', () => {
  const bad = {
    'svg-script': '<svg xmlns="x"><script>alert(1)</script></svg>',
    'svg-foreign': '<svg xmlns="x"><foreignObject><div/></foreignObject></svg>',
    'svg-handler': '<svg xmlns="x"><rect onclick="x()" width="1" height="1"/></svg>',
    'svg-link': '<svg xmlns="x" xmlns:xlink="y"><a xlink:href="javascript:alert(1)"><rect/></a></svg>',
  };
  for (const [code, text] of Object.entries(bad)) { const r = checkProp({ type: 'svg', bytes: text.length, text }); assert.equal(r.ok, false, code); assert.ok(r.problems.includes(code), code); }
  assert.deepEqual(checkProp({ type: 'svg', bytes: 5 }).problems, ['svg-text'], 'an svg without text cannot be checked, so it is refused');
  assert.equal(checkProp({ type: 'svg', bytes: SVG.length, text: SVG.replace('rect', 'circle') }).ok, true);
  assert.equal(checkProp({ type: 'svg', bytes: 80, text: '<svg xmlns="x"><path d="M0 0" stroke-linejoin="round" font-weight="1"/></svg>' }).ok, true, 'attribute names that merely contain "on" are fine');
});

test('propId: ASCII ids from names, unique among the existing, p_<n> when the name has none, never longer than 32', () => {
  assert.equal(propId('Lantern.glb', []), 'Lantern');
  assert.equal(propId('Lantern.glb', ['Lantern']), 'Lantern-2');
  assert.equal(propId('Lantern.glb', ['Lantern', 'Lantern-2']), 'Lantern-3');
  assert.equal(propId('my little prop!.png', []), 'my-little-prop');
  assert.equal(propId('灯笼.glb', []), 'p_1');
  assert.equal(propId('灯笼.glb', ['p_1', 'p_2']), 'p_3');
  assert.equal(propId('', []), 'p_1');
  assert.ok(propId('x'.repeat(100), []).length <= 32);
  assert.match(propId('a b/c\\d:e', []), /^[A-Za-z0-9_-]{1,64}$/);
});

test('placements: { prop, map, at } with at in 0..1; bad rows dropped; at most 200, the newest kept', () => {
  assert.deepEqual(normPlacement({ prop: 'p_1', map: 'town_hill', at: [0.25, 0.5], extra: 1 }), { prop: 'p_1', map: 'town_hill', at: [0.25, 0.5] });
  for (const bad of [null, {}, { prop: 'p', map: 'm', at: [2, 0] }, { prop: 'p', map: 'm', at: [0] }, { prop: 'a b', map: 'm', at: [0, 0] }, { prop: 'p', map: '', at: [0, 0] }, { prop: 'p', map: 'm', at: [NaN, 0] }, { prop: 'p', map: 'm', at: ['0', '0'] }]) assert.equal(normPlacement(bad), null);
  const many = Array.from({ length: 250 }, (_, i) => ({ prop: 'p' + i, map: 'm', at: [0, 0] }));
  const out = normPlacements([...many, { bad: true }]);
  assert.equal(out.length, 200); assert.equal(out.at(-1).prop, 'p249'); assert.deepEqual(normPlacements('x'), []);
});

test('limits: 64 props and 64 MB per pack, 200 placements; the pure module touches no DOM, storage or network', () => {
  assert.deepEqual([PROP_LIMITS.count, PROP_LIMITS.total, PROP_LIMITS.placements], [64, 64 << 20, 200]);
  const src = fs.readFileSync(fileURLToPath(new URL('../map/core/prop-pack.mjs', import.meta.url)), 'utf8').replace(/^\/\/.*$/gm, '');
  assert.doesNotMatch(src, /\b(document|window|localStorage|indexedDB|fetch|XMLHttpRequest)\b/);
});

test('privacy (static): the prop modules make no network call and send no message to the host', () => {
  for (const f of ['map/app/prop-store.mjs', 'map/app/local-props-view.mjs']) {
    const src = fs.readFileSync(fileURLToPath(new URL('../' + f, import.meta.url)), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(src, /\bfetch\(|XMLHttpRequest|sendBeacon|postMessage|\bpost\(|WebSocket|https?:\/\//, f);
  }
});
test('placing a prop turns the (default-off) local-props layer on and says so through the notice layer; both strings exist', () => {
  const src = fs.readFileSync(fileURLToPath(new URL('../map/app/local-props-view.mjs', import.meta.url)), 'utf8');
  assert.match(src, /registry\.setVisible\(ID, true\)/); assert.match(src, /showNotice\?\.\(\{[^}]*props\.shown/);
  assert.equal((src.match(/reveal\(\);/g) || []).length, 2, 'both the explicit and the picked placement reveal');
  for (const l of ['zh', 'en']) assert.ok(JSON.parse(fs.readFileSync(fileURLToPath(new URL(`../map/i18n/${l}.json`, import.meta.url)), 'utf8'))['props.shown'], l);
});
