// FIX-R2 (U-FIX-8, sweep-2 P2 batch): the pins that need a real DOM are in tools/browser/ufix_r2.mjs; these assert the wiring of the two that do not fail visibly in the stub.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const rd = p => readFileSync(fileURLToPath(new URL('../' + p, import.meta.url)), 'utf8');

test('SW2-05: gallery thumbnails start as a placeholder tile and drop the mark once loaded', () => {
  const s = rd('map/gallery-view.mjs');
  assert.match(s, /el\('img', 'cg-th ld'\)/);
  assert.match(s, /addEventListener\('load', \(\) => i\.classList\.remove\('ld'\)\)/);
  assert.match(s, /\.cg-th\.ld\{background:linear-gradient/);
});

test('SW2-06: a developer group with no visible row is hidden with its heading', () => {
  const s = rd('map/app/settings-wire.mjs');
  assert.match(s, /\$\('#devBox'\)[\s\S]{0,200}dv\.hidden = true/);
});
