// v2 性能基线：查看器冷开 / 热开 / 内存 / 庄园第一帧 / 发送路径 / 首开包体。
// 用法：node tools/browser/perf_v2.mjs <outDir> [轮数=3] [发送路径次数=30]
// 产出 <outDir>/perf_v2.json（每轮原始值 + 中位数 + 按文件包体），stdout 打 markdown 表。
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const OUT = process.argv[2] || 'perf_v2_out', RUNS = +process.argv[3] || 3, NSEND = +process.argv[4] || 30;
fs.mkdirSync(OUT, { recursive: true });
const med = a => { const b = a.filter(x => x != null).sort((x, y) => x - y); return b.length ? b[b.length >> 1] : null; };
const LAYERS = ['tc_upper', 'tc_mid', 'tc_low'];

async function heap(P) {
  const c = await P.ctx.newCDPSession(P.page);
  await c.send('HeapProfiler.collectGarbage').catch(() => {});
  const h = await c.send('Runtime.getHeapUsage');
  const dom = await c.send('Memory.getDOMCounters').catch(() => ({}));
  // 监听器总数：遍历所有元素 + window/document 的 getEventListeners
  let listeners = null;
  try {
    const { result } = await c.send('Runtime.evaluate', { expression: '[window, document, ...document.querySelectorAll("*")]', objectGroup: 'pv2' });
    const { result: arr } = await c.send('Runtime.callFunctionOn', { objectId: result.objectId, functionDeclaration: 'function(){return this.length}', returnByValue: true });
    listeners = 0;
    for (let i = 0; i < arr.value; i++) {
      const { result: el } = await c.send('Runtime.callFunctionOn', { objectId: result.objectId, functionDeclaration: `function(){return this[${i}]}`, objectGroup: 'pv2' });
      const { listeners: L } = await c.send('DOMDebugger.getEventListeners', { objectId: el.objectId });
      listeners += L.length;
    }
    await c.send('Runtime.releaseObjectGroup', { objectGroup: 'pv2' });
  } catch (e) { listeners = null; }
  await c.detach();
  return { heapMB: +(h.usedSize / 1048576).toFixed(2), domNodes: dom.nodes ?? await P.page.evaluate(() => document.getElementsByTagName('*').length), jsListeners: dom.jsEventListeners ?? null, listeners };
}

async function run(i) {
  const r = {};
  // (1)(2)(3) desktop：冷开、热开（同上下文 reload）、内存
  { const P = await B.newPage('desktop');
    const cold = await B.openViewer(P); await B.wait(1500);
    r.coldList = P.net.list.map(([u, b]) => [u.split('?')[0], b]);
    r.desktopCold = { ms: cold.loadingDoneMs, firstTileMs: cold.firstTileMs, bytes: P.net.bytes, requests: P.net.n };
    r.heapLoad = await heap(P);
    for (let k = 0; k < 10; k++) await B.goMap(P.page, LAYERS[(k + 1) % 3]);
    await B.wait(1000); r.heap10 = await heap(P);
    const warm = await B.openViewer(P); await B.wait(1000);
    r.desktopWarm = { ms: warm.loadingDoneMs, bytes: P.net.bytes, requests: P.net.n };
    await P.close(); }
  { const P = await B.newPage('phone');
    const cold = await B.openViewer(P); await B.wait(1500);
    r.phoneCold = { ms: cold.loadingDoneMs, firstTileMs: cold.firstTileMs, bytes: P.net.bytes, requests: P.net.n };
    const warm = await B.openViewer(P); await B.wait(1000);
    r.phoneWarm = { ms: warm.loadingDoneMs, bytes: P.net.bytes, requests: P.net.n };
    await P.close(); }
  // (4) 庄园独立页第一帧
  { const P = await B.newPage('desktop'); r.estate = await B.openEstate(P); await P.close(); }
  // (5) 发送路径：宿主同步触发 GENERATION_AFTER_COMMANDS（eden-map.js 的 onGen），中位 ms / 次
  { const P = await B.newPage('desktop', { tier: 'save' });
    const pad = s => (s + ' 城市的霓虹在雨里晕开，街角的广告牌循环播放着口号。').repeat(40).slice(0, 3400);
    const msgs = Array.from({ length: 81 }, (_, j) => ({ message_id: j * 2 + 1, message: pad(`第${j}楼。`) + `<span style="display:none">⌖人物 雷恩 @ 下层·7号井</span>` }));
    await openHost(P, { here: '天城·中层·辉光大教堂', msgs, chat: 'perf-v2' }); await B.wait(3000);
    r.send = await P.page.evaluate(async N => {
      const m = a => a.slice().sort((x, y) => x - y)[a.length >> 1], S = window.__stub, same = [], changed = [];
      for (let k = 0; k < N; k++) { const t = performance.now(); window.__fire('g'); same.push(performance.now() - t); await new Promise(r => setTimeout(r, 20)); }
      for (let k = 0; k < N; k++) { const L = S.msgs[S.msgs.length - 1]; S.msgs = [...S.msgs.slice(0, -1), { ...L, message: L.message + k }];
        const t = performance.now(); window.__fire('g'); changed.push(performance.now() - t); await new Promise(r => setTimeout(r, 300)); }
      return { sameMs: +m(same).toFixed(3), changedMs: +m(changed).toFixed(3) };
    }, NSEND);
    await P.close(); }
  console.error(`[perf_v2] run ${i + 1}/${RUNS}`, JSON.stringify({ d: r.desktopCold.ms, p: r.phoneCold.ms, e: r.estate.firstFrameMs, s: r.send }));
  return r;
}

