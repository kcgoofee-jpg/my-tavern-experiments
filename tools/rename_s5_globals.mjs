// S5-3: the `--globals` mode of tools/rename_s5.mjs (it hands over its tracked-file list, scope test and flags).
// Reads tools/rename_s5_globals.json (generated from docs/naming.md tables C and D by tools/rename_s5_globals_extract.py) and rewrites
//   global / plugin  whole tokens: `window.X`, `P.X`, `parent.X`, a bare unbound `X`, `'X'` registry strings, comments, docs
//   ident            bindings, by scope analysis (a parser, so a local `t` or `P` of another file is never touched):
//                      scope.module  the declaring module and every importer (named import, namespace member, dynamic import)
//                      scope.family  one name shared across files by a deps bag: every identifier token (and 'X' strings)
//                      scope.tmerge  local `T` wrappers of window.I18N.tx become an import of `uiTextOr`
//   debug            unbound reads of the old compat face in probes become `ViewerDebug.<key>`
// The parser is the Babel bundled with Playwright (tools/browser/node_modules, PLAYWRIGHT_DIR or the npx cache), already needed by the
// browser probes. Dry run first; the run is idempotent (a second run plans nothing).
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

function loadBabel(ROOT) {
  const req = createRequire(import.meta.url), tries = [path.join(ROOT, 'tools/browser/node_modules/playwright'), process.env.PLAYWRIGHT_DIR];
  const npx = path.join(os.homedir(), '.npm/_npx');
  if (existsSync(npx)) for (const d of readdirSync(npx)) tries.push(path.join(npx, d, 'node_modules/playwright'));
  for (const t of tries.filter(Boolean)) { try { return req(path.join(t, 'lib/transform/babelBundle.js')); } catch (e) {} }
  throw new Error('no Babel found: cd tools/browser && npm install (or set PLAYWRIGHT_DIR)');
}
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const tokenRe = (names, flags = 'g') => new RegExp(`(?<![\\w$])(?:${names.map(esc).join('|')})(?![\\w$])`, flags);
const globToRe = g => new RegExp('^' + g.split('*').map(esc).join('[^/]*') + '$');

