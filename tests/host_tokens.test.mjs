// S7-2 T1: the host page has no tokens.css, so tavern/host-tokens.mjs carries a copy of the values (dark and .em-light); every value must equal the tokens.css value of the same name.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HOST_TOKENS_CSS, hostTokensCss } from '../map/tavern/host-tokens.mjs';

const tokens = readFileSync(new URL('../map/ui/tokens.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const decls = body => new Map([...body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].replace(/\s+/g, ' ').trim()]));
const block = (css, head) => { const i = css.indexOf(head + ' {'); assert.ok(i >= 0, head); return css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i)); };
const rulesOf = sel => new Map([...HOST_TOKENS_CSS.matchAll(/(#@(?:\.em-light)?) \{([^}]*)\}/g)].filter(m => m[1] === sel).flatMap(m => [...decls(m[2])]));
const hostDark = rulesOf('#@'), hostLight = rulesOf('#@.em-light');
const tokDark = new Map([...decls(block(tokens, ':root')), ...decls(block(tokens, ':root, body'))]), tokLight = decls(block(tokens, '.light'));

test('every dark value in HOST_TOKENS_CSS equals the tokens.css value of the same name', () => {
  let n = 0;
  for (const [k, v] of hostDark) { if (k.startsWith('--em-')) continue; n++; assert.ok(tokDark.has(k), `${k} missing from tokens.css`); assert.equal(v, tokDark.get(k), k); }
  assert.ok(n >= 35, 'the block carries colours, glass, elevation and the --zh-* ladder');
});
test('every light value equals the .light value in tokens.css', () => {
  assert.ok(hostLight.size >= 15);
  for (const [k, v] of hostLight) { assert.ok(tokLight.has(k), `${k} missing from the tokens.css .light block`); assert.equal(v, tokLight.get(k), k); }
});
test('the --em-* names are aliases (var(...)) of the shared tokens, so the host and the viewer cannot drift', () => {
  const alias = [...hostDark].filter(([k]) => k.startsWith('--em-') && k !== '--em-font');
  assert.ok(alias.length >= 12);
  for (const [k, v] of alias) assert.match(v, /^var\(--[a-z0-9-]+\)$/, k);
});
test('hostTokensCss scopes every rule to the panel root id and leaves no placeholder', () => {
  const css = hostTokensCss('eden-map-root');
  assert.doesNotMatch(css, /#@/); assert.match(css, /#eden-map-root \{ --focus/); assert.match(css, /#eden-map-root\.em-light \{/);
});
