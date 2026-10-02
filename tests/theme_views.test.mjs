// K-R70 per-view theme (LOOK-1 A9 / D42: the first pack no longer ships per-view skins — the kernel ability stays, pinned here by a fixture of the
// old eden values): the cascade is unchanged, bad ids and tokens are dropped and listed, and body[data-glow] follows the view that defines --glow-text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { themeCss, applyTheme, syncGlow } from '../map/app/theme.mjs';
import { applyOverlayUi } from '../map/core/overlay-v2.mjs';
import { THEME_CSS_V1 } from './helpers/s43_frozen.mjs';

const norm = s => s.replace(/\s+/g, ' ').trim();
const rd = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
// the old first-pack values (overlay.v2.json ui.theme.views until A9), kept as the engine-mapping fixture
const VIEWS = {
  tc_mid: { tokens: { '--bg': '#120a1f', '--surface': '#1a1029', '--line': 'rgba(255, 61, 154, .24)', '--ink': '#f3e6ff', '--ink-2': '#dccbf0', '--muted': '#ac9ec3', '--accent': '#ff3d9a', '--on-accent': '#1a0610', '--accent-2': '#3de0ff', '--glow': '0 0 10px rgba(255, 61, 154, .7)', '--glow-text': '-1px 0 #3de0ff, 1px 0 #ff3d9a, 0 0 10px rgba(255, 61, 154, .7)' },
    light: { '--bg': '#f1ecf7', '--surface': '#f9f6fc', '--line': 'rgba(29, 18, 48, .16)', '--ink': '#1d1230', '--ink-2': '#3a2b52', '--muted': '#66537f', '--accent': '#b3155f', '--on-accent': '#fff', '--accent-2': '#0f8fa8', '--glow': 'none', '--glow-text': 'none' } },
  tc_low: { tokens: { '--bg': '#0b0b0b', '--surface': '#111411', '--line': 'rgba(159, 232, 112, .2)', '--ink': '#d8e8cc', '--ink-2': '#bcd0ae', '--muted': '#7aa35c', '--accent': '#9fe870', '--on-accent': '#0b1406', '--accent-2': '#f4f1e8', '--ok': 'var(--muted)' },
    light: { '--bg': '#f4f1e8', '--surface': '#f8f6ef', '--line': 'rgba(27, 36, 20, .16)', '--ink': '#1b2414', '--ink-2': '#34402b', '--muted': '#55664a', '--accent': '#336619', '--on-accent': '#fff', '--accent-2': '#8a7a52' } },
};
const ui = { theme: { views: VIEWS } };
const fakeDoc = () => { const kids = new Map(), doc = { head: { appendChild: el => kids.set(el.id, el) }, body: { dataset: {} }, kids,
  getElementById: id => kids.get(id) || null, createElement: () => ({ id: '', textContent: '', remove() { kids.delete(this.id); } }) }; return doc; };

