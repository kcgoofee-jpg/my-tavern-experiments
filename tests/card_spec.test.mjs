// node tests/card097.test.mjs —— 卡原名照抄进数据（2026-09-28 用户决定：按原卡，不做运行时绑定 / 占位）：
// 庄园卡房间稳定编号 + 原名；旧编号 / 旧名仍能落点；地标 / 分区别名是卡原名；仓库以前自编的名字不再识别。
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { buildIndex, resolveHere } from './helpers/here-engine.mjs';
import { buildGroups } from '../map/tavern/picker.mjs';

const J = p => JSON.parse(readFileSync(new URL('../map/' + p, import.meta.url), 'utf8'));
const REG = J('data/maps.json'), W = J('data/world_markers.json'), PLAN = J('data/eden_estate_rooms.json');
let n = 0; const t = (name, f) => { f(); n++; console.log('ok', name); };
const IDX = buildIndex(REG, W, null, null, PLAN);
const CARD = { 'F3-C01': '正式母畜个人寝室', 'B1-C01': '主调教室', 'B1-C02': '私人调教室', 'B1-C04': '性技巧训练室', 'B2-C01': '惩罚室', 'B2-C02': '医疗与改造室' };

t('运行时绑定层已删：没有 card-bind.mjs / card_bind.json；数据里没有占位', () => {
  assert.ok(!existsSync(new URL('../map/card-bind.mjs', import.meta.url)));
  assert.ok(!existsSync(new URL('../map/data/card_bind.json', import.meta.url)));
  for (const r of [...PLAN.rooms, ...PLAN.card_rooms]) { assert.ok(r.name && !/按原卡/.test(r.name), r.id || r.cid); assert.ok(!('bind' in r), r.id || r.cid); }
});
t('卡房间：稳定编号 + 卡原名；多边形与 card_rooms 同名', () => {
  const cids = PLAN.card_rooms.map(c => c.cid);
  assert.equal(new Set(cids).size, cids.length);
  for (const c of PLAN.card_rooms) assert.match(c.cid, /^(F[1-3]|B[12]|EX)-C\d{2}$/);
  for (const [cid, name] of Object.entries(CARD)) {
    assert.equal(PLAN.card_rooms.find(c => c.cid === cid).name, name, cid);
    for (const r of PLAN.rooms.filter(r => r.card_id === cid)) assert.equal(r.name, name, r.id);
  }
  for (const r of PLAN.rooms.filter(r => r.kind === 'card')) assert.ok(cids.includes(r.card_id), r.id);
});
t('识别（当前地点的房间级）：卡原名落到房间，带楼层', () => {
  const x = resolveHere('伊甸庄园·主调教室', IDX); assert.equal(x.level, 1); assert.equal(x.std, '主调教室'); assert.equal(x.floor, 'B1'); assert.equal(x.restricted, undefined);   // S7-3 (N9): the flag is gone, the room is an ordinary card room
  assert.equal(resolveHere('惩罚室', IDX).floor, 'B2');
  assert.equal(resolveHere('个人寝室', IDX).std, '正式母畜个人寝室');   // 卡权限表的写法
  for (const w of ['受限房间 A', '附属室A', '受限房间', '附属室D', '（按原卡）']) assert.equal(resolveHere(w, IDX), null, w);   // 仓库以前自编的名字 / 占位不识别
});
t('卡的写法与通用叫法都落到卡房间（std = 卡名）', () => {
  for (const [w, std] of [['主卧', '主人主卧'], ['User主卧', '主人主卧'], ['书房', '主人书房'], ['厨房', '厨房与后勤区'], ['新进寝区', '新进公共寝区'], ['卧室', '主人主卧'], ['浴室', '三楼公共浴室'], ['集体间', '杂鱼女仆集体间']])
    assert.equal(resolveHere(w, IDX)?.std, std, w);
});
t('聊天里存过的旧叫法（指向旧名 / 旧编号）落到现在的房间', () => {
  for (const v of Object.values({ ...PLAN.card_id_alias, ...PLAN.retired_names })) assert.ok(PLAN.card_rooms.some(c => c.cid === v), v);
  const custom = { rooms: { 老地方: '受限房间 A', 书斋: 'F2-书房', 旧寝: 'F3-个人寝室', 小间: '附属室B' } };
  const b = buildIndex(REG, W, null, custom, PLAN);
  assert.equal(resolveHere('老地方', b).room, '主调教室'); assert.equal(resolveHere('书斋', b).room, '主人书房');
  assert.equal(resolveHere('旧寝', b).room, '正式母畜个人寝室'); assert.equal(resolveHere('小间', b).room, '私人调教室');
});
t('选择器：房间按卡原名列出、按名字落点；没有「其他叫法」组、没有自编名', () => {
  const g = buildGroups({ reg: REG, plan: { CARD: PLAN } });
  assert.ok(!g.some(x => x.id === 'room:other'));
  const b1 = g.find(x => x.id === 'room:B1').items, it = b1.find(i => i.key === '主调教室');
  assert.ok(it); assert.equal(it.target.room, '主调教室'); assert.equal(it.target.floor, 'B1');
  assert.ok(g.flatMap(x => x.items).every(i => !/受限房间|附属室|按原卡/.test(i.key)));
});
t('地标 / 分区别名是卡原名，识别落到对的地方', () => {
  const a = resolveHere('天城下层·公共母畜池管理中心', IDX); assert.equal(a.map, 'tc_low'); assert.equal(a.marker, 'amc_facility');
  assert.equal(resolveHere('集中调教工厂', IDX).marker, 'amc_facility');
  for (const w of ['母畜专卖店', '低端调教沙龙', '母畜租赁店']) assert.equal(resolveHere(w, IDX).map, 'tc_mid', w);
  const c = resolveHere('霓虹酒吧与母畜体验馆', IDX); assert.equal(c.map, 'site_kavalierki'); assert.equal(c.marker, 'contest_corridor');
});
t('剖面图 B1 / B2 标签是卡原名', () => {
  const s = readFileSync(new URL('../map/section.js', import.meta.url), 'utf8');
  assert.ok(s.includes("'B1 调教与训练区'") && s.includes("'B2 惩罚与特殊区域'")); assert.ok(!/按原卡|cardBindLabel/.test(s));
});
t('层名全称优先于庄园（canon_audit B8）', () => {
  const r = resolveHere('上层悬浮庄园区', IDX); assert.equal(r.level, 4); assert.equal(r.map, 'tc_upper');
  assert.equal(resolveHere('上层悬浮庄园区·伊甸庄园·主卧', IDX).std, '主人主卧');
});
console.log(`${n} passed`);
