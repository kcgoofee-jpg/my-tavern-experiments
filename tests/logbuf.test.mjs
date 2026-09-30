// logbuf 单测：环形上限、行截断、boot() 归档分会话、install() 包 console、node 环境下自动安装安全跳过。
// 注意：push() 的落盘有 2s 节流（给真实浏览器用的），测试里布置「上一次会话」一律直接写 localStorage 桩（等价 pagehide 兜底落盘），不依赖节流时机。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as logbuf from '../map/core/logbuf.mjs';

const CUR = 'edenMapLogCur';

test('ring buffer keeps only the most recent 400 lines', () => {
  logbuf.clear();
  for (let i = 0; i < 405; i++) logbuf.push('log', ['line ' + i]);
  const L = logbuf.lines();
  assert.equal(L.length, 400);
  assert.equal(L[0].text, 'line 5');
  assert.equal(L[L.length - 1].text, 'line 404');
  assert.ok(L[0].t <= L[L.length - 1].t);
  logbuf.clear();
});

test('long lines are truncated to the per-line cap', () => {
  logbuf.clear();
  logbuf.push('warn', ['x'.repeat(900)]);
  const L = logbuf.lines();
  assert.ok(L[0].text.length <= 400);
  assert.ok(L[0].text.endsWith('…'));
  logbuf.clear();
});

test('boot() archives the previous session into sessions()', () => {
  const mem = {};
  globalThis.localStorage = {
    getItem: k => (k in mem ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); },
    removeItem: k => { delete mem[k]; },
  };
  try {
    logbuf.clear();
    // 第一次打开：落盘里已有「上一次」的日志（pagehide 落的盘）→ boot 应归档它并开新会话
    mem[CUR] = JSON.stringify({ meta: { t0: 1 }, lines: [{ t: 1, level: 'warn', text: 'first-session-line' }] });
    logbuf.boot({});
    assert.equal(logbuf.lines().length, 0);
    // 第二次打开：当前会话又留了一份（同样直接布置落盘，绕开节流）
    mem[CUR] = JSON.stringify({ meta: null, lines: [{ t: 2, level: 'log', text: 'second-session-line' }] });
    logbuf.boot({});
    const S = logbuf.sessions();
    assert.equal(S.length, 2);
    assert.ok(S[0].lines.some(l => l.text === 'first-session-line'));
    assert.ok(S[1].lines.some(l => l.text === 'second-session-line'));
    assert.equal(logbuf.lines().length, 0);   // 新会话是空的
  } finally { delete globalThis.localStorage; logbuf.clear(); }
});

test('the stored keys follow the pack (core/pack.mjs nsKey): the first pack keeps edenMapLogCur / edenMapLogPast, any other pack writes under its own prefix and leaves the first pack\'s keys alone', () => {
  const mem = {};
  globalThis.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
  try {
    logbuf.clear(); logbuf.boot({}); logbuf.push('log', ['first pack line']); logbuf.clear();   // clear() flushes
    assert.deepEqual(Object.keys(mem), ['edenMapLogCur']);
    delete mem.edenMapLogCur;
    globalThis.__tcPack = { id: 'town' };
    mem['tcp.town.LogCur'] = JSON.stringify({ meta: null, lines: [{ t: 1, level: 'log', text: 'town session' }] });
    logbuf.boot({});
    assert.deepEqual(logbuf.sessions().map(s => s.lines[0].text), ['town session'], 'the archive is read back from the pack\'s own key');
    logbuf.clear();
    assert.deepEqual(Object.keys(mem).sort(), ['tcp.town.LogCur', 'tcp.town.LogPast'], 'nothing under the first pack\'s names');
    globalThis.__tcPack = { id: 'Bad Id!' };
    logbuf.boot({}); logbuf.clear(); assert.ok('edenMapLogCur' in mem, 'an id that is no id falls back to the first pack');
  } finally { delete globalThis.localStorage; delete globalThis.__tcPack; logbuf.boot({}); logbuf.clear(); }
});

test('printf-style args (%s/%d) are interpolated before storing', () => {
  logbuf.clear();
  logbuf.push('warn', ['Ignoring tile %s loaded before reset: %s', { level: 11, x: 1 }]);
  const L = logbuf.lines();
  assert.ok(L[0].text.startsWith('Ignoring tile {"level":11,"x":1} loaded before reset'));
  assert.ok(!L[0].text.includes('%s'));
  logbuf.clear();
});

test('repeated identical printf templates collapse into ×N', () => {
  logbuf.clear();
  for (let i = 0; i < 30; i++) logbuf.push('warn', ['Ignoring tile %s loaded before reset: %s', { level: 11, x: i }]);
  const L = logbuf.lines();
  assert.equal(L.length, 1);
  assert.ok(L[0].text.endsWith('（×30）'));
  assert.ok(L[0].text.includes('"x":0'));
  assert.ok(!L[0].text.includes('"x":29'));
  logbuf.clear();
});

test('install() wraps a console-like target and still calls the original', () => {
  const calls = [];
  const fake = { log: (...a) => calls.push(a), warn: () => {} };
  logbuf.install(fake);
  fake.log('via-fake');
  assert.ok(logbuf.lines().some(l => l.text === 'via-fake'));
  assert.ok(calls.some(a => a[0] === 'via-fake'));   // 原始实现仍被调用
  logbuf.clear();
});
