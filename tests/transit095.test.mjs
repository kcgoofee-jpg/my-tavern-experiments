// node tests/transit095.test.mjs —— v0.9.5 途中地点：「A至B的…」「从A到B」「前往B」「A → B」（core/transit.mjs 切分，app/here-v2.mjs 落点）。例子都是中性的
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as H from './helpers/here-engine.mjs';
import * as T from '../map/core/transit.mjs';
const REG = JSON.parse(fs.readFileSync(new URL('../map/data/maps.json', import.meta.url), 'utf8'));
const idx = H.buildIndex(REG);
let n = 0; const t = (name, f) => { f(); n++; console.log('ok', name); };
t('切分四种写法', () => {
  assert.deepEqual(T.parseTransit('天城上层·甲岛至乙园的私人载具舱内'), { from: '天城上层·甲岛', to: '乙园', via: '私人载具舱内' });
  assert.deepEqual(T.parseTransit('从中层霓虹街到下层7号井'), { from: '中层霓虹街', to: '下层7号井', via: '' });
  assert.deepEqual(T.parseTransit('中层，前往辉光大教堂的路上'), { from: '中层', to: '辉光大教堂', via: '' });
  assert.deepEqual(T.parseTransit('甲地 → 乙地'), { from: '甲地', to: '乙地', via: '' });
  assert.equal(T.parseTransit('天城·中层·天城执法局总局'), null); assert.equal(T.parseTransit(''), null);
});
t('两端都落到地标；终点借起点的层前缀', () => {
  const r = H.resolveTransit('天城上层·罗斯柴尔德岛至伊甸庄园的私人载具舱内', idx);
  assert.equal(r.from.marker, 'zaibatsu_estate'); assert.equal(r.to.map, 'eden_estate'); assert.equal(r.via, '私人载具舱内');
  const h = H.resolveHere('天城上层·罗斯柴尔德岛至伊甸庄园的私人载具舱内', idx); assert.equal(h.marker, 'zaibatsu_estate'); assert.ok(h.transit);
});
t('终点认不出：只有起点', () => {
  const r = H.resolveTransit('天城·中层·天城执法局总局前往某个没写过的地方', idx); assert.ok(r.from && !r.to);
});
t('两端都认不出：不算途中，照旧解析', () => { assert.equal(H.resolveTransit('甲地至乙地的车上', idx), null); });
t('胶囊文字', () => {
  assert.equal(T.transitLabel('天城上层·甲岛至乙园的私人载具舱内'), '甲岛 → 乙园（途中）');
  assert.equal(T.transitLabel('从甲到乙', true), '甲 → 乙 (en route)'); assert.equal(T.transitLabel('乙园'), null);
});
t('「议会骑士团」不落到「天城议会」（council）', () => { for (const v of ['议会骑士团总部', '天城·上层·议会骑士团']) assert.notEqual(H.resolveHere(v, idx)?.marker, 'council'); });
console.log(`${n} passed`);
