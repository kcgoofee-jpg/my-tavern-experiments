// node tests/roster095.test.mjs —— v0.9.5 人物栏名册（只读）：按表的位置发现在场 / 成员 / 目标，身份、阶段、声望、阶段顺序。数据全是中性占位
import assert from 'node:assert/strict';
import * as V from '../map/tavern/mvu.mjs';
let n = 0; const t = (name, f) => { f(); n++; console.log('ok', name); };
const S = { 世界: { 当前地点: '甲地' }, 主角: { 声望: 62, 着装: {} }, 表一: { 甲: { 身份: '园丁', 等级: 'B' } }, 在场人物: { 乙: { 身份: '访客' } }, 表三: { 丙: { 身份: '商人', 进度: '第二步' }, 丁: { 身份: ['学者', '说明'], 进度: '第一步' } } };
t('按位置发现三张表；身份、阶段；[值, 说明] 也认', () => {
  const r = V.rosters(S);
  assert.equal(r.present.key, '在场人物'); assert.deepEqual(r.present.items, [{ name: '乙', identity: '访客' }]);
  assert.equal(r.members.key, '表一'); assert.deepEqual(r.members.items[0], { name: '甲', identity: '园丁' });
  assert.equal(r.targets.key, '表三'); assert.deepEqual(r.targets.items[1], { name: '丁', identity: '学者', stage: '第一步' });
});
t('映射覆盖表名；缺表为 null；非对象安全', () => {
  const r = V.rosters(S, { members: '表三', targets: '表一' }); assert.equal(r.members.key, '表三'); assert.equal(r.targets.key, '表一');
  assert.deepEqual(V.rosters({ 世界: {}, 主角: {} }), { present: null, members: null, targets: null });
  assert.deepEqual(V.rosters(null), { present: null, members: null, targets: null });
});
t('声望：第 2 个顶层键里认「声望」；限 0–100；可指定路径', () => {
  assert.equal(V.reputation(S), 62); assert.equal(V.reputation({ a: {}, b: { 声望: 140 } }), 100);
  assert.equal(V.reputation({ a: {}, b: {} }), null); assert.equal(V.reputation({ x: { y: '30' } }, 'x.y'), 30);
});
t('阶段顺序：在脚本文本里找含全部取值的数组', () => {
  const src = 'const a = ["无关"]; const s = z.enum([\'第一步\', \'第二步\', \'第三步\']);';
  assert.deepEqual(V.findStageOrder([src], ['第二步', '第一步']), ['第一步', '第二步', '第三步']);
  assert.equal(V.findStageOrder([src], ['第九步']), null); assert.equal(V.findStageOrder([], ['x']), null);
});
t('原作头像表：只收作者 CDN 的 /sfw/ 地址', () => {
  const ok = 'https://cdn.jsdelivr.net/gh/Yehehua1311/repo@main/A/sfw/A_1.png';
  const src = `var defaultPortraits = { "甲": "${ok}", "乙": "https://cdn.jsdelivr.net/gh/Yehehua1311/repo@main/B/other/B_1.png", "丙": "https://example.com/sfw/c.png" };`;
  assert.deepEqual(V.findPortraits([src]), { 甲: ok }); assert.deepEqual(V.findPortraits(['无']), {});
});
console.log(`${n} passed`);
