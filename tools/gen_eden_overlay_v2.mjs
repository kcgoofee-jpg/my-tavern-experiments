// ONE-OFF (S3-2). Generated map/packs/eden/overlay.v2.json from the event geography constants that lived in code before
// S3-2 (docs/kernel-schema.md Appendix A.5): RE_UP / RE_MID / RE_LOW / RE_OUT / RE_RING in map/tavern/events-parse.mjs and the viewer's
// ZONES in map/events-view.mjs. Those constants are deleted from the engine in the same step, so this script reads them from the
// last commit that still had them (e36aadd, head #144). Kept for the record; there is nothing to re-run.
//   node tools/gen_eden_overlay_v2.mjs [--write]      prints the overlay (or writes it)
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fromV1 } from '../map/core/compat-v1.mjs';
import { geoFromV1 } from '../map/core/event-geo.mjs';
import { normalise } from '../map/core/lexicon.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url)), REV = 'e36aadd';
const J = p => JSON.parse(fs.readFileSync(ROOT + p, 'utf8'));
const old = p => execFileSync('git', ['-C', ROOT, 'show', `${REV}:${p}`], { encoding: 'utf8', maxBuffer: 1 << 26 });
const words = (src, name) => { const m = src.match(new RegExp(`const ${name} = /(.+)/;`)); if (!m) throw new Error('missing ' + name); return m[1].split('|'); };
const ev = old('map/tavern/events-parse.mjs'), vw = old('map/events-view.mjs');
const RE = { up: words(ev, 'RE_UP'), mid: words(ev, 'RE_MID'), low: words(ev, 'RE_LOW'), out: words(ev, 'RE_OUT'), ring: words(vw, 'RE_RING') };
const zonesOf = tier => [...vw.match(new RegExp(`${tier}: \\[(.*)\\],?\\n`))[1].matchAll(/\[\/(.+?)\/, (-?[\d.]+), (-?[\d.]+)\]/g)].map(m => ({ pieces: m[1].split('|'), x: +m[2], y: +m[3] }));

const inputs = { manifest: J('map/packs/eden/manifest.json'), maps: J('map/data/maps.json'), world: J('map/data/world_markers.json'), names: J('map/packs/eden/names.en.json'), plan: J('map/data/eden_estate_rooms.json') };
const base = fromV1(inputs), geo0 = geoFromV1(inputs);   // geo0: the tree before any overlay, to see which words already land where v1 put them
const nodes = base.pack.nodes, byId = new Map(nodes.map(n => [n.id, n]));
const kids = id => nodes.filter(n => n.parent === id).map(n => n.id);
const inSubtree = (id, f) => f(byId.get(id)) || kids(id).some(k => inSubtree(k, f));
const aliasOf = n => (n.alias || [n.name]).map(normalise);
const isAlias = (tier, w) => inSubtree(tier, n => aliasOf(n).includes(normalise(w)));                  // an alias of the tier or of a node below it
const aliasedBelow = (tier, w) => kids(tier).some(k => inSubtree(k, n => aliasOf(n).includes(normalise(w))));   // ... of a node below it only
const aliasedAnywhere = w => nodes.some(n => aliasOf(n).includes(normalise(w)));
const round = v => Math.round(v * 1e6) / 1e6;

const out = [];
// a tier word that is not a name yet: a hint of the one place below the tier whose name holds it ("银冠" in the keep's name; v1 looked at the markers first), else of the tier
const holdersBelow = (tier, w) => nodes.filter(n => n.id !== tier && byId.get(n.id) && (function up(x) { return x === tier || (x && up(byId.get(x)?.parent)); })(n.parent) && aliasOf(n).some(a => a.includes(normalise(w))));
for (const [tier, key] of [['tc_upper', 'up'], ['tc_mid', 'mid'], ['tc_low', 'low']]) {
  const own = new Map(), rest = [];
  // a word that already lands in the tier ("悬浮庄园" holds the estate's alias) needs no hint, and a hint would hide the name inside it
  for (const w of RE[key].filter(w => !isAlias(tier, w) && geo0.place(w)?.owner !== tier)) { const h = w.length >= 2 ? holdersBelow(tier, w) : []; if (h.length === 1) own.set(h[0].id, [...(own.get(h[0].id) || []), w]); else rest.push(w); }
  if (rest.length) out.push({ id: tier, hints: rest }); for (const [id, hints] of own) out.push({ id, hints });
}
// the layer word of the outside: "天城外·<place>" names the world map as a whole, and the chain score lets a named place below it win
out.push({ id: 'world', alias: ['天城外'], 'x-layer': '天城外' });
const ringOf = w => RE.ring.some(p => w.includes(p));
// an outside word that is part of the name of exactly one node ("大骑士领" in a site's name) becomes a hint of that node; the rest is beyond the city
const outside = RE.out.filter(w => !aliasedAnywhere(w)), holder = w => { const h = nodes.filter(n => aliasOf(n).some(a => a.includes(normalise(w)))); return h.length === 1 ? h[0].id : null; };
const own = new Map(), rest = [];
for (const w of outside) { const h = !ringOf(w) && holder(w); if (h) own.set(h, [...(own.get(h) || []), w]); else rest.push(w); }
for (const [id, hints] of own) out.push({ id, hints });
out.push({ id: 'beyond', parent: 'world', name: '海外', alias: [], hints: [...new Set(['海外', ...rest.filter(w => !ringOf(w))])] });
out.push({ id: 'outskirts', parent: 'beyond', name: '天城周边', alias: [], hints: ['天城周边', '天城外围', ...new Set([...RE.ring, ...rest.filter(ringOf)])], 'x-ring': true });   // 天城外围: v1 read the prefix 天城外 first; as one word it beats the mid tier's own alias 外围
for (const [tier, short] of [['tc_mid', 'mid'], ['tc_low', 'low']]) {
  let k = 0;
  for (const z of zonesOf(tier)) {
    // a zone word is a hint of its district (a vague "somewhere in"); so are the tier's own aliases that hold a word (the regex matched those as substrings too).
    // Words that name a landmark of the tier are left out: the landmark wins there (v1 looked at the markers first); a zone with nothing left is dropped.
    const words = z.pieces.filter(p => !aliasedBelow(tier, p)), fromTier = (byId.get(tier).alias || []).filter(a => z.pieces.some(p => a.includes(p)));
    const hints = [...new Set([...words, ...fromTier])];
    if (!hints.length) continue;
    out.push({ id: `zone_${short}_${++k}`, parent: tier, name: z.pieces[0], alias: [], hints: [...new Set([z.pieces[0], ...hints])], at: { x: round((z.x + 15) / 30), y: round((9.375 - z.y) / 18.75) } });
  }
}

const doc = { _note: 'Schema-2 overlay of the schema-1 eden pack (docs/kernel-schema.md K-R67): tier hints, the outskirts and beyond nodes, district nodes with `at`. Generated once by tools/gen_eden_overlay_v2.mjs from the pre-S3-2 event constants.', schema: 2, nodes: out };
const text = JSON.stringify(doc, null, 2).replace(/\[\n\s+((?:"[^"\n]*",?\s*)+)\n\s+\]/g, (m, body) => '[' + body.replace(/\s*\n\s*/g, ' ').trim() + ']') + '\n';
if (process.argv.includes('--write')) fs.writeFileSync(ROOT + 'map/packs/eden/overlay.v2.json', text); else process.stdout.write(text);
