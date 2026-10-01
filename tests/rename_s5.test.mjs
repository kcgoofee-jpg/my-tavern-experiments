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
const GLOBALS = JSON.parse(readFileSync(path.join(ROOT, 'tools/rename_s5_globals.json'), 'utf8'));
/** the S5-3 name of an export that the S5-2 split lists under its old name */
const renamedTo = (mod, name) => GLOBALS.entries.find(e => e.kind === 'ident' && e.scope?.module === mod && e.from === name)?.to ?? name;

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
      const ex = exportsOf(t); for (const n of names) assert.ok(ex.has(renamedTo(t, n)), `${t} exports ${renamedTo(t, n)}`);
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

// ---- S5-3: window globals, plugin names, short identifiers, the ViewerDebug namespace, dead hooks ------------------------------------
const tracked = execFileSync('git', ['ls-files', '-z', 'map', 'tests', 'tools', 'skills'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 }).split('\0').filter(f => has(f));
const sourceFiles = d => tracked.filter(f => f.startsWith(d) && /\.(mjs|js|html)$/.test(f) && !/^map\/(vendor|estate\/vendor|art|shots|_proto)\//.test(f));
const globalsOf = kinds => GLOBALS.entries.filter(e => kinds.includes(e.kind));
/** every exported name, including each declarator of `export let a, b = 1, c;` (split at top level, not inside brackets) */
const exportNames = f => {
  const out = exportsOf(f);
  for (const m of rd(f).matchAll(/export\s+(?:const|let|var)\s+([^;\n]*)/g)) {
    let depth = 0, start = 0; const parts = [];
    for (let i = 0; i <= m[1].length; i++) { const c = m[1][i]; if ('([{'.includes(c)) depth++; else if (')]}'.includes(c)) depth--; else if ((c === ',' && !depth) || i === m[1].length) { parts.push(m[1].slice(start, i)); start = i + 1; } }
    for (const d of parts) { const n = d.trim().match(/^([\w$]+)\s*(?:=|$)/); if (n) out.add(n[1]); }
  }
  return out;
};
const SHIMS = [];   // old window names kept as read-only aliases in map/app/legacy-globals.mjs (S5-3 found none that something outside the repo could call)

test('S5-3 map: the Wave-S5 rows of tables C and D are all in the globals map, and the map is what the extractor writes', () => {
  const out = execFileSync('python3', ['tools/rename_s5_globals_extract.py', '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.match(out, /^\d+ entries: /);
  assert.ok(globalsOf(['global', 'plugin']).length >= 50, 'the 18 TC* globals, the 11 plugins and the __ hooks');
  assert.ok(globalsOf(['ident']).length >= 70, 'the table D identifiers');
  assert.equal(globalsOf(['debug']).length, 33);
});

test('S5-3 globals: no window.TC[A-Z] / P.TC[A-Z] left in map/ (except the listed shims), and no old global or plugin name is left anywhere in map/ tests/ tools/', () => {
  const bad = [], oldNames = globalsOf(['global', 'plugin']).map(e => e.from).filter(n => !SHIMS.includes(n));
  const re = new RegExp(`(?<![\\w$])(?:${oldNames.join('|')})(?![\\w$])`), tc = /\b(?:window|parent|globalThis|P)\.TC[A-Z]/;
  for (const f of tracked) {
    if (!/\.(mjs|js|html|py|sh)$/.test(f) || /^(tools\/(rename_s5|test_architecture_gate)|tests\/rename_s5|map\/(vendor|estate\/vendor|art|shots|_proto)\/)/.test(f)) continue;
    const text = rd(f);
    if (re.test(text)) bad.push(`${f}: ${text.match(re)[0]}`);
    if (f.startsWith('map/') && tc.test(text)) bad.push(`${f}: ${text.match(tc)[0]}`);
  }
  assert.deepEqual(bad, []);
});

test('S5-3 identifiers: every table D export is renamed (the old name is not exported, the new one is) and the importers name only exports that exist', () => {
  for (const e of GLOBALS.entries.filter(x => x.kind === 'ident' && x.scope?.role === 'export')) {
    const ex = exportNames(e.scope.module);
    assert.ok(!ex.has(e.from), `${e.scope.module} still exports ${e.from}`);
    assert.ok(ex.has(e.to), `${e.scope.module} does not export ${e.to}`);
  }
  const mods = new Map(GLOBALS.entries.filter(x => x.kind === 'ident' && x.scope?.module).map(e => [e.scope.module, exportNames(e.scope.module)])), bad = [];
  for (const f of [...sourceFiles('map/'), ...sourceFiles('tests/'), ...sourceFiles('tools/')]) {
    if (/^tests\/helpers\/.*frozen/.test(f)) continue;
    for (const m of rd(f).matchAll(/import\s*\{([^}]*)\}\s*from\s*'(\.[^']+)'/g)) {
      const t = path.posix.normalize(path.posix.join(path.posix.dirname(f), m[2])); if (!mods.has(t)) continue;
      for (const item of m[1].split(',').map(x => x.trim().split(/\s+as\s+/)[0]).filter(Boolean)) if (!mods.get(t).has(item)) bad.push(`${f}: ${item} is not exported by ${t}`);
    }
  }
  assert.deepEqual(bad, []);
  // the exports that keep their short name on purpose are not in the map
  assert.ok(exportsOf('map/core/storage.mjs').has('get'), 'storage.get mirrors LocalStore.get and stays');
});

test('S5-3 host family: the deps-bag names are renamed together (keys, DEPS lists, uses): none of the old names is left in map/tavern', () => {
  const fam = GLOBALS.entries.filter(e => e.kind === 'ident' && e.scope?.family), bad = [];
  assert.ok(fam.length >= 28, 'BR, MV, CTX, BG, SELF, OWNER, UL and the 21 module handles');
  for (const f of sourceFiles('map/tavern/')) {
    const text = rd(f);
    for (const e of fam) if (new RegExp(`(?<![\\w$])${e.from}(?![\\w$])`).test(text)) bad.push(`${f}: ${e.from}`);
  }
  assert.deepEqual(bad, []);
});

test('S5-3 ViewerDebug: it exposes every getter the probes read, nothing reads the old ad-hoc window getters, and legacy-globals.mjs is gone', () => {
  assert.ok(!has('map/app/legacy-globals.mjs') && has('map/app/viewer-debug.mjs'));
  const body = rd('map/app/viewer-debug.mjs'), exposed = new Set([...body.slice(body.indexOf('const G = {'), body.indexOf('const debug')).matchAll(/(\w+): \(\) => /g)].map(m => m[1]));
  const ADDED = ['tabs', 'raf'];   // getters added after S5-3 (the list only grows): S6-1 `tabs` (the drawer tab registry), S7-2 `raf` (the activity counter of the pause probes); they are not in the frozen S5 globals map
  assert.deepEqual([...exposed].filter(k => !ADDED.includes(k)).sort(), GLOBALS.entries.filter(e => e.kind === 'debug').map(e => e.to).sort(), 'the map and the module agree');
  for (const k of ADDED) assert.ok(exposed.has(k), k);
  const used = new Set(); let n = 0;
  for (const f of sourceFiles('tools/browser/')) for (const m of rd(f).matchAll(/\bViewerDebug\.(\w+)/g)) { used.add(m[1]); n++; }
  assert.ok(n > 100 && used.size > 15, `probes read ViewerDebug (${n} reads, ${used.size} names)`);
  for (const u of used) assert.ok(exposed.has(u), `probes read ViewerDebug.${u} which is not exposed`);
  // product code never reads it (only tools/ and tests/ do)
  for (const f of sourceFiles('map/')) if (f !== 'map/app/viewer-debug.mjs') assert.doesNotMatch(rd(f), /ViewerDebug/, f);
  assert.match(rd('map/app/boot.mjs'), /import '\.\/viewer-debug\.mjs';/);
  assert.match(rd('map/viewer.html'), /<link rel="modulepreload" href="app\/viewer-debug\.mjs">/);
});

test('S5-3 dead hooks: the four read-only hooks are gone, the storage owners name real files', () => {
  for (const n of ['__edenHostVersions', '__edenHereText', '__edenMvuSnapshotStatus', '__composeTest']) for (const f of [...sourceFiles('map/'), ...sourceFiles('tools/browser/'), ...sourceFiles('tests/')].filter(f => f !== 'tests/rename_s5.test.mjs')) assert.ok(!rd(f).includes(n), `${f} still names ${n}`);
  const st = rd('map/core/storage.mjs'), owners = [...st.matchAll(/owner: '([\w./-]+\.(?:mjs|js|html))'/g)].map(m => m[1]);
  assert.ok(owners.length >= 15);
  for (const o of owners) assert.ok(has('map/' + o) || has(o), `storage.mjs owner ${o} is not a file under map/`);
});

test('S5-3 codemod: idempotent — a second --globals run plans no edit', t => {
  let out;
  try { out = execFileSync('node', ['tools/rename_s5.mjs', '--globals', 'tools/rename_s5_globals.json', '--dry-run'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { if (/no Babel found/.test(String(e.stderr || e.message))) return t.skip('the parser (Babel bundled with Playwright) is not installed here'); throw e; }
  assert.match(out, /dry run: 0 edit\(s\) in 0 file\(s\), 0 problem\(s\), 0 manual/, out.split('\n').slice(-6).join('\n'));
});
