// ONE-OFF (S4-2 T1). Generates the `vars` and `entities` blocks of map/packs/eden/overlay.v2.json (docs/kernel-schema.md K-R69, Appendix A.7)
// from the constants that lived in map/tavern/stat-path-mapping.mjs, mvu-readers.mjs and characters-parse.mjs before S4-2: DEFAULT_MAP (the variable paths and roster field names), the period
// words of todPhase, CORE_CUTS / CORE_NAMES / CORE_DEFAULT, tierText, PORTRAIT_HOSTS / PORTRAIT_BAN and the /sfw/ rule, PRESENT_KEYS / POS_KEY. Those are deleted from the engine
// in the same step; tests/helpers/{adapter,mvu,characters}_v1_frozen.mjs are the frozen copies this reads. The three table names are the card's own (docs/card-digest.md §8).
// Kept for the record; there is nothing to re-run.
//   node tools/gen_eden_vars_v2.mjs [--write]      prints the blocks (or writes them at the end of the overlay)
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as AD from '../tests/helpers/adapter_v1_frozen.mjs';
import * as MV from '../tests/helpers/mvu_v1_frozen.mjs';

const FILE = fileURLToPath(new URL('../map/packs/eden/overlay.v2.json', import.meta.url));
const D = AD.DEFAULT_MAP, path = k => { if (!D[k]) throw new Error('no default for ' + k); return D[k]; };

// ---- vars: paths from DEFAULT_MAP; the four bands of todPhase (05:00 / 07:00 / 17:00 / 20:00) with its period words, in the order todPhase tried them
const todSrc = MV.todPhase.toString();
const wordsOf = re => { const m = todSrc.match(re); if (!m) throw new Error('todPhase changed: ' + re); return m[1].split('|'); };
const W = { night: wordsOf(/\/(就寝\|[^/]+)\/i\.test\(p\) && !\/侍寝/), dusk: wordsOf(/\/(侍寝\|[^/]+)\/i/), dawn: wordsOf(/\/(晨\|[^/]+)\/i/), day: wordsOf(/\/(日间\|[^/]+)\/i/) };
const vars = {
  location: path('location'), time: path('time'), date: path('date'), period: path('period'), outfit: path('outfit'),
  periods: [{ id: 'dawn', start: '05:00', words: W.dawn }, { id: 'day', start: '07:00', words: W.day }, { id: 'dusk', start: '17:00', words: W.dusk },
    { id: 'night', start: '20:00', dark: true, words: W.night }],
};

// ---- entities: the three tables, the roster slots, the portrait rules
const CN = ['', '一', '二', '三', '四', '五'];
const cores = MV.CORE_CUTS.map((up_to, i) => ({ up_to, label: MV.coreStage(MV.CORE_DEFAULT, up_to) }));
if (cores.some((c, i) => c.label !== ['抗拒期', '动摇期', '接受期', '沉溺期', '完全母畜化'][i])) throw new Error('coreStage changed');
const tier = [1, 2, 3, 4, 5].map(n => { const label = MV.tierText(`超凡${CN[n]}阶`); if (label !== `超凡 ${n} 阶`) throw new Error('tierText changed'); return { label, match: [`超凡${CN[n]}阶`, `超凡${n}阶`, `超凡 ${CN[n]} 阶`] }; });
tier.push({ label: '天灾级', match: [] });   // v1 showed 天灾; a step's label is also a match word, and a bare 天灾 would hit a codename that holds it
if (MV.tierText('天灾级') !== '天灾') throw new Error('tierText changed');
const slot = (f, s, extra) => ({ field: D[f], kind: 'text', show: 'detail', ...extra, 'x-slot': s });
const entities = {
  groups: [
    { id: 'present', label: 'present', i18n: { zh: { label: '在场' } }, source: { mvu: MV.PRESENT_KEYS[0], present: true, place: MV.POS_KEY } },
    { id: 'members', label: 'members', i18n: { zh: { label: '成员' } }, source: { mvu: '已收服母畜' } },
    { id: 'targets', label: 'targets', i18n: { zh: { label: '目标' } }, source: { mvu: '狩猎清单' } },
  ],
  fields: [
    { field: '狩猎阶段', kind: 'tag', show: 'chip', 'x-slot': 'stage' },
    slot('gradeField', 'grade', { kind: 'tag', show: 'chip' }),
    { field: D.coreField, kind: 'gauge', min: 0, max: 100, ladder: cores, show: 'chip', 'x-slot': 'core' },
    slot('codeField', 'code'), slot('socialField', 'social'), slot('heightField', 'height'), slot('weightField', 'weight'),
    slot('knownField', 'known', { kind: 'tag' }), slot('accessoryField', 'accessory'),
    { field: '战力', kind: 'ladder', scan: true, ladder: tier, show: 'chip', 'x-slot': 'tier' },   // the card's roster has no such field: v1 scanned every text value of the row (tierField '')
  ],
  avatar: { from: ['card-script', 'imagegen'], hosts: [...MV.PORTRAIT_HOSTS.map(h => (h === 'cdn.jsdelivr.net' ? 'cdn.jsdelivr.net/gh/Yehehua1311/' : h))], require: ['/sfw/'],
    deny: MV.PORTRAIT_BAN.source.replace(/^\(|\)$/g, '').split('|') },
};

// Compact layout: short lists and the rows of a list / dict stay on one line; everything above is expanded.
const one = v => JSON.stringify(v);
const fmt = (v, depth, inlineFrom, pad) => {
  if (depth >= inlineFrom || v === null || typeof v !== 'object') return one(v);
  const p = pad + '  ';
  if (Array.isArray(v)) return one(v).length <= 100 ? one(v) : '[\n' + v.map(x => p + fmt(x, depth + 1, inlineFrom, p)).join(',\n') + '\n' + pad + ']';
  return '{\n' + Object.entries(v).map(([k, x]) => `${p}${JSON.stringify(k)}: ${fmt(x, depth + 1, inlineFrom, p)}`).join(',\n') + '\n' + pad + '}';
};
const text = `  "vars": ${fmt(vars, 0, 2, '  ')},\n  "entities": ${fmt(entities, 0, 2, '  ')}`;
if (!process.argv.includes('--write')) { console.log(text); process.exit(0); }
const src = fs.readFileSync(FILE, 'utf8').replace(/,\n  "vars": [\s\S]*$/, '\n}\n');   // idempotent: drop blocks written by an earlier run
const out = src.replace(/\n\}\n$/, `,\n${text}\n}\n`);
JSON.parse(out);
fs.writeFileSync(FILE, out);
console.log(`wrote ${Object.keys(vars).length} var keys, ${vars.periods.length} bands, ${entities.groups.length} groups, ${entities.fields.length} fields to ${FILE}`);
