// node tests/selfcheck.test.mjs —— 卡内脚本启动自检（map/tavern/selfcheck.mjs）的判定逻辑
import assert from 'node:assert/strict';
import { evaluate, findPaths, getPath, wbMissing, warnSig, cmpVer, latestTag, dueCheck, swapVer, MS_PER_DAY } from '../map/tavern/selfcheck.mjs';

const HERE_PATH = '世界.当前地点';
let n = 0; const t = (name, f) => { f(); n++; console.log('ok', name); };
const good = {
  api: { getChatMessages: true, eventOn: true, injectPrompts: true, tavern_events: true },
  mvu: { stat: true, here: true, candidates: [] },
  dup: { others: [], oldStyle: false, replaced: false },
  line: { swappable: true, ok: true, name: '有梯子' },
  worldbook: { missing: [] },
  version: { script: '0.9.1', viewer: '0.9.1' },
};
const st = items => Object.fromEntries(items.map(i => [i.id, i.status]));

t('全部正常：六项都是 ok，没有要提示的', () => {
  const r = evaluate(good);
  assert.deepEqual(st(r), { api: 'ok', mvu: 'ok', dup: 'ok', line: 'ok', worldbook: 'ok', version: 'ok' });
  assert.equal(warnSig(r), '');
  for (const i of r) { assert.ok(i.zh && i.en, i.id + ' 有中英文'); }
});
t('酒馆助手接口缺失', () => {
  const r = evaluate({ ...good, api: { ...good.api, injectPrompts: false } });
  assert.equal(st(r).api, 'warn'); assert.match(r[0].zh, /injectPrompts/);
});
t('MVU：没加载 / 读不到 / 当前地点改名（给出候选路径）', () => {
  assert.equal(st(evaluate({ ...good, mvu: null })).mvu, 'warn');
  assert.equal(st(evaluate({ ...good, mvu: { stat: false } })).mvu, 'skip');   // 新聊天还没有变量：不报警
  const r = evaluate({ ...good, mvu: { stat: true, here: false, candidates: ['世界.所在地点'] } });
  const m = r.find(i => i.id === 'mvu'); assert.equal(m.status, 'warn'); assert.match(m.zh, /世界\.所在地点/); assert.match(m.en, /renamed/);
});
t('重复的地图脚本：旧版、被替换、别的地址', () => {
  for (const dup of [{ oldStyle: true }, { replaced: true }, { others: ['https://cdn.jsdelivr.net/gh/x@map-v0.8.0/map/'] }]) assert.equal(st(evaluate({ ...good, dup })).dup, 'warn');
});
t('线路：本地不测、连不上警告、还没测跳过', () => {
  assert.equal(st(evaluate({ ...good, line: { swappable: false } })).line, 'skip');
  assert.equal(st(evaluate({ ...good, line: { swappable: true, ok: false } })).line, 'warn');
  assert.equal(st(evaluate({ ...good, line: { swappable: true, ok: null } })).line, 'skip');
});
t('世界书：查不了就跳过；缺条目警告；按名字前缀、要启用', () => {
  assert.equal(st(evaluate({ ...good, worldbook: null })).worldbook, 'skip');
  assert.deepEqual(wbMissing([{ name: '地图联动规范 v3' }, { name: '地图事件类型 v2' }, { name: '地图当前地点', enabled: false }, { name: '地图人物位置 v1' }]), ['地图当前地点']);
  assert.deepEqual(wbMissing([{ name: '地图联动规范 v4' }, { name: '地图事件类型 v2' }, { name: '地图当前地点' }, { name: '地图人物位置 v1' }]), []);
  const r = evaluate({ ...good, worldbook: { missing: ['地图当前地点'] } }); assert.equal(st(r).worldbook, 'warn');
});
t('版本：一致 ok、不一致警告、跟分支或没开过跳过', () => {
  assert.equal(st(evaluate({ ...good, version: { script: '0.9.1', viewer: '0.9.0' } })).version, 'warn');
  assert.equal(st(evaluate({ ...good, version: { script: null, viewer: '0.9.1' } })).version, 'skip');
  assert.equal(st(evaluate({ ...good, version: { script: '0.9.1', viewer: null } })).version, 'skip');
});
t('MVU 路径工具：取值（[值, 说明] 也认）、找改名后的候选', () => {
  const d = { 世界: { 当前地点: ['主卧', '说明'], 时间: '夜' }, 角色: { 所在位置: '书房', 好感: 3 } };
  assert.equal(getPath(d, HERE_PATH), '主卧'); assert.equal(getPath(d, '世界.没有'), undefined); assert.equal(getPath(null, HERE_PATH), undefined);
  assert.deepEqual(findPaths({ 世界: { 所在地点: 'x' }, 角色: { 所在位置: 'y', location: 'z', 好感: 1 } }), ['世界.所在地点', '角色.所在位置', '角色.location']);
  const loop = { a: {} }; loop.a.b = loop; assert.deepEqual(findPaths(loop), []);   // 循环引用不死循环
});
t('提示签名：同一组警告签名相同（只提示一次）', () => {
  const a = evaluate({ ...good, mvu: null, line: { swappable: true, ok: false } });
  const b = evaluate({ ...good, line: { swappable: true, ok: false }, mvu: null });
  assert.equal(warnSig(a), 'line,mvu'); assert.equal(warnSig(a), warnSig(b));
});
t('更新检查：最新标签、版本比较、一天一次、换标签地址', () => {
  assert.equal(cmpVer('0.10.0', '0.9.1'), 1); assert.equal(cmpVer('0.9.1', '0.9.1'), 0); assert.equal(cmpVer('0.9.0', '0.9.1'), -1);
  assert.equal(latestTag({ versions: [{ version: 'map-v0.6.1' }, { version: 'map-v0.10.0' }, { version: 'main' }, { version: 'map-v0.9.1' }] }), '0.10.0');
  assert.equal(latestTag({ versions: ['map-v0.6.1', 'map-v0.6.0', 'v9.9.9'] }), '0.6.1');
  assert.equal(latestTag({}), null); assert.equal(latestTag(null), null);
  const now = 1e12; assert.equal(dueCheck(null, now), true); assert.equal(dueCheck(now - MS_PER_DAY + 1000, now), false); assert.equal(dueCheck(now - MS_PER_DAY, now), true); assert.equal(dueCheck(now + 5000, now), true);
  const u = 'https://cdn.jsdmirror.com/gh/kcgoofee-jpg/my-tavern-experiments@map-v0.9.1/map/tavern/eden-map.js';
  assert.equal(swapVer(u, '0.9.2'), u.replace('map-v0.9.1', 'map-v0.9.2'));
  assert.equal(swapVer('https://cdn.jsdelivr.net/gh/x/y@preview/map/tavern/eden-map.js', '0.9.2'), null);   // 跟分支：不换
  assert.equal(swapVer(u, '../evil'), null);
  const it = evaluate({ ...good, update: { current: '0.9.1', latest: '0.9.2' } }).find(i => i.id === 'update');
  assert.equal(it.status, 'info'); assert.match(it.zh, /有新版本 v0\.9\.2/);
  assert.equal(evaluate({ ...good, update: { current: '0.9.1', latest: '0.9.1' } }).some(i => i.id === 'update'), false);
  assert.equal(warnSig(evaluate({ ...good, update: { current: '0.9.1', latest: '0.9.2' } })), '');   // 新版本不弹警告提示
});
t('v0.9.3：MVU 字段缺了只提示（skip）、聊天变量接口、EJS 条目没有扩展时警告', () => {
  const m = { stat: true, here: true, candidates: [] };
  assert.equal(st(evaluate({ ...good, mvu: { ...m, fields: { present: true, clock: true, outfit: true } } })).mvu_fields, 'ok');
  const r = evaluate({ ...good, mvu: { ...m, fields: { present: false, clock: true, outfit: false } } }).find(i => i.id === 'mvu_fields');
  assert.equal(r.status, 'skip'); assert.match(r.zh, /在场人物、着装/);
  assert.equal(st(evaluate({ ...good, vars: false })).vars, 'warn'); assert.equal(st(evaluate({ ...good, vars: true })).vars, 'ok');
  assert.equal(st(evaluate({ ...good, worldbook: { missing: [], lore: true }, ejs: false })).ejs, 'warn');
  assert.equal(st(evaluate({ ...good, worldbook: { missing: [], lore: true }, ejs: true })).ejs, undefined);
});
t('N14 c：最新楼没有快照、更早一楼有 → 只有一种说法（MVU 可读 + 用第几楼），不再同时说「还没有 MVU 变量」', () => {
  const f = { ...good, varmode: 'mvu', mvu: { stat: true, here: true, candidates: [], snap: { floor: 66, top: 68, state: 'stale' } }, checkpoint: { floor: 66, reason: 'ahead' } };
  const r = evaluate(f), zh = r.map(i => i.zh).join('\n');
  assert.equal(st(r).mvu, 'ok'); assert.match(r.find(i => i.id === 'mvu').zh, /用第 66 楼的/); assert.doesNotMatch(zh, /还没有变量（新聊天）/);
  assert.match(r.find(i => i.id === 'varmap').zh, /^读法：聊天变量/);
  assert.doesNotMatch(evaluate({ ...good, mvu: { stat: true, here: true, candidates: [], snap: { floor: 68, top: 68 } } }).find(i => i.id === 'mvu').zh, /楼/);
});
console.log(`\n${n} passed`);
