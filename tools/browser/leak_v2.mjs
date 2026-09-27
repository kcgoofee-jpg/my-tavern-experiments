// 大版本 2 · 泄漏检查：先到 tc_mid 量一次，再在 tc_upper / tc_low / tc_mid 之间切 N 轮（每轮 3 次）回到 tc_mid 再量；比较监听器 / DOM / 堆。
// 用法：node tools/browser/leak_v2.mjs <输出目录> [轮数=4]；监听器按「目标标签#id.类」分组列出增长最多的
import * as B from './lib.mjs';
const OUT = process.argv[2] || '/tmp/leak_v2', N = +(process.argv[3] || 4);
B.quietWait(); const srv = await B.ensureServer(); const rep = B.reporter(OUT);
async function snap(P) {
  const c = await P.ctx.newCDPSession(P.page); await c.send('HeapProfiler.collectGarbage').catch(() => {});
  const h = await c.send('Runtime.getHeapUsage'), dom = await c.send('Memory.getDOMCounters').catch(() => ({}));
  const { result } = await c.send('Runtime.evaluate', { expression: '[window, document, ...document.querySelectorAll("*")]', objectGroup: 'lk' });
  const { result: n } = await c.send('Runtime.callFunctionOn', { objectId: result.objectId, functionDeclaration: 'function(){return this.length}', returnByValue: true });
  const by = {}; let tot = 0;
  for (let i = 0; i < n.value; i++) {
    const { result: el } = await c.send('Runtime.callFunctionOn', { objectId: result.objectId, functionDeclaration: `function(){return this[${i}]}`, objectGroup: 'lk' });
    const { listeners: L } = await c.send('DOMDebugger.getEventListeners', { objectId: el.objectId }); if (!L.length) continue;
    const { result: nm } = await c.send('Runtime.callFunctionOn', { objectId: el.objectId, functionDeclaration: 'function(){return this===window?"window":this===document?"document":(this.tagName.toLowerCase()+(this.id?"#"+this.id:"")+(typeof this.className==="string"&&this.className?"."+this.className.split(" ")[0]:""))}', returnByValue: true });
    for (const l of L) { const k = nm.value + ' ' + l.type; by[k] = (by[k] || 0) + 1; tot++; }
  }
  await c.send('Runtime.releaseObjectGroup', { objectGroup: 'lk' }); await c.detach();
  return { heapMB: +(h.usedSize / 1048576).toFixed(2), nodes: dom.nodes, js: dom.jsEventListeners, tot, by };
}
try {
  const P = await B.newPage('desktop'); await B.openViewer(P, { map: 'tc_mid' }); await B.wait(1500);
  for (const id of ['tc_upper', 'tc_low', 'tc_mid']) await B.goMap(P.page, id); await B.wait(800);
  const a = await snap(P);
  for (let k = 0; k < N; k++) for (const id of ['tc_upper', 'tc_low', 'tc_mid']) await B.goMap(P.page, id);
  await B.wait(1500); const b = await snap(P);
  const grow = Object.keys({ ...a.by, ...b.by }).map(k => [k, (b.by[k] || 0) - (a.by[k] || 0)]).filter(x => x[1]).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])).slice(0, 15);
  console.log(JSON.stringify({ before: { ...a, by: undefined }, after: { ...b, by: undefined }, grow }, null, 1));
  rep.metric('before', { ...a, by: undefined }); rep.metric('after', { ...b, by: undefined }); rep.metric('grow', grow);
  rep.check(`切 ${N * 3} 次回到同一层：监听器不增长（±5）`, Math.abs(b.tot - a.tot) <= 5, `${a.tot} → ${b.tot}`);
  rep.check(`DOM 节点不增长（±30）`, Math.abs(b.nodes - a.nodes) <= 30, `${a.nodes} → ${b.nodes}`);
} catch (e) { rep.check('运行', false, String(e?.stack || e)); }
finally { await B.closeAll(); srv.stop(); }
const ok = rep.save(); console.log(ok ? '全部通过' : '有失败'); process.exit(ok ? 0 : 1);
