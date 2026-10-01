// Part 3 §3：单一 WebGL 上下文的宿主侧普查（浏览器探针）。
// 用法：node tools/browser/webgl_single_ctx.mjs <输出目录>
// 为什么在宿主侧数帧：庄园 / 三维页跑在 blob iframe 里，node 单测看不到运行时；而「同一时刻有几个活着的三维帧」
// 正是这条要求的验收口径。路线：世界图 → 三维 A → 三维 B → 世界图 → 三维 A，全程高频采样 #stage 里的三维帧数，
// 并让三维页报一次自己的上下文状态（__viewer3dProbe.perf().gpu）。
import fs from 'node:fs';
import path from 'node:path';
import { newPage, closeAll, wait, BASE, ensureServer } from './lib.mjs';

const OUT = path.resolve(process.argv[2] || '/tmp/webgl_single_ctx');
const srv = await ensureServer();
const res = { peak: 0, samples: 0, errors: [], steps: [] };
let crash = null;
try {
  const P = await newPage('desktop');
  await P.page.goto(`${BASE}viewer.html?map=world`);
  await P.page.waitForFunction(() => document.getElementById('loading')?.classList.contains('done'), null, { timeout: 60000 });
  const count = () => P.page.evaluate(() => ({
    n: document.querySelectorAll('#stage iframe').length,
    lease: window.Lease3dApi?.live() ?? null,
    snapping: window.Lease3dApi?.snapping?.() ?? null,
  }));
  const sample = async label => {
    const c = await count();
    res.samples++; res.peak = Math.max(res.peak, c.n);
    res.steps.push({ label, ...c });
  };
  const go3d = async map => {
    await P.page.evaluate(m => ViewerDebug.go(m), map);
    await P.page.waitForFunction(() => { const f = document.querySelector('#estate.on'); try { return f && f.contentWindow.__viewer3dProbe?.ready; } catch (e) { return false; } }, null, { timeout: 90000 });
  };
  await sample('world');
  await go3d('dairy'); await sample('dairy ready');
  const gpu = await P.page.evaluate(() => { try { return document.querySelector('#estate').contentWindow.__viewer3dProbe.perf().gpu; } catch (e) { return null; } });
  res.gpu = gpu;
  await go3d('holy_mountain');
  for (let i = 0; i < 6; i++) { await sample('during switch ' + i); await wait(120); }   // 切三维时高频采样：旧帧未摘就是 2
  await sample('holy_mountain ready');
  await P.page.evaluate(() => ViewerDebug.go('world'));
  await wait(1200); await sample('back to world');
  await go3d('dairy'); await sample('dairy again');
  await P.page.evaluate(() => ViewerDebug.go('world'));
  await wait(1200); await sample('final world');
  res.errors = P.errors;
  await P.close();
} catch (e) { crash = String(e?.stack || e); res.crash = crash; }
await closeAll(); srv.stop();
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'single_ctx.json'), JSON.stringify(res, null, 1));
console.log(JSON.stringify(res, null, 1));
if (crash || res.peak > 1 || (res.errors || []).length) {
  console.error(`失败：peak=${res.peak} crash=${crash ? crash.split('\n')[0] : 'none'} errors=${(res.errors || []).join(' | ')}`);
  process.exit(1);
}
console.log('单上下文：任意采样时刻 #stage 里的三维帧 ≤ 1');
process.exit(0);
