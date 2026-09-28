// 酒馆助手地基修复（docs/tavernhelper-audit.md §6）：cdnFetch 唯一出口、父页面孤儿清扫、getScriptId 身份、偏好迁移到脚本变量、cleanup 与空闲预取。
// 用假的 TavernHelper（只有用到的几个函数）驱动 map/tavern/th.mjs；eden-map.js 的内联副本按源码对照。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as T from '../map/tavern/th.mjs';
import * as S from '../map/core/storage.mjs';

const rd = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const HOST = rd('map/tavern/eden-map.js');

test('A1 cdnFetch：不带凭据、不带 Referer，调用方的选项保留但不能覆盖这两项', async () => {
  const seen = []; await T.cdnFetch('https://cdn.jsdelivr.net/x', { cache: 'no-store', credentials: 'include', referrerPolicy: 'origin' }, (u, o) => { seen.push([u, o]); return Promise.resolve({ ok: true }); });
  assert.deepEqual(seen[0][1], { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
  assert.match(HOST, /const cdnFetch = \(u, o = \{\}\) => fetch\(u, \{ \.\.\.o, credentials: 'omit', referrerPolicy: 'no-referrer' \}\);/);
});

test('A1 静态清点：宿主侧源码里没有 cdnFetch 以外的裸 fetch(', () => {
  const files = [...readdirSync(new URL('../map/tavern/', import.meta.url)).map(f => 'map/tavern/' + f), ...readdirSync(new URL('../map/core/', import.meta.url)).map(f => 'map/core/' + f)].filter(f => /\.(m?js)$/.test(f));
  const bad = [];
  for (const f of files) {
    rd(f).split('\n').forEach((l, i) => {
      for (const m of l.matchAll(/(?<![\w.])fetch\(/g)) {
        const ok = /const cdnFetch = .*=> (?:f|fetch)\(u, \{ \.\.\.o, (?:\.\.\.CDN_OPTS|credentials: 'omit', referrerPolicy: 'no-referrer') \}\)/.test(l)
          || /fetch\(u, \{ credentials: 'omit', referrerPolicy: 'no-referrer' \}\)/.test(l);   // core/pack.mjs 的兜底取 JSON（查看器与宿主共用，不能依赖宿主的包装）
        if (!ok) bad.push(`${f}:${i + 1}: ${l.trim().slice(0, 100)}`);
        void m;
      }
    });
  }
  assert.deepEqual(bad, []);
  // 加载器（tools/build_preview_script.py 生成的跟随 / 正式脚本）取 head.json 也不带 Referer
  const py = rd('tools/build_preview_script.py');
  for (const l of py.split('\n').filter(l => /await fetch\(/.test(l))) assert.match(l, /credentials: 'omit', referrerPolicy: 'no-referrer'/);
});

// 最小 DOM：querySelectorAll('[data-eden-owner]') + remove
function fakeDoc(nodes) {
  const live = new Set(nodes);
  for (const n of nodes) n.remove = () => live.delete(n);
  return { querySelectorAll: sel => (sel === '[data-eden-owner]' ? [...live].filter(n => n.attrs['data-eden-owner'] != null) : []), live };
}
const el = (owner, id) => ({ id, attrs: owner == null ? {} : { 'data-eden-owner': owner }, getAttribute(k) { return this.attrs[k] ?? null; } });

test('A2 孤儿清扫：只清别的实例留下的节点，不碰没打标记的宿主节点', () => {
  const mine = el('s:abc', 'eden-map-root'), orphan = el('s:old', 'eden-map-root'), orphan2 = el('u:https://x/map/', 'toast'), host = el(null, 'chat');
  const d = fakeDoc([mine, orphan, orphan2, host]);
  assert.equal(T.sweepOrphans(d, 's:abc'), 2);
  assert.deepEqual([...d.live].map(n => n.id).sort(), ['chat', 'eden-map-root']);
  assert.ok(d.live.has(mine));
  assert.equal(T.sweepOrphans(d, null), 1);   // cleanup：全清自己的
  assert.ok(HOST.includes("root.setAttribute('data-eden-owner', OWNER)"), '宿主根节点打标记');
  assert.match(HOST, /querySelectorAll\('\[data-eden-owner\]'\)/);
});

test('A3 身份：getScriptId 优先；同一脚本换版本不算另一个实例', () => {
  const fn = T.hostFns([{ getScriptId: () => 'abc' }]);
  assert.equal(T.ownerId(fn, 'https://cdn/x/map/'), 's:abc');
  assert.equal(T.ownerId(T.hostFns([{}]), 'https://cdn/x/map/'), 'u:https://cdn/x/map/');
  assert.equal(T.ownerId(T.hostFns([{ TavernHelper: { getScriptId: () => 'z' } }]), 'u'), 's:z');   // 只挂在 TavernHelper 命名空间
  // 同一 id 再登记（换版本）只占一格；另一个脚本 id 才算
  const reg = {}; reg['s:abc'] = 'https://cdn/v1/map/'; reg['s:abc'] = 'https://cdn/v2/map/';
  assert.deepEqual(T.otherInstances(reg, 's:abc', null), []);
  reg['s:other'] = 'https://cdn/v1/map/';
  assert.deepEqual(T.otherInstances(reg, 's:abc', null), ['https://cdn/v1/map/']);
  assert.deepEqual(T.otherInstances(reg, 's:abc', 'https://cdn/v1/map/'), []);   // 切版本前的旧地址不算
  assert.ok(!HOST.includes('__edenMapLoads'), '不再用 __edenMapLoads 计数');
});

test('A4 偏好迁移：脚本变量优先、本机回退、双写；键表与宿主同一份', () => {
  const ls = new Map([['edenMapLine', 'cn'], ['edenMapHand', 'left']]);
  const lsGet = k => ls.get(k) ?? null;
  // 第一次（脚本变量空）：本机的补进脚本变量
  let r = T.mergePrefs(null, lsGet, S.SCRIPT_KEYS);
  assert.ok(r.changed); assert.deepEqual(r.script, { edenMapLine: 'cn', edenMapHand: 'left' }); assert.deepEqual(r.toLS, {});
  // iPhone 清了本机：脚本变量写回本机
  ls.clear(); r = T.mergePrefs({ edenMapLine: 'cn', edenMapHand: 'left' }, lsGet, S.SCRIPT_KEYS);
  assert.deepEqual(r.toLS, { edenMapLine: 'cn', edenMapHand: 'left' }); assert.ok(!r.changed);
  // 两边不一致：脚本变量赢
  ls.set('edenMapLine', 'vpn'); r = T.mergePrefs({ edenMapLine: 'cn' }, lsGet, S.SCRIPT_KEYS); assert.equal(r.toLS.edenMapLine, 'cn');
  // 本机改了（查看器里切语言）→ 只有差异时写脚本变量
  ls.clear(); ls.set('edenMapLang', 'en');
  assert.deepEqual(T.prefsDiff({ edenMapLang: 'zh' }, lsGet, S.SCRIPT_KEYS), { edenMapLang: 'en' });
  assert.equal(T.prefsDiff({ edenMapLang: 'en' }, lsGet, S.SCRIPT_KEYS), null);
  // 假 TH：写脚本变量
  const store = {}; const fn = T.hostFns([{ getVariables: o => (o.type === 'script' ? store : {}), updateVariablesWith: (u, o) => { assert.equal(o.type, 'script'); Object.assign(store, u({ ...store })); } }]);
  return T.writeScriptPrefs(fn, { edenMapLang: 'en' }).then(ok => { assert.ok(ok); assert.deepEqual(T.readScriptPrefs(fn), { edenMapLang: 'en' });
    // 宿主内联的键表 = storage.mjs 登记的
    const m = /const PREF_KEYS = (\[[^\]]+\])/.exec(HOST); assert.ok(m); assert.deepEqual(JSON.parse(m[1].replace(/'/g, '"')), S.SCRIPT_KEYS);
    for (const k of S.SCRIPT_KEYS) assert.ok(S.known(k), k + ' 已登记');
    assert.ok(HOST.includes("getVariables') ?? null") || HOST.includes("thFn('getVariables')"), '启动时读脚本变量'); });
});

test('A5 cleanup 清 watchT；生成期间空闲预取排队、结束后补做', () => {
  const m = /const cleanup = \(\) => \{([^\n]+)/.exec(HOST); assert.ok(m); assert.match(m[1], /clearInterval\(watchT\)/);
  assert.match(HOST, /afterGen\(\(\) => preload\(\)/); assert.match(HOST, /afterGen\(\(\) => fetchHtml\(\)/);
  assert.match(HOST, /GENERATION_STOPPED'\]\) if \(tavern_events\[k\]\) listen\(tavern_events\[k\], \(\) => \{ GEN\.since = 0; setTimeout\(flushIdle/);
  // 行为：把 afterGen / flushIdle 抠出来跑
  const src = /const idleQ = \[\];\n([\s\S]*?)\n  if \(line/.exec(HOST)[1];
  const GEN = { generating: true }; let dead = false; const ran = [];
  const { afterGen, flushIdle } = new Function('GEN', 'dead', 'const idleQ = [];\n' + src + '\nreturn { afterGen, flushIdle };')(GEN, dead);
  afterGen(() => ran.push('a')); assert.deepEqual(ran, []);
  GEN.generating = false; flushIdle(); assert.deepEqual(ran, ['a']);
  afterGen(() => ran.push('b')); assert.deepEqual(ran, ['a', 'b']);
});
