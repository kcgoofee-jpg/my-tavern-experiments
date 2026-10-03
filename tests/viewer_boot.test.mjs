// F-TT（I-36）：查看器「起没起来」的看门狗（map/tavern/viewer-boot.mjs）。
// 缺陷现场：Mac TauriTavern 的 WKWebView 里，某个镜像只回响应头不回响应体，查看器文档的子资源永远不落地，
// DOMContentLoaded 不触发、启动函数不跑，界面停在「加载中…」且不报错。这里测两件事：换域名的顺序与边界，
// 以及「没人说话就重挂、换域名、换完了不再自己动」这套调度。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBootWatchdog, hopBases, BOOT_WAIT_MS, MAX_HOPS, MIRROR_HOSTS } from '../map/tavern/viewer-boot.mjs';

const GH = 'https://cdn.statically.io/gh/owner/repo@sha/map/';

test('hopBases：从当前域名的下一个开始轮，不含自己，最多 max 个', () => {
  const hops = hopBases(GH);
  assert.equal(hops.length, MAX_HOPS);
  assert.equal(hops[0], 'https://cdn.jsdelivr.net/gh/owner/repo@sha/map/');
  assert.ok(!hops.some(h => h.includes('statically.io')), '不回到原来那台');
  assert.ok(!hops.some(h => h === GH));
  assert.deepEqual(hopBases('https://cdn.jsdelivr.net/gh/o/r@v/map/')[0], 'https://cdn.jsdmirror.com/gh/o/r@v/map/');
  assert.deepEqual(hopBases(GH, ['a.example', 'b.example', 'c.example'], 2), ['https://a.example/gh/owner/repo@sha/map/', 'https://b.example/gh/owner/repo@sha/map/']);
  assert.deepEqual(hopBases(GH, ['x.example'], 3), ['https://x.example/gh/owner/repo@sha/map/'], '不在名单里的域名也换得过去');
});

test('hopBases：不是 gh 镜像路径的地址不动（本地服务 / npm 线路 / 坏地址）', () => {
  assert.deepEqual(hopBases('http://localhost:5200/'), []);
  assert.deepEqual(hopBases('https://registry.npmmirror.com/pkg/1.0.0/files/map/'), []);
  assert.deepEqual(hopBases('not a url'), []);
  assert.deepEqual(hopBases('https://cdn.jsdelivr.net/gh/o/r@v/map/other/'), []);
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

test('看门狗：第一次重挂留在同一个域名，之后按同一张顺序逐个换域名', () => {
  const h = harness();
  h.bw.arm(); h.clock.tick();
  assert.deepEqual(h.calls, [['stall', 1, null], ['mount', null]]);
  h.bw.arm(); h.clock.tick();
  assert.deepEqual(h.calls.slice(2), [['stall', 2, 'https://cdn.jsdelivr.net/gh/owner/repo@sha/map/'],
    ['mount', 'https://cdn.jsdelivr.net/gh/owner/repo@sha/map/']]);
  h.bw.arm(); h.clock.tick();
  const third = h.calls.filter(c => c[0] === 'stall').at(-1);
  assert.equal(third[1], 3);
  assert.ok(third[2].includes('jsdmirror.com'), '接着换下一台，不回到原来那台：' + third[2]);
  assert.equal(h.bw.tries, 3);
});

test('看门狗：域名换完只通报，不再自己挂（出路留给界面上的重试 / 换线路）', () => {
  const h = harness({ maxHops: 1 });
  h.bw.arm(); h.clock.tick();
  assert.deepEqual(h.calls.at(-1), ['mount', null], '第一次还是同一个域名重挂');
  h.bw.arm(); h.clock.tick();
  assert.ok(String(h.calls.at(-1)[1]).includes('jsdelivr.net'), '接着换一个域名：' + h.calls.at(-1)[1]);
  const before = h.calls.length;
  h.bw.arm(); h.clock.tick();
  assert.equal(h.calls.length, before + 1, '只有一次通报，没有再挂');
  assert.deepEqual(h.calls.at(-1), ['stall', 3, null], '之后的挂载也只是通报（次数照数），不会自己再动');
  assert.ok(!h.calls.slice(4).some(c => c[0] === 'mount'), '换完之后一次都不自己重挂');
});

test('看门狗：换不了域名的地址（本机服务）也照样重挂一次，然后只通报', () => {
  const h = harness();
  h.set('http://localhost:5200/');
  h.bw.arm(); h.clock.tick();
  assert.deepEqual(h.calls, [['stall', 1, null], ['mount', null]], '先在原地址重挂一次');
  h.bw.arm(); h.clock.tick();
  assert.deepEqual(h.calls.at(-1), ['stall', 2, null], '没有域名可换，只通报');
  h.bw.arm(); h.clock.tick();
  assert.deepEqual(h.calls.at(-1), ['stall', 3, null]);
  assert.equal(h.calls.filter(c => c[0] === 'mount').length, 1, '只重挂过一次');
});

test('看门狗：stop 之后到点也不动（脚本被关掉 / 查看器被卸载时）', () => {
  const h = harness();
  h.bw.arm(); h.bw.stop(); h.clock.tick();
  assert.deepEqual(h.calls, []);
});

test('镜像名单：轮得到用户机器上真实用过的域名，且不含自己那份以外的怪东西', () => {
  assert.ok(MIRROR_HOSTS.includes('cdn.statically.io'), '2026-10-03 实测卡住的那台也在名单里');
  assert.ok(MIRROR_HOSTS.includes('cdn.jsdelivr.net') && MIRROR_HOSTS.includes('cdn.jsdmirror.com'));
  assert.equal(new Set(MIRROR_HOSTS).size, MIRROR_HOSTS.length, '不重复');
});
