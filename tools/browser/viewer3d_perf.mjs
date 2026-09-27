// 通用三维查看器（map/props/viewer3d.html）性能测量：加载、各显示方式绕转帧时间、开关 10 次的 JS 堆、GPU 内存估算、截图。
// 用法：EDEN_BASE=http://localhost:5191/ [GPU=1] node tools/browser/viewer3d_perf.mjs <输出目录> [model=dairy]
// 手机档：Chromium 375×812 + CDP CPU 降速 4×；WebKit iPhone 没有降速接口，只记原速。
import fs from 'node:fs';
import path from 'node:path';
import { newPage, shot, closeAll, wait, BASE, ensureServer } from './lib.mjs';

const OUT = path.resolve(process.argv[2] || 'docs/reviews/dairy_interactive');
const MODEL = process.argv[3] || 'dairy';
const SHOTS = path.join(OUT, 'shots');
await ensureServer();
const q = a => { const s = [...a].sort((x, y) => x - y); const at = p => s[Math.min(s.length - 1, Math.floor(p * s.length))]; return { p50: at(0.5), p95: at(0.95) }; };
const fpsOf = ft => { const { p50, p95 } = q(ft); return { fps_p50: +(1000 / p50).toFixed(1), fps_p95: +(1000 / p95).toFixed(1), ms_p50: +p50.toFixed(1), ms_p95: +p95.toFixed(1) }; };
const results = {};

for (const preset of ['desktop', 'phone', 'desktopWk', 'iphone']) {
  const P = await newPage(preset);
  const r = results[preset] = {};
  if (preset === 'phone') { const cdp = await P.ctx.newCDPSession(P.page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); r.cpuThrottle = 4; }
  const t0 = Date.now();
  await P.page.goto(`${BASE}props/viewer3d.html?model=${MODEL}`);
  await P.page.waitForFunction(() => window.__v3d?.ready, null, { timeout: 120000 });
  r.loadMs = Date.now() - t0;
  await wait(600);
  r.stats = await P.page.evaluate(() => ({ ...__v3d.stats, calls: __v3d.info().render.calls, gl: (() => { const c = document.createElement('canvas').getContext('webgl2'); const e = c?.getExtension('WEBGL_debug_renderer_info'); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : ''; })() }));
  await shot(P.page, SHOTS, `${preset}_start`);
  r.modes = {};
  for (const [name, mode, hs] of [['exterior', 'ext', null], ['roof_lift', 'ext', 'cluster'], ['xray', 'xray', null], ['section', 'cut', null]]) {
    await P.page.evaluate(([m, h]) => { __v3d.select(null); __v3d.setMode(m); if (h) __v3d.fly(h, true); else __v3d.home(); }, [mode, hs]);
    await wait(900);
    const ft = await P.page.evaluate(() => __v3d.orbitBench(4000));
    r.modes[name] = { ...fpsOf(ft), frames: ft.length };
    await shot(P.page, SHOTS, `${preset}_${name}`);
  }
  await P.page.evaluate(() => { __v3d.setMode('ext'); __v3d.fly('tank'); });
  await wait(1500); await shot(P.page, SHOTS, `${preset}_fly_tank`);
  r.errors = P.errors;
  await P.close();
}

// 开关 10 次：在查看器 viewer.html 里切到测试图再切回世界，比较 JS 堆（Chromium，CDP 强制 GC）
{
  const P = await newPage('desktop');
  const cdp = await P.ctx.newCDPSession(P.page);
  await P.page.goto(BASE + 'viewer.html?map=world');
  await P.page.waitForFunction(() => document.getElementById('loading')?.classList.contains('done'), null, { timeout: 60000 }).catch(() => {});
  const heap = async () => { await cdp.send('HeapProfiler.collectGarbage'); await wait(300); await cdp.send('HeapProfiler.collectGarbage'); return (await cdp.send('Runtime.getHeapUsage')).usedSize / 1048576; };
  const series = [+(await heap()).toFixed(1)];
  for (let i = 0; i < 10; i++) {
    await P.page.evaluate(() => go('dairy'));
    await P.page.waitForFunction(() => { const f = document.querySelector('#estate.on'); try { return f && f.contentWindow.__v3d?.ready; } catch (e) { return false; } }, null, { timeout: 60000 });
    if (i === 0) await shot(P.page, SHOTS, 'embedded_in_map');
    await P.page.evaluate(() => go('world'));
    await wait(1500);
    series.push(+(await heap()).toFixed(1));
  }
  const frames = P.page.frames().length;
  results.openClose10 = { heapMB: series, growthMB: +(series[series.length - 1] - series[1]).toFixed(1), framesLeft: frames, errors: P.errors };
  // EdenMap.flyTo 从地图外调用
  await P.page.evaluate(() => EdenMap.flyTo({ map: 'dairy', hotspot: 'energiser' }));
  await wait(6000); await shot(P.page, SHOTS, 'embedded_flyTo_energiser');
  await P.close();
}
await closeAll();
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'perf.json'), JSON.stringify(results, null, 1));
console.log(JSON.stringify(results, null, 1));
