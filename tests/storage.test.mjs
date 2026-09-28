// arch-v2 §4：本机存储服务（map/core/storage.mjs）——键表登记、带兜底的读写；静态清点仓库里所有 edenMap* 键
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import * as S from '../map/core/storage.mjs';

const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m }; };
test('读写 / 默认值 / json / session 作用域', () => {
  const G = { localStorage: mem(), sessionStorage: mem() };
  assert.equal(S.get('edenMapTheme', undefined, G), 'auto');
  assert.ok(S.set('edenMapTheme', 'light', G)); assert.equal(S.get('edenMapTheme', undefined, G), 'light');
  S.set('edenMapEstateFail', 'x', G); assert.equal(G.sessionStorage.getItem('edenMapEstateFail'), 'x'); assert.equal(G.localStorage.getItem('edenMapEstateFail'), null);
  S.set('edenMapTrips', '{"a":1}', G); assert.deepEqual(S.json('edenMapTrips', null, G), { a: 1 });
  S.set('edenMapTrips', '{bad', G); assert.equal(S.json('edenMapTrips', 'd', G), 'd');
  assert.equal(S.flag('edenMap3dAuto', G), false);
  S.remove('edenMapTheme', G); assert.equal(S.get('edenMapTheme', undefined, G), 'auto');
});
test('U13/U14/迷雾/快捷键：新用户默认值（2026-09-28）', () => {
  const G = { localStorage: mem(), sessionStorage: mem() };
  assert.equal(S.get('edenMapMinimap', undefined, G), '0');   // U14：左下角小地图默认关
  assert.equal(S.get('edenMapFog', undefined, G), '1');       // 迷雾探索默认开
  assert.equal(S.get('edenMapKeys', undefined, G), '0');      // 单字母快捷键 / 事态操作字母角标默认关
});
test('存储不可用时不抛', () => {
  const G = { get localStorage() { throw new Error('denied'); } };
  assert.equal(S.get('edenMapTheme', undefined, G), 'auto'); assert.equal(S.set('edenMapTheme', 'x', G), false); S.remove('edenMapTheme', G);
});
test('静态清点：仓库里出现的每个 edenMap* / edenEstate* 键都登记在 KEYS', () => {
  const root = new URL('../map/', import.meta.url), out = new Set();
  const walk = d => { for (const f of readdirSync(d)) { const p = new URL(f, d); if (/^(vendor|art|shots|_proto|data|i18n|node_modules)$/.test(f)) continue;
    if (statSync(p).isDirectory()) walk(new URL(f + '/', d)); else if (/\.(m?js|html)$/.test(f)) for (const m of readFileSync(p, 'utf8').matchAll(/['`"]((?:edenMap|edenEstate)[A-Za-z0-9_:]*)/g)) out.add(m[1]); } };
  walk(root);
  const miss = [...out].filter(k => k !== 'edenMap' && !S.known(k));
  assert.deepEqual(miss, []);
});
test('查看器与经典外挂脚本的本机读写都经 TCStore（core/storage.mjs 的同步镜像）', () => {
  const rd = f => readFileSync(new URL('../map/' + f, import.meta.url), 'utf8');
  const v = rd('viewer.html'), body = v.slice(v.indexOf('window.TCStore'));
  const shimEnd = body.indexOf('})();') + 5;
  assert.doesNotMatch(body.slice(shimEnd), /\b(localStorage|sessionStorage)\.(get|set|remove)Item\(/);
  for (const f of readdirSync(new URL('../map/app/', import.meta.url)).filter(f => f.endsWith('.mjs'))) assert.doesNotMatch(rd('app/' + f), /\b(localStorage|sessionStorage)\.(get|set|remove)Item\(/, f);
  for (const f of ['events.mjs', 'custom.mjs', 'trips.mjs', 'security.mjs']) assert.doesNotMatch(rd(f), /localStorage\.(get|set|remove)Item\(/, f);
  // chars.mjs 只剩读状态栏自己的头像键（不是我们的键）
  for (const l of rd('chars.mjs').split('\n').filter(l => /localStorage\.(get|set|remove)Item\(/.test(l))) assert.match(l, /eden_portrait|eden_custom_portraits/);
  // 镜像里的 session 键 = KEYS 里 scope=session 的键
  const ses = Object.entries(S.KEYS).filter(([, o]) => o.scope === 'session').map(([k]) => k);
  assert.deepEqual(ses, [...v.matchAll(/ses = k => k === '([^']+)'/g)].map(m => m[1]));
});