export function runGlobals({ ROOT, tracked, inScope, DRY, mapFile, verbose, only }) {
  const bb = loadBabel(ROOT), t = bb.types;
  const MAPG = JSON.parse(readFileSync(path.resolve(ROOT, mapFile), 'utf8')), kinds = only ? new Set(only.split(',')) : null;
  const E = MAPG.entries.filter(e => !kinds || kinds.has(e.kind));   // --only global,plugin,debug  /  --only ident
  const files = tracked.filter(f => inScope(f) && existsSync(path.join(ROOT, f)));
  const trackedSet = new Set(tracked), texts = new Map(), log = [], problems = [], manual = [];
  const read = f => { if (!texts.has(f)) texts.set(f, readFileSync(path.join(ROOT, f), 'utf8')); return texts.get(f); };

  // ---- parse every JS file once -------------------------------------------------------------------------------------
  const units = new Map();   // file -> { ast, text }
  for (const f of files) {
    if (!/\.(mjs|js)$/.test(f)) continue;
    const text = read(f); let ast = null;
    for (const mod of [true, false]) { try { ast = bb.babelParse(text, f, mod); break; } catch (e) {} }
    if (ast) units.set(f, { file: f, ast, text }); else problems.push(`parse failed: ${f}`);
  }
  const edits = new Map();   // file -> [{ s, e, to, why }]
  const addEdit = (f, s, e, to, why, name) => { (edits.get(f) || edits.set(f, []).get(f)).push({ s, e, to, why, name: name ?? (/^[A-Za-z_$][\w$]*$/.test(to) ? to : null) }); };
  const resolveSpec = (from, spec) => { if (!spec.startsWith('.')) return null; const p = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec)); return trackedSet.has(p) ? p : null; };
  const lineOf = (f, off) => read(f).slice(0, off).split('\n').length;
  // identifiers that are bound or read in a file (property names and path strings do not count): the names a new binding could clash with
  const idCache = new Map();
  const exists = (f, name) => {
    if (!idCache.has(f)) { const set = new Set(), u = units.get(f); if (u) bb.traverse(u.ast, { Identifier(p) { if (p.isReferencedIdentifier() || p.isBindingIdentifier()) set.add(p.node.name); } }); idCache.set(f, set); }
    return idCache.get(f).has(name);
  };

  // ---- the identifier visitor shared by the binding renames ---------------------------------------------------------------
  /** targets: Map<binding, { from, to, exported }>; nsTargets: Map<binding, Map<from,to>>; keys: { Pattern keys of destructured namespaces } */
  function renameIn(unit, targets, nsTargets) {
    const f = unit.file;
    bb.traverse(unit.ast, {
      Identifier(p) {
        const n = p.node, par = p.parent;
        if ((par.type === 'MemberExpression' || par.type === 'OptionalMemberExpression') && par.property === n && !par.computed) return;
        if ((par.type === 'ObjectProperty' || par.type === 'ObjectMethod' || par.type === 'ClassMethod' || par.type === 'ClassProperty') && par.key === n && !par.computed) return;
        if (/^Import/.test(par.type) || par.type === 'LabeledStatement' || par.type === 'BreakStatement' || par.type === 'ContinueStatement') return;
        if (par.type === 'ExportSpecifier' && par.exported === n) return;
        const b = p.scope.getBinding(n.name), tg = b && targets.get(b);
        if (!tg || tg.from !== n.name) return;
        let text = tg.to;
        const gp = p.parentPath.parent;
        if (par.type === 'ObjectProperty' && par.shorthand && par.value === n) text = `${n.name}: ${tg.to}`;
        else if (par.type === 'AssignmentPattern' && par.left === n && gp?.type === 'ObjectProperty' && gp.shorthand && gp.value === par) text = `${n.name}: ${tg.to}`;
        else if (par.type === 'ExportSpecifier' && par.local === n && par.exported.start === n.start) text = tg.exported ? tg.to : `${tg.to} as ${n.name}`;
        addEdit(f, n.start, n.end, text, `${n.name} -> ${tg.to}`, tg.to);
      },
      MemberExpression(p) { nsMember(p, f, nsTargets); },
      OptionalMemberExpression(p) { nsMember(p, f, nsTargets); },
    });
  }
  function nsMember(p, f, nsTargets) {
    const n = p.node; if (n.computed || n.object.type !== 'Identifier' || n.property.type !== 'Identifier') return;
    const b = p.scope.getBinding(n.object.name), m = b && nsTargets.get(b), to = m?.get(n.property.name);
    if (to) addEdit(f, n.property.start, n.property.end, to, `${n.object.name}.${n.property.name} -> ${to}`);
  }

  // ---- ident / module: the declaring module and its importers -------------------------------------------------------------
  const exportRenames = E.filter(e => e.kind === 'ident' && e.scope?.module);
  const targetsOf = new Map(), nsOf = new Map();   // file -> Map
  const T = f => targetsOf.get(f) || targetsOf.set(f, new Map()).get(f), NS = f => nsOf.get(f) || nsOf.set(f, new Map()).get(f);
  const done = [];
  for (const e of exportRenames) {
    const mod = e.scope.module, u = units.get(mod);
    if (!u) { problems.push(`module not parsed: ${mod}`); continue; }
    const prog = u.ast.program;
    let programScope = null; bb.traverse(u.ast, { Program(p) { programScope = p.scope; p.stop(); } });
    const b = programScope.getBinding(e.from);
    if (!b) {
      if (programScope.getBinding(e.to)) { done.push(`${mod}: ${e.from} already ${e.to}`); continue; }
      let viaAlias = false;   // `export { local as from }`
      for (const s of prog.body) if (s.type === 'ExportNamedDeclaration' && !s.source) for (const sp of s.specifiers) if (sp.exported.name === e.from) { addEdit(mod, sp.exported.start, sp.exported.end, e.to, `export alias ${e.from}`); viaAlias = true; }
      if (!viaAlias) problems.push(`${mod}: no binding or export named ${e.from}`);
      else for (const o of units.values()) importers(o, mod, e);
      continue;
    }
    T(mod).set(b, { from: e.from, to: e.to, exported: e.scope.role === 'export' });
    for (const o of units.values()) if (o.file !== mod) importers(o, mod, e);
    for (const o of units.values()) reexports(o, mod, e);
  }
  function importers(o, mod, e) {
    let programScope = null; bb.traverse(o.ast, { Program(p) { programScope = p.scope; p.stop(); } });
    for (const s of o.ast.program.body) {
      if (s.type !== 'ImportDeclaration' || resolveSpec(o.file, s.source.value) !== mod) continue;
      for (const sp of s.specifiers) {
        if (sp.type === 'ImportSpecifier') {
          const imp = sp.imported.name ?? sp.imported.value;
          if (imp !== e.from) continue;
          if (sp.local.name === e.from && sp.local.start === sp.imported.start) {
            addEdit(o.file, sp.local.start, sp.local.end, e.to, `import ${e.from} -> ${e.to}`);
            T(o.file).set(programScope.getBinding(sp.local.name), { from: e.from, to: e.to, exported: false });
          } else addEdit(o.file, sp.imported.start, sp.imported.end, e.to, `import ${e.from} as ${sp.local.name}`);
        } else if (sp.type === 'ImportNamespaceSpecifier') {
          const b = programScope.getBinding(sp.local.name), m = NS(o.file).get(b) || new Map(); m.set(e.from, e.to); NS(o.file).set(b, m);
        }
      }
    }
    // `const { OPS } = await import('./x.mjs')` / `const ns = await import('./x.mjs')` with a literal specifier
    bb.traverse(o.ast, { VariableDeclarator(p) {
      let init = p.node.init; if (init?.type === 'AwaitExpression') init = init.argument;
      if (init?.type !== 'CallExpression' || init.callee.type !== 'Import' || init.arguments[0]?.type !== 'StringLiteral' || resolveSpec(o.file, init.arguments[0].value) !== mod) return;
      if (p.node.id.type === 'Identifier') { const b = p.scope.getBinding(p.node.id.name), m = NS(o.file).get(b) || new Map(); m.set(e.from, e.to); NS(o.file).set(b, m); }
      else if (p.node.id.type === 'ObjectPattern') for (const pr of p.node.id.properties) if (pr.type === 'ObjectProperty' && pr.key.name === e.from) {
        if (pr.shorthand) { addEdit(o.file, pr.key.start, pr.key.end, `${e.to}: ${e.from}`, `dynamic import pattern ${e.from}`); manual.push(`${o.file}:${lineOf(o.file, pr.key.start)} dynamic-import destructure keeps local name ${e.from}`); }
        else addEdit(o.file, pr.key.start, pr.key.end, e.to, `dynamic import key ${e.from}`);
      }
    } });
  }
  function reexports(o, mod, e) {
    for (const s of o.ast.program.body) if ((s.type === 'ExportNamedDeclaration' || s.type === 'ExportAllDeclaration') && s.source && resolveSpec(o.file, s.source.value) === mod
      && (s.type === 'ExportAllDeclaration' || s.specifiers.some(sp => sp.local?.name === e.from))) manual.push(`${o.file}:${lineOf(o.file, s.start)} re-exports ${e.from} from ${mod}`);
  }

  // ---- ident / local role is the same path as an unexported module binding (handled above: role only changes `exported`) ---
  // ---- ident / family ---------------------------------------------------------------------------------------------------------
  for (const e of E.filter(x => x.kind === 'ident' && x.scope?.family)) {
    const res = e.scope.family.map(globToRe);
    for (const u of units.values()) {
      if (!res.some(r => r.test(u.file)) || !tokenRe([e.from]).test(u.text)) continue;
      const seen = new Set();
      bb.traverse(u.ast, {
        Identifier(p) { if (p.node.name === e.from && !seen.has(p.node.start)) { seen.add(p.node.start); addEdit(u.file, p.node.start, p.node.end, e.to, `${e.from} -> ${e.to}`); } },
        StringLiteral(p) { if (e.scope.strings && p.node.value === e.from) addEdit(u.file, p.node.start + 1, p.node.end - 1, e.to, `'${e.from}' -> '${e.to}'`); },
      });
      if (e.scope.comments) for (const c of u.ast.comments || []) {
        const m = tokenRe([e.from]); let x; while ((x = m.exec(c.value))) { const s = c.start + (c.type === 'CommentLine' ? 2 : 2) + x.index; addEdit(u.file, s, s + e.from.length, e.to, `comment ${e.from}`); }
      }
    }
  }

  // ---- ident / tmerge: `const T = (k, zh, v) => window.I18N.tx(k, zh, v)` becomes an import of uiTextOr ---------------------------------
  for (const e of E.filter(x => x.kind === 'ident' && x.scope?.tmerge)) {
    for (const f of e.scope.tmerge) {
      const u = units.get(f); if (!u) { problems.push(`tmerge file not parsed: ${f}`); continue; }
      const seen = new Set(); let had = false;
      bb.traverse(u.ast, { Identifier(p) { if (p.node.name === e.from && !seen.has(p.node.start)) { seen.add(p.node.start); had = true; } } });
      if (!had) continue;
      bb.traverse(u.ast, { VariableDeclaration(p) {
        const d = p.node.declarations; if (d.length !== 1 || d[0].id.name !== e.from || !u.text.slice(d[0].init.start, d[0].init.end).includes('I18N.tx')) return;
        let s = p.node.start, en = p.node.end; const ls = u.text.lastIndexOf('\n', s - 1) + 1, le = u.text.indexOf('\n', en);
        if (!u.text.slice(ls, s).trim() && le > 0 && /^\s*(\/\/[^\n]*)?$/.test(u.text.slice(en, le))) { s = ls; en = le + 1; }
        addEdit(f, s, en, '', `drop local ${e.from} wrapper`); seen.delete(d[0].id.start);
        let last = null; for (const n of u.ast.program.body) if (n.type === 'ImportDeclaration') last = n;
        const rel = path.posix.relative(path.posix.dirname(f), 'map/app/text-lookup.mjs'), spec = rel.startsWith('.') ? rel : './' + rel;
        addEdit(f, last.end, last.end, `\nimport { ${e.to} } from '${spec}';`, `import ${e.to}`);
        p.stop();
      } });
      bb.traverse(u.ast, { Identifier(p) { const n = p.node; if (n.name === e.from && seen.has(n.start) && !(p.parent.type === 'MemberExpression' && p.parent.property === n && !p.parent.computed)) addEdit(f, n.start, n.end, e.to, `${e.from} -> ${e.to}`); } });
    }
  }

  // ---- run the binding renames per unit -------------------------------------------------------------------------------------
  for (const u of units.values()) if (targetsOf.has(u.file) || nsOf.has(u.file)) renameIn(u, T(u.file), NS(u.file));

  // ---- global alias split: `TCStore` is the import alias of core/storage.mjs in some files and the window global in others ------------
  const split = E.find(e => e.kind === 'global' && e.alias);
  if (split) for (const u of units.values()) {
    if (!tokenRe([split.from]).test(u.text)) continue;
    bb.traverse(u.ast, { Identifier(p) {
      const n = p.node, par = p.parent; if (n.name !== split.from) return;
      if (par.type === 'ObjectProperty' && par.key === n && !par.computed && !par.shorthand) return addEdit(u.file, n.start, n.end, split.to, 'TCStore key');
      if (/^Import/.test(par.type)) { if (par.type === 'ImportNamespaceSpecifier' && par.local === n) addEdit(u.file, n.start, n.end, split.alias, 'TCStore alias -> storage'); return; }
      const member = (par.type === 'MemberExpression' || par.type === 'OptionalMemberExpression') && par.property === n && !par.computed;
      if (member) return addEdit(u.file, n.start, n.end, split.to, 'x.TCStore');
      const b = p.scope.getBinding(n.name);
      if (!b) return addEdit(u.file, n.start, n.end, split.to, 'global TCStore');
      if (b.path.type === 'ImportNamespaceSpecifier') addEdit(u.file, n.start, n.end, split.alias, 'alias TCStore -> storage');
      else problems.push(`${u.file}:${lineOf(u.file, n.start)} TCStore bound to something else (${b.path.type})`);
    } });
    if (/import \* as TCStore/.test(u.text) && exists(u.file, split.alias)) problems.push(`${u.file}: \`${split.alias}\` already used; the alias rename would collide`);
  }

  // ---- debug: probes read the old compat face as bare globals -----------------------------------------------------------------------
  const dbg = new Map(E.filter(e => e.kind === 'debug').map(e => [e.from, e.to]));
  if (dbg.size) for (const u of units.values()) {
    if (!/^tools\/browser\/[^/]+\.mjs$/.test(u.file)) continue;
    bb.traverse(u.ast, { Identifier(p) {
      const n = p.node, key = dbg.get(n.name); if (!key || !p.isReferencedIdentifier() || p.scope.getBinding(n.name)) return;
      const par = p.parent; if (par.type === 'ObjectProperty' && par.key === n && !par.shorthand) return;
      addEdit(u.file, n.start, n.end, par.type === 'ObjectProperty' && par.shorthand ? `${n.name}: ViewerDebug.${key}` : `ViewerDebug.${key}`, `${n.name} -> ViewerDebug.${key}`);
    },
    // `window.go?.('x')`, `window.REG?.maps`: the member form of the same getters (kept null-safe: ViewerDebug may not be there yet)
    'MemberExpression|OptionalMemberExpression'(p) {
      const n = p.node, key = !n.computed && n.property.type === 'Identifier' && n.object.type === 'Identifier' && n.object.name === 'window' ? dbg.get(n.property.name) : null;
      if (key) addEdit(u.file, n.property.start, n.property.end, `ViewerDebug?.${key}`, `window.${n.property.name} -> window.ViewerDebug?.${key}`);
    } });
  }

  // ---- apply the parser edits, then the raw token pass ------------------------------------------------------------------------------
  const rawEntries = E.filter(e => e.kind === 'global' || e.kind === 'plugin'), rawMap = new Map(rawEntries.map(e => [e.from, e.to]));
  const rawRe = rawEntries.length ? tokenRe(rawEntries.map(e => e.from)) : null;
  const out = new Map(), rawCounts = new Map(); let nEdits = 0;
  for (const f of files) {
    let text = read(f); const list = edits.get(f) || [];
    list.sort((a, b) => b.s - a.s || b.e - a.e);
    const kept = []; for (const x of list) { const last = kept[kept.length - 1]; if (last && last.s === x.s && last.e === x.e) { if (last.to !== x.to) problems.push(`${f}:${lineOf(f, x.s)} conflicting edits ${last.why} / ${x.why}`); continue; } if (last && x.e > last.s) { problems.push(`${f}:${lineOf(f, x.s)} overlapping edits ${last.why} / ${x.why}`); continue; } kept.push(x); }
    for (const x of kept) { text = text.slice(0, x.s) + x.to + text.slice(x.e); if (verbose) log.push(`${f}:${lineOf(f, x.s)}  ${x.why}`); }
    nEdits += kept.length;
    if (rawRe) text = text.replace(rawRe, (m, off) => { nEdits++; rawCounts.set(m, (rawCounts.get(m) || 0) + 1); if (verbose) log.push(`${f}:${text.slice(0, off).split('\n').length}  ${m} -> ${rawMap.get(m)}  (token)`); return rawMap.get(m); });
    if (text !== read(f)) out.set(f, text);
  }
  // a new name that was already there (and not produced by the rename itself) would merge two bindings: refuse
  for (const [f, text0] of [...out]) {
    for (const x of new Set((edits.get(f) || []).map(x => x.name).filter(Boolean))) {
      if (units.has(f) ? exists(f, x) : new RegExp(`(?<![\\w$.])${esc(x)}(?![\\w$])`).test(read(f))) problems.push(`${f}: new name \`${x}\` already occurs in the file (check for a clash)`);
    }
  }
  const summary = {};
  for (const [f, list] of edits) for (const x of list) { const k = x.why.split(' ')[0] + ' -> ' + (x.to.length < 40 ? x.to : '…'); summary[k] = (summary[k] || 0) + 1; }
  for (const l of log) console.log(l);
  for (const [k, v] of [...rawCounts].sort()) console.log(`token ${k} -> ${rawMap.get(k)}: ${v}`);
  for (const d of done) console.log(`already done: ${d}`);
  for (const m of manual) console.log(`MANUAL ${m}`);
  for (const p of problems) console.log(`PROBLEM ${p}`);
  console.log(`${DRY ? 'dry run: ' : ''}${nEdits} edit(s) in ${out.size} file(s), ${problems.length} problem(s), ${manual.length} manual`);
  if (problems.length && !DRY) { console.log('refusing to write: fix the problems above'); process.exit(1); }
  if (DRY) return;
  for (const [f, text] of out) writeFileSync(path.join(ROOT, f), text);
}
