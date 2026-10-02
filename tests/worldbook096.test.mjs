// node tests/worldbook096.test.mjs —— 自检的世界书检测（v0.9.6 修误报：附加条目已导入、设为全局并启用，自检仍说「缺少」）
import assert from 'node:assert/strict';
import { collectWorldbook, wbMissing, evaluate } from '../map/tavern/selfcheck.mjs';

let n = 0; const t = async (name, f) => { await f(); n++; console.log('ok', name); };
const BOOK = '伊甸地图·世界书附加条目 v0.9.5';
// tools/build_worldbook_addon.py 实际产出的条目名（ST 格式 comment / disable）
const RAW = ['地图联动规范 v3', '地图事件类型 v2', '地图当前地点 v2', '地图人物位置 v1', '地图方位·上层'].map((c, i) => ({ uid: i, comment: c, disable: false }));
const NEW = RAW.map(e => ({ name: e.comment, enabled: true }));
const lazy = v => () => Promise.resolve(v);   // 酒馆助手异步接口：返回 Promise（review A-8）
const api = o => n => o[n] || null;

await t('全局启用（新接口，异步）：不缺', async () => {
  const w = await collectWorldbook(api({ getGlobalWorldbookNames: lazy([BOOK]), getCharWorldbookNames: lazy({ primary: null, additional: [] }), getChatWorldbookName: lazy(null),
    getWorldbook: n => Promise.resolve(n === BOOK ? NEW : []) }));
  assert.deepEqual(w.missing, []); assert.equal(w.lore, true);
  assert.equal(evaluate({ worldbook: w }).find(i => i.id === 'worldbook').status, 'ok');
});
await t('全局启用（同步接口）：不缺', async () => {
  const w = await collectWorldbook(api({ getGlobalWorldbookNames: () => [BOOK], getWorldbook: () => NEW }));
  assert.deepEqual(w.missing, []);
});
await t('getGlobalWorldbookNames 返回空（设置未加载），但 getLorebookSettings 有：并集，不缺', async () => {
  const w = await collectWorldbook(api({ getGlobalWorldbookNames: () => [], getLorebookSettings: lazy({ selected_global_lorebooks: [BOOK] }), getWorldbook: lazy(NEW) }));
  assert.deepEqual(w.missing, []);
});
await t('getWorldbook 抛错时退回旧接口 getLorebookEntries（comment 字段）', async () => {
  const w = await collectWorldbook(api({ getGlobalWorldbookNames: lazy([BOOK]), getWorldbook: () => { throw new Error('x'); }, getLorebookEntries: lazy(RAW.map(e => ({ comment: e.comment, enabled: true }))) }));
  assert.deepEqual(w.missing, []);
});
await t('条目一本都取不到：查不了（null），不报「缺少」', async () => {
  assert.equal(await collectWorldbook(api({ getGlobalWorldbookNames: lazy([BOOK]), getWorldbook: () => Promise.reject(new Error('no')) })), null);
});
await t('原始 ST 形状（dict + disable）与改过名的条目（【地图】前缀）也认', async () => {
  const dict = Object.fromEntries(RAW.map(e => [e.uid, { ...e, comment: '【地图】' + e.comment }]));
  const w = await collectWorldbook(api({ getGlobalWorldbookNames: () => [BOOK], getWorldbook: () => dict }));
  assert.deepEqual(w.missing, []);
  assert.deepEqual(wbMissing([{ name: '地图联动规范 v3', enabled: false }]).includes('地图联动规范'), true);   // 停用的条目仍算缺
});
await t('导入了但没启用：missing + imported，文案说「没有启用」', async () => {
  const w = await collectWorldbook(api({ getGlobalWorldbookNames: () => [], getCharWorldbookNames: () => ({ primary: '卡自带', additional: [] }),
    getWorldbook: n => (n === BOOK ? NEW : [{ name: '别的条目', enabled: true }]), getWorldbookNames: () => ['卡自带', BOOK] }));
  assert.equal(w.missing.length, 3); assert.equal(w.imported, true);
  assert.match(evaluate({ worldbook: w }).find(i => i.id === 'worldbook').zh, /已导入但没有启用/);
});
await t('没有列名接口 / 没有取条目接口：null', async () => {
  assert.equal(await collectWorldbook(api({ getWorldbook: () => NEW })), null);
  assert.equal(await collectWorldbook(api({ getGlobalWorldbookNames: () => [BOOK] })), null);
});
console.log(`\n${n} passed`);
