// 回放静音（Part 5-4）：host-messages.mjs 经 P.FogApi?.mute?.() 调用；fog.mjs 必须把 API 注册进 P，否则这个调用是空操作。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const stub = () => { const f = function () {}; const p = new Proxy(f, {
  get: (t, k) => k === Symbol.toPrimitive ? () => 0 : k === Symbol.iterator ? function* () {} : k === 'then' ? undefined : p,
  apply: () => p, construct: () => p, set: () => true, has: () => true, deleteProperty: () => true }); return p; };

test('host 的 P.FogApi.mute 调用能到达 fog 的 mute', async () => {
  const S = stub();
  const win = new Proxy({}, { get: (t, k) => k in t ? t[k] : k in globalThis ? globalThis[k] : S, set: (t, k, v) => { t[k] = v; return true; } });
  const keep = {};
  const names = ['window', 'document', 'navigator', 'location', 'matchMedia', 'addEventListener', 'removeEventListener', 'requestIdleCallback', 'OpenSeadragon', 'LocalStore', 'self', 'parent', 'top', 'getComputedStyle', 'innerWidth', 'innerHeight', 'devicePixelRatio', 'MutationObserver', 'ResizeObserver', 'Image', 'CSS', 'localStorage', 'sessionStorage', 'fetch', 'setTimeout', 'setInterval', 'requestAnimationFrame'];
  for (const k of names) keep[k] = Object.getOwnPropertyDescriptor(globalThis, k);
  const set = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  set('window', win); for (const k of names.filter(k => k !== 'window')) set(k, S);
  set('fetch', () => new Promise(() => {}));
  for (const k of ['setTimeout', 'setInterval', 'requestAnimationFrame']) set(k, () => 0);
  try {
    await import('../map/app/boot.mjs');   // 核心先求值（同 app_modules.test.mjs），再加载 fog
    await import('../map/app/fog.mjs');
    const { P } = await import('../map/app/plugins.mjs');
    assert.equal(typeof P.FogApi?.mute, 'function');
    assert.doesNotThrow(() => { P.FogApi.mute(true); P.FogApi.mute(false); });
  } finally { for (const [k, d] of Object.entries(keep)) d ? Object.defineProperty(globalThis, k, d) : delete globalThis[k]; }
  const host = readFileSync(new URL('../map/app/host-messages.mjs', import.meta.url), 'utf8');
  assert.match(host, /P\.FogApi\?\.mute\?\.\(true\)/);
});
