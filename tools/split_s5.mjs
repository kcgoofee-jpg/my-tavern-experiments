#!/usr/bin/env node
// S5-2 T3: rewrite the importers of a split module. tools/rename_s5_map.json "splits" lists, per source, the new job modules and
// the exports each one carries; every static `import { a, b as c } from '<source>'` becomes one import per job module, a bare
// `import '<source>'` becomes a bare import of each new module (same position, so the boot order of side effects holds),
// and a modulepreload tag becomes one tag per new module. Dynamic imports are only reported (they are rewritten by hand).
//   node tools/split_s5.mjs --map tools/rename_s5_map.json [--dry-run]
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2), DRY = args.includes('--dry-run');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MAP = JSON.parse(readFileSync(path.join(ROOT, args.includes('--map') ? args[args.indexOf('--map') + 1] : 'tools/rename_s5_map.json'), 'utf8'));
const files = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 }).split('\0').filter(Boolean)
  .filter(f => /^(map|tests|tools|skills)\//.test(f) && /\.(mjs|js|html)$/.test(f) && !/^(tools\/(rename_s5|split_s5)|tests\/rename_s5|map\/vendor|map\/estate\/vendor|tools\/browser\/node_modules)/.test(f) && existsSync(path.join(ROOT, f)) && !MAP.splits.some(s => s.from === f));
const rel = (from, to) => { const r = path.posix.relative(path.posix.dirname(from), to); return r.startsWith('.') ? r : './' + r; };
const log = [], dynamic = [];
let changed = 0;
for (const sp of MAP.splits) {
  const owner = new Map();   // export name -> target module
  for (const [t, names] of Object.entries(sp.to)) for (const n of names) owner.set(n, t);
  for (const f of files) {
    const text = readFileSync(path.join(ROOT, f), 'utf8'); let out = text;
    const same = spec => path.posix.normalize(path.posix.join(path.posix.dirname(f), spec)) === sp.from;
    out = out.replace(/^([ \t]*)import\s*\{([^}]*)\}\s*from\s*(['"])([^'"]+)\3;?([^\n]*)$/gm, (m, ind, list, q, spec, tail) => {
      if (!same(spec)) return m;
      const groups = new Map();
      for (const item of list.split(',').map(x => x.trim()).filter(Boolean)) {
        const name = item.split(/\s+as\s+/)[0].trim(), tgt = sp.keep && !owner.has(name) ? sp.from : owner.get(name);
        if (!tgt) throw new Error(`${f}: '${name}' is not an export of a job module of ${sp.from}`);
        (groups.get(tgt) || groups.set(tgt, []).get(tgt)).push(item);
      }
      const lines = [...groups].map(([t, items], i) => `${ind}import { ${items.join(', ')} } from '${rel(f, t)}';${i === 0 ? tail : ''}`);
      log.push(`${f}: ${m.trim().slice(0, 90)}  ->  ${lines.length} import(s)`); return lines.join('\n');
    });
    if (!sp.keep) out = out.replace(/^([ \t]*)import\s*(['"])([^'"]+)\2;?([^\n]*)$/gm, (m, ind, q, spec, tail) => {
      if (!same(spec)) return m;
      log.push(`${f}: ${m.trim()}  ->  bare imports of ${Object.keys(sp.to).length} modules`);
      return Object.keys(sp.to).map((t, i) => `${ind}import '${rel(f, t)}';${i === 0 ? tail : ''}`).join('\n');
    });
    if (f.endsWith('.html')) {
      const href = sp.from.replace(/^map\//, '');
      out = out.replace(new RegExp(`<link rel="modulepreload" href="${href.replace(/[./]/g, '\\$&')}">`, 'g'), m => {
        const tags = Object.keys(sp.to).map(t => `<link rel="modulepreload" href="${t.replace(/^map\//, '')}">`);
        log.push(`${f}: ${m}  ->  ${tags.length} tag(s)`); return (sp.keep ? [m, ...tags] : tags).join('');   // one line per source: viewer.html is on the line ledger
      });
    }
    for (const m of out.matchAll(/import\(([^)]*)\)/g)) if (m[1].includes(path.posix.basename(sp.from))) dynamic.push(`${f}: ${m[0]}`);
    if (out !== text) { changed++; if (!DRY) writeFileSync(path.join(ROOT, f), out); }
  }
}
for (const l of log) console.log(l);
for (const d of dynamic) console.log('DYNAMIC (by hand): ' + d);
console.log(`${DRY ? 'dry run: ' : ''}${log.length} rewrite(s) in ${changed} file(s)`);
