#!/usr/bin/env node
// S5-2 T2: file-rename codemod. Moves the files of tools/rename_s5_map.json with `git mv` and rewrites every path
// reference (static / dynamic import, new URL, <script src>, string path lists, shell / python lists, doc paths).
//   node tools/rename_s5.mjs --map tools/rename_s5_map.json [--dry-run] [--root <dir>]
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
const MAP = JSON.parse(readFileSync(path.resolve(ROOT, opt('--map') || 'tools/rename_s5_map.json'), 'utf8'));

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
const tracked = git('ls-files', '-z').split('\0').filter(Boolean);
const trackedSet = new Set(tracked);

// ---- the moves: source -> target (repo-relative, posix) ------------------------------------------------------------
const moves = new Map(), redirects = new Map();   // redirects: deleted forwarder -> module that replaces it
for (const r of MAP.renames) moves.set(r.from, r.to);
for (const d of MAP.deletes) redirects.set(d.from, d.redirect);
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

// ---- scope ---------------------------------------------------------------------------------------------------------
const TEXT_EXT = new Set(['.mjs', '.js', '.html', '.json', '.py', '.sh', '.md', '.css', '.txt', '.yml', '.yaml']);
const SKIP_DIR = /^(map\/(vendor|estate\/vendor|shots|art|_proto)\/|tools\/browser\/node_modules\/|node_modules\/)/;
const SELF_FILES = new Set(['tools/rename_s5.mjs', 'tools/rename_s5_extract.py', 'tools/rename_s5_map.json', 'tests/rename_s5.test.mjs']);
const inScope = f => {
  if (SELF_FILES.has(f) || SKIP_DIR.test(f) || !TEXT_EXT.has(path.extname(f))) return false;
  if (/^docs\/naming(\.zh)?\.md$/.test(f)) return false;   // the rename map keeps old names as its "Current" column; rows are marked, not rewritten
  return /^(map|tests|tools)\//.test(f) || /^docs\/ARCHITECTURE(\.zh)?\.md$/.test(f) || /^README(\.zh)?\.md$/.test(f);
};

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

/** Resolve a token seen in file `file` (old path); returns { src, style } or null. */
function resolve(file, tok, quoted) {
  const dir = path.posix.dirname(file);
  const norm = p => path.posix.normalize(p);
  if (tok.startsWith('./') || tok.startsWith('../')) { const r = norm(path.posix.join(dir, tok)); return isSource(r) ? { src: r, style: 'rel' } : null; }
  for (const a of ALIAS) if (tok.startsWith(a.from)) return { src: a.dir + tok.slice(a.from.length), style: 'alias', alias: a };   // the whole alias moves, not only the moved files behind it
  if (tok.includes('/')) {
    if (isSource(tok)) return { src: tok, style: 'repo' };
    if (isSource('map/' + tok)) return { src: 'map/' + tok, style: 'map' };
    const r = norm(path.posix.join(dir, tok)); if (quoted && isSource(r)) return { src: r, style: 'bare' };
    return null;
  }
  if (quoted) { const r = norm(path.posix.join(dir, tok)); if (isSource(r)) return { src: r, style: 'bare' }; }
  const u = uniqueSource.get(tok); return u ? { src: u, style: 'name' } : null;
}
function render(file, hit) {
  const dst = targetOf(hit.src) ?? hit.src, dir = path.posix.dirname(file);
  switch (hit.style) {
    case 'repo': return dst;
    case 'map': return dst.replace(/^map\//, '');
    case 'alias': return hit.alias.to + dst.slice(hit.alias.dir.length);
    case 'name': return path.posix.basename(dst);
    case 'bare': return path.posix.relative(dir, dst);
    default: { const r = path.posix.relative(dir, dst); return r.startsWith('.') ? r : './' + r; }
  }
}

const edits = [];   // { file, line, from, to }
const contents = new Map();
for (const f of tracked) {
  if (!inScope(f)) continue;
  let text; try { if (statSync(path.join(ROOT, f)).size > 4 << 20) continue; text = readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { continue; }
  if (text.includes('\0')) continue;
  const out = text.replace(TOKEN, (m, tok, off) => {
    const q = text[off - 1], quoted = (q === "'" || q === '"' || q === '`') && text[off + m.length] === q;
    const hit = resolve(f, tok, quoted); if (!hit) return m;
    const nt = render(f, hit); if (nt === tok) return m;
    edits.push({ file: f, line: text.slice(0, off).split('\n').length, from: tok, to: nt });
    return nt;
  });
  if (out !== text) contents.set(f, out);
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
