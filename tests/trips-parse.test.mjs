// node tests/trips095.test.mjs —— v0.9.5 行程：交通方式关键词、JSONPatch 里的地点、玩家 / 人物行程、最近 5 段（map/tavern/trips-parse.mjs）。例子都是中性的
import assert from 'node:assert/strict';
import * as R from '../map/tavern/trips-parse.mjs';
import { parseTransit } from '../map/core/transit.mjs';
let n = 0; const t = (name, f) => { f(); n++; console.log('ok', name); };
t('交通方式：最长关键词胜出；通用奇幻词默认不启用', () => {
  assert.equal(R.modeOf('坐悬浮车去'), 'air'); assert.equal(R.modeOf('沿着悬浮轨道'), 'rail'); assert.equal(R.modeOf('穿过步行连廊'), 'road');
  assert.equal(R.modeOf('踩着传送阵'), ''); assert.equal(R.modeOf('踩着传送阵', R.keywords(R.DEFAULT_KEYWORDS, true)), 'teleport');
  assert.equal(R.modeOf('跃迁到更高的阶层'), ''); assert.equal(R.modeOf(''), '');
});
t('原文里的 JSONPatch：取最后一次写入的地点（path / value 顺序都认）', () => {
  const s = '<UpdateVariable><JSONPatch>[{"op":"replace","path":"/世界/当前地点","value":"甲地"},{"value":"乙地","op":"replace","path":"/世界/当前地点"}]</JSONPatch></UpdateVariable>';
  assert.equal(R.patchPlace(s, '/世界/当前地点'), '乙地'); assert.equal(R.patchPlace('无', '/世界/当前地点'), ''); assert.equal(R.patchPlace(s), '', '没有路径就没有地点'); assert.equal(R.patchPlace('{"path":"/x/y","value":"丙"}', '/x/y'), '丙');
});
t('玩家行程：相邻楼地点变化、「A至B」途中；只有最新一段算进行中', () => {
  const seq = [{ floor: 1, place: '甲地' }, { floor: 2, place: '甲地' }, { floor: 3, place: '乙地', text: '坐悬浮车' }, { floor: 4, place: '乙地至丙地的路上' }];
  const tr = R.playerTrips(seq, parseTransit);
  assert.deepEqual(tr.map(x => [x.from, x.to, x.mode, !!x.live]), [['甲地', '乙地', 'air', false], ['乙地', '丙地', '', true]]);
  const tr2 = R.playerTrips([...seq, { floor: 5, place: '丙地' }], parseTransit); assert.equal(tr2.length, 2);
});
t('人物行程与最近 5 段', () => {
  const c = R.charTrips([{ floor: 1, name: '甲', place: 'A' }, { floor: 2, name: '甲', place: 'B', text: '步行' }, { floor: 3, name: '乙', place: 'C' }]);
  assert.deepEqual(c, [{ floor: 2, who: '甲', from: 'A', to: 'B', mode: 'road' }]);
  const many = Array.from({ length: 8 }, (_, i) => ({ floor: i, from: 'a' + i, to: 'b' + i }));
  assert.equal(R.recent(many).length, 5); assert.equal(R.recent(many)[0].floor, 3);
});
console.log(`${n} passed`);
