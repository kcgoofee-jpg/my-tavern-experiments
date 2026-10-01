#!/usr/bin/env node
// S5-2 T2: file-rename codemod. Moves the files of tools/rename_s5_map.json with `git mv` and rewrites every path
// reference (static / dynamic import, new URL, <script src>, string path lists, shell / python lists, doc paths).
//   node tools/rename_s5.mjs --map tools/rename_s5_map.json [--dry-run] [--root <dir>]
// S5-3 mode: `--globals tools/rename_s5_globals.json` renames window globals, plugin names and short identifiers (see rename_s5_globals.mjs;
// it reuses this file's tracked-file list and scope test).
// Matching is on path tokens that resolve to a moved file (relative to the importer, to map/, to the repo root, or
// through the 3D import-map alias), never on bare words. Idempotent: after a run no token resolves to a source.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const flag = n => args.includes(n), opt = n => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const ROOT = path.resolve(opt('--root') || fileURLToPath(new URL('..', import.meta.url)));
const DRY = flag('--dry-run');
const GLOBALS = opt('--globals');
const MAP = GLOBALS ? { renames: [], deletes: [], specifiers: [] } : JSON.parse(readFileSync(path.resolve(ROOT, opt('--map') || 'tools/rename_s5_map.json'), 'utf8'));

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
const tracked = git('ls-files', '-z').split('\0').filter(Boolean);
const trackedSet = new Set(tracked);

// ---- scope ---------------------------------------------------------------------------------------------------------
const TEXT_EXT = new Set(['.mjs', '.js', '.html', '.json', '.py', '.sh', '.md', '.css', '.txt', '.yml', '.yaml']);
const SKIP_DIR = /^(map\/(vendor|estate\/vendor|shots|art|_proto)\/|tools\/browser\/node_modules\/|node_modules\/)/;
const SELF_FILES = new Set(['tools/rename_s5.mjs', 'tools/rename_s5_extract.py', 'tools/rename_s5_map.json', 'tools/rename_s5_globals.mjs', 'tools/rename_s5_globals_extract.py', 'tools/rename_s5_globals.json', 'tests/rename_s5.test.mjs']);
const inScope = f => {
  if (SELF_FILES.has(f) || SKIP_DIR.test(f) || !TEXT_EXT.has(path.extname(f))) return false;
  if (/^docs\/naming(\.zh)?\.md$/.test(f)) return false;   // the rename map keeps old names as its "Current" column; rows are marked, not rewritten
  return /^(map|tests|tools|skills)\//.test(f) || /^docs\/ARCHITECTURE(\.zh)?\.md$/.test(f) || /^README(\.zh)?\.md$/.test(f);
};

if (GLOBALS) {
  const { runGlobals } = await import('./rename_s5_globals.mjs');
  runGlobals({ ROOT, tracked, inScope, DRY, mapFile: GLOBALS, verbose: flag('--verbose'), only: opt('--only') });
  process.exit(0);
}

// ---- the moves: source -> target (repo-relative, posix) ------------------------------------------------------------
const moves = new Map(), redirects = new Map();   // redirects: deleted forwarder -> module that replaces it
// only sources that still exist: a second run finds none, so it plans nothing (idempotent)
for (const r of MAP.renames) if (trackedSet.has(r.from)) moves.set(r.from, r.to);
for (const d of MAP.deletes) if (trackedSet.has(d.from)) redirects.set(d.from, d.redirect);
const baseOf = p => path.posix.basename(p).replace(/\.[^.]+$/, '');
// paired tests: tests/<base>.test.mjs named after the module, kept only when it really loads that module
const testMoves = new Map();
const sameBase = b => tracked.filter(f => /^map\/.*\.(mjs|js)$/.test(f) && baseOf(f) === b);
const skippedTests = [];
for (const [from, to] of moves) {
  const t = `tests/${baseOf(from)}.test.mjs`;
  if (!trackedSet.has(t) || testMoves.has(t)) continue;
  const siblings = sameBase(baseOf(from));   // every map file with that name, moved or kept
  const txt = readFileSync(path.join(ROOT, t), 'utf8');
  const hits = siblings.filter(s => txt.includes(s));   // full repo path ('map/tavern/events.mjs'), so 'map/events.mjs' does not match the tavern one
  const own = hits.length ? hits : siblings.length === 1 ? [from] : [];
  if (own.length === 1 && own[0] === from) testMoves.set(t, `tests/${baseOf(to)}.test.mjs`);
  else skippedTests.push(`${t}: ${own.join(', ') || 'no module path found'}`);
}
for (const [a, b] of testMoves) moves.set(a, b);
for (const [a, b] of moves) if (trackedSet.has(b) && !moves.has(b)) throw new Error(`target exists: ${b} (from ${a})`);

