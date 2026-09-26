// node tests/events.test.mjs —— 天城事态解析器单测
import assert from 'node:assert/strict';
import { parseMarks, collect, summarize, layerOf, tierOf } from '../map/tavern/events.mjs';

const span = s => `<htm1fenge><div>…</div><span style="display:none">${s}</span></htm1fenge>`;
let n = 0; const t = (name, f) => { f(); n++; console.log('ok', name); };

t('全角分隔 + 发布方缺省', () => {
  const [e] = parseMarks(span('⌖火灾｜中层·霓虹街C区｜2｜霓街17号仓库起火，三人被困'));
  assert.equal(e.cat, '火灾'); assert.equal(e.layer, '中层'); assert.equal(e.place, '霓虹街C区'); assert.equal(e.lvl, 2); assert.equal(e.src, '天城一台');
});
t('半角分隔、空格、别名类别', () => {
  const [e] = parseMarks('⌖ 查抄 | 下层 · 7号井 | 3 | 突击查抄 | 执法局下层分局');
  assert.equal(e.cat, '黑市查抄'); assert.equal(e.place, '7号井'); assert.equal(e.lvl, 3); assert.equal(e.src, '执法局下层分局');
});
t('未知类别归「其他」', () => { assert.equal(parseMarks('⌖流星雨｜上层·伊甸庄园｜1｜夜空里一串蓝光')[0].cat, '其他'); });
t('无层前缀：按关键词推断，推不出就丢', () => {
  assert.equal(parseMarks('⌖火灾｜7号井｜1｜锅炉房冒烟')[0].layer, '下层');
  assert.equal(parseMarks('⌖火灾｜某处｜1｜冒烟').length, 0);
});
t('等级越界 / 缺字段丢弃', () => {
  assert.equal(parseMarks('⌖火灾｜中层·C区｜5｜太大').length, 0);
  assert.equal(parseMarks('⌖火灾｜中层·C区').length, 0);
});
t('HTML 实体转义后仍能解析', () => { assert.equal(parseMarks('&lt;span style=&quot;display:none&quot;&gt;⌖通缉｜中层·商业区｜2｜悬赏五万 Æ&lt;/span&gt;').length, 1); });
t('代码块与示范原文不上图', () => {
  assert.equal(parseMarks('```\n⌖火灾｜中层·C区｜2｜示例\n```').length, 0);
  assert.equal(parseMarks(span('⌖检查点管控｜中层·C区检查点｜2｜查验身份芯片与资产铭牌｜执法局')).length, 0);
});
t('内容硬边界', () => { assert.equal(parseMarks('⌖通缉｜中层·商业区｜2｜逃跑的母畜').length, 0); });
t('一楼最多 3 条', () => { assert.equal(parseMarks('⌖火灾｜中层·A｜1｜a ⌖火灾｜中层·B｜1｜b ⌖火灾｜中层·C｜1｜c ⌖火灾｜中层·D｜1｜d').length, 3); });

