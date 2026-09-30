// node tests/characters.test.mjs —— 人物栏：标签解析、MVU 发现、每人最新位置、颜色避开事态大类、本机头像存储（map/tavern/characters.mjs）
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as C from '../map/tavern/characters.mjs';
import { legend, parseMarks, setGeo } from '../map/tavern/events.mjs';
import { edenGeo } from './helpers/eden-geo.mjs';

setGeo(edenGeo());   // the event taxonomy is the first pack's (its events block)
import { buildIndex, resolveHere } from './helpers/here-engine.mjs';

let n = 0; const t = (name, f) => { f(); n++; console.log('ok', name); };

t('紧凑写法与 data-tcmap 写法', () => {
  const r = C.parseChars('他离开了。<span style="display:none">⌖人物 雷恩 @ 下层·7号井</span><span style="display:none" data-tcmap="人物=Anna Lee;层=中层;地点=霓虹街"></span>⌖人物：艾琳＠中层·C区检查点');
  assert.deepEqual(r, [{ name: '雷恩', place: '下层·7号井' }, { name: 'Anna Lee', place: '中层·霓虹街' }, { name: '艾琳', place: '中层·C区检查点' }]);
});
t('示范原文、代码块、事态标签不算人物', () => {
  assert.deepEqual(C.parseChars('```⌖人物 甲 @ 中层```⌖人物 名字 @ 层·地点 <span data-tcmap="类型=火灾;人物=乙;地点=中层"></span>'), []);
});
t('人物标签不会被当成事态', () => {
  assert.deepEqual(parseMarks('⌖人物 雷恩 @ 下层·7号井 <span data-tcmap="人物=艾琳;地点=中层·霓虹街"></span>'), []);
});
t('一楼最多 8 条', () => { assert.equal(C.parseChars(Array.from({ length: 12 }, (_, i) => `⌖人物 N${i} @ 中层`).join('\n')).length, 8); });
t('MVU：位置字段 + 在场表（取第一处当前地点）', () => {
  const r = C.mvuChars({ 世界: { 当前地点: 'x' }, 在场人物: { 米拉: { 身份: '向导' } }, 角色: { 卡尔: { 位置: '上层·银冠堡' }, 空: 3 } }, '中层·霓虹街 / 下层·7号井');
  assert.deepEqual(r, [{ name: '米拉', place: '中层·霓虹街', present: true }, { name: '卡尔', place: '上层·银冠堡' }]);
});
t('物品 / 势力表带位置字段也不算人物', () => {
  assert.deepEqual(C.mvuChars({ 物品: { 钥匙: { 位置: '中层' } }, 势力: { 骑士团: { 所在地: '上层' } } }, '中层'), []);
  assert.equal(C.mvuChars({ 追踪: { 甲: { 身份: '商人', 位置: '中层' } } }, '').length, 1);
});
t('每人最新一楼为准；MVU 是最新状态', () => {
  const r = C.collectChars([{ floor: 10, text: '⌖人物 甲 @ 中层·霓虹街 ⌖人物 乙 @ 下层·7号井' }, { floor: 20, text: '⌖人物 甲 @ 上层·银冠堡' }], 25, [{ name: '乙', place: '中层', present: true }]);
  assert.deepEqual(r.map(c => [c.name, c.place, c.floor, c.src]), [['甲', '上层·银冠堡', 20, 'tag'], ['乙', '下层·7号井', 10, 'tag']]);   // v0.9.3：在场但没写位置 → 标签优先
  const old = C.collectChars([{ floor: 10, text: '⌖人物 乙 @ 下层·7号井' }], 40, [{ name: '乙', place: '中层', present: true }]);
  assert.deepEqual(old.map(c => [c.place, c.src]), [['中层', 'infer']]);   // 在场、标签已隔 30 楼：按和玩家同处
  assert.equal(C.summarizeChars([{ name: '甲', place: 'p', floor: 1 }], 8, 160, 50), '');   // 注入只放 30 楼内
  const r2 = C.collectChars([{ floor: 10, text: '⌖人物 乙 @ 下层·7号井' }], 25, [{ name: '乙', place: '上层·银冠堡' }, { name: '丙', place: '中层', present: true }]);
  assert.deepEqual(r2.map(c => [c.name, c.place, c.src]), [['丙', '中层', 'infer'], ['乙', '上层·银冠堡', 'mvu']]);
});
t('颜色：色相离事态 9 大类都 ≥ 18°', () => {
  const ev = legend().map(g => g.color).map(C.hueOf).filter(h => h != null);
  for (const h of C.CHAR_HUES) for (const e of ev) { const d = Math.min(Math.abs(h - e), 360 - Math.abs(h - e)); assert.ok(d >= 18, `${h} vs ${e}`); }
  assert.equal(C.colorOf('甲'), C.colorOf('甲'));
});
t('头像框文字', () => { assert.equal(C.initials('雷恩'), '雷'); assert.equal(C.initials('Anna Lee'), 'AL'); });
t('注入摘要：同处合并、最多 8 人', () => {
  const s = C.summarizeChars([{ name: 'A', place: 'p', present: true }, { name: 'B', place: '下层·7号井' }, ...Array.from({ length: 10 }, (_, i) => ({ name: 'X' + i, place: 'q' }))]);
  assert.match(s, /与你同处：A；B@下层·7号井/); assert.equal((s.match(/@/g) || []).length, 7);
  assert.equal(C.summarizeChars([]), '');
});
t('头像只存本机：按聊天、全局兜底；只收图片 data / http 地址', () => {
  const m = new Map(), st = { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) };
  assert.equal(C.setAvatar(st, '', '甲', 'data:image/png;base64,AAA'), true);
  assert.equal(C.setAvatar(st, 'c1', '甲', 'https://x/a.png'), true);
  assert.equal(C.setAvatar(st, 'c1', '乙', 'javascript:alert(1)'), false);
  assert.equal(C.readAvatars(st, 'c1').甲, 'https://x/a.png'); assert.equal(C.readAvatars(st, 'c2').甲, 'data:image/png;base64,AAA');
  assert.equal(C.removeAvatar(st, 'c1', '甲'), true); assert.equal(C.readAvatars(st, 'c1').甲, 'data:image/png;base64,AAA');
  C.writeCharPrefs(st, 'c1', { show: false, off: ['甲', '甲'] }); assert.deepEqual(C.readCharPrefs(st, 'c1'), { show: false, off: ['甲'] });
});
t('人物地点与玩家地点同一条解析链（app/here-v2.mjs）', () => {
  const J = p => JSON.parse(readFileSync(new URL('../map/' + p, import.meta.url), 'utf8'));
  const idx = buildIndex(J('data/maps.json'), J('data/world_markers.json'));
  assert.equal(resolveHere('下层·7号井', idx)?.map, 'tc_low');
  assert.equal(resolveHere('天城上层·D区 / 天城下层·7号井', idx)?.map, 'tc_upper');   // 多处取第一处认得出的
});
t('裸标签只取到句读：不把后面的叙述吃进地点（2026-09-27 接手 review）', () => {
  assert.deepEqual(C.parseChars('⌖人物 雷恩 @ 下层·7号井，他推开铁门走进黑市。'), [{ name: '雷恩', place: '下层·7号井' }]);
  assert.deepEqual(C.parseChars('⌖人物 米拉 @ 庄园·书房；随后她去了花园。'), [{ name: '米拉', place: '庄园·书房' }]);
  // 两个标签挨着写：不吞掉后一个，尾部的「和」也去掉
  assert.deepEqual(C.parseChars('⌖人物 甲 @ 中层·C区检查点 和 ⌖人物 乙 @ 上层·银冠堡'),
    [{ name: '甲', place: '中层·C区检查点' }, { name: '乙', place: '上层·银冠堡' }]);
});
t('开局前（卡初始）：在场表有人也不推断和你同处（2026-09-28 待查 1）', () => {
  const r = C.collectChars([], 0, C.mvuChars({ 在场人物: { 米拉: { 身份: '向导' } } }, '中层·霓虹街'));
  assert.deepEqual(r.map(c => [c.name, c.place, c.src, c.floor]), [['米拉', '', 'infer', 0]]);
  assert.equal(r[0].prelude, true);   // UI 显示「开局前 · 卡初始」，不显示「和你在一起」
  assert.equal(C.summarizeChars(r, 8, 160, 0), '');   // 不注入「与你同处」
});
t('在场表久未变：降级为未知，保留上次明确楼（2026-09-28 待查 2）', () => {
  const msgs = [{ floor: 10, text: '⌖人物 乙 @ 下层·7号井' }];
  const stale = C.collectChars(msgs, 60, [{ name: '乙', place: '中层', present: true }], [], 5);   // 在场表第 5 楼后没变
  assert.deepEqual(stale.map(c => [c.name, c.place, c.floor]), [['乙', '', 10]]);   // 保留上次明确位置所在楼
  assert.equal(stale[0].stale, 55); assert.equal(stale[0].present, undefined);
  assert.equal(C.summarizeChars(stale, 8, 160, 60), '');
  const fresh = C.collectChars(msgs, 60, [{ name: '乙', place: '中层', present: true }], [], 55);   // 近期更新过：照旧推断
  assert.deepEqual(fresh.map(c => [c.place, c.src]), [['中层', 'infer']]);
});
t('占位 / 空槽不算在场人物（只按结构，2026-09-28 待查 3）', () => {
  const r = C.mvuChars({ 在场人物: { '临时-01': '', '临时-02': null, '临时-03': 3, 甲: { 身份: 'x' } } }, '中层');
  assert.deepEqual(r.map(c => c.name), ['甲']);
});
console.log(`characters: ${n} 项通过`);