// ---- token matching ------------------------------------------------------------------------------------------------
const TOKEN = /(?<![\w@./-])((?:\.{1,2}\/)*(?:[\w.-]+\/)*[\w.-]+\.(?:mjs|js|html))(?![\w-])/g;
const posix = p => p.split(path.sep).join('/');
const basenameCount = new Map();
for (const f of tracked) { if (/^(map|tests|tools)\//.test(f)) { const b = path.posix.basename(f); basenameCount.set(b, (basenameCount.get(b) || 0) + 1); } }
const uniqueSource = new Map();   // bare file name -> source path, when no other tracked file shares the name
for (const s of [...moves.keys(), ...redirects.keys()]) if (basenameCount.get(path.posix.basename(s)) === 1) uniqueSource.set(path.posix.basename(s), s);
const isSource = p => moves.has(p) || redirects.has(p);
const targetOf = p => moves.get(p) ?? redirects.get(p);
const ALIAS = MAP.specifiers.map(s => ({ ...s, dir: 'map/three/' }));   // import-map alias three/map/ -> map/three/

/** Resolve a token seen in file `file` (old path); returns { src, base, alias? } or null. `base` says what the token was written
 *  relative to: the importing file's folder, the repo root (scripts run from there), or map/ (the viewer's document base). */
function resolve(file, tok, quoted) {
  const norm = p => path.posix.normalize(p);
  for (const a of ALIAS) if (tok.startsWith(a.from)) return { src: a.dir + tok.slice(a.from.length), base: 'alias', alias: a };   // the whole alias moves, not only the moved files behind it
  const dotted = tok.startsWith('./') || tok.startsWith('../');
  const bases = tok.startsWith('../') ? ['dir'] : dotted ? ['dir', 'repo', 'map'] : tok.includes('/') ? (quoted ? ['repo', 'map', 'dir'] : ['repo', 'map']) : quoted ? ['dir', 'map'] : [];
  for (const base of bases) {
    const r = norm(path.posix.join(BASE_DIR[base](file), tok));
    if (!r.startsWith('..') && isSource(r)) return { src: r, base };
  }
  if (!tok.includes('/')) { const u = uniqueSource.get(tok); if (u) return { src: u, base: 'name' }; }
  return null;
}
const BASE_DIR = { dir: f => path.posix.dirname(f), repo: () => '', map: () => 'map' };
function render(file, tok, hit) {
  const dst = targetOf(hit.src) ?? hit.src;
  if (hit.base === 'alias') return hit.alias.to + dst.slice(hit.alias.dir.length);
  if (hit.base === 'name') return path.posix.basename(dst);
  const rel = path.posix.relative(BASE_DIR[hit.base](file), dst);
  return tok.startsWith('./') && !rel.startsWith('.') ? './' + rel : rel;
}

// regex-literal form of a path inside a test (`/tavern\/action\.mjs/`, `src="app\/cardlinks\.mjs"`): same resolution, re-escaped
const TOKEN_ESC = /(?<![\w@\\-])((?:(?:\\\.){1,2}\\\/)*(?:[\w-]+\\\/)*[\w-]+)\\\.(mjs|js)(?![\w-])/g;
const esc = t => t.replace(/([./])/g, '\\$1');

/** docs/ARCHITECTURE*.md module map: rows are `| \`name.mjs\` | role |` under a "### 3.n map/<dir>" heading, so the folder comes from the
 *  heading, not from the token. Renames the first cell, drops the row of a deleted forwarder, and keeps each table sorted. */
const DOC_DIR = [[/^### 3\.\d+ map\/core\b/, 'map/core'], [/^### 3\.\d+ map\/app\b/, 'map/app'], [/^### 3\.\d+ map\/tavern\b/, 'map/tavern'],
  [/^### 3\.\d+ map\/ui\b/, 'map/ui'], [/^### 3\.\d+ map\/three\b/, 'map/three'], [/^### 3\.\d+ map\/\*/, 'map']];
function moduleMapRows(f, text, note) {
  const lines = text.split('\n'); let dir = null, i = 0;
  while (i < lines.length) {
    const h = lines[i].startsWith('### ') ? DOC_DIR.find(([re]) => re.test(lines[i])) : null;
    if (lines[i].startsWith('#')) dir = h ? h[1] : null;
    if (!dir || !/^\| `[\w.-]+\.(mjs|js)` \|/.test(lines[i])) { i++; continue; }
    let j = i; while (j < lines.length && /^\| `[\w.-]+\.(mjs|js)` \|/.test(lines[j])) j++;
    const rows = [];
    for (let k = i; k < j; k++) {
      const m = lines[k].match(/^\| `([\w.-]+\.(?:mjs|js))` \|/), src = `${dir}/${m[1]}`;
      if (redirects.has(src)) { note(k, m[1], '(row removed)'); continue; }
      const dst = moves.get(src); let row = lines[k];
      if (dst) { const nn = path.posix.basename(dst); row = row.replace('`' + m[1] + '`', '`' + nn + '`'); note(k, m[1], nn); }
      rows.push(row);
    }
    const key = r => r.match(/^\| `([^`]+)`/)[1], sorted = [...rows].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
    lines.splice(i, j - i, ...sorted); i += sorted.length;
  }
  return lines.join('\n');
}

const edits = [];   // { file, line, from, to }
const contents = new Map();
for (const f of tracked) {
  if (!inScope(f)) continue;
  let text; try { if (statSync(path.join(ROOT, f)).size > 4 << 20) continue; text = readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { continue; }
  if (text.includes('\0')) continue;
  const note = (off, from, to) => edits.push({ file: f, line: text.slice(0, off).split('\n').length, from, to });
  if (/^docs\/ARCHITECTURE(\.zh)?\.md$/.test(f)) text = moduleMapRows(f, text, (k, from, to) => edits.push({ file: f, line: k + 1, from, to }));
  const isMd = f.endsWith('.md'), QUOTES = isMd ? `'"` : `'"\``;   // in markdown a backtick is code formatting, not a string quote
  let out = text.replace(TOKEN, (m, tok, off) => {
    const q = text[off - 1], quoted = QUOTES.includes(q) && text[off + m.length] === q;
    const hit = resolve(f, tok, quoted); if (!hit) return m;
    const nt = render(f, tok, hit); if (nt === tok) return m;
    note(off, tok, nt); return nt;
  });
  out = out.replace(TOKEN_ESC, (m, stem, ext, off) => {
    const plain = (stem + '.' + ext).replace(/\\/g, ''), q = out[off - 1];
    const hit = resolve(f, plain, QUOTES.includes(q));
    if (!hit) return m;
    const nt = render(f, plain, hit); if (nt === plain) return m;
    note(off, m, esc(nt)); return esc(nt);
  });
  if (out !== readFileSync(path.join(ROOT, f), 'utf8')) contents.set(f, out);
}
// the engine alias line in the import map (directory form `three/map/`)
for (const f of tracked) {
  if (!inScope(f)) continue;
  for (const a of MAP.specifiers) {
    const text = contents.get(f) ?? readFileSync(path.join(ROOT, f), 'utf8');
    if (!text.includes(`"${a.from}"`)) continue;
    const out = text.split(`"${a.from}"`).join(`"${a.to}"`);
    edits.push({ file: f, line: 0, from: `"${a.from}"`, to: `"${a.to}"` }); contents.set(f, out);
  }
}

for (const e of edits) console.log(`${e.file}:${e.line}  ${e.from}  ->  ${e.to}`);
const todo = [...moves].filter(([a]) => existsSync(path.join(ROOT, a))), dels = [...redirects.keys()].filter(a => existsSync(path.join(ROOT, a)));
for (const [a, b] of todo) console.log(`git mv ${a} ${b}`);
for (const a of dels) console.log(`git rm ${a}  (references go to ${redirects.get(a)})`);
for (const t of skippedTests) if (!testMoves.has(t.split(':')[0])) console.log(`test kept (not named after the moved module): ${t}`);
console.log(`${DRY ? 'dry run: ' : ''}${edits.length} edit(s) in ${contents.size} file(s), ${todo.length} move(s), ${dels.length} delete(s)`);
if (DRY) process.exit(0);

for (const [a, b] of todo) git('mv', a, b);
for (const a of dels) git('rm', '-q', '-f', a);
for (const [f, text] of contents) {
  const dest = moves.get(f) ?? f;
  if (!existsSync(path.join(ROOT, dest))) continue;   // deleted file
  writeFileSync(path.join(ROOT, dest), text);
}
