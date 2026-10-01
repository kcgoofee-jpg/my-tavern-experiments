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

const RETIRED = new Set(['map/app/legacy-globals.mjs']);   // renamed in S5-2, retired in S5-3 (its getters became window.ViewerDebug, app/viewer-debug.mjs)

test('S5-2 map: every target exists, no source is left, the forwarder is gone and its redirect exists', () => {
  assert.ok(MAP.renames.length >= 60, 'the table A / B rows of Wave S5');
  for (const r of MAP.renames) { assert.ok(has(r.to) || RETIRED.has(r.to), 'target ' + r.to); assert.ok(!has(r.from), 'source still there: ' + r.from); }
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

// ---- T3: util.mjs / shell.mjs split by job, the fog part of depth.mjs split out ----------------------------------------------
const rd = f => readFileSync(path.join(ROOT, f), 'utf8');
const exportsOf = f => {   // names after `export const|let|function`, also the later declarators of `export let a = [], b = 0;`
  const t = rd(f), out = new Set();
  for (const m of t.matchAll(/export\s+(?:async\s+)?(?:const|let|function)\s+([\w$]+)/g)) out.add(m[1]);
  for (const m of t.matchAll(/export\s+(?:const|let)\s+[^;\n]*/g)) for (const d of m[0].matchAll(/,\s*([\w$]+)\s*=/g)) out.add(d[1]);
  return out;
};

test('S5-2 split: every job module exists, carries its listed exports, stays under 400 lines; the sources are gone (no shim)', () => {
  assert.equal(MAP.splits.length, 3);
  for (const sp of MAP.splits) {
    assert.equal(has(sp.from), !!sp.keep, sp.from + (sp.keep ? ' stays (gives up only the listed exports)' : ' is gone'));
    for (const [t, names] of Object.entries(sp.to)) {
      assert.ok(has(t), t); assert.ok(rd(t).split('\n').length <= 401, t + ' <= 400 lines');
      const ex = exportsOf(t); for (const n of names) assert.ok(ex.has(n), `${t} exports ${n}`);
      assert.doesNotMatch(rd(t), /z-index\s*:\s*\d|zIndex\s*:\s*\d/, t + ': no bare z-index');
    }
  }
  const ledger = exportsOf('map/core/exploration-ledger.mjs'), depth = exportsOf('map/core/depth.mjs');
  for (const n of ['norm', 'visit', 'known', 'count', 'MAX_MAPS', 'MAX_PER_MAP', 'MAX_NAME']) { assert.ok(ledger.has(n), n); assert.ok(!depth.has(n), n + ' left depth.mjs'); }
});

test('S5-2 split: no importer names util.mjs / shell.mjs; every import of a job module names an export it really has', () => {
  const files = execFileSync('git', ['ls-files', '-z', 'map', 'tests', 'tools', 'skills'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 }).split('\0').filter(f => /\.(mjs|js|html)$/.test(f) && has(f) && !/^(tools\/(rename_s5|split_s5)|tests\/rename_s5|map\/vendor|map\/estate\/vendor)/.test(f));
  const targets = new Map(); for (const sp of MAP.splits) for (const t of Object.keys(sp.to)) targets.set(t, exportsOf(t));
  const bad = [];
  for (const f of files) {
    const text = rd(f);
    if (/(?<![\w-])(app\/)?(util|shell)\.mjs/.test(text) && !/^tests\/text_lookup/.test(f) && !targets.has(f)) bad.push(f + ' names util / shell');
    for (const m of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
      const t = path.posix.normalize(path.posix.join(path.posix.dirname(f), m[2])); if (!targets.has(t)) continue;
      for (const item of m[1].split(',').map(x => x.trim().split(/\s+as\s+/)[0]).filter(Boolean)) if (!targets.get(t).has(item)) bad.push(`${f}: ${item} is not exported by ${t}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('S5-2 split: boot.mjs pulls in every shell job module at the old slot, viewer.html preloads every new module', () => {
  const boot = rd('map/app/boot.mjs'), html = rd('map/viewer.html');
  const shellMods = Object.keys(MAP.splits.find(s => s.from === 'map/app/shell.mjs').to);
  let at = boot.indexOf("import './extension-api.mjs';");
  assert.ok(at >= 0);
  for (const t of shellMods) { const i = boot.indexOf(`import './${path.posix.basename(t)}';`, at); assert.ok(i > at, `${t} imported (bare) after extension-api, in order`); at = i; }
  assert.ok(boot.indexOf("import './host-messages.mjs';") > at, 'host-messages stays after the shell block');
  for (const sp of MAP.splits) for (const t of Object.keys(sp.to)) assert.ok(html.includes(`<link rel="modulepreload" href="${t.replace(/^map\//, '')}">`), t + ' preloaded');
});
