// node tests/events.test.mjs —— 天城事态解析器单测
import assert from 'node:assert/strict';
import { parseMarks, collect, summarize, layerOf, tierOf, CATS, GROUPS, GROUP_ORDER, SHAPES, catOf, EXAMPLES } from '../map/tavern/events.mjs';

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
t('不做关键词过滤：正文原样保留', () => { const r = parseMarks('⌖通缉｜中层·商业区｜2｜任意正文 ABC'); assert.equal(r.length, 1); assert.equal(r[0].text, '任意正文 ABC'); });
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
  assert.equal(tierOf(8, false), 'after');
});
t('未解除的事件不因楼层旧而丢（窗口内一直以「淡出」列出）；已解除的照旧淡出后丢弃（E6）', () => {
  const open = collect([{ floor: 1, text: '⌖通缉｜中层·霓虹街｜2｜悬赏令' }], 80);
  assert.equal(open.length, 1); assert.equal(open[0].tier, 'fade'); assert.equal(open[0].closed, false);
  assert.equal(tierOf(79, false), 'fade'); assert.equal(tierOf(500, false), 'fade');
  const shut = collect([{ floor: 1, text: '⌖通缉｜中层·霓虹街｜2｜悬赏令' }, { floor: 5, text: '⌖通缉｜中层·霓虹街｜0｜已落网' }], 80);
  assert.equal(shut.length, 0);   // 已解除 76 楼 > 40：丢
  assert.equal(collect([{ floor: 1, text: '⌖通缉｜中层·霓虹街｜2｜a' }, { floor: 5, text: '⌖通缉｜中层·霓虹街｜0｜b' }], 30)[0].tier, 'fade');
  assert.equal(tierOf(41, true), ''); assert.equal(tierOf(20, true), 'after');
});
t('隔了合并窗口再出现：旧的一条让位，不常驻（避免同一事件两条都挂着）', () => {
  const items = collect([{ floor: 1, text: '⌖封锁｜中层·C区检查点｜2｜a' }, { floor: 30, text: '⌖封锁｜中层·C区检查点｜2｜b' }], 75);
  assert.equal(items.length, 1); assert.equal(items[0].text, 'b'); assert.equal(items[0].tier, 'fade');
  // 隔了合并窗口才来的「已解除」：旧的未解除那条也不再常驻
  const late = collect([{ floor: 1, text: '⌖封锁｜中层·C区检查点｜2｜a' }, { floor: 30, text: '⌖封锁｜中层·C区检查点｜0｜解除' }], 75);
  assert.equal(late.length, 0);
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

// ---------- 事件体系 v2（docs/event-taxonomy.md：9 大类；v0.9.5 起 82 种）----------
const V2 = {
  空防: { 巡空令: '巡', 结界警报: '结', 空域临检: '检', 宴会加警: '宴', 以太信标失准: '标', 锚泊校正: '锚' },
  气候: { 塔体保养: '塔', 气候故障: '候', 以太潮汐: '潮', 结界过载: '过', 气压异常: '压', 人工极光: '光' },
  治安: { 检查点管控: '管', 盗窃: '盗', 抢劫: '劫', 通缉: '缉', 黑市查抄: '抄', 持械: '械', 资产纠纷: '产', 灰票造假: '票', 以太走私: '私', 非法义体: '义', 凶案: '凶', 追捕在逃人员: '追', 帮派冲突: '帮', 下层失踪案: '踪', 赤潮相关: '赤' },
  政治: { 政策: '策', 通行税: '税', 议会质询: '议', 评级复核: '评', 议席改选: '席', 联盟内讧: '盟' },
  媒体: { 舆情: '传', 公共直播: '播', 名流八卦: '闻', 网络攻击: '网', 数据泄露: '泄', 广告劫持: '屏', 直播事故: '播' },
  民生: { 施粥告急: '粥', 教会仪式: '祷', 以太配给: '配', 兑价波动: '兑', 急救: '救', 骚乱: '乱', 修女出巡: '铁', 建城纪念日: '城', 制度纪念日: '纪', 丰收节: '丰', 地下格斗: '斗' },
  军事: { 哨所换防: '防', 军事调动: '调', 魔导装甲调动: '甲', 联合演习: '演', 边境警戒: '境', 城外清剿: '剿', 私兵冲突: '兵', 异兽侵袭: '兽', 戒严: '戒' },
  灾害: { 火灾: '火', 停电: '电', 交通事故: '撞', 轨道故障: '轨', 以太泄漏: '漏', 爆炸: '爆', 结构坍塌: '塌' },
  人物: { 公开行程: '程', 首相出席: '相', 防卫军阅兵: '阅', 名门晚宴: '筵', 大主教弥撒: '弥', 修女授勋: '勋', 丑闻曝光: '丑', 债务违约: '债', 继承之争: '继', 失势罢免: '罢', 以太觉醒: '觉', 拍卖季: '拍', 品鉴宴: '品', 猎季: '猎', 贵族暗杀: '刺' },
};
t('v2：9 个大类、颜色与图例顺序', () => {
  assert.deepEqual(GROUP_ORDER, Object.keys(V2));
  assert.equal(GROUPS.人物, '#d7a6e8'); assert.equal(GROUPS.空防, '#d9a441'); assert.equal(GROUPS.灾害, '#ff5a2a');
  for (const g of GROUP_ORDER) assert.match(GROUPS[g], /^#[0-9a-f]{6}$/);
});
t('v2：每一种类型都能解析到正确大类、图标字、颜色（两种写法）', () => {
  let k = 0;
  for (const [g, types] of Object.entries(V2)) for (const [c, ch] of Object.entries(types)) {
    const [a] = parseMarks(`⌖${c}｜中层·商业区｜2｜测试${k}`);
    assert.equal(a.cat, c, c); assert.equal(a.grp, g, c); assert.equal(a.ch, ch, c); assert.equal(a.color, GROUPS[g], c);
    const [b] = parseMarks(`<span style="display:none" data-tcmap="类型=${c};地点=下层 7号井;标题=测试${k};等级=1"></span>`);
    assert.equal(b.cat, c, c); assert.equal(b.grp, g, c);
    assert.ok(CATS[c].rare >= 1 && CATS[c].rare <= 4, c); k++;
  }
  assert.equal(k, Object.keys(CATS).length - 1);   // 表里的类型 = CATS 里除「其他」外的全部
});
t('v2：新类型的近义词', () => {
  const S = { 信标: '以太信标失准', 以太潮: '以太潮汐', 走私: '以太走私', 义体: '非法义体', 改选: '议席改选', 绯闻: '名流八卦', 配给: '以太配给', 魔导: '魔导装甲调动',
    泄漏: '以太泄漏', 行程: '公开行程', 首相: '首相出席', 阅兵: '防卫军阅兵', 将军阅兵: '防卫军阅兵', 晚宴: '名门晚宴', 弥撒: '大主教弥撒', 授勋: '修女授勋', 丑闻: '丑闻曝光', 违约: '债务违约',
    继承: '继承之争', 罢免: '失势罢免', 觉醒: '以太觉醒' };
  for (const [w, c] of Object.entries(S)) assert.equal(catOf(w), c, w);
  // 最长匹配：「装甲部队调动」不被短的「调动」抢走；泄露 / 泄漏 分开
  assert.equal(catOf('装甲部队调动'), '魔导装甲调动'); assert.equal(catOf('以太泄漏事故'), '以太泄漏'); assert.equal(catOf('客户数据泄露'), '数据泄露');
  assert.equal(catOf('直播事故'), '直播事故'); assert.equal(catOf('首相出席晚宴'), '首相出席');
});
t('v1 旧标签兼容：8 类 46 种原名 + 旧查看器 / 旧文档用过的名字', () => {
  const V1 = ['巡空令', '结界警报', '锚泊校正', '空域临检', '宴会加警', '塔体保养', '气候故障', '结界过载', '气压异常', '人工极光', '黑市查抄', '检查点管控', '通缉', '持械', '凶案',
    '抢劫', '盗窃', '资产纠纷', '灰票造假', '政策', '议会质询', '联盟内讧', '通行税', '评级复核', '网络攻击', '数据泄露', '广告劫持', '直播事故', '公共直播', '舆情',
    '施粥告急', '教会仪式', '修女出巡', '急救', '兑价波动', '骚乱', '军事调动', '哨所换防', '联合演习', '边境警戒', '火灾', '爆炸', '交通事故', '停电', '轨道故障', '结构坍塌'];
  assert.equal(V1.length, 46);
  for (const c of V1) { const [e] = parseMarks(`⌖${c}｜下层·7号井｜2｜旧标签`); assert.equal(e.cat, c, c); assert.notEqual(e.grp, '人物'); }
  const OLD = { 结界事故: '结界警报', 空域巡查: '巡空令', 执法管控: '检查点管控', 执法: '检查点管控', 封锁: '检查点管控', 枪击: '持械', 天气: '气候故障', 民生: '施粥告急',
    交通: '交通事故', 军事: '军事调动', 结界: '结界警报', 信号干扰: '网络攻击', 起火: '火灾', 断电: '停电' };
  for (const [w, c] of Object.entries(OLD)) assert.equal(parseMarks(`<span data-tcmap="类型=${w};地点=中层 商业区;标题=旧写法${w}"></span>`)[0].cat, c, w);
});
t('只写大类名：类型记「其他」，颜色按大类；认不出的仍是其他', () => {
  const [a] = parseMarks('⌖人物｜上层·银冠堡｜1｜某位将军现身');
  assert.equal(a.cat, '其他'); assert.equal(a.grp, '人物'); assert.equal(a.color, GROUPS.人物); assert.equal(a.ch, '!');
  const [b] = parseMarks('⌖流星雨｜上层·伊甸庄园｜1｜夜空里一串蓝光'); assert.equal(b.grp, '其他');
  assert.equal(parseMarks('⌖治安｜中层·商业区｜1｜巡逻')[0].color, GROUPS.治安);
});
t('v2 人物类照常解析；示范原文仍被忽略', () => {
  assert.equal(parseMarks('⌖丑闻曝光｜上层·银冠堡｜3｜某某丑闻').length, 1);
  assert.equal(parseMarks('⌖首相出席｜中层·天城议会｜2｜首相出席浮空港落成礼').length, 1);
  for (const x of EXAMPLES) {
    const raw = x.startsWith('⌖') ? span(x) : `<span style="display:none" data-tcmap="${x}"></span>`;
    assert.equal(parseMarks(raw).length, 0, x);
  }
});
t('v2 上层府邸地名推断到上层', () => {
  for (const p of ['首相府', '将军官邸', '财团家族庄园', '罗斯柴尔德庄园', '悬浮岛 R-02', '庄园主联盟会所', '以太研究院', '银冠堡']) {
    assert.equal(parseMarks(`⌖公开行程｜${p}｜1｜到访`)[0].layer, '上层', p); assert.equal(layerOf(p), '上层', p);
  }
});
t('首次出现就是已解除：记为已解除（灰色余波），不丢（E4 N16）', () => {
  const tag = o => `<span style="display:none" data-tcmap="${o}"></span>`;
  const items = collect([
    { floor: 20, text: tag('类型=骚乱;地点=血肉磨坊;标题=拳场骚乱已控制;状态=已控制') },
    { floor: 21, text: '⌖爆炸｜下层·货运站｜0｜货运站爆燃已扑灭' },
    { floor: 22, text: '⌖火灾｜中层·霓虹街｜2｜起火' },
  ], 22);
  assert.equal(items.length, 3);
  const riot = items.find(e => e.cat === '骚乱'), boom = items.find(e => e.cat === '爆炸');
  assert.equal(riot.closed, true); assert.equal(riot.lvl, 0); assert.equal(riot.tier, 'after'); assert.equal(riot.count, 1); assert.equal(riot.first, 20);
  assert.equal(boom.closed, true); assert.equal(boom.text, '货运站爆燃已扑灭');
  assert.equal(items.find(e => e.cat === '火灾').closed, false);
  // 之后同一地点再「发生中」= 新的一条进行中事件，已解除的那条保留
  const again = collect([{ floor: 20, text: '⌖骚乱｜下层·血肉磨坊｜0｜已控制' }, { floor: 23, text: '⌖骚乱｜下层·血肉磨坊｜2｜再起冲突' }], 23);
  assert.equal(again.length, 2); assert.deepEqual(again.map(e => e.closed), [false, true]);
  // 老化规则不变：40 楼以前的已解除事件丢弃
  assert.equal(collect([{ floor: 1, text: '⌖骚乱｜下层·血肉磨坊｜0｜已控制' }], 50).length, 0);
  // 注入给模型的一句话不含已解除事件
  assert.equal(summarize(items, '下层'), '');
});
t('色弱：媒体与气候拉开颜色，9 个大类各有形状（E4 N30）', () => {
  assert.equal(GROUPS.媒体, '#d03ca8'); assert.notEqual(GROUPS.媒体, GROUPS.气候);
  for (const g of GROUP_ORDER) assert.ok(SHAPES[g], g);
  assert.equal(new Set(GROUP_ORDER.map(g => SHAPES[g])).size, GROUP_ORDER.length);
});
t('设定对齐：层推断（card-digest §10 第 5、12、13、14 条）', () => {
  const L = p => (parseMarks(`⌖公开行程｜${p}｜1｜到访`)[0] || {}).layer || '';   // 认不出层的事件不上图（parseMarks 不返回）
  assert.equal(L('大主教府邸'), '中层'); assert.equal(layerOf('大主教府邸'), '中层');       // 上层没有教区
  assert.equal(L('骑士团巡逻据点'), ''); assert.equal(layerOf('议会骑士团'), '');          // 「骑士团」不单独定层
  assert.equal(L('银冠堡'), '上层');
  for (const p of ['光辉联邦', '大骑士领·圣都', '第三帝国', '灵枢秘派', '虚灵古派', '原域', '海外']) { assert.equal(L(p), '天城外', p); assert.equal(layerOf(p), '天城外', p); }
  assert.equal(L('奥伦帝国'), '');                                                       // 国都就是天城，不算天城外
  assert.equal(L('最高法院'), '中层'); assert.equal(L('佣兵公会'), '中层'); assert.equal(L('公共收容设施'), '下层');
  assert.equal(L('法师塔'), ''); assert.equal(L('天城执政厅'), '');                       // 卡没写层：不猜
  assert.equal(L('旧公寓楼'), '中层'); assert.equal(L('废弃教堂区'), '下层');             // 之前的修正保留
  assert.equal(L('中层第三分局'), '中层'); assert.equal(L('下层分局'), '下层');
});

t('防卫军阅兵：旧名「将军阅兵」仍认', () => { assert.equal(catOf('将军阅兵'), '防卫军阅兵'); assert.equal(catOf('防卫军阅兵'), '防卫军阅兵'); });

t('v0.9.5 五路通读：层规则与新类型别名', () => {
  const L = p => (parseMarks(`⌖公开行程｜${p}｜1｜到访`)[0] || {}).layer || '';
  assert.equal(L('某家族庄园'), ''); assert.equal(L('区议会'), '');                        // 「庄园」「议会」单独不定层
  assert.equal(L('悬浮庄园区'), '上层'); assert.equal(L('天城议会'), '中层'); assert.equal(L('伊甸庄园'), '上层');
  for (const p of ['天城外围防线', '野兽潮前线', '城外营地']) assert.equal(L(p), '天城外', p);
  for (const p of ['贫民窟', '廉价酒馆', '非法赌场']) assert.equal(L(p), '下层', p);
  const A = { 兽潮: '异兽侵袭', 野兽潮: '异兽侵袭', 戒严令: '戒严', 展示会: '品鉴宴', 帮派火并: '帮派冲突', 追捕: '追捕在逃人员', 失踪: '下层失踪案', 清剿: '城外清剿', 私兵: '私兵冲突', 暗杀: '贵族暗杀', 赤潮: '赤潮相关', 格斗赛: '地下格斗', 私人拍卖: '拍卖季', 狩猎季: '猎季', 丰收: '丰收节' };
  for (const [a, c] of Object.entries(A)) assert.equal(catOf(a), c, a);
});

console.log(`\n${n} passed`);