t('合并：15 楼内同类同地 = 更新；0 = 平息', () => {
  const msgs = [
    { floor: 10, text: '⌖火灾｜中层·霓虹街｜2｜起火' },
    { floor: 12, text: '⌖火灾｜中层·霓虹街｜3｜火势蔓延' },
    { floor: 14, text: '⌖网络攻击｜中层·商业区｜2｜全息广告被劫持' },
    { floor: 16, text: '⌖火灾｜中层·霓虹街｜0｜明火扑灭' },
  ];
  const items = collect(msgs, 16);
  const fire = items.find(e => e.cat === '火灾');
  assert.equal(items.length, 2); assert.equal(fire.count, 3); assert.equal(fire.closed, true); assert.equal(fire.first, 10); assert.equal(fire.text, '明火扑灭');
  assert.equal(items[0].cat, '火灾');   // 最近更新的在前
});
t('超过合并窗口 = 新事件；老化分档', () => {
  const items = collect([{ floor: 1, text: '⌖火灾｜下层·7号井｜1｜a' }, { floor: 30, text: '⌖火灾｜下层·7号井｜1｜b' }], 30);
  assert.equal(items.length, 2);
  assert.deepEqual(items.map(e => e.tier), ['live', 'fade']);
  assert.equal(collect([{ floor: 1, text: '⌖火灾｜下层·7号井｜1｜a' }], 50).length, 0);
  assert.equal(tierOf(8, false), 'after');
});
t('swipe / 删楼：纯函数重算', () => {
  const a = collect([{ floor: 5, text: '⌖凶案｜下层·贫民区｜2｜a' }], 5);
  const b = collect([{ floor: 5, text: '（换了一个回复，没有事件）' }], 5);
  assert.equal(a.length, 1); assert.equal(b.length, 0);
});
t('所在层与注入', () => {
  assert.equal(layerOf('伊甸庄园·主卧'), '上层'); assert.equal(layerOf('地基区 7 号井'), '下层'); assert.equal(layerOf('中层·霓虹街'), '中层'); assert.equal(layerOf('某个房间'), '');
  const items = collect([{ floor: 3, text: '⌖黑市查抄｜下层·7号井｜2｜三名中间人被带走' }, { floor: 3, text: '⌖政策｜中层·商业区｜1｜通行税上调' }], 4);
  const s = summarize(items, '下层');
  assert.match(s, /^\[天城事态·仅背景/); assert.match(s, /7号井/); assert.doesNotMatch(s, /通行税/);
  assert.ok(s.length <= 80 + 40);
  assert.equal(summarize(items, ''), ''); assert.equal(summarize(items, '上层'), '');
});
t('data-tcmap：字段、推断层、状态关闭、编号合并', () => {
  const tag = o => `<span style="display:none" data-tcmap="${o}"></span>`;
  const [e] = parseMarks(tag('类型=火灾;地点=血肉磨坊;标题=后巷起火;等级=2;状态=发生中;编号=LEB-88-0400'));
  assert.equal(e.cat, '火灾'); assert.equal(e.layer, '下层'); assert.equal(e.place, '血肉磨坊'); assert.equal(e.lvl, 2); assert.equal(e.code, 'LEB-88-0400');
  assert.equal(parseMarks(tag('类型=执法管控;地点=中层 霓虹街后巷;标题=临检;等级=1'))[0].cat, '检查点管控');
  assert.equal(parseMarks(tag('类型=盗窃;地点=伊甸庄园;标题=藏品失窃'))[0].layer, '上层');
  const items = collect([
    { floor: 3, text: tag('类型=火灾;地点=7号井黑市;标题=仓库起火;等级=3;状态=发生中;编号=LEB-88-0501') },
    { floor: 6, text: tag('类型=火灾;地点=7号井;标题=余火复燃;状态=已扑灭;编号=LEB-88-0501') },
  ], 6);
  assert.equal(items.length, 1); assert.equal(items[0].closed, true); assert.equal(items[0].count, 2);
});
t('data-tcmap：世界书示范原文、实体转义、网络攻击范围', () => {
  assert.equal(parseMarks('<span data-tcmap="类型=网络攻击;地点=中层;范围=中层;标题=霓虹网络遭入侵;等级=2;持续=3"></span>').length, 0);
  const [e] = parseMarks('&lt;span data-tcmap=&quot;类型=网络攻击;地点=中层 商业区;范围=中层;标题=广告屏被劫持;等级=3;持续=5&quot;&gt;');
  assert.equal(e.cat, '网络攻击'); assert.equal(e.scope, '中层'); assert.equal(e.dur, 5); assert.equal(e.lvl, 3);
});
t('两种写法混在一楼：按出现顺序，总数 ≤ 3', () => {
  const s = '⌖火灾｜中层·A｜1｜a <span data-tcmap="类型=盗窃;地点=中层 B;标题=b"></span> ⌖火灾｜中层·C｜1｜c ⌖火灾｜中层·D｜1｜d';
  assert.deepEqual(parseMarks(s).map(e => e.place), ['A', 'B', 'C']);
});
t('世界书视觉样例的 8 条示范标签原文不上图', () => {
  const EX8 = [
    '类型=巡空令;地点=银冠堡;标题=骑士团加开巡空;等级=1;状态=进行中;来源=议会骑士团;编号=KN-88-0041',
    '类型=塔体保养;地点=以太气候调节塔;标题=第三环停机保养;等级=1;状态=预告;时间=2088.01.14 05:30;来源=天城执政厅;编号=CT-88-0003',
    '类型=灰票造假;地点=7号井黑市;标题=假灰票流入7号井;等级=2;状态=发生中;来源=黑市终端;编号=BM-88-0114',
    '类型=议会质询;地点=天城议会;标题=质询空防预算;等级=1;状态=进行中;来源=天城议会;编号=CP-88-0017',
    '类型=广告劫持;地点=中层 霓虹街;标题=全息广告被劫持;等级=2;状态=发生中;来源=天城一台;编号=TV1-88-0209',
    '类型=修女出巡;地点=施粥站;标题=修女队沿施粥线巡行;等级=1;状态=进行中;来源=天城一台;编号=TV1-88-0211',
    '类型=联合演习;地点=防卫军前沿哨所;标题=前沿哨所夜间联合演习;等级=1;状态=预告;时间=2088.01.13 22:00;来源=天城防卫军;编号=DF-88-0056',
    '类型=轨道故障;地点=中层 悬浮轨道C线;标题=C线第七区段停运;等级=2;状态=发生中;来源=天城一台;编号=TV1-88-0213',
  ];
  for (const x of EX8) assert.equal(parseMarks(`<span style="display:none" data-tcmap="${x}"></span>`).length, 0, x);
  // 8 条一起出现在同一楼（样例卡原样复述）也不产生事件；改一个字段就照常解析
  assert.equal(collect([{ floor: 9, text: span(EX8.map(x => `<span data-tcmap="${x}"></span>`).join('')) }], 9).length, 0);
  assert.equal(parseMarks(`<span data-tcmap="${EX8[2].replace('等级=2', '等级=3')}"></span>`).length, 1);
});
console.log(`\n${n} passed`);
