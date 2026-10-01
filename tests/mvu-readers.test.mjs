// node tests/mvu-readers.test.mjs —— v0.9.3 MVU 联动：在场人物位置（两种表形状）、世界时间 / 夜间、着装、自定义名称与用途、剧情标签（map/tavern/mvu-readers.mjs）
import assert from 'node:assert/strict';
import * as V from '../map/tavern/mvu-readers.mjs';
import * as C from '../map/tavern/characters-parse.mjs';
import * as AD from '../map/tavern/stat-path-mapping.mjs';
import { collect } from '../map/tavern/events-parse.mjs';
import { useEden } from './helpers/eden-profile.mjs';
useEden();   // the first pack's variable and roster declarations (its overlay blocks); the engine itself names no card

let n = 0; const t = (name, f) => { f(); n++; console.log('ok', name); };

t('[值, 说明] 旧格式也认', () => {
  assert.equal(V.getByPath({ 世界: { 当前时刻: ['08:00', '说明'] } }, '世界.当前时刻'), '08:00');
  assert.equal(V.getByPath({}, '世界.当前时刻'), undefined); assert.equal(V.getByPath(null, 'a'), undefined);
});
t('在场人物：对象表（位置字段）、字符串值、数组、逗号串', () => {
  assert.deepEqual(V.presentList({ 在场人物: { 甲: { 身份: '向导', 位置: '中层·霓虹街' }, 乙: { 身份: '司机' } } }), [{ name: '甲', place: '中层·霓虹街' }, { name: '乙', place: '' }]);
  assert.deepEqual(V.presentList({ 在场人物: { 甲: '下层·7号井', 乙: '一句描述' } }), [{ name: '甲', place: '下层·7号井' }, { name: '乙', place: '' }]);
  assert.deepEqual(V.presentList({ 在场人物: ['甲', { 姓名: '乙', 位置: ['上层·银冠堡', 'desc'] }] }), [{ name: '甲', place: '' }, { name: '乙', place: '上层·银冠堡' }]);
  assert.deepEqual(V.presentList({ 在场人物: '甲、乙' }).map(x => x.name), ['甲', '乙']);
  assert.equal(V.presentList({ 世界: {} }), null); assert.deepEqual(V.presentList({ 在场人物: {} }), []);
});
t('人物栏：MVU 位置 > 标签 > 推断；来源标注', () => {
  const stat = { 世界: { 当前地点: '书房' }, 在场人物: { 甲: { 位置: '中层·霓虹街' }, 乙: { 身份: 'x' }, 丙: '一句描述' } };
  const r = C.collectChars([{ floor: 5, text: '⌖人物 乙 @ 下层·7号井' }], 9, C.mvuChars(stat, '书房'));
  const m = Object.fromEntries(r.map(c => [c.name, [c.place, c.src]]));
  assert.deepEqual(m, { 甲: ['中层·霓虹街', 'mvu'], 乙: ['下层·7号井', 'tag'], 丙: ['书房', 'infer'] });
});
t('世界时间、标题栏写法、夜间判断', () => {
  const S = { 世界: { 当前日期: '新历2088年01月01日', 当前时刻: '08:00', 当日时段: '日间' } }, w = V.worldTime(S, AD.detect(S));
  assert.deepEqual(V.clockLabel(w), { short: '1月1日 08:00', full: '新历2088年01月01日 08:00 日间' }); assert.equal(V.clockLabel(w, 'en').short, 'Jan 1 08:00');
  assert.equal(V.isNight(w), false);
  assert.equal(V.isNight({ period: '就寝', time: '' }), true);
  assert.equal(V.isNight({ period: '', time: '23:30' }), true); assert.equal(V.isNight({ period: '', time: '03:00' }), true);
  assert.equal(V.isNight({ period: '晨起', time: '04:50' }), false);   // 时段优先于时刻
  assert.deepEqual(V.worldTime(null), { date: '', time: '', period: '' }); assert.deepEqual(V.clockLabel(V.worldTime({})), { short: '', full: '' });
});
t('事件按剧情内时间排序（有时间时）', () => {
  assert.ok(V.timeKey('2088.01.12 21:40') > V.timeKey('2088.01.12 09:00'));
  assert.ok(V.timeKey('2088.01.13 01:00') > V.timeKey('2088.01.12 23:00'));
  assert.equal(V.timeKey('明天'), null);
  const tag = (ty, pl, tm) => `<span style="display:none" data-tcmap="类型=${ty};地点=${pl};标题=测试${ty};等级=2;状态=发生中;时间=${tm}"></span>`;
  const ev = collect([{ floor: 1, text: tag('火灾', '下层·7号井', '2088.01.12 23:00') }, { floor: 2, text: tag('停电', '中层·霓虹街', '2088.01.12 08:00') }], 2);
  assert.deepEqual(ev.map(e => e.cat), ['火灾', '停电']);
});
t('着装：跳过待初始化；一行截断', () => {
  assert.equal(V.outfit({ 主角: { 着装: { 衣服: '待初始化', 裤子: '', 鞋子: '待初始化' } } }, '主角.着装'), null);
  const o = V.outfit({ 主角: { 着装: { 衣服: '白衬衫', 裤子: '深色长裤', 鞋子: '皮鞋' } } }, '主角.着装');
  assert.equal(V.outfitText(o), '白衬衫 / 深色长裤 / 皮鞋');
  assert.equal([...V.outfitText({ 衣服: 'x'.repeat(80) }, 20)].length, 20);
  assert.equal(V.outfit({}, '主角.着装'), null); assert.equal(V.outfit({ 主角: { 着装: { 衣服: 'a' } } }), null, 'no path, no outfit'); assert.equal(V.outfitText(null), '');
});
t('自定义：设置、清除、显示名、叫法表、长度上限', () => {
  let c = V.setCustom({}, '书房', { name: '星图室', note: '看星图', kind: 'room' });
  assert.deepEqual(c.items.书房, { 类: 'room', 名: '星图室', 用途: '看星图' });
  assert.equal(V.displayName(c, '书房'), '星图室'); assert.equal(V.displayName(c, '主卧'), '主卧');
  assert.deepEqual(V.aliasMap(c, ['room']), { 星图室: '书房' }); assert.equal(V.findKey(c, '星图室'), '书房');
  c = V.setCustom(c, '书房', { name: '' }); assert.deepEqual(c.items.书房, { 类: 'room', 用途: '看星图' });
  c = V.setCustom(c, '书房', { note: '' }); assert.equal(c.items.书房, undefined);
  assert.equal(V.setCustom({}, '书房', { name: 'x'.repeat(41) }), null);
  assert.equal(V.setCustom({}, '书房', { note: 'x'.repeat(201) }), null);
  assert.equal(V.removeCustom({}, '书房'), null);
});
t('旧版本机叫法迁移', () => {
  const { custom, changed } = V.migrateRooms(V.setCustom({}, '主卧', { name: '卧房', kind: 'room' }), { 星图室: '书房', 小卧: '主卧' });
  assert.equal(changed, 2); assert.equal(custom.items.书房.名, '星图室'); assert.deepEqual(custom.items.主卧.别名, ['小卧']);
  assert.deepEqual(V.aliasMap(custom), { 星图室: '书房', 卧房: '主卧', 小卧: '主卧' });
});
t('剧情标签：⌖改名 / ⌖用途；示范原文与代码块不算；只处理新楼层', () => {
  assert.deepEqual(V.parseCustomTags('<span style="display:none">⌖改名 客房 → 画室</span>⌖用途 客房：放画架的地方'),
    [{ op: 'name', key: '客房', value: '画室' }, { op: 'note', key: '客房', value: '放画架的地方' }]);
  assert.deepEqual(V.parseCustomTags('⌖改名 原名 → 新名 ⌖改名 书房 → 星图室 ```⌖改名 甲 → 乙```'), []);
  const r = V.applyTags({}, [{ floor: 3, text: '⌖改名 书房 -> 星图室' }, { floor: 5, text: '⌖用途 星图室：夜里看星图' }], 2, () => 'room');
  assert.equal(r.custom.items.书房.名, '星图室'); assert.equal(r.custom.items.书房.用途, '夜里看星图'); assert.equal(r.custom.items.书房.类, 'room');
  assert.equal(r.applied.length, 2); assert.equal(r.last, 5);
  assert.equal(V.applyTags(r.custom, [{ floor: 5, text: '⌖改名 书房 -> 别的' }], 5).applied.length, 0);
});
t('注入摘要与世界书条目：紧凑、有上限、空时为空', () => {
  const c = V.setCustom(V.setCustom({}, '书房', { name: '星图室', note: '看星图' }), '雷恩', { note: 'x'.repeat(190), kind: 'character' });
  const s = V.summarizeCustom(c); assert.match(s, /书房→星图室（看星图）/); assert.ok(s.length < 260);
  assert.equal(V.summarizeCustom({}), ''); assert.equal(V.wbContent({}), '');
  assert.match(V.wbContent(c), /书房：玩家称为「星图室」；用途：看星图/);
});
console.log(`mvu: ${n} 项通过`);

{   // todPhase：卡的五时段与时刻 → 晨 / 日 / 暮 / 夜（v0.9.6）
  const todPhase = V.todPhase;
  const P = p => todPhase({ period: p, time: '' });
  assert.equal(P('晨起'), 'dawn'); assert.equal(P('晨间报到'), 'dawn'); assert.equal(P('日间'), 'day'); assert.equal(P('侍寝时段'), 'dusk'); assert.equal(P('就寝'), 'night');
  const T = t => todPhase({ period: '', time: t });
  assert.equal(T('05:30'), 'dawn'); assert.equal(T('12:00'), 'day'); assert.equal(T('18:10'), 'dusk'); assert.equal(T('23:00'), 'night'); assert.equal(T('03:00'), 'night');
  assert.equal(todPhase({ period: '', time: '' }), ''); assert.equal(todPhase(null), '');
}
