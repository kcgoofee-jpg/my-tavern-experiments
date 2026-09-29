// G6（P0，handoff 准则 1）：window.parent.EdenMap 公共 API 表面积的机读契约 + fnGuard / guardApi 行为
// （docs/reviews/architecture_and_stream_perf.md §1.4 G6）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fnGuard } from '../map/tavern/host-th.mjs';
import { EDEN_API, guardApi } from '../map/tavern/edenapi.mjs';

const rd = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('fnGuard：类型与形参个数都过才给；默认参数不计长度', () => {
  const f = (a, b) => a + b;
  assert.equal(fnGuard('t.ok', f, 2), f);
  assert.equal(fnGuard('t.ok0', f, 0), f);
  assert.equal(fnGuard('t.notfn', undefined, 1), null);
  assert.equal(fnGuard('t.str', 'x', 1), null);
  assert.equal(fnGuard('t.arity', f, 3), null);
  const d = (o = {}) => o;                    // 默认参数不计长：(o = {}) 的 fn.length 是 0——契约按实际长度写（setCustom=1、selfcheck=0）
  assert.equal(fnGuard('t.def', d, 0), d);
  assert.equal(fnGuard('t.def1', d, 1), null);
});

test('fnGuard：告警按名字去重（同名只一次）', () => {
  const w = console.warn; let n = 0; console.warn = () => n++;
  try { fnGuard('t.once', null, 1); fnGuard('t.once', null, 1); fnGuard('t.once2', 42, 0); }
  finally { console.warn = w; }
  assert.equal(n, 2);
});

test('guardApi：契约全过原样透传；缺方法 / 形参不足不进暴露面；契约外字段原样带过', () => {
  const api = { on: (a, b) => 1, off: (a, b) => 2, version: '1.0' };
  const g = guardApi(api, { on: 2, off: 2, missing: 1, bad: 2 });
  assert.equal(g.on, api.on); assert.equal(g.off, api.off);
  assert.equal('missing' in g, false);          // api 里没有的方法不暴露
  assert.equal('bad' in g, false);              // 有但形参不足（bad 声明 1 参，契约要 2）
  assert.equal(g.version, '1.0');               // 契约外的值字段原样带过
});

test('EdenMap 表面积接线（静态断言）：暴露点走 guardApi + EDEN_API；契约与 api 对象一致；跨窗口调用点都过 fnGuard', () => {
  const src = rd('map/tavern/eden-map.js');
  assert.match(src, /const exposed = guardApi\(api, EDEN_API\)/);
  assert.match(src, /window\.parent\.EdenMap = exposed/);
  assert.match(src, /'EdenMap', guardApi\(api, EDEN_API\)/);                                   // initializeGlobal 注册的也是守卫过的面
  assert.match(src, /window\.parent\.EdenMap === exposed\) delete window\.parent\.EdenMap/);  // cleanup 对照暴露对象（不再对着原 api 永远删不掉）
  const body = src.slice(src.indexOf('const api = Object.freeze'), src.indexOf('window.parent.EdenMap'));
  assert.ok(body.length > 500, '抽到了 api 对象定义');
  for (const k of Object.keys(EDEN_API)) assert.match(body, new RegExp(`(?:^|[,\\n]\\s*(?:async\\s+)?)${k}\\s*[:=(]`), k);   // 契约方法都在 api 里（async 修饰也要越过）
  for (const m of ['EdenMap.setAvatar', 'EdenMap.removeAvatar', 'EdenMap.flyTo', 'EdenMap.getRooms', 'EdenMap.__chat']) assert.ok(src.includes(`'${m}'`), m);   // 跨窗口调用点
});
