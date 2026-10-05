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

// ---- SEC-1 (PUB, 2026-10-06): the attribute and URL sites a pack or chat value can reach ----
test('SEC-1 esc() closes the single quote as well, so a value cannot break out of a single-quoted attribute', () => {
  for (const bad of [`a'"<b>`, "onerror='alert(1)'", '<img src=x onerror=alert(1)>']) assert.doesNotMatch(esc(bad), /[<>'"]/);
});
test('SEC-1 safeHref: only http(s) and protocol-relative addresses reach an href', async () => {
  const { safeHref } = await import('../map/app/dom-helpers.mjs');
  for (const ok of ['https://github.com/kcgoofee-jpg/my-tavern-experiments/releases', '//cdn.jsdelivr.net/gh/a/b@map-v0.9.8/x']) assert.equal(safeHref(ok), ok);
  for (const bad of ['javascript:alert(1)', 'data:text/html,<script>1</script>', 'HTTPS:/evil.example.com', ' /x', '', undefined, null, 'https://ok.example.com/" onmouseover=x', 'https://a b.example.com', 'https://a.example.com/(x']) assert.equal(safeHref(bad), '', String(bad));
});
test('SEC-1 every id that reaches an attribute goes through esc()', () => {
  assert.match(src('tavern/clock-view.mjs'), /data-band="\$\{esc\(id\)\}"/); assert.match(src('tavern/clock-view.mjs'), /\$\{esc\(text\)\}<\/button>/);
  assert.match(src('characters-view.mjs'), /data-g="\$\{esc\(id\)\}"/);
  assert.match(src('app/markers.mjs'), /data-go="\$\{esc\(k\)\}"/); assert.match(src('app/map-level-nav.mjs'), /data-go="\$\{esc\(k\)\}"/);
  for (const [f, pat] of [['app/markers.mjs', /data-go="\$\{k\}"/], ['app/map-level-nav.mjs', /data-go="\$\{k\}"/], ['characters-view.mjs', /data-g="\$\{id\}"/], ['tavern/clock-view.mjs', /data-band="\$\{id\}"/]]) assert.doesNotMatch(src(f), pat, f);
});
test('SEC-1 the update link and the pack art base are filtered, not echoed', () => {
  assert.match(src('app/settings.mjs'), /nh = safeHref\(r\?\.notes\)/); assert.match(src('app/settings.mjs'), /href="\$\{nh\}"/);
  assert.doesNotMatch(src('app/settings.mjs'), /href="\$\{esc\(r\.notes/); assert.doesNotMatch(src('app/settings.mjs'), /href="\$\{safeHref\(r\.notes\)\}"/);
  const v = src('viewer.html');
  assert.match(v, /url\("\$\{artUrl\('art\/world_1k\.jpg'\)\}"/); assert.match(v, /add\(artUrl\(h\), as, co\)/);
  assert.doesNotMatch(v, /url\("\$\{\(window\.__edenArtAt/);
  const decl = v.split('\n').find(l => l.includes('const artUrl =')) || '';
  const art = (w) => new Function('window', `return (${decl.replace(/^.*const artUrl = /, '').replace(/; if \(window.*$/, '')});`)(w);
  assert.equal(art({ __edenArtBase: 'https://cdn.example/gh/a/b@sha/' })('art/world_1k.jpg'), 'https://cdn.example/gh/a/b@sha/art/world_1k.jpg');
  assert.equal(art({ __edenArtAt: y => 'https://cdn.example/' + y })('art/world.dzi'), 'https://cdn.example/art/world.dzi');
  assert.equal(art({})('art/world.dzi'), 'art/world.dzi');   // 单独打开 / 本地开发：相对路径照旧
  for (const w of [{ __edenArtBase: 'javascript:alert(1)/' }, { __edenArtBase: 'data:text/html,x' }, { __edenArtBase: 'https://ok/ a' }, { __edenArtBase: 'https://ok/" e' }, { __edenArtBase: 'https://ok/(x' }, { __edenArtAt: y => 'javascript:' + y }])
    for (const f of ['art/world.dzi', 'art/world_1k.jpg']) assert.equal(art(w)(f), '', JSON.stringify(w) + ' ' + f);
});
test('SEC-1 the escape helpers copied into the estate, 3D and panel pages close the single quote too', () => {
  for (const f of ['props/viewer3d.html', 'ui/illustration-panel.js', 'ui/room-gallery-panel.js', 'estate/main.js']) {
    const decl = src(f).split('\n').find(l => l.includes('const esc =')) || '';
    const run = new Function('return (' + decl.slice(decl.indexOf('=') + 1).replace(/\/\/.*$/, '').trim().replace(/;+$/, '') + ')')();
    for (const bad of [`a'"<b>`, "onerror='alert(1)'", '<img src=x onerror=alert(1)>']) assert.doesNotMatch(run(bad), /[<>'"]/, `${f} ${bad}`);
    assert.equal(run('&'), '&amp;');
  }
});
