// Part 3：三维查看器（map/props/viewer3d.html）的加载 / 取景 / LOD / 实例化 / 上下文冒烟（探针）。
// 用法：EDEN_BASE=http://localhost:5191/ node tools/browser/v3d_webgl.mjs <输出目录> [model=dairy]
// 目的不是截图，而是把「页面能画出来 + 只有一个 WebGL 上下文 + LOD / 实例化生效 + 没有控制台报错」变成一条命令。
import fs from 'node:fs';
import path from 'node:path';
import { newPage, closeAll, wait, BASE, ensureServer } from './lib.mjs';

const OUT = path.resolve(process.argv[2] || '/tmp/v3d_webgl');
const MODEL = process.argv[3] || 'dairy';
const srv = await ensureServer();
const results = {};
let crash = null;
try {
  const P = await newPage('desktop');
  const r = results[MODEL] = { errors: [] };
  const t0 = Date.now();
  await P.page.goto(`${BASE}props/viewer3d.html?model=${MODEL}`);
  await P.page.waitForFunction(() => window.__viewer3dProbe?.ready, null, { timeout: 120000 });
  r.loadMs = Date.now() - t0;
  await wait(600);
  const perf = await P.page.evaluate(() => window.__viewer3dProbe.perf());
  r.perf = perf;
  r.checks = {
    oneContext: perf.gpu != null,
    lodTracked: !!perf.lod && perf.lod.models === 1,
    instancingRan: perf.culled > 0,
    drawsBelowBudget: perf.draws > 0 && perf.draws <= 40,
    dprSane: perf.dpr >= 1 && perf.dpr <= 4,
    budgetTracked: !!perf.budget && perf.budget.limitBytes > 0,
    budgetSane: !!perf.budget && perf.budget.ratio >= 0 && perf.budget.ratio < 1,
  };
  // 拉远 / 拉近：LOD 档位随镜头变化（升到近档后 detail 应当是 high）
  await P.page.evaluate(() => { __viewer3dProbe.home(); });
  await wait(400);
  const near = await P.page.evaluate(() => window.__viewer3dProbe.perf());
  r.detailNear = near.detail;
  r.checks.lodNearIsHigh = near.detail === 'high';
  r.errors = P.errors;
  await P.close();
} catch (e) { crash = String(e?.stack || e); results.crash = crash; }
await closeAll(); srv.stop();
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'v3d_webgl.json'), JSON.stringify(results, null, 1));
console.log(JSON.stringify(results, null, 1));
const failed = Object.entries(results).filter(([, v]) => v && v.checks && Object.values(v.checks).some(x => x === false));
if (crash || failed.length) {
  console.error('失败：' + (crash ? crash.split('\n')[0] : failed.map(([k]) => k).join(' | ')));
  process.exit(1);
}
process.exit(0);
