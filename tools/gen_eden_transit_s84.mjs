// Builder-side (S8-4b, docs/transit-schema.md §9): the first pack's demo transit network. Reads the tc_mid markers (positions), builds the `transit` block with the design's formulas and writes it into
// map/packs/eden/overlay.v2.json as the last key (the rest of the file stays byte-identical; re-running replaces the block). Pack wording lives only in the tables below.
//   node tools/gen_eden_transit_s84.mjs            prints the block, the minutes and the district overlap check
//   node tools/gen_eden_transit_s84.mjs --write    writes it into the overlay
// Card basis (docs/card-digest.md L33, L98-L117): the mid tier is linked by its maglev rail, the main public transport; walkways; hired hover cars; a metro entrance. Stations sit only at existing tc_mid markers.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { hull } from '../map/core/thematic.mjs';
import { normTransit } from '../map/core/transit-spec.mjs';
import { packGeo } from './eden_geo.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const J = p => JSON.parse(fs.readFileSync(ROOT + p, 'utf8'));
const OVERLAY = 'map/packs/eden/overlay.v2.json';

// ---- input tables (hand-adjusted; pack data) ----
const MODES = {
  maglev: { label: '悬浮轨道', i18n: { en: { label: 'Maglev rail' } } },
  metro: { label: '地铁', i18n: { en: { label: 'Metro' } } },
  air: { label: '出租悬浮车', i18n: { en: { label: 'Hover taxi' } } },
  walkway: { label: '步行连廊', i18n: { en: { label: 'Skywalk' } }, trip: 'road', dash: [1, 4] },
};
const LINES = [
  { id: 'l1', number: '1', name: '悬浮轨道 1 号线', en: 'Maglev Line 1', mode: 'maglev', color: '#e8b33a', k: 'maglev',
    stops: ['barracks_ring', 'military_academy', 'storm_hall', 'enforcement_hq', 'reserve_office', 'admin_council', 'schneider_clinic', 'victoria_apartment', 'mid_care_home'] },
  { id: 'l2', number: '2', name: '悬浮轨道 2 号线', en: 'Maglev Line 2', mode: 'maglev', color: '#3fa7d6', k: 'maglev',
    stops: ['starabyss_univ', 'mage_tower', 'enforcement_hq', 'executive_office', 'council', 'old_apartment', 'merc_guild', 'checkpoint_c'] },
  { id: 'l3', number: '3', name: '悬浮轨道 3 号线', en: 'Maglev Line 3', mode: 'maglev', color: '#59b36b', k: 'maglev',
    stops: ['butler_academy', 'mid_hospital', 'tiancheng_univ', 'admin_council', 'culture_office', 'merc_guild', 'rebirth_workshop'] },
  { id: 'l4', number: '4', name: '悬浮轨道 4 号线（环线）', en: 'Maglev Line 4 (loop)', mode: 'maglev', color: '#b07cd8', k: 'maglev', loop: true,
    stops: ['iron_cradle', 'butler_academy', 'radiance_cathedral', 'supreme_court', 'victoria_apartment', 'mid_care_home', 'mid_monastery', 'schneider_clinic', 'tiancheng_univ', 'mid_hospital'] },
  { id: 'm', number: 'M', name: '地铁 M 线', en: 'Metro Line M', mode: 'metro', color: '#e0736a', k: 'metro',
    stops: ['knights_camp', 'rebirth_workshop', 'old_apartment', 'council', 'culture_office', 'mid_monastery'] },
];
const LINKS = [['reserve_office', 'executive_office', 'walkway'], ['executive_office', 'council', 'walkway'], ['tiancheng_univ', 'supreme_court', 'walkway'], ['mid_monastery', 'mid_care_home', 'walkway'],
  ['enforcement_hq', 'victoria_apartment', 'air'], ['checkpoint_c', 'enforcement_hq', 'air']];
// metres -> minutes, rounded to 0.5, at least 1
const FORMULA = { maglev: d => 1 + d / 400, metro: d => 1 + d / 350, walkway: d => d / 70, air: d => 2 + d / 600 };
const DISTRICTS = [   // pad = the hull's outward push (design: 0.03); adjusted here so that no two districts overlap
  { id: 'core', name: '核心区', en: 'Core district', function: 'civic', danger: 0, pad: 0.03, markers: ['enforcement_hq', 'reserve_office', 'executive_office', 'admin_council', 'council', 'culture_office', 'storm_hall'] },
  { id: 'high', name: '中层高区', en: 'Upper mid tier', function: 'residential', danger: 0, pad: 0.03, markers: ['radiance_cathedral', 'iron_cradle', 'supreme_court', 'victoria_apartment', 'mid_hospital', 'butler_academy', 'schneider_clinic', 'tiancheng_univ', 'mid_monastery', 'mid_care_home'] },
  { id: 'rim', name: '外围', en: 'Outer rim', function: 'military', danger: 1, pad: 0.03, markers: ['barracks_ring', 'military_academy', 'knights_camp'] },
  { id: 'low', name: '中层低区', en: 'Lower mid tier', function: 'industry', danger: 2, pad: 0.03, markers: ['rebirth_workshop', 'old_apartment', 'merc_guild', 'checkpoint_c'] },
];

