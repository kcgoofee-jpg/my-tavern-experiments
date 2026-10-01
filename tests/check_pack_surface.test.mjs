// S7-3 T1 (docs/ui-refactor.md 2.7): tools/check_pack.py --surface prints the pack-author surface table; its rows are the rows of that section. The chrome / map contrast
// check and the locked keys of `ui.strings` (core/locked-strings.mjs) are errors in check_pack.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const py = (code, ...args) => { const r = spawnSync('python3', ['-W', 'ignore', '-c', `import sys,json; sys.path.insert(0,'tools'); import check_pack as C\n${code}`, ...args], { cwd: ROOT, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout; };
const rows = text => text.split('\n').filter(l => /^\|/.test(l) && !/^\|[-| ]+\|$/.test(l)).map(l => l.split('|').slice(1, -1).map(c => c.trim()));

test('--surface prints exactly the rows of the section 2.7 table of docs/ui-refactor.md', () => {
  const doc = fs.readFileSync(ROOT + 'docs/ui-refactor.md', 'utf8'), sec = doc.slice(doc.indexOf('### 2.7 Pack-author surface'), doc.indexOf('**Non-overridable keys**'));
  const r = spawnSync('python3', ['-W', 'ignore', 'tools/check_pack.py', '--surface', 'eden'], { cwd: ROOT, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr);
  const want = rows(sec), got = rows(r.stdout.split('\n\n')[0]);
  assert.equal(want.length, 13); assert.deepEqual(got, want);
});
test('--surface <pack> says which rows the pack declares: the first pack declares the building words, the kinds and the rooms; a pack without a 3D manifest none of them', () => {
  const eden = spawnSync('python3', ['-W', 'ignore', 'tools/check_pack.py', '--surface', 'eden'], { cwd: ROOT, encoding: 'utf8' }).stdout;
  for (const k of ['building title, subtitle: declared', 'floor labels: declared', 'room kinds: declared', 'rooms: declared']) assert.ok(eden.includes(k), k);
  const town = spawnSync('python3', ['-W', 'ignore', 'tools/check_pack.py', '--surface', 'town'], { cwd: ROOT, encoding: 'utf8' }).stdout;
  for (const k of ['building title, subtitle: engine fallback', 'room kinds: engine fallback', 'rooms: engine fallback']) assert.ok(town.includes(k), k);
});
test('contrast: a chrome accent that fails on the glass, or a label ink that fails on its background, is an error; a good label pair and a pack without an accent are not', () => {
  const out = py(`print(json.dumps([C.check_theme('t', {'ui': {'theme': {'chrome': {'accent': '#1b2330'}, 'views': {'v': {'tokens': {'--map-label-ink': '#777777', '--map-label-bg': '#808080'}}}}}}),
    C.check_theme('t', {'ui': {'theme': {'views': {'v': {'tokens': {'--map-label-ink': '#ffffff', '--map-label-bg': '#101418'}, 'light': {'--map-label-ink': '#101418', '--map-label-bg': '#ffffff'}}}}}}), C.check_theme('t', {})]))`);
  const [bad, good, none] = JSON.parse(out); assert.ok(bad.some(e => /chrome/.test(e)) && bad.some(e => /标签字/.test(e)), bad.join('\n')); assert.deepEqual(good, []); assert.deepEqual(none, []);
});
test('non-overridable keys in ui.strings are an error', () => {
  const out = py(`print(json.dumps(C.locked_strings('t', {'ui': {'strings': {'en': {'fc.nav.consent': 'x', 'fc.reason.off': 'y', 'ch.tab': 'Cast'}}}})))`);
  const errs = JSON.parse(out); assert.equal(errs.length, 2); assert.ok(errs.every(e => /fc\.(nav\.consent|reason\.off)/.test(e)));
});
