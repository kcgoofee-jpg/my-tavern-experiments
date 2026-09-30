// node tests/roster095.test.mjs —— v0.9.5 人物栏名册（只读）：按表的位置发现在场 / 成员 / 目标，身份、阶段、声望、阶段顺序。数据全是中性占位
// 保底名册（通用化 v1）是包级数据（map/data/fallback_roster.json），rosters() 按参数收；这里显式传 eden 的保底名册当夹具
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as V from '../map/tavern/mvu.mjs';
import { useEden } from './helpers/eden-profile.mjs';
useEden();   // the first pack's variable and roster declarations (its overlay blocks); the engine itself names no card
const FB = JSON.parse(readFileSync(new URL('../map/data/fallback_roster.json', import.meta.url), 'utf8')).members;
let n = 0; const t = (name, f) => { f(); n++; console.log('ok', name); };
const S = { 世界: { 当前地点: '甲地' }, 主角: { 声望: 62, 着装: {} }, 表一: { 甲: { 身份: '园丁', 等级: 'B' } }, 在场人物: { 乙: { 身份: '访客' } }, 表三: { 丙: { 身份: '商人', 进度: '第二步' }, 丁: { 身份: ['学者', '说明'], 进度: '第一步' } } };
t('按位置发现三张表；身份、阶段；[值, 说明] 也认', () => {
  const r = V.rosters(S);
  assert.equal(r.present.key, '在场人物'); assert.deepEqual(r.present.items, [{ name: '乙', identity: '访客' }]);
  assert.equal(r.members.key, '表一'); assert.deepEqual(r.members.items[0], { name: '甲', identity: '园丁' });
  assert.equal(r.targets.key, '表三'); assert.deepEqual(r.targets.items[1], { name: '丁', identity: '学者', stage: '第一步' });
});
t('映射覆盖表名；缺表走设定兜底（包保底名册 16 人）；非对象安全；不给 fallback 就没有兜底行', () => {
  const r = V.rosters(S, { members: '表三', targets: '表一' }); assert.equal(r.members.key, '表三'); assert.equal(r.targets.key, '表一');
  const fb = V.rosters({ 世界: {}, 主角: {} }, {}, FB);
  assert.equal(fb.present, null); assert.equal(fb.targets, null);
  assert.equal(fb.members.key, '设定名册'); assert.equal(fb.members.items.length, 16);
  assert.equal(fb.members.items[0].name, '绫濑遥'); assert.equal(fb.members.items[0].src, '设定');
  assert.equal(V.rosters(null, {}, FB).members.items.length, 16);
  assert.equal(V.rosters({ 世界: {}, 主角: {} }).members, null, '没传保底名册（非 eden 包未声明 data.roster）→ 没有兜底行');
});
t('设定兜底合并：MVU 表里有的人以 MVU 为准不重复，表里没有的补在后面', () => {
  const r2 = V.rosters({ 世界: {}, 主角: {}, 表一: { 绫濑遥: { 身份: '女仆长（剧情版）' }, 新人: { 身份: '新加入' } } }, {}, FB);
  assert.equal(r2.members.key, '表一'); assert.equal(r2.members.items.length, 17);
  assert.deepEqual(r2.members.items[0], { name: '绫濑遥', identity: '女仆长（剧情版）' }); assert.ok(!('src' in r2.members.items[0]));
  assert.equal(r2.members.items[1].name, '新人');
  assert.equal(r2.members.items.filter(i => i.name === '绫濑遥').length, 1);
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
t('原作头像表：作者 CDN 只收 /sfw/；另外两个图床的直链也收；别的域名与受限分类不收', () => {
  const cdn = 'https://cdn.jsdelivr.net/gh/Yehehua1311/repo@main/A/sfw/A_1.png';
  const post = 'https://i.postimg.cc/1tJb0jSZ/seraphina.png';
  const pico = 'https://picgocloud.com/i/2024/09/29/abcd.png';
  const src = `var defaultPortraits = { "甲": "${cdn}", "乙": "https://cdn.jsdelivr.net/gh/Yehehua1311/repo@main/B/other/B_1.png", "丙": "https://example.com/sfw/c.png", "丁": "${post}", "戊": "${pico}" };`;
  assert.deepEqual(V.findPortraits([src]), { 甲: cdn, 丁: post, 戊: pico }); assert.deepEqual(V.findPortraits(['无']), {});
});
t('原作头像白名单的底线：https / 图片 / 白名单域名 / 不碰受限分类', () => {
  for (const bad of [
    'http://i.postimg.cc/1tJb0jSZ/x.png',                                        // 非 https
    'https://i.postimg.cc/1tJb0jSZ/x.txt',                                       // 不是图片
    'https://cdn.jsdelivr.net/gh/OtherUser/repo@main/A/sfw/A_1.png',              // 不是作者的仓库
    'https://cdn.jsdelivr.net/gh/Yehehua1311/repo@main/A/性交/A_1.png',           // 受限分类目录
    'https://i.postimg.cc/1tJb0jSZ/口交.png',                                     // 受限分类词
    'https://evil.com/gh/Yehehua1311/repo@main/A/sfw/A_1.png',                   // 冒名域名
    'https://i.postimg.cc/1tJb0jSZ/x.png?v=2',                                   // 带 query
  ]) assert.equal(V.portraitOk(bad), false, '不该收：' + bad);
  assert.equal(V.portraitOk('https://cdn.jsdelivr.net/gh/Yehehua1311/repo@main/A/sfw/A_1.png'), true);
  assert.equal(V.portraitOk('https://picgocloud.com/i/2024/09/29/abcd.webp'), true);
});
import * as C from '../map/tavern/characters.mjs';
t('名字对齐：去 _idN；短名唯一对应「名·」全名；名字当姓用的不合并', () => {
  const known = ['甲·乙家', '丙', '丁·戊', '某人·丙'];
  assert.equal(C.canonName('甲_id9', known), '甲·乙家'); assert.equal(C.canonName('甲', known), '甲·乙家');
  assert.equal(C.canonName('丙', known), '丙'); assert.equal(C.canonName('丙', ['某人·丙', '他人·丙']), '丙');
  assert.equal(C.canonName('己', ['己·一', '己·二']), '己');
  const r = C.collectChars([{ floor: 3, text: '⌖人物 甲_id9 @ 中层·某处' }], 5, [{ name: '甲·乙家', place: '中层·某处', present: false }]);
  assert.equal(r.length, 1); assert.equal(r[0].name, '甲·乙家');
});
t('变量更新块不参与标签解析（含没闭合的）', () => {
  assert.equal(C.stripUpdate('前<UpdateVariable>⌖人物 甲 @ 中层·某处</UpdateVariable>后'), '前 后');
  assert.equal(C.stripUpdate('前<UpdateVariable>没闭合'), '前 ');
});
console.log(`${n} passed`);
