// F-TT（I-36）：查看器「起没起来」的看门狗（map/tavern/viewer-boot.mjs）。
// 缺陷现场：Mac TauriTavern 的 WKWebView 里，某个取件域名只回响应头不回响应体，查看器文档的子资源永远不落地，
// DOMContentLoaded 不触发、启动函数不跑，界面停在「加载中…」且不报错。这里测两件事：重挂顺序（同一个地址 → 换线路）
// 与边界，以及「没人说话就重挂、换线路、换完了不再自己动」这套调度。换到哪儿由调用方给，模块里不写死域名。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBootWatchdog, bootPlan, rotateKeys, BOOT_WAIT_MS, MAX_HOPS } from '../map/tavern/viewer-boot.mjs';

const GH = 'https://cdn.statically.io/gh/owner/repo@sha/map/';
const NPM = 'https://registry.npmmirror.com/pkg/1.0.0/files/map/';
const ALTS = ['https://cdn.jsdelivr.net/gh/owner/repo@sha/map/', 'https://cdn.jsdmirror.com/gh/owner/repo@sha/map/'];

test('bootPlan：先在同一个地址重挂一次，再按给的顺序换线路，最多 maxHops 个', () => {
  assert.deepEqual(bootPlan(ALTS), [null, ...ALTS]);
  assert.deepEqual(bootPlan(ALTS, 1), [null, ALTS[0]], '上限生效');
  assert.deepEqual(bootPlan(ALTS, 0), [null], '不换线路：只在原地重挂');
  assert.deepEqual(bootPlan(undefined), [null], '没给线路也照样在原地重挂一次');
  assert.deepEqual(bootPlan(['', null, ALTS[0]]), [null, ALTS[0]], '空地址不算');
  assert.equal(bootPlan([...ALTS, 'x', 'y']).length - 1, MAX_HOPS, '给多了也只换 MAX_HOPS 条');
});

test('rotateKeys：从当前线路的下一个开始轮，不含自己，最多 max 条', () => {
  assert.deepEqual(rotateKeys(['a', 'b', 'c'], 'a'), ['b', 'c']);
  assert.deepEqual(rotateKeys(['a', 'b', 'c'], 'b'), ['c', 'a'], '从下一条绕回第一条，不回到自己');
  assert.deepEqual(rotateKeys(['a', 'b', 'c'], 'c'), ['a', 'b']);
  assert.deepEqual(rotateKeys(['a', 'b', 'c', 'd'], 'b', 2), ['c', 'd'], '上限生效');
  assert.deepEqual(rotateKeys([], 'a'), [], '没线路就没有可换的（用户钉了线路）');
  assert.deepEqual(rotateKeys(['a'], 'a'), []);
  assert.deepEqual(rotateKeys(undefined, 'a'), []);
  assert.deepEqual(rotateKeys(['a', '', 'b'], 'a'), ['b'], '空的不算');
  assert.deepEqual(rotateKeys(['a', 'b'], 'z'), ['a', 'b'], '当前线路不在表里就从头轮');
});

/** 假计时器：把回调抓在手里，由测试决定什么时候「时间到」。 */
function fakeClock() {
  const jobs = new Map(); let n = 0;
  return {
    set: (fn, ms) => { jobs.set(++n, { fn, ms }); return n; },
    clear: id => { jobs.delete(id); },
    pending: () => [...jobs.values()].map(j => j.ms),
    tick() { for (const j of [...jobs.values()]) { jobs.delete(j.id ?? 0); j.fn(); } },
  };
}

function harness(over = {}) {
  const clock = fakeClock(), calls = [];
  let cur = GH;
  const bw = createBootWatchdog({
    base: () => cur,
    alts: () => ALTS,
    onStall: (n, next) => calls.push(['stall', n, next]),
    onMount: next => { calls.push(['mount', next]); if (next) cur = next; },
    setTimer: clock.set, clearTimer: clock.clear, ...over,
  });
  return { bw, calls, clock, set: b => { cur = b; } };
}

