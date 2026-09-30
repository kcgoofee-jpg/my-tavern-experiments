// ONE-OFF (S4-1 T1). Generates the `events` block and the injected-line tag of map/packs/eden/overlay.v2.json (docs/kernel-schema.md K-R68, Appendix A.5)
// from the taxonomy constants that lived in map/tavern/events.mjs before S4-1 (GROUPS, GROUP_ORDER, SHAPES, CATS, ALIAS_CAT, EXAMPLES, CLOSED, CFG.tag) and the
// viewer's DEFAULT_OFF_TYPES. Those constants are deleted from the engine in the same step; tests/helpers/events_v1_frozen.mjs is the frozen copy this reads.
// Kept for the record; there is nothing to re-run.
//   node tools/gen_eden_events_v2.mjs [--write]      prints the block (or writes it into the overlay, after its nodes)
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fnv36 } from '../map/core/lexicon.mjs';
import { DEFAULT_LEVELS } from '../map/core/pack-v2.mjs';
import * as V1 from '../tests/helpers/events_v1_frozen.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url)), FILE = ROOT + 'map/packs/eden/overlay.v2.json', REV = 'c89b5b2a';
const viewer = execFileSync('git', ['-C', ROOT, 'show', `${REV}:map/events.mjs`], { encoding: 'utf8', maxBuffer: 1 << 26 });
const offList = viewer.match(/const DEFAULT_OFF_TYPES = \[(.*?)\];/);
if (!offList) throw new Error('DEFAULT_OFF_TYPES not found at ' + REV);
const defaultOff = [...offList[1].matchAll(/'type:(.+?)'/g)].map(m => m[1]);

const OTHER = '其他', gid = name => (name === OTHER ? 'other' : `g_${fnv36(name)}`), tid = name => (name === OTHER ? 'other' : `t_${fnv36(name)}`);
const groups = [...V1.GROUP_ORDER, OTHER].map(name => ({ id: gid(name), label: name, color: V1.GROUPS[name], shape: V1.SHAPES[name] }));
const aliasesOf = new Map();
for (const [w, to] of Object.entries(V1.ALIAS_CAT)) aliasesOf.set(to, [...(aliasesOf.get(to) || []), w]);
const types = {};
for (const [name, c] of Object.entries(V1.CATS)) {
  const t = { label: name, group: gid(c.g), icon: c.ch };
  if (c.src) t.source = c.src;
  t.rare = c.rare;
  if (aliasesOf.has(name)) t.alias = aliasesOf.get(name);
  if (name === '网络攻击') t.fx = 'glitch';   // the one type the viewer hard-wired a screen glitch to
  if (defaultOff.includes(name)) t['x-default-off'] = true;
  types[tid(name)] = t;
}
for (const to of aliasesOf.keys()) if (!V1.CATS[to]) throw new Error('alias target is not a type: ' + to);
const events = {
  groups, types,
  fx_presets: { glitch: { block: 'glitch', 'x-messages': 3 } },   // 3 = v1's default length of the glitch, in messages (the tag field `duration` overrides it)
  levels: JSON.parse(JSON.stringify(DEFAULT_LEVELS)),
  closed: String(V1.CLOSED).slice(1, -1).split('|'),
  examples: [...V1.EXAMPLES],
};
const llm = { templates: { zh: { tag: V1.CFG.tag } } };

// Compact layout: short lists and the rows of a list / dict stay on one line; everything above is expanded.
const one = v => JSON.stringify(v);
const fmt = (v, depth, inlineFrom, pad) => {
  if (depth >= inlineFrom || v === null || typeof v !== 'object') return one(v);
  const p = pad + '  ';
  if (Array.isArray(v)) return one(v).length <= 100 ? one(v) : '[\n' + v.map(x => p + fmt(x, depth + 1, inlineFrom, p)).join(',\n') + '\n' + pad + ']';
  return '{\n' + Object.entries(v).map(([k, x]) => `${p}${JSON.stringify(k)}: ${fmt(x, depth + 1, inlineFrom, p)}`).join(',\n') + '\n' + pad + '}';
};
const text = `  "events": ${fmt(events, 0, 2, '  ')},\n  "llm": ${fmt(llm, 0, 3, '  ')}`;
if (!process.argv.includes('--write')) { console.log(text); process.exit(0); }
const src = fs.readFileSync(FILE, 'utf8').replace(/,\n  "events": [\s\S]*$/, '\n}\n');   // idempotent: drop a block written by an earlier run
const out = src.replace(/\n\}\n$/, `,\n${text}\n}\n`);
JSON.parse(out);
fs.writeFileSync(FILE, out);
console.log(`wrote ${groups.length} groups, ${Object.keys(types).length} types, ${Object.values(types).reduce((n, t) => n + (t.alias?.length || 0), 0)} aliases to ${FILE}`);
