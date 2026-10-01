// I-09 (kernel-schema K-R64): the three places that let a pack or chat value reach markup are re-checked at run time.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { safeColor, NEUTRAL } from '../map/app/color-vision-mode.mjs';

// ---- I-09: the three places that let a pack or chat value reach markup, now re-checked at run time ----
const src = f => readFileSync(new URL('../map/' + f, import.meta.url), 'utf8');
const esc = new Function(`${src('app/dom-helpers.mjs').match(/^export const (esc = .*)$/m)[1]}; return esc;`)();   // the viewer's own escape helper (dom-helpers.mjs needs a browser to import)
test('I-09 (1) wbpeek: the capsule label goes through esc() before it reaches innerHTML', () => {
  const s = src('worldbook-peek-view.mjs'); assert.match(s, /\$\{esc\(uiTextOr\('wb\.capsule'/); assert.doesNotMatch(s, /innerHTML = `[^`]*\$\{uiTextOr\(/);
  for (const bad of ['</button><img src=x onerror=alert(1)>', '<script>1</script>', '"><b>']) assert.doesNotMatch(esc(bad), /[<>"]/);
});
test('I-09 (2) events: colours (pack group colour, e.color from the chat script, CVD palette) only reach style as #rrggbb, else the neutral group colour', () => {
  for (const bad of ['red;background:url(x)', '#12345g', '</style>', 'var(--x)', '#fff', undefined]) assert.equal(safeColor(bad), NEUTRAL, String(bad));
  assert.equal(safeColor('#D9A441'), '#D9A441'); assert.equal(NEUTRAL, '#cfd8e0');
  const s = src('events-view.mjs');
  assert.match(s, /const lk = e => \{[^\n]*TCCvd\.safeColor\(/); assert.match(s, /const gcol = g => TCCvd\.safeColor\(/);
  for (const m of s.matchAll(/--c:\$\{([^}]*)\}/g)) assert.match(m[1], /^(top \? lk\(top\)\[1\] : 'var\(--muted\)'|lk\(e\)\[1\]|gcol\(g\))$/, m[1]);   // every style that takes a colour takes it from lk() / gcol()
  assert.match(s, /\[ch, color\] = lk\(e\);/); assert.match(s, /t\.style\.background = lk\(e\)\[1\]/); assert.doesNotMatch(s, /e\.color\b(?![^\n]*lk\()[^\n]*style/);   // the mark, the card tag and the radar colour all come from lk()
});
test('I-09 (3) viewer3d: cvdColor returns #ffffff for anything that is not #rrggbb — with the colour mode off as well — and only a hex reaches the style', () => {
  const v3 = src('props/viewer3d.html'), text = v3.slice(v3.indexOf('const CVD_PAL'), v3.indexOf('// 包内文案')), three = new Function('CVD', `${text}; return cvdColor;`);
  for (const mode of ['0', 'rg', 'by']) { for (const bad of ['red;background:url(x)', '#12345g', '</style>', '"><i>', undefined, null, 7]) assert.equal(three(mode)(bad), '#ffffff', `${mode} ${bad}`); assert.match(three(mode)('#d9a441'), /^#[0-9a-f]{6}$/i); }
  assert.equal(three('0')('#D9A441'), '#D9A441');
  assert.match(v3, /style="background:\$\{cvdColor\(x\.f\.color\)\}"/);
});