B.quietWait(); const srv = await B.ensureServer();
const runs = []; for (let i = 0; i < RUNS; i++) runs.push(await run(i));
await B.closeAll(); srv.stop();

const g = f => med(runs.map(f));
const M = {
  desktopCold: { ms: g(r => r.desktopCold.ms), bytes: g(r => r.desktopCold.bytes), requests: g(r => r.desktopCold.requests) },
  phoneCold: { ms: g(r => r.phoneCold.ms), bytes: g(r => r.phoneCold.bytes), requests: g(r => r.phoneCold.requests) },
  desktopWarm: { ms: g(r => r.desktopWarm.ms), bytes: g(r => r.desktopWarm.bytes), requests: g(r => r.desktopWarm.requests) },
  phoneWarm: { ms: g(r => r.phoneWarm.ms), bytes: g(r => r.phoneWarm.bytes), requests: g(r => r.phoneWarm.requests) },
  heapLoad: { heapMB: g(r => r.heapLoad.heapMB), domNodes: g(r => r.heapLoad.domNodes), listeners: g(r => r.heapLoad.listeners) },
  heap10: { heapMB: g(r => r.heap10.heapMB), domNodes: g(r => r.heap10.domNodes), listeners: g(r => r.heap10.listeners) },
  estate: { firstFrameMs: g(r => r.estate.firstFrameMs), bytes: g(r => r.estate.bytes), requests: g(r => r.estate.requests) },
  send: { sameMs: g(r => r.send.sameMs), changedMs: g(r => r.send.changedMs) },
};
// (6) 首开包体：viewer.html 与冷开时载入的每个 JS / CSS（按本地文件算 raw + gzip）
const mapDir = path.join(B.REPO_ROOT, 'map');
const files = [...new Set(runs[0].coldList.map(([u]) => u.replace(/^\//, '')).filter(u => /\.(m?js|css|html)$/.test(u)))];
const bundle = files.map(f => { const p = path.join(mapDir, decodeURIComponent(f)); if (!fs.existsSync(p)) return null; const b = fs.readFileSync(p);
  return { file: f, raw: b.length, gzip: zlib.gzipSync(b, { level: 9 }).length }; }).filter(Boolean).sort((a, b) => b.raw - a.raw);
const tot = bundle.reduce((a, x) => ({ raw: a.raw + x.raw, gzip: a.gzip + x.gzip }), { raw: 0, gzip: 0 });
fs.writeFileSync(path.join(OUT, 'perf_v2.json'), JSON.stringify({ runs: runs.map(({ coldList, ...r }) => r), median: M, bundle, bundleTotal: tot, coldRequests: runs[0].coldList }, null, 1));

const kb = n => n == null ? '-' : (n / 1024).toFixed(1) + ' KB';
console.log(`## perf_v2（${RUNS} 轮中位数）\n\n| 项 | ms | 字节 | 请求 | 其他 |\n|---|---|---|---|---|`);
for (const k of ['desktopCold', 'phoneCold', 'desktopWarm', 'phoneWarm']) console.log(`| ${k} | ${M[k].ms} | ${kb(M[k].bytes)} | ${M[k].requests} | |`);
console.log(`| estate 第一帧 | ${M.estate.firstFrameMs} | ${kb(M.estate.bytes)} | ${M.estate.requests} | |`);
console.log(`| 堆 载入后 | | | | ${M.heapLoad.heapMB} MB, DOM ${M.heapLoad.domNodes}, 监听 ${M.heapLoad.listeners} |`);
console.log(`| 堆 切层 10 次后 | | | | ${M.heap10.heapMB} MB, DOM ${M.heap10.domNodes}, 监听 ${M.heap10.listeners} |`);
console.log(`| 发送路径 same / changed | ${M.send.sameMs} / ${M.send.changedMs} | | | N=${NSEND} |`);
console.log(`\n| 文件 | raw | gzip |\n|---|---|---|`);
for (const x of bundle) console.log(`| ${x.file} | ${kb(x.raw)} | ${kb(x.gzip)} |`);
console.log(`| **合计** | ${kb(tot.raw)} | ${kb(tot.gzip)} |`);
