// node tests/canon0928.test.mjs —— 卡原名对账（docs/reviews/canon_audit_0928.md）：卡里的原名与模型常写的全称要能落到对的地标 / 事件类型
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildIndex, resolveHere } from './helpers/here-engine.mjs';
import { catOf, setGeo } from '../map/tavern/events.mjs';
import { edenGeo } from './helpers/eden-geo.mjs';
import { edenNames } from './helpers/eden-names.mjs';

setGeo(edenGeo());   // the event taxonomy is the first pack's (its events block)

const J = p => JSON.parse(readFileSync(new URL('../map/' + p, import.meta.url), 'utf8'));
const idx = buildIndex(J('data/maps.json'), J('data/world_markers.json'), edenNames());
let n = 0; const t = (name, f) => { f(); n++; console.log('ok', name); };
const at = (v, map, marker) => { const r = resolveHere(v, idx); assert.ok(r, `${v} 应能解析`); assert.equal(r.map, map, `${v} 地图`); if (marker) assert.equal(r.marker, marker, `${v} 地标`); };

t('圣都：卡原名全称落到对应地标（不再被「黑市」抢到天城下层）', () => {
  at('独立骑士黑市营地', 'site_kavalierki', 'free_knight_camp');
  at('顶级贵族与财阀会所', 'site_kavalierki', 'elite_club');
  at('败者资产清算转运站', 'site_kavalierki', 'clearing_depot');
  at('竞赛事务局与博彩中心', 'site_kavalierki', 'contest_corridor');
  at('工匠工坊街', 'site_kavalierki', 'contest_corridor');
});
t('天城：卡里的层全称与分区', () => {
  at('中层低区', 'tc_mid'); at('购物中心', 'tc_mid'); at('下层地基区', 'tc_low'); at('天城最高法院', 'tc_mid', 'supreme_court');
});
t('庄园主联盟单独出现不落到伊甸庄园（卡：联盟没有固定会所）', () => {
  const r = resolveHere('庄园主联盟', idx); assert.ok(!r || r.map !== 'eden_estate', JSON.stringify(r));
});
t('事件：卡里的「治安检查点」→ 检查点管控', () => {
  for (const s of ['检查点', '治安检查点', '层间检查点']) assert.equal(catOf(s), '检查点管控', s);
});
console.log(`${n} passed`);
