// S7-2 (U-04 B'): one chrome token set; the pack's per-view theme feeds only --map-*; ui.theme.chrome is the one pack-wide chrome accent (K-R70 amended).
// LOOK-1 A9 (D42): the first pack no longer ships per-view skins — the mapping stays pinned here by a fixture of the old eden values.
import test from 'node:test';
import assert from 'node:assert/strict';
import { themeCss, chromeCss, onAccentFor, MAP_OF } from '../map/app/theme.mjs';
import { applyOverlayUi } from '../map/core/overlay-v2.mjs';
import { THEME_CSS_V1 } from './helpers/s43_frozen.mjs';

const VIEWS = {
  tc_mid: { tokens: { '--bg': '#120a1f', '--surface': '#1a1029', '--line': 'rgba(255, 61, 154, .24)', '--ink': '#f3e6ff', '--ink-2': '#dccbf0', '--muted': '#ac9ec3', '--accent': '#ff3d9a', '--on-accent': '#1a0610', '--accent-2': '#3de0ff', '--glow': '0 0 10px rgba(255, 61, 154, .7)', '--glow-text': '-1px 0 #3de0ff, 1px 0 #ff3d9a, 0 0 10px rgba(255, 61, 154, .7)' },
    light: { '--bg': '#f1ecf7', '--surface': '#f9f6fc', '--line': 'rgba(29, 18, 48, .16)', '--ink': '#1d1230', '--ink-2': '#3a2b52', '--muted': '#66537f', '--accent': '#b3155f', '--on-accent': '#fff', '--accent-2': '#0f8fa8', '--glow': 'none', '--glow-text': 'none' } },
  tc_low: { tokens: { '--bg': '#0b0b0b', '--surface': '#111411', '--line': 'rgba(159, 232, 112, .2)', '--ink': '#d8e8cc', '--ink-2': '#bcd0ae', '--muted': '#7aa35c', '--accent': '#9fe870', '--on-accent': '#0b1406', '--accent-2': '#f4f1e8', '--ok': 'var(--muted)' },
    light: { '--bg': '#f4f1e8', '--surface': '#f8f6ef', '--line': 'rgba(27, 36, 20, .16)', '--ink': '#1b2414', '--ink-2': '#34402b', '--muted': '#55664a', '--accent': '#336619', '--on-accent': '#fff', '--accent-2': '#8a7a52' } },
};
const ui = { theme: { views: VIEWS } };
const decls = css => Object.fromEntries([...css.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
const ruleOf = (css, i) => decls(css.split('\n')[i].slice(css.split('\n')[i].indexOf('{')));

test('eden: each old per-view token lands on its map-space tokens (the mapping is pinned against the frozen pre-S4-3 CSS)', () => {
  const got = themeCss(ui);
  THEME_CSS_V1.forEach((old, i) => {   // frozen order: dark mid, dark low, light mid, light low
    const want = {}, o = decls(old);
    for (const [k, v] of Object.entries(o)) for (const t of MAP_OF[k] || []) want[t] = v;
    const idx = [0, 2, 1, 3][i];   // themeCss order is per view: mid dark, mid light, low dark, low light
    assert.deepEqual(ruleOf(got, idx), want, `rule ${i}`);
  });
  assert.equal(ruleOf(got, 0)['--map-accent'], '#ff3d9a'); assert.equal(ruleOf(got, 0)['--map-pin'], '#ff3d9a'); assert.equal(ruleOf(got, 2)['--map-accent'], '#9fe870');
});
test('town (no per-view theme): nothing is written, so the chrome and map tokens stay the engine defaults', () => {
  assert.equal(themeCss(undefined), ''); assert.equal(themeCss({ theme: { accent: '#63b4be' } }), '');
});
test('the mapping covers accent, accent-2, bg, glow; chrome names in a view are dropped; --map-* names pass through', () => {
  assert.deepEqual(Object.keys(MAP_OF).sort(), ['--accent', '--accent-2', '--bg', '--glow', '--glow-text']);
  const css = themeCss({ theme: { views: { v: { tokens: { '--surface': '#111111', '--ink': '#eeeeee', '--map-label-ink': '#fafafa', '--map-pin': '#123456', '--muted': '#777777' } } } } });
  assert.equal(css, '[data-map="v"] { --map-label-ink: #fafafa; --map-pin: #123456; }');
});
test('ui.theme.chrome: one pack-wide accent for both themes; onAccent computed when absent (the better of the chrome background and white)', () => {
  assert.equal(chromeCss({ theme: { chrome: { accent: '#63b4be', onAccent: '#001010' } } }), ':root, :root.light { --accent: #63b4be; --on-accent: #001010; }');
  assert.match(chromeCss({ theme: { chrome: { accent: '#e6c36a' } } }), /--on-accent: #101418;/);   // light accent -> dark text
  assert.match(chromeCss({ theme: { chrome: { accent: '#1a3a6a' } } }), /--on-accent: #ffffff;/);   // dark accent -> white text
  assert.equal(onAccentFor('#ffffff'), '#101418'); assert.equal(onAccentFor('#000000'), '#ffffff');
  assert.equal(chromeCss({ theme: { chrome: { accent: 'red; x' } } }), ''); assert.equal(chromeCss({ theme: {} }), ''); assert.equal(chromeCss(undefined), '');
  assert.ok(themeCss({ theme: { chrome: { accent: '#63b4be' } } }).startsWith(':root, :root.light'));
});
test('the overlay merge keeps only hex chrome values and lists the rest (K-R70)', () => {
  const p = [], out = applyOverlayUi(undefined, { theme: { chrome: { accent: '#63b4be', onAccent: 'nope', extra: '#000000' } } }, p);
  assert.deepEqual(out.theme.chrome, { accent: '#63b4be' }); assert.equal(p.filter(e => e.code === 'overlay-chrome-invalid').length, 2);
  assert.equal(applyOverlayUi(undefined, { theme: { chrome: 'x' } }, []).theme.chrome, undefined);
});
