// S5-2: the file renames of tools/rename_s5_map.json are done and complete. Targets exist, sources are gone, no reference to a
// source path is left in map/, tests/, tools/ or skills/ (outside the map file, the codemod and the history docs), and a second
// codemod run plans nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const MAP = JSON.parse(readFileSync(path.join(ROOT, 'tools/rename_s5_map.json'), 'utf8'));
const has = p => existsSync(path.join(ROOT, p));

test('S5-2 map: every target exists, no source is left, the forwarder is gone and its redirect exists', () => {
  assert.ok(MAP.renames.length >= 60, 'the table A / B rows of Wave S5');
  for (const r of MAP.renames) { assert.ok(has(r.to), 'target ' + r.to); assert.ok(!has(r.from), 'source still there: ' + r.from); }
  for (const d of MAP.deletes) { assert.ok(!has(d.from), d.from); assert.ok(has(d.redirect), d.redirect); }
  for (const e of MAP.excluded) assert.ok(has(e.from), 'excluded file must stay where it is: ' + e.from);   // entry, viewer page, S10 rows
  const tgt = MAP.renames.map(r => r.to); assert.equal(new Set(tgt).size, tgt.length, 'targets are unique');
});

test('S5-2 map: the 3D import-map alias moved with its folder and nothing imports the old specifier', () => {
  const v3d = readFileSync(path.join(ROOT, 'map/props/viewer3d.html'), 'utf8');
  for (const a of MAP.specifiers) { assert.ok(v3d.includes(`"${a.to}"`), a.to); assert.ok(!v3d.includes(`"${a.from}"`) && !v3d.includes(`'${a.from}`), a.from); }
});

test('S5-2 map: no reference to a moved path is left in map/, tests/, tools/, skills/ (history docs and the log are not rewritten)', () => {
  const files = execFileSync('git', ['ls-files', '-z', 'map', 'tests', 'tools', 'skills'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 }).split('\0').filter(Boolean)
    .filter(f => /\.(mjs|js|html|json|py|sh|md|css|txt)$/.test(f) && !/^(tools\/rename_s5|tests\/rename_s5|map\/vendor|map\/estate\/vendor|map\/shots|map\/art|map\/_proto|tools\/browser\/node_modules)/.test(f) && has(f));
  const sources = [...MAP.renames.map(r => r.from), ...MAP.deletes.map(d => d.from)];
  const bad = [];
  for (const f of files) {
    const text = readFileSync(path.join(ROOT, f), 'utf8');
    for (const s of sources) {
      const parts = s.split('/'), file = parts.pop(), dir = parts.pop();
      const stem = file.replace(/\.[^.]+$/, ''), ext = file.slice(stem.length + 1);
      // `<dir>/<stem>.<ext>` as a path (plain or escaped inside a regex), not preceded by another path / word part
      const re = new RegExp(`(?<![\\w-])${dir}(?:/|\\\\/)${stem.replace(/[-.]/g, '\\$&')}(?:\\.|\\\\\\.)${ext}(?![\\w-])`);
      if (re.test(text)) bad.push(`${f} -> ${s}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('S5-2 codemod: idempotent — a second run plans no edit, move or delete', () => {
  const out = execFileSync('node', ['tools/rename_s5.mjs', '--map', 'tools/rename_s5_map.json', '--dry-run'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
  assert.match(out, /dry run: 0 edit\(s\) in 0 file\(s\), 0 move\(s\), 0 delete\(s\)/, out.split('\n').slice(-6).join('\n'));
});
