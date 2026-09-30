// v0.9.6（用户 2026-09-27）：地图上不显示开局编号——地点名、副标题、地点卡正文（maps.json 标记、世界图地点、界面文字）里不出现「开局 / Opening」。
// openings 字段（数据）保留给自检与文档，不在检查之列。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const J = p => JSON.parse(fs.readFileSync(new URL('../map/' + p, import.meta.url), 'utf8'));
// 例外（fix3，用户 2026-09-28）：人物页「开局前 · 卡初始值」标注说明数据来源，不是开局编号
const PRE_OK = new Set(['ch.pre', 'ch.pre_tip']);
const BAD = /开局|Opening/i, VIS = ['name', 'sub', 'src', 'name_en', 'sub_en', 'title', 'title_en', 'label', 'label_en'];
test('地点可见文字不含开局', () => {
  const bad = [], reg = J('data/maps.json'), wm = J('data/world_markers.json');
  for (const [mid, m] of Object.entries(reg.maps)) {
    for (const f of VIS) if (BAD.test(m[f] || '')) bad.push(`${mid}.${f}`);
    for (const [k, v] of Object.entries(m.markers || {})) for (const f of VIS) if (BAD.test(v[f] || '')) bad.push(`${mid}.${k}.${f}`);
  }
  for (const [g, arr] of Object.entries(wm)) if (Array.isArray(arr)) arr.forEach((p, i) => { for (const f of VIS) if (p && BAD.test(p[f] || '')) bad.push(`world.${g}[${i}].${f}`); });
  const wjs = fs.readFileSync(new URL('../map/data/world.js', import.meta.url), 'utf8');
  for (const m of wjs.matchAll(/(?:name|sub|src): '([^']*)'/g)) if (BAD.test(m[1])) bad.push('world.js: ' + m[1].slice(0, 30));
  for (const lg of ['zh', 'en']) { const d = J(`i18n/${lg}.json`);
    for (const [k, v] of Object.entries(d)) if (k !== '_note' && !PRE_OK.has(k) && typeof v === 'string' && BAD.test(v)) bad.push(`i18n/${lg}.${k}`);
    for (const [k, v] of Object.entries(d.names || {})) if (BAD.test(k) || BAD.test(v)) bad.push(`i18n/${lg}.names.${k}`); }
  for (const [k, v] of Object.entries(J('packs/eden/names.en.json'))) if (BAD.test(k) || BAD.test(v)) bad.push(`packs/eden/names.en.${k}`);   // the English name table lives in the pack now (S4-4)
  assert.deepEqual(bad, []);
});
