// card-omissions 收尾：A23 别名、C6 / C10 / C15 各层结算说明
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildIndex, resolveHere } from '../map/here.mjs';
const J = f => JSON.parse(readFileSync(new URL('../map/' + f, import.meta.url), 'utf8'));
const REG = J('data/maps.json'), W = J('data/world_markers.json'), PLAN = J('data/eden_estate_rooms.json');
test('A23：灵枢秘派 解析到世界图的虚灵古派', () => {
  const r = resolveHere('灵枢秘派', buildIndex(REG, W, null, null, PLAN));
  assert.equal(r?.place || r?.name, '虚灵古派', JSON.stringify(r));
});
test('C6 / C10 / C15：三层都有中英结算说明，7 号井黑市只收灰票', () => {
  for (const id of ['tc_upper', 'tc_mid', 'tc_low']) assert.ok(REG.maps[id].econ && REG.maps[id].econ_en, id);
  assert.match(REG.maps.tc_upper.econ, /免税/); assert.match(REG.maps.tc_low.econ, /灰票/);
  assert.match(REG.maps.tc_low.markers.well7.econ, /只收灰票/);
  assert.match(readFileSync(new URL('../map/app/markers.mjs', import.meta.url), 'utf8'), /extra: (?:\(\) => )?econHtml\(meta\) \+ links\(meta\)/);
});