test('ui.theme.views give four rules, one per view and theme, and each carries only map-space tokens (S7-2 U-04 B: the old chrome values no longer reach the chrome)', () => {
  const got = themeCss(ui).split('\n');
  assert.equal(got.length, THEME_CSS_V1.length);   // still the same four rules
  for (const l of got) assert.doesNotMatch(l.slice(l.indexOf('{')), /--(bg|surface|line|ink|ink-2|muted|accent|accent-2|on-accent|ok|glow|glow-text):/, 'no chrome token in a per-view rule');
  for (const l of got) assert.match(l.slice(l.indexOf('{')), /--map-accent: #[0-9a-f]{6}; --map-pin: #[0-9a-f]{6}; --map-select/);
});
test('the cascade is unchanged: dark block then light block per view, selectors equal the old ones', () => {
  const css = themeCss(ui), sel = css.split('\n').map(l => l.slice(0, l.indexOf('{')).trim());
  assert.deepEqual(sel, ['[data-map="tc_mid"]', '.light [data-map="tc_mid"], .light[data-map="tc_mid"]', '[data-map="tc_low"]', '.light [data-map="tc_low"], .light[data-map="tc_low"]']);
  assert.doesNotMatch(rd('map/ui/tokens.css'), /data-map="tc_/); assert.doesNotMatch(rd('map/viewer.html'), /\[data-map="tc_/);
});
test('bad ids and tokens are dropped at run time (K-R64) and listed when the overlay is merged', () => {
  const evil = { theme: { views: { tc_a: { tokens: { '--bg': '#101010', '--ink': 'red;background:url(x)', '--accent': '</style>', '--evil': 'red', '--line': '#12345g' }, light: { '--bg': '#ffffff' } }, 'x"]{}': { tokens: { '--bg': '#000000' } }, tc_b: { tokens: { '--ink': 'url(javascript:1)' } } } } };
  assert.equal(themeCss(evil), '[data-map="tc_a"] { --map-tint: #101010; }\n.light [data-map="tc_a"], .light[data-map="tc_a"] { --map-tint: #ffffff; }');   // the engine re-checks even what the merge let through
  const p = [], merged = applyOverlayUi(undefined, evil, p);
  assert.deepEqual(Object.keys(merged.theme.views), ['tc_a', 'tc_b']); assert.deepEqual(merged.theme.views.tc_a.tokens, { '--bg': '#101010' }); assert.deepEqual(merged.theme.views.tc_b.tokens, {});
  assert.equal(p.filter(e => e.code === 'overlay-token-invalid').length, 5); assert.equal(p.filter(e => e.code === 'overlay-view-invalid').length, 1);
  assert.equal(themeCss(undefined), ''); assert.equal(themeCss({}), ''); assert.equal(themeCss({ theme: { views: 'x' } }), '');
});
test('a comma list is accepted for --glow* only', () => {
  const glow = '-1px 0 #3de0ff, 1px 0 #ff3d9a, 0 0 10px rgba(255, 61, 154, .7)';
  assert.match(themeCss({ theme: { views: { v: { tokens: { '--glow-text': glow, '--glow': '0 0 10px #fff' } } } } }), /--map-glow-text: -1px 0 #3de0ff, 1px 0 #ff3d9a, 0 0 10px rgba\(255, 61, 154, \.7\); --map-glow: 0 0 10px #fff;/);
  assert.equal(themeCss({ theme: { views: { v: { tokens: { '--ink': '#fff, #000', '--glow': '1px 0 #fff, 2px 0 #fff, 3px 0 #fff, 4px 0 #fff' } } } } }), '');
});
test('applyTheme writes one <style id="packTheme"> (textContent) and body[data-glow] follows the current view', () => {
  const doc = fakeDoc(); doc.body.dataset.map = 'tc_mid';
  applyTheme(ui, doc);
  assert.equal(doc.kids.size, 1); assert.equal(doc.kids.get('packTheme').textContent, themeCss(ui)); assert.equal(doc.body.dataset.glow, '1');   // tc_mid defines --glow-text
  syncGlow('tc_low', doc); assert.equal(doc.body.dataset.glow, undefined);
  syncGlow('tc_mid', doc); assert.equal(doc.body.dataset.glow, '1');
  syncGlow('world', doc); assert.equal(doc.body.dataset.glow, undefined); syncGlow(undefined, doc); assert.equal(doc.body.dataset.glow, undefined);
  applyTheme(ui, doc); assert.equal(doc.kids.size, 1, 'a second call replaces the style');
  applyTheme(undefined, doc); assert.equal(doc.kids.size, 0); assert.equal(doc.body.dataset.glow, undefined);   // no theme data = no style, no glow (town, minimal)
});
test('the selectors that depended on the glow view read body[data-glow]', () => {
  assert.doesNotMatch(rd('map/viewer.html'), /body\[data-glow="1"\] #layers/, 'S7-2: the chrome has no glow rule'); assert.match(rd('map/events-view.mjs'), /body:not\(\[data-glow="1"\]\) \.ev i/);
  assert.doesNotMatch(rd('map/events-view.mjs') + rd('map/viewer.html'), /\[data-map="tc_mid"\]/);
  assert.match(rd('map/app/map-switch.mjs'), /document\.body\.dataset\.map = id; syncGlow\(id\)/);
});
