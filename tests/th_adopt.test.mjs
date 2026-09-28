// 酒馆助手采纳 B2–B9（map/tavern/th.mjs + eden-map.js 接线）：脚本按钮、卡身份、版本报告、脚本说明、initializeGlobal、正则只读、广播、类宏。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from '../map/tavern/th.mjs';
import * as SC from '../map/tavern/selfcheck.mjs';
const HOST = readFileSync(new URL('../map/tavern/eden-map.js', import.meta.url), 'utf8');

test('B2 脚本按钮：不存在才追加，返回事件名；接口缺 → null', () => {
  const got = []; const fn = T.hostFns([{ appendInexistentScriptButtons: b => got.push(...b), getButtonEvent: n => 'btn:' + n }]);
  assert.deepEqual(T.scriptButtons(fn), { '地图': 'btn:地图', '地图自检': 'btn:地图自检' });
  assert.deepEqual(got.map(b => b.name), ['地图', '地图自检']);
  assert.equal(T.scriptButtons(T.hostFns([{ getButtonEvent: () => 'x' }])), null);
  assert.match(HOST, /listen\(thBtns\['地图'\]/);
});

test('B3 卡身份：getCharData 优先（同步或 Promise），缺了回退到上下文 name2', async () => {
  assert.deepEqual(await T.cardIdentity(T.hostFns([{ getCharData: () => ({ name: '母畜庄园', data: { character_version: '2.1' } }) }])), { name: '母畜庄园', version: '2.1', src: 'getCharData' });
  assert.deepEqual(await T.cardIdentity(T.hostFns([{ getCharData: async () => ({ name: 'X', data: {} }) }])), { name: 'X', version: '', src: 'getCharData' });
  assert.deepEqual(await T.cardIdentity(T.hostFns([{}]), () => ({ name2: 'Y' })), { name: 'Y', version: '', src: 'context' });
  assert.equal(await T.cardIdentity(T.hostFns([{ getCharData: () => { throw new Error(); } }]), () => ({})), null);
});

test('B4 版本只报告；B7 正则只读判定；自检出条目', () => {
  assert.deepEqual(T.hostVersions(T.hostFns([{ getTavernHelperVersion: () => '4.3.1', getTavernVersion: () => '1.13.4' }])), { th: '4.3.1', st: '1.13.4' });
  assert.deepEqual(T.hostVersions(T.hostFns([{}])), { th: null, st: null });
  const re = [{ enabled: true, find_regex: '/<UpdateVariable>[\\s\\S]*?<\\/UpdateVariable>/gi', destination: { display: true, prompt: false } }, { enabled: false, find_regex: '⌖', destination: { display: true } }];
  assert.deepEqual(T.regexFacts(re), { n: 2, hidesVars: true, hidesTags: false });
  assert.deepEqual(T.regexFacts([{ enabled: true, find_regex: '(', destination: { display: true } }]), { n: 1, hidesVars: false, hidesTags: false });   // 坏正则不抛
  assert.equal(T.regexFacts(null), null);
  const items = SC.evaluate({ api: {}, card: { name: '母畜庄园', version: '2.1' }, host: { th: '4.3.1', st: '1.13.4' }, regex: { n: 2, hidesVars: true } });
  assert.deepEqual(items.filter(i => ['card', 'host', 'regex'].includes(i.id)).map(i => i.status), ['info', 'info', 'ok']);
  assert.ok(items.find(i => i.id === 'card').zh.includes('母畜庄园'), '卡名照抄');
  assert.match(HOST, /getTavernRegexes'\)\(\{ type: 'character', name: 'current' \}\)/);
  assert.ok(!/updateTavernRegexesWith|replaceTavernRegexes/.test(HOST), '不写正则');
});

test('B5 脚本说明；B6 initializeGlobal + 旧别名；B8 只广播地点；B9 类宏默认关、可撤销', () => {
  assert.equal(T.scriptInfo({ version: '0.9.6', channel: 'tag', warns: 0, checkAt: 0 }), '伊甸地图 v0.9.6 · tag · 自检：全部正常');
  assert.match(T.scriptInfo({ channel: 'follow', build: 31, warns: 2, en: true }), /follow build #31 · follow · self-check: 2 warning/);
  assert.match(HOST, /thFn\('initializeGlobal'\)\?\.\('EdenMap', api\)/); assert.match(HOST, /window\.parent\.EdenMap = api;/);
  const p = T.movedPayload('中层·霓虹街', '伊甸庄园·书房', { source: 'mvu' });
  assert.deepEqual(Object.keys(p).sort(), ['at', 'from', 'map', 'source', 'to']);
  assert.match(HOST, /thFn\('eventEmit'\)\?\.\('eden-map:moved'/);
  // 广播路径上不写变量
  const fnSrc = /function emitMoved\(to\) \{[\s\S]*?\n  \}/.exec(HOST)[0]; assert.ok(!/Variables|setVar|Mvu\.|exportTable|importTable/.test(fnSrc));
  // 类宏
  const reg = new Map(); const fn = T.hostFns([{ registerMacroLike: (re, f) => { reg.set(re.source, f); return { unregister: () => reg.delete(re.source) }; } }]);
  const off = T.registerMacros(fn, k => (k === 'eden_here' ? '伊甸庄园·书房' : 'A → B'));
  assert.equal(reg.size, 2); assert.equal(reg.get('\\{\\{eden_here\\}\\}')({}, '{{eden_here}}'), '伊甸庄园·书房');
  off(); assert.equal(reg.size, 0);
  assert.doesNotThrow(() => T.registerMacros(T.hostFns([{}]), () => '')());
  assert.match(HOST, /macroSet\(lsGet\('edenMapMacros'\) === '1'\)/);
});

test('不用的接口：installExtension / builtin / 角色卡写接口 / generate*', () => {
  for (const f of ['map/tavern/eden-map.js', 'map/tavern/th.mjs', 'map/tavern/wbsync.mjs', 'map/tavern/modes.mjs'].map(p => { try { return readFileSync(new URL('../' + p, import.meta.url), 'utf8'); } catch (e) { return ''; } }))
    assert.ok(!/installExtension\(|builtin\.|replaceCharacter\(|importRawCharacter\(|updateCharacterWith\(|\bgenerate(Raw)?\(/.test(f));
});
