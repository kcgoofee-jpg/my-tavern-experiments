// ONE-OFF (S4-3 T2-T7). Moves the first pack's viewer special cases into pack data, reading the constants that lived in the engine before S4-3 from
// tests/helpers/s43_frozen.mjs (verbatim copies: the per-view theme CSS, the legend, the CVD palettes, the world-map word table, the tag examples, the picker's
// tier table) and the legend's words from the i18n dictionaries. Writes:
//   map/packs/eden/overlay.v2.json   ui (K-R70: theme.views, legend, x-event-level), events.groups[].x-cvd, node tiancheng hint 全城, llm.x-tag-examples
//   map/data/maps.json               clouds / tint / tier_label(_en) on the tier maps; the lm_hunting_camp 3D entry (T7)
//   map/data/world_markers.json      here_words (tiancheng), realms[].label_dy, overseas {at,name,sub,src}, hunting_camp link (T7)
//   map/packs/eden/manifest.json     worldbook.prefix, credits, data.galleries / worldbook_addon / gallery
// Every value is read from the frozen copies or the existing files, never retyped. Idempotent: running it twice changes nothing. Kept for the record.
//   node tools/gen_eden_s43_data.mjs [--write]      prints what would change (or writes it)
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as F from '../tests/helpers/s43_frozen.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url)), WRITE = process.argv.includes('--write');
const rd = p => fs.readFileSync(ROOT + p, 'utf8'), J = p => JSON.parse(rd(p));
const out = {};   // path -> new text

// ---- overlay: ui ----
const tokensOf = css => Object.fromEntries([...css.replace(/^[^{]*\{/, '').replace(/\}\s*$/, '').matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+?)\s*;/g)].map(m => [m[1], m[2]]));
const views = {};
for (const css of F.THEME_CSS_V1) {
  const id = css.match(/\[data-map="([^"]+)"\]/)[1], light = css.startsWith('.light');
  (views[id] ||= {})[light ? 'light' : 'tokens'] = tokensOf(css);
}
const zh = J('map/i18n/zh.json'), en = J('map/i18n/en.json');
const legend = F.LEGEND.map(([kt, , kd]) => ({ type: kt.replace(/^lg\./, ''), label: zh[kt], desc: zh[kd], i18n: { en: { label: en[kt], desc: en[kd] } } }));
const ui = { theme: { views }, legend, 'x-event-level': 'tc_mid' };