test('看门狗：arm 之后到点才动；saw 之后不再动，且把次数清零（下次挂上给满额度）', () => {
  const h = harness();
  h.bw.arm();
  assert.deepEqual(h.clock.pending(), [BOOT_WAIT_MS]);
  h.bw.saw();
  assert.deepEqual(h.clock.pending(), [], '收到查看器的消息就停表');
  h.clock.tick();
  assert.deepEqual(h.calls, [], '停表之后到点也不该有动作');
  h.bw.arm(); h.clock.tick();
  assert.deepEqual(h.calls, [['stall', 1, null], ['mount', null]], '额度重新从第一次算起');
});

test('看门狗：第一次重挂留在同一个地址，之后按同一张顺序逐条换线路', () => {
  const h = harness();
  h.bw.arm(); h.clock.tick();
  assert.deepEqual(h.calls, [['stall', 1, null], ['mount', null]]);
  h.bw.arm(); h.clock.tick();
  assert.deepEqual(h.calls.slice(2), [['stall', 2, ALTS[0]], ['mount', ALTS[0]]]);
  h.bw.arm(); h.clock.tick();
  assert.deepEqual(h.calls.at(-2), ['stall', 3, ALTS[1]], '接着换下一条，不回到原来那条');
  assert.deepEqual(h.calls.at(-1), ['mount', ALTS[1]]);
  assert.equal(h.bw.tries, 3);
});

test('看门狗：线路换完只通报，不再自己挂（出路留给界面上的重试 / 换线路）', () => {
  const h = harness({ maxHops: 1 });
  h.bw.arm(); h.clock.tick();
  assert.deepEqual(h.calls.at(-1), ['mount', null], '第一次还是同一个地址重挂');
  h.bw.arm(); h.clock.tick();
  assert.deepEqual(h.calls.at(-1), ['mount', ALTS[0]], '接着换一条线路');
  const before = h.calls.length;
  h.bw.arm(); h.clock.tick();
  assert.equal(h.calls.length, before + 1, '只有一次通报，没有再挂');
  assert.deepEqual(h.calls.at(-1), ['stall', 3, null], '之后的挂载也只是通报（次数照数），不会自己再动');
  assert.ok(!h.calls.slice(4).some(c => c[0] === 'mount'), '换完之后一次都不自己重挂');
});

test('看门狗：没有线路可换（用户钉了线路 / 本机服务）就只重挂一次，然后只通报', () => {
  const h = harness({ alts: () => [] });
  h.set(NPM);
  h.bw.arm(); h.clock.tick();
  assert.deepEqual(h.calls, [['stall', 1, null], ['mount', null]], '先在原地址重挂一次');
  h.bw.arm(); h.clock.tick();
  assert.deepEqual(h.calls.at(-1), ['stall', 2, null], '没有线路可换，只通报');
  h.bw.arm(); h.clock.tick();
  assert.deepEqual(h.calls.at(-1), ['stall', 3, null]);
  assert.equal(h.calls.filter(c => c[0] === 'mount').length, 1, '只重挂过一次');
});

test('看门狗：用户自己换了线路就重排一张顺序表（不是自己挪的不算）', () => {
  const h = harness({ alts: cur2 => (cur2 === NPM ? [GH] : ALTS) });
  h.set(NPM);
  h.bw.arm(); h.clock.tick();
  h.bw.arm(); h.clock.tick();
  assert.deepEqual(h.calls.at(-1), ['mount', GH], '换到 alts 给的第一条：' + h.calls.at(-1)[1]);
  h.bw.arm(); h.clock.tick();
  assert.deepEqual(h.calls.at(-1), ['stall', 3, null], '这一轮只有一条可换，第三次就通报');
});

test('看门狗：stop 之后到点也不动（脚本被关掉 / 查看器被卸载时）', () => {
  const h = harness();
  h.bw.arm(); h.bw.stop(); h.clock.tick();
  assert.deepEqual(h.calls, []);
});