// ---- build ----
const tc = J('map/data/tc_mid.json'), [W, H] = tc.extent_m, at = new Map(tc.markers.map(m => [m.id, [m.nx, m.ny]]));
const r2 = v => Math.round(v * 100) / 100, half = v => Math.max(1, Math.round(v * 2) / 2);
const metres = (a, b) => Math.hypot((at.get(a)[0] - at.get(b)[0]) * W, (at.get(a)[1] - at.get(b)[1]) * H);
const districtOf = new Map(DISTRICTS.flatMap(d => d.markers.map(m => [m, d.id])));
const block = { modes: MODES, stations: tc.markers.map(m => ({ id: m.id, node: m.id, ...(districtOf.has(m.id) ? { district: districtOf.get(m.id) } : {}) })),
  lines: LINES.map(l => { const n = l.stops.length, segs = l.loop ? n : n - 1;
    return { id: l.id, number: l.number, name: l.name, i18n: { en: { name: l.en } }, mode: l.mode, color: l.color, stops: l.stops, ...(l.loop ? { loop: true } : {}),
      min: Array.from({ length: segs }, (_, i) => half(FORMULA[l.k](metres(l.stops[i], l.stops[(i + 1) % n])))) }; }),
  links: LINKS.map(([from, to, mode]) => ({ from, to, mode, min: half(FORMULA[mode](metres(from, to))) })),
  districts: DISTRICTS.map(d => ({ id: d.id, name: d.name, i18n: { en: { name: d.en } }, view: 'tc_mid', function: d.function, danger: d.danger, pts: hull(d.markers.map(m => at.get(m)), d.pad).map(([x, y]) => [Math.round(x * 1e3) / 1e3, Math.round(y * 1e3) / 1e3]) })) };

// ---- checks ----
const geo = packGeo('eden'), nodeOk = id => geo.tree.has(id), problems = [];
for (const s of block.stations) if (!nodeOk(s.node)) problems.push('station node not in the tree: ' + s.node);
const norm = normTransit(block, { nodes: nodeOk, views: id => id === 'tc_mid' });
const inside = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[i][1] > p[1]) !== (poly[j][1] > p[1]) && p[0] < (poly[j][0] - poly[i][0]) * (p[1] - poly[i][1]) / (poly[j][1] - poly[i][1]) + poly[i][0]) c = !c; return c; };
const cross = (a, b, c, d) => { const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0; };
const overlap = (A, B) => A.some(p => inside(p, B)) || B.some(p => inside(p, A)) || A.some((p, i) => B.some((q, j) => cross(p, A[(i + 1) % A.length], q, B[(j + 1) % B.length])));
for (let i = 0; i < block.districts.length; i++) for (let j = i + 1; j < block.districts.length; j++) if (overlap(block.districts[i].pts, block.districts[j].pts)) problems.push(`districts overlap: ${block.districts[i].id} / ${block.districts[j].id}`);
for (const d of block.districts) for (const m of DISTRICTS.find(x => x.id === d.id).markers) if (!inside(at.get(m), d.pts)) problems.push(`marker outside its district: ${d.id} / ${m}`);
console.log(JSON.stringify(norm.problems), 'stations', block.stations.length, 'lines', block.lines.length, 'links', block.links.length, 'districts', block.districts.length);
for (const l of block.lines) console.log(l.id, JSON.stringify(l.min));
console.log('links', JSON.stringify(block.links.map(k => `${k.from}-${k.to} ${k.min}`)));
if (problems.length || norm.problems.length) { console.log('PROBLEMS', problems, norm.problems); process.exitCode = 1; }

if (process.argv.includes('--write') && !process.exitCode) {
  const f = ROOT + OVERLAY; let s = fs.readFileSync(f, 'utf8');
  const i = s.indexOf(',\n  "transit":');
  if (i >= 0) s = s.slice(0, i) + '\n}\n';
  if (!s.endsWith('\n}\n')) throw new Error('unexpected overlay ending');
  s = s.slice(0, -3) + ',\n  "transit": ' + JSON.stringify(block, null, 2).replace(/\n/g, '\n  ') + '\n}\n';
  fs.writeFileSync(f, s); console.log('written', OVERLAY);
}