// ---- overlay text edits ----
const one = v => JSON.stringify(v);
const fmt = (v, depth, inlineFrom, pad) => {
  if (depth >= inlineFrom || v === null || typeof v !== 'object') return one(v);
  const p = pad + '  ';
  if (Array.isArray(v)) return one(v).length <= 100 ? one(v) : '[\n' + v.map(x => p + fmt(x, depth + 1, inlineFrom, p)).join(',\n') + '\n' + pad + ']';
  return '{\n' + Object.entries(v).map(([k, x]) => `${p}${one(k)}: ${fmt(x, depth + 1, inlineFrom, p)}`).join(',\n') + '\n' + pad + '}';
};
let ov = rd('map/packs/eden/overlay.v2.json');
ov = ov.replace(/,\n  "ui": [\s\S]*$/, '\n}\n');   // idempotent: drop a block written by an earlier run
const ovJ = JSON.parse(ov);
// events.groups[].x-cvd: the label -> group id map is the overlay's own
{
  const rows = ovJ.events.groups.map(g => {
    const { 'x-cvd': _, ...rest } = g;
    if (!F.OI[g.label] || !F.TR[g.label]) throw new Error('no CVD colour for group ' + g.label);
    return { ...rest, 'x-cvd': { rg: F.OI[g.label], by: F.TR[g.label] } };
  });
  ov = ov.replace(/("groups": \[\n)[\s\S]*?(\n    \],\n    "types")/, (_, a, b) => a + rows.map(r => '      ' + one(r)).join(',\n') + b);
}
// node tiancheng: hint 全城 (the old city-wide word of the glitch scope)
if (!ovJ.nodes.some(n => n.id === 'tiancheng')) ov = ov.replace(/\n  \],\n  "events": \{/, ',\n    {\n      "id": "tiancheng",\n      "hints": ["全城"]\n    }\n  ],\n  "events": {');
// llm.x-tag-examples
if (!ovJ.llm['x-tag-examples']) ov = ov.replace(/("templates": \{\n      "zh": \{\n        "tag": "[^"]*"\n      \}\n    \})\n  \}/, `$1,\n    "x-tag-examples": ${one([...F.EX])}\n  }`);
ov = ov.replace(/\n\}\n$/, `,\n  "ui": ${fmt(ui, 0, 3, '  ')}\n}\n`);
JSON.parse(ov); out['map/packs/eden/overlay.v2.json'] = ov;

// ---- maps.json: flags on the tier maps, the hunting_camp 3D entry ----
let mp = rd('map/data/maps.json'); const mpJ = JSON.parse(mp);
const tierOf = id => F.TIER[id];
const flags = { tc_upper: { clouds: true, tint: 'period' }, tc_mid: { tint: 'period' }, tc_low: {} };
for (const [id, fl] of Object.entries(flags)) {
  if ('tier_label' in mpJ.maps[id]) continue;
  const lines = [...Object.entries(fl).map(([k, v]) => `      ${one(k)}: ${one(v)},`), `      "tier_label": ${one(tierOf(id)[0])},`, `      "tier_label_en": ${one(tierOf(id)[1])},`].join('\n');
  mp = mp.replace(new RegExp(`(\\n    "${id}": \\{\\n)`), `$1${lines}\n`);
}
if (!mpJ.maps.lm_hunting_camp) {
  const man = J('map/props/hunting_camp/manifest.json');
  const e = { title: man.title.zh, title_en: man.title.en, parent: 'world', kind: 'estate', viewer3d: 'hunting_camp', src: 'props/viewer3d.html', alias: [man.title.zh],
    src_note: '世界图上猎季营地的三维场景；从世界图 hunting_camp 地点卡的「查看三维模型」进。源：blender/landmarks/hunting_camp/', credit: man.credit.zh, credit_en: man.credit.en };
  const body = JSON.stringify(e, null, 2).split('\n').map((l, i) => (i ? '    ' + l : l)).join('\n');
  mp = mp.replace(/\n    "dairy": \{/, `\n    "lm_hunting_camp": ${body},\n    "dairy": {`);
}
JSON.parse(mp); out['map/data/maps.json'] = mp;

// ---- world_markers.json ----
let wm = rd('map/data/world_markers.json'); const wmJ = JSON.parse(wm);
const W1 = (s, find, add) => { if (!find.test(s)) throw new Error('anchor not found ' + find); return s.replace(find, add); };
if (!wmJ.places.find(p => p.id === 'tiancheng').here_words) {
  wm = W1(wm, /("id": "tiancheng",\n(?:   .*\n)*?   "src": "[^"]*")/, `$1,\n   "here_words": ${one(F.ALIAS['天城'])}`);
}
for (const [id, dy] of Object.entries({ oren: -95, fed: -150, xl: -110 })) {
  if (wmJ.realms.find(r => r.id === id).label_dy !== undefined) continue;
  wm = W1(wm, new RegExp(`("id": "${id}",\\n(?:   .*\\n)*?   "src": "[^"]*")`), `$1,\n   "label_dy": ${dy}`);
}
if (!wmJ.places.find(p => p.id === 'hunting_camp').link) {
  wm = W1(wm, /("id": "hunting_camp",\n(?:   .*\n)*?   "src": "[^"]*")/, `$1,\n   "link": ${one({ map: 'lm_hunting_camp', label: '查看三维模型', label_en: 'View 3D model' })}`);
}
if (Array.isArray(wmJ.overseas)) {
  wm = W1(wm, /"overseas": \[\n  (.*),\n  (.*)\n \]/, (_, x, y) => `"overseas": {\n  "at": [\n   ${x},\n   ${y}\n  ],\n  "name": "海外诸地",\n  "sub": "稀有矿物 · 异域人员输出地",\n  "src": "货币与贸易：天城输入稀有矿物、异域特殊体质人员（部分来自海外）"\n }`);
}
JSON.parse(wm); out['map/data/world_markers.json'] = wm;

// ---- eden manifest ----
const man = J('map/packs/eden/manifest.json');
man.worldbook = { addon: man.worldbook.addon, prefix: '伊甸地图' };
man.credits = { card: { creator: 'Yehehua' }, pack: [{ name: 'kcgoofee-jpg', role: 'map', url: 'https://github.com/kcgoofee-jpg/my-tavern-experiments' }],
  assets: [{ name: 'Poly Haven', license: 'CC0', url: 'https://polyhaven.com' }, { name: 'ambientCG', license: 'CC0', url: 'https://ambientcg.com' }] };
Object.assign(man.data, { galleries: 'data/room_galleries.json', worldbook_addon: 'data/worldbook_addon.json', gallery: 'data/gallery.json' });
out['map/packs/eden/manifest.json'] = JSON.stringify(man, null, 2) + '\n';

for (const [p, text] of Object.entries(out)) {
  const same = rd(p) === text;
  console.log((same ? 'same    ' : WRITE ? 'wrote   ' : 'differs ') + p);
  if (WRITE && !same) fs.writeFileSync(ROOT + p, text);
}
