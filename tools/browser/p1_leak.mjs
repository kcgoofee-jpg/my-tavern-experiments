// Part 1-4 泄漏探针：node tools/browser/p1_leak.mjs <输出目录> [轮数]
// 长会话里最容易慢慢涨的三样：全局监听器（模块重复求值 / 忘了摘）、DOM 节点（叠加层没回收）、
// 已解码瓦片占的堆。这里让查看器反复切图（OSD 每次 open 都会销毁上一张图的瓦片），
// 跑完对账：监听器台账只增不减 = 泄漏；DOM / 堆的增长要有界。
import * as B from './lib.mjs';

const OUT = process.argv[2] || 'tools/browser/out-p1leak';
const ROUNDS = Number(process.argv[3] || 20);
const HEAP_MB = Number(process.env.HEAP_MB || 120);   // 允许的增长上限（OSD 瓦片缓存本身就会占一堆）
B.quietWait();
await B.ensureServer();
const rep = B.reporter(OUT);

const snap = page => page.evaluate(() => ({
  bus: window.__edenBus?.describe?.().count ?? -1,
  nodes: document.getElementsByTagName('*').length,
  heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1,
  items: window.viewer?.world?.getItemCount?.() ?? -1,
  tiles: (() => { try { let n = 0; for (let i = 0; i < window.viewer.world.getItemCount(); i++) n += window.viewer.world.getItemAt(i).tilesMatrix ? 1 : 0; return n; } catch (e) { return -1; } })(),
}));

try {
  const D = await B.newPage('desktop', { tier: 'save' });
  const p = D.page;
  const r0 = await B.openViewer(D);
  rep.metric('first', r0);
  const maps = ['tc_upper', 'tc_mid', 'tc_low', 'world'];
  const usable = await p.evaluate(ms => ms.filter(m => !!window.REG?.maps[m] && window.REG.maps[m].status !== 'planned'), maps);
  rep.check('至少有两张图可来回切（切图循环才有意义）', usable.length >= 2, JSON.stringify(usable));

  await p.evaluate(() => window.go?.(window.REG.start));
  await B.wait(1200);
  const a = await snap(p);
  rep.metric('before', a);

  for (let i = 0; i < ROUNDS; i++) {
    const m = usable[i % usable.length];
    await p.evaluate(id => { try { window.go?.(id); } catch (e) {} }, m);
    await B.wait(350);
  }
  await B.wait(2500);
  const b = await snap(p);
  rep.metric('after', { ...b, rounds: ROUNDS });

  rep.check(`监听器台账不随切图增长（${a.bus} → ${b.bus}）`, a.bus > 0 && b.bus === a.bus, `总线登记 ${JSON.stringify(await p.evaluate(() => window.__edenBus?.describe?.() || null))}`);
  rep.check('叠加层节点数有界（切图不堆 DOM）', b.nodes - a.nodes <= 200, `${a.nodes} → ${b.nodes}`);
  rep.check(`堆增长 ≤ ${HEAP_MB} MB（${a.heap} → ${b.heap} MB）`, b.heap < 0 || b.heap - a.heap <= HEAP_MB, `${ROUNDS} 次切图`);
  rep.check('切图循环全程无控制台错误 / 404', D.errors.length === 0, D.errors.slice(0, 4).join(' | '));
  await B.shot(p, OUT, 'after_cycles');
} finally {
  await B.closeAll();
  const ok = rep.save();
  console.log(ok ? 'p1_leak：全过' : 'p1_leak：有失败');
  process.exit(ok ? 0 : 1);
}
