// v2b 模块化护栏（arch-v2 §1.3）：
// 1. 真的把查看器核心（app/boot.mjs 起的整张图）与全部外挂在 node 里求值一遍：DOM / 浏览器全局用「什么都接得住」的桩代替，
//    所以只会因为模块自身的问题失败——求值期碰到还没求值的绑定（TDZ）、未声明的全局、import 的名字不存在。
//    核心各块互相 import（成环），规则是求值期只碰 state / util / plugins 与自己的绑定；谁在顶层多调一个别的块的函数，这里就会炸。
// 2. 兼容面 app/bridge.mjs 的全局名单固定（只加不减；要加就改这里）。
// 3. viewer.html 里除两段首帧前置外没有内联脚本；核心模块都有 modulepreload。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const stub = () => { const f = function () {}; const p = new Proxy(f, {
  get: (t, k) => k === Symbol.toPrimitive ? () => 0 : k === Symbol.iterator ? function* () {} : k === 'then' ? undefined : p,
  apply: () => p, construct: () => p, set: () => true, has: () => true, deleteProperty: () => true }); return p; };
const S = stub();
const win = new Proxy({}, { get: (t, k) => k in t ? t[k] : k in globalThis ? globalThis[k] : S, set: (t, k, v) => { t[k] = v; return true; },
  defineProperty: (t, k, d) => { Object.defineProperty(t, k, d); return true; } });
const rd = f => readFileSync(new URL('../map/' + f, import.meta.url), 'utf8');

test('核心与外挂模块在桩 DOM 下都能求值（没有 TDZ / 未声明全局 / 不存在的导出）', async () => {
  const keep = {};
  for (const k of ['window', 'document', 'navigator', 'location', 'matchMedia', 'addEventListener', 'removeEventListener', 'requestIdleCallback', 'OpenSeadragon', 'TCStore', 'self', 'parent', 'top', 'getComputedStyle', 'innerWidth', 'innerHeight', 'devicePixelRatio', 'MutationObserver', 'ResizeObserver', 'Image', 'CSS', 'localStorage', 'sessionStorage', 'fetch', 'setTimeout', 'setInterval', 'requestAnimationFrame'])
    keep[k] = Object.getOwnPropertyDescriptor(globalThis, k);
  const set = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  set('window', win); for (const k of Object.keys(keep).filter(k => k !== 'window')) set(k, S);
  const doc = { baseURI: 'http://stub.invalid/map/', readyState: 'loading' };   // 相对 import(new URL(x, document.baseURI)) 在 node 里拒绝（各处都有 catch）
  set('document', new Proxy(doc, { get: (t, k) => k in t ? t[k] : S[k], set: () => true }));
  set('fetch', () => new Promise(() => {}));
  for (const k of ['setTimeout', 'setInterval', 'requestAnimationFrame']) set(k, () => 0);   // 求值期排的定时器不真的跑（不让 node 挂着）   // 求值期的 build.json 请求：永远挂起，不发网络
  try {
    await import('../map/app/boot.mjs');
    for (const f of ['events', 'chars', 'custom', 'trips', 'unmapped', 'varmap', 'compose', 'security']) await import(`../map/${f}.mjs`);
    for (const f of ['cardlinks', 'clouds', 'fog', 'storage-ui', 'scale']) await import(`../map/app/${f}.mjs`);
    const { P } = await import('../map/app/plugins.mjs');
    assert.deepEqual(Object.keys(P).sort(), ['TCChars', 'TCCompose', 'TCCustom', 'TCEvents', 'TCFog', 'TCSecurity', 'TCTrips', 'TCUnmapped', 'TCVarMap']);
  } finally { for (const [k, d] of Object.entries(keep)) d ? Object.defineProperty(globalThis, k, d) : delete globalThis[k]; }
});

test('兼容面 bridge.mjs 的全局名单固定', () => {
  const names = [...rd('app/bridge.mjs').matchAll(/(\w+): \(\) => \1\b/g)].map(m => m[1]).sort();
  assert.deepEqual(names, ['LANG', 'LS', 'M', 'REG', 'TCSettings', 'aspect', 'chatId', 'closeCard', 'cur', 'curData', 'esc', 'est', 'estFocus', 'fadeAway', 'go', 'hereRes',
    'jsonCache', 'jumpHere', 'lean', 'main', 'nm', 'openEstate', 'post', 'renderAbout', 'setEstFail', 'setTheme', 'showCard', 'showLay', 'showSet', 'sleeping', 't', 'tier', 'toImg', 'viewer'].sort());
});

test('viewer.html 只剩标记与首帧前置；核心模块都 modulepreload；外挂是模块标签', () => {
  const v = rd('viewer.html');
  const inline = [...v.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  assert.ok(inline.every(s => s.length < 3000), `内联脚本应只是前置小段，最长 ${Math.max(...inline.map(s => s.length))} 字符`);
  const core = readdirSync(new URL('../map/app/', import.meta.url)).filter(f => /\.mjs$/.test(f) && !['cardlinks.mjs', 'clouds.mjs', 'fog.mjs', 'storage-ui.mjs', 'scale.mjs'].includes(f));
  for (const f of core) assert.match(v, new RegExp(`<link rel="modulepreload" href="app/${f.replace('.', '\\.')}">`), f);
  for (const f of ['events', 'chars', 'custom', 'trips', 'unmapped', 'security']) assert.match(v, new RegExp(`<script type="module" src="${f}\\.mjs"></script>`), f);
  assert.doesNotMatch(v, /<script defer src="(events|chars|custom|trips|unmapped|varmap|compose|security)\.js"/);
  assert.ok(v.indexOf('src="app/boot.mjs"') < v.indexOf('src="events.mjs"'), '核心先于外挂');
});
