// S8-1 parity probe: the layer registry and the layer menu of the viewer, written as JSON so two trees can be diffed.
//   node tools/browser/layer_dump.mjs <out.json> [--pack eden|town]     dump (default: the first pack, then ?pack=town)
//   node tools/browser/layer_dump.mjs --diff <a.json> <b.json>          differences (the new describe.declared field is ignored); exit 1 when any
// Per pack: { describe: LayerHostApi.describe(), rows: [#layList label -> { id, boxId, text, checked, hidden }], slots: [data-slot of every .vpslot] }.
import fs from 'node:fs';
import * as B from './lib.mjs';

const args = process.argv.slice(2);
const di = args.indexOf('--diff');
if (di >= 0) {
  const [a, b] = [args[di + 1], args[di + 2]].map(f => JSON.parse(fs.readFileSync(f, 'utf8')));
  const strip = o => JSON.parse(JSON.stringify(o, (k, v) => (k === 'declared' ? undefined : v)));
  const out = [];
  const walk = (x, y, p) => {
    if (JSON.stringify(x) === JSON.stringify(y)) return;
    if (x && y && typeof x === 'object' && typeof y === 'object') { for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], p + '/' + k); return; }
    out.push(`${p}: ${JSON.stringify(x)} -> ${JSON.stringify(y)}`);
  };
  walk(strip(a), strip(b), '');
  for (const l of out.slice(0, 40)) console.log(l);
  console.log(out.length ? `${out.length} difference(s)` : 'identical');
  process.exit(out.length ? 1 : 0);
}
const OUT = args.find(a => !a.startsWith('--'));
const pi = args.indexOf('--pack');
const PACKS = pi >= 0 ? [args[pi + 1]] : ['eden', 'town'];
if (!OUT) { console.error('usage: layer_dump.mjs <out.json> [--pack id] | --diff a b'); process.exit(2); }
const srv = await B.ensureServer();
const result = {};
try {
  for (const pack of PACKS) {
    const P = await B.newPage('desktop', { lang: 'zh', tier: 'save', scheme: 'dark', init: [o => { try { if (o.pack !== 'eden') { localStorage.setItem(`tcp.${o.pack}.Lang`, 'zh'); localStorage.setItem(`tcp.${o.pack}.Hint`, '1'); localStorage.setItem(`tcp.${o.pack}.TierV2`, 'save'); } } catch (e) {} }, { pack }] });
    const p = P.page;
    await p.goto(B.BASE + 'viewer.html' + (pack === 'eden' ? '' : '?pack=' + pack), { waitUntil: 'commit' });
    await p.waitForFunction(() => document.getElementById('loading')?.classList.contains('done'), null, { timeout: 30000, polling: 50 }).catch(() => {});
    await B.wait(2000);
    result[pack] = await p.evaluate(() => ({
      describe: window.LayerHostApi?.describe() || null,
      rows: [...document.querySelectorAll('#layList > label')].map(l => { const b = l.querySelector('input'); return { id: l.id || '', boxId: b?.id || '', text: l.querySelector('span')?.textContent || '', checked: !!b?.checked, hidden: l.hidden }; }),
      slots: [...document.querySelectorAll('.vpslot')].map(e => e.dataset.slot),
    }));
    await P.ctx.close();
  }
} finally { await B.closeAll(); srv.stop(); }
fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
for (const [k, v] of Object.entries(result)) console.log(`${k}: layers ${v.describe?.slots.reduce((n, s) => n + s.layers.length, 0)}, menu rows ${v.rows.length}, slots ${v.slots.length}`);
process.exit(0);
