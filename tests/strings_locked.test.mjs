// S7-1 §2.7: a pack override of the locked keys (AI advisor consent, health reasons, cost lines, disclaimer) leaves the rendered text unchanged; other keys still take the pack text.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isLocked, ignoredKeys, lookup } from '../map/core/locked-strings.mjs';
const dict = lang => JSON.parse(fs.readFileSync(fileURLToPath(new URL(`../map/i18n/${lang}.json`, import.meta.url)), 'utf8'));
test('each locked key renders the core text whatever the pack says (zh and en, with @en variants)', () => {
  for (const lang of ['zh', 'en']) {
    const d = dict(lang), keys = Object.keys(d).filter(isLocked);
    assert.ok(keys.some(k => k.startsWith('fc.reason.')) && keys.some(k => k.startsWith('fc.nav.consent')) && keys.some(k => /^fc\.\w+\.cost$/.test(k)) && keys.includes('s.lic_disc_v'), 'the locked sets exist in the dictionary');
    const strings = Object.fromEntries(keys.flatMap(k => [[k, 'PACK'], [k + '@en', 'PACK']]));
    for (const k of keys) assert.equal(lookup(d, strings, lang, k), d[k], `${lang} ${k}`);
  }
});
test('other keys still take the pack text; the ignored list has one entry per locked key', () => {
  const d = dict('zh'), strings = { 'app.name': 'X', 'fc.reason.empty': 'Y', 'fc.reason.empty@en': 'Z', 'fc.nav.consent': 'W' };
  assert.equal(lookup(d, strings, 'zh', 'app.name'), 'X');
  assert.deepEqual(ignoredKeys(strings), ['fc.nav.consent', 'fc.reason.empty']);
  assert.deepEqual(ignoredKeys(null), []);
});
