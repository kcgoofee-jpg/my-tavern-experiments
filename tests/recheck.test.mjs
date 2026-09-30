// K-R64 run-time re-check helpers (core/pack-v2-spec.mjs `recheck`): accept / reject tables, including the I-09 attack strings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { recheck } from '../map/core/pack-v2-spec.mjs';

const ATTACK = ['red;background:url(x)', '#12345g', '</style>', '"><img src=x onerror=1>', 'url(javascript:1)', '#fff;}body{display:none', '', 7, null, undefined, {}];

test('recheck.hex: exactly #rrggbb', () => {
  for (const ok of ['#000000', '#FFFFFF', '#e6c36a']) assert.equal(recheck.hex(ok), ok);
  for (const bad of [...ATTACK, '#fff', '#12345', '#1234567', 'e6c36a', ' #e6c36a', '#e6c36a ']) assert.equal(recheck.hex(bad), null, String(bad));
});
test('recheck.id: a kernel id (lower-case, digits, underscore, 64 max)', () => {
  for (const ok of ['tc_mid', 'world', 'a', 'lm_hunting_camp']) assert.equal(recheck.id(ok), ok);
  for (const bad of [...ATTACK, 'Tc', '1a', 'a-b', 'a b', 'a'.repeat(65), 'a"]{}']) assert.equal(recheck.id(bad), null, String(bad));
});
test('recheck.token: the K-R58 name list and value grammar', () => {
  const ok = [['--bg', '#120a1f'], ['--line', 'rgba(255, 61, 154, .24)'], ['--accent', 'var(--gold)'], ['--glow', 'none'], ['--r-card', '12px'], ['--fs-body', '1.2rem'], ['--ok', 'var(--muted)'], ['--on-accent', '#1a0610']];
  for (const [n, v] of ok) assert.equal(recheck.token(n, v), v, n);
  for (const [n, v] of [['--evil', 'red'], ['--font-ui', 'serif'], ['bg', 'red'], ['--bg', 'url(x)'], ['--bg', 'red;background:url(x)'], ['--bg', '#12345g'], ['--bg', '</style>'], ['--bg', '"x"'], ['--bg', 'a\\b'], ['--bg', 'calc(1px + 2px)'], ['--bg', 'a b c d e']]) assert.equal(recheck.token(n, v), null, `${n}: ${v}`);
  for (const bad of ATTACK) assert.equal(recheck.token('--bg', bad), null, String(bad));
});
test('K-R70: only --glow* may be a comma list, at most 3 groups of at most 4 terms', () => {
  const g3 = '-1px 0 #3de0ff, 1px 0 #ff3d9a, 0 0 10px rgba(255, 61, 154, .7)';
  assert.equal(recheck.token('--glow-text', g3), g3); assert.equal(recheck.token('--glow', g3), g3);
  assert.equal(recheck.token('--glow', '1px 0 #fff,2px 0 #000'), '1px 0 #fff,2px 0 #000');
  assert.equal(recheck.token('--glow', '1px 0 #fff, 2px 0 #fff, 3px 0 #fff, 4px 0 #fff'), null);   // 4 groups
  assert.equal(recheck.token('--glow', '1px 0 #fff #000 red, 2px'), null);                         // 5 terms in a group
  assert.equal(recheck.token('--bg', '#fff, #000'), null); assert.equal(recheck.token('--ink', g3), null);
  assert.equal(recheck.token('--glow', '0 0 10px url(x), 1px'), null); assert.equal(recheck.token('--glow', '0 0 1px red;}'), null);
});
