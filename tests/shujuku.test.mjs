// node tests/shujuku.test.mjs —— 表格数据库插件兼容（map/tavern/shujuku.mjs，只读）与自检一行
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { findApi, sheets, protagonist, characters, facts, lostTags } from '../map/tavern/shujuku.mjs';
import { evaluate } from '../map/tavern/selfcheck.mjs';

let n = 0; const t = (name, f) => { f(); n++; console.log('ok', name); };
// 插件默认模板导出的形状（表头第 0 列是行号）
const data = {
  sheet_g: { name: '全局数据表', content: [[null, '主角当前所在地点', '当前时间', '上轮场景时间', '经过的时间'], [1, '{{user}}书房', '2026-09-28 20:30', '', '']] },
  sheet_c: { name: '重要角色表', content: [[null, '姓名', '性别/年龄', '一句话介绍', '是否离场'], [1, '艾琳', '女/20', '管家', '否']] },
  sheet_p: { name: 'NPC位置表', content: [[null, '姓名', '当前位置'], [1, '艾琳', '花园'], [2, '维克多', '下层·7号井'], [3, '', '空名']] },
  mate: { type: 'chatSheets', version: 1 },
};

t('sheets：只收有 content 表头的表', () => {
  assert.deepEqual(sheets(data).map(s => s.name), ['全局数据表', '重要角色表', 'NPC位置表']);
  assert.deepEqual(sheets(null), []); assert.deepEqual(sheets({ x: { content: 'bad' } }), []);
});
t('protagonist：全局表的地点与时间，取最后一行非空', () => {
  assert.deepEqual(protagonist(data), { location: '{{user}}书房', time: '2026-09-28 20:30', sheet: '全局数据表' });
  const d2 = { g: { name: '全局数据表', content: [[null, '主角当前所在地点', '当前时间'], [1, '花园', ''], [2, '', '21:00']] } };
  assert.deepEqual(protagonist(d2), { location: '花园', time: '21:00', sheet: '全局数据表' });
  assert.equal(protagonist({}).location, '');
  // 插件 9.x 默认模板：当前详细地点 / 次要地区 / 主要地区；详细地点空了退到地区
  const h9 = ['row_id', '全局状态', '当前详细地点', '当前次要地区', '当前主要地区', '上轮场景时间', '经过的时间', '当前时间'];
  assert.deepEqual(protagonist({ g: { name: '全局数据表', content: [h9, [1, '夜晚', '花园', '庄园', '中层', '', '', '21:00']] } }), { location: '花园', time: '21:00', sheet: '全局数据表' });
  assert.equal(protagonist({ g: { name: '全局数据表', content: [h9, [1, '夜晚', '', '庄园', '中层', '', '', '']] } }).location, '庄园');
  // 英文表头也认
  assert.equal(protagonist({ g: { name: 'Global', content: [['row_id', 'Current Location', 'Time'], [1, 'Hall', '9:00']] } }).location, 'Hall');
});
t('characters：姓名 + 位置列的表才算，跳过空名、去重', () => {
  assert.deepEqual(characters(data), [{ name: '艾琳', place: '花园' }, { name: '维克多', place: '下层·7号井' }]);
  assert.deepEqual(characters({ g: data.sheet_g }), []);   // 全局表不当人物表
});
t('findApi：认 exportTableAsJson；拿对象抛错也不崩', () => {
  const api = { exportTableAsJson: () => data };
  const bad = {}; Object.defineProperty(bad, 'AutoCardUpdaterAPI', { get() { throw new Error('x'); } });
  assert.equal(findApi([bad, {}, { AutoCardUpdaterAPI: api }]), api);
  assert.equal(findApi([{ AutoCardUpdaterAPI: {} }]), null);
});
t('facts：只读，不调用写接口', () => {
  const calls = []; const api = new Proxy({ exportTableAsJson: () => data }, { get(o, k) { calls.push(k); return o[k]; } });
  assert.deepEqual(facts(api, true), { tables: 3, location: true, chars: 2 });
  assert.deepEqual([...new Set(calls)], ['exportTableAsJson']);
  assert.equal(facts(null), null);
  assert.deepEqual(facts({ exportTableAsJson() { throw new Error('boom'); } }, false), { tables: 0, location: false, chars: 0 });
});
t('自检：检测到插件时多一行「数据库插件：已检测 / 兼容模式」；没有 MVU 但读到它的地点时不报警', () => {
  const base = { api: { getChatMessages: true, eventOn: true, injectPrompts: true, tavern_events: true }, mvu: null, dup: {}, line: {}, worldbook: null, version: {} };
  let r = evaluate({ ...base, db: { tables: 3, location: true, chars: 2 } });
  const i = r.find(x => x.id === 'shujuku'); assert.equal(i.status, 'ok'); assert.match(i.zh, /^数据库插件：已检测 \/ 兼容模式/); assert.ok(i.en);
  assert.equal(r.find(x => x.id === 'mvu').status, 'skip');
  assert.match(evaluate({ ...base, varmode: 'tags', db: { tables: 3, location: true, chars: 0 } }).find(x => x.id === 'varmap').zh, /数据库插件/);
  r = evaluate({ ...base, db: null });
  assert.equal(r.find(x => x.id === 'shujuku'), undefined); assert.equal(r.find(x => x.id === 'mvu').status, 'warn');
});
t('lostTags：正文优化改写丢掉的 ⌖ 标签从原文补回，没丢的不重复', () => {
  const orig = '你走进书房。\n<span style="display:none">⌖人物 艾琳 @ 中层·霓虹街</span>\n<span style="display:none">⌖火灾｜中层·霓虹街｜2｜仓库起火</span>';
  assert.equal(lostTags(orig, '你缓步走进书房。\n<span style="display:none">⌖人物 艾琳 @ 中层·霓虹街</span>'), '\n<span style="display:none">⌖火灾｜中层·霓虹街｜2｜仓库起火</span>');
  assert.equal(lostTags(orig, orig), '');
  assert.equal(lostTags('⌖人物 维克多 @ 下层·7号井\n正文', '正文'), '\n⌖人物 维克多 @ 下层·7号井');
  assert.equal(lostTags('', 'x'), '');
});
t('eden-map.js 只调用插件的只读接口', () => {
  const src = ['eden-map.js', 'host-th.mjs', 'host-routes.mjs', 'host-lifecycle.mjs'].map(f => fs.readFileSync(fileURLToPath(new URL('../map/tavern/' + f, import.meta.url)), 'utf8')).join('\n');   // C2：宿主拆成入口 + host-*.mjs
  const used = new Set([...src.matchAll(/(?:dbApiRef|a|api)\??\.(\w+(?:TableAsJson|Update\w*|Callback))\b/g)].map(m => m[1]));
  for (const k of used) assert.ok(['exportTableAsJson', 'registerTableUpdateCallback', 'unregisterTableUpdateCallback'].includes(k), k);
  assert.doesNotMatch(src, /importTableAsJson|triggerUpdate|restoreTableAsJson/);
  // 没装 MVU 时 waitGlobalInitialized('Mvu') 永远不返回：不能 await 它再挂楼层事件
  assert.doesNotMatch(src, /await\s+waitGlobalInitialized\(\s*'Mvu'\s*\)\s*;\s*listen/);
});
console.log(`shujuku: ${n} passed`);
