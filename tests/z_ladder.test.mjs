// S7-2 T2: the one z ladder lives in map/ui/tokens.css (host page: the --zh-* block of tavern/host-tokens.mjs). Every var(--z...) used under map/ is defined there, none keeps a literal fallback,
// and the viewport slots equal core/layer-registry.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { SLOTS, slotZ } from '../map/core/layer-registry.mjs';
import { HOST_TOKENS_CSS } from '../map/tavern/host-tokens.mjs';

const MAP = fileURLToPath(new URL('../map/', import.meta.url));
const tokens = readFileSync(path.join(MAP, 'ui/tokens.css'), 'utf8');
const walk = d => readdirSync(d).flatMap(n => { const p = path.join(d, n); return statSync(p).isDirectory() ? (/node_modules|vendor|^art$|^data$|^packs$|model|tiles/.test(n) ? [] : walk(p)) : /\.(mjs|js|html|css)$/.test(n) ? [p] : []; });
const defs = css => new Set([...css.matchAll(/(--z[a-z]+-[a-z0-9-]+|--zl-\w+):\s*(-?\d+)/g)].map(m => m[1]));
const defined = new Set([...defs(tokens), ...defs(HOST_TOKENS_CSS)]);

test('every var(--z...) used in map/** is defined in tokens.css or the host token block, and none carries a literal fallback', () => {
  const used = new Map();
  for (const f of walk(MAP)) {
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/var\((--z[a-z]+-[a-z0-9-]+|--zl-\w+)\s*(,[^)]*)?\)/g)) { used.set(m[1], f); assert.equal(m[2], undefined, `${path.relative(MAP, f)}: ${m[0]} keeps a literal fallback`); }
  }
  assert.ok(used.size >= 20, 'the ladder is used');
  for (const [name, f] of used) assert.ok(defined.has(name), `${name} (in ${path.relative(MAP, f)}) is not defined in tokens.css / host-tokens.mjs`);
});
test('the --zv-* viewport slots equal the layer registry (z = (slot index + 1) x 10)', () => {
  for (const slot of SLOTS) { const m = tokens.match(new RegExp(`--zv-${slot}:\\s*(\\d+)`)); assert.ok(m, slot); assert.equal(+m[1], slotZ(slot)); }
});
test('the host --zh-* values are the ones tokens.css carries (one ladder, two homes)', () => {
  for (const m of HOST_TOKENS_CSS.matchAll(/(--zh-[a-z]+):\s*(\d+)/g)) assert.match(tokens, new RegExp(`${m[1]}:\\s*${m[2]}\\b`), m[1]);
});
test('no engine file writes a bare z-index (the ratchet ledger section is empty)', () => {
  const base = JSON.parse(readFileSync(new URL('../tools/arch_baseline.json', import.meta.url), 'utf8'));
  assert.deepEqual(base.zindex, {});
});
