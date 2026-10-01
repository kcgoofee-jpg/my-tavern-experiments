// K-R70 per-view theme: the first pack's overlay `ui.theme.views` produce the CSS the engine used to carry (tokens.css / viewer.html), the cascade is unchanged,
// bad ids and tokens are dropped and listed, and body[data-glow] follows the view that defines --glow-text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { themeCss, applyTheme, syncGlow } from '../map/app/theme.mjs';
import { applyOverlayUi } from '../map/core/overlay-v2.mjs';
import { fromV1 } from '../map/core/compat-v1.mjs';
import { edenInputs } from './helpers/eden-inputs.mjs';
import { THEME_CSS_V1 } from './helpers/s43_frozen.mjs';

const norm = s => s.replace(/\s+/g, ' ').trim();
const rd = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const ui = fromV1(edenInputs()).pack.ui;
const fakeDoc = () => { const kids = new Map(), doc = { head: { appendChild: el => kids.set(el.id, el) }, body: { dataset: {} }, kids,
  getElementById: id => kids.get(id) || null, createElement: () => ({ id: '', textContent: '', remove() { kids.delete(this.id); } }) }; return doc; };

test('the first pack: ui.theme.views give the same CSS as the four blocks that lived in tokens.css (token names and values verbatim, same selectors, same order)', () => {
  const got = themeCss(ui).split('\n').map(norm);
  assert.deepEqual([...got].sort(), THEME_CSS_V1.map(norm).sort());   // the same four rules (the old file listed both dark blocks first; here it is per view, dark then light — the light rules are more specific, so the order between views and themes does not matter)
  assert.equal(got.length, 4);
});
test('the cascade is unchanged: dark block then light block per view, selectors equal the old ones', () => {
  const css = themeCss(ui), sel = css.split('\n').map(l => l.slice(0, l.indexOf('{')).trim());
  assert.deepEqual(sel, ['[data-map="tc_mid"]', '.light [data-map="tc_mid"], .light[data-map="tc_mid"]', '[data-map="tc_low"]', '.light [data-map="tc_low"], .light[data-map="tc_low"]']);
  for (const old of THEME_CSS_V1) assert.ok(css.split('\n').map(norm).includes(norm(old)), old.slice(0, 40));
  assert.doesNotMatch(rd('map/ui/tokens.css'), /data-map="tc_/); assert.doesNotMatch(rd('map/viewer.html'), /\[data-map="tc_/);
});
test('bad ids and tokens are dropped at run time (K-R64) and listed when the overlay is merged', () => {
  const evil = { theme: { views: { tc_a: { tokens: { '--bg': '#101010', '--ink': 'red;background:url(x)', '--accent': '</style>', '--evil': 'red', '--line': '#12345g' }, light: { '--bg': '#ffffff' } }, 'x"]{}': { tokens: { '--bg': '#000000' } }, tc_b: { tokens: { '--ink': 'url(javascript:1)' } } } } };
  assert.equal(themeCss(evil), '[data-map="tc_a"] { --bg: #101010; }\n.light [data-map="tc_a"], .light[data-map="tc_a"] { --bg: #ffffff; }');   // the engine re-checks even what the merge let through
  const p = [], merged = applyOverlayUi(undefined, evil, p);
  assert.deepEqual(Object.keys(merged.theme.views), ['tc_a', 'tc_b']); assert.deepEqual(merged.theme.views.tc_a.tokens, { '--bg': '#101010' }); assert.deepEqual(merged.theme.views.tc_b.tokens, {});
  assert.equal(p.filter(e => e.code === 'overlay-token-invalid').length, 5); assert.equal(p.filter(e => e.code === 'overlay-view-invalid').length, 1);
  assert.equal(themeCss(undefined), ''); assert.equal(themeCss({}), ''); assert.equal(themeCss({ theme: { views: 'x' } }), '');
});
test('a comma list is accepted for --glow* only', () => {
  const glow = '-1px 0 #3de0ff, 1px 0 #ff3d9a, 0 0 10px rgba(255, 61, 154, .7)';
  assert.match(themeCss({ theme: { views: { v: { tokens: { '--glow-text': glow, '--glow': '0 0 10px #fff' } } } } }), /--glow-text: -1px 0 #3de0ff, 1px 0 #ff3d9a, 0 0 10px rgba\(255, 61, 154, \.7\); --glow: 0 0 10px #fff;/);
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
  assert.match(rd('map/viewer.html'), /body\[data-glow="1"\] #layers button\.on/); assert.match(rd('map/events-view.mjs'), /body:not\(\[data-glow="1"\]\) \.ev i/);
  assert.doesNotMatch(rd('map/events-view.mjs') + rd('map/viewer.html'), /\[data-map="tc_mid"\]/);
  assert.match(rd('map/app/map-switch.mjs'), /document\.body\.dataset\.map = id; syncGlow\(id\)/);
});
