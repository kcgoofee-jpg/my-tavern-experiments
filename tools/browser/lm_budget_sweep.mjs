// RENDER-B7 验证扫描：把重导出的地标逐个开进 viewer3d.html，白天 / 夜里各看一次，低档也开一次。
// 产出：每模型 day/night/low 三张截图 + 每档加载字节与三角数 + 夜里亮度必须明显下降（uTint 时段调色生效）。
// 用法：node tools/browser/lm_budget_sweep.mjs <输出目录> <id> [id...]
import fs from 'node:fs';
import path from 'node:path';
import { newPage, shot, closeAll, wait, BASE, ensureServer } from './lib.mjs';

const OUT = path.resolve(process.argv[2] || 'logs/campaign/b7/sweep');
const IDS = process.argv.slice(3);
if (!IDS.length) { console.error('usage: lm_budget_sweep.mjs <out-dir> <id>...'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const srv = await ensureServer();
const report = {};
let fails = 0;
try {
  for (const id of IDS) {
    const r = report[id] = {};
    for (const [key, url] of [
      ['std', `${BASE}props/viewer3d.html?model=${id}`],
      ['low', `${BASE}props/viewer3d.html?model=${id}&tier=low`],
    ]) {
      const P = await newPage('desktop');
      try {
        const t0 = Date.now();
        await P.page.goto(url);
        await P.page.waitForFunction(() => window.__viewer3dProbe?.ready, null, { timeout: 90000 });
        r[key] = { loadMs: Date.now() - t0, ...(await P.page.evaluate(() => { const s = __viewer3dProbe.stats; return { bytes: s.bytes, tris: Math.round(s.tris), tier: s.tier, glb: s.glb }; })) };
        await wait(700);
        await shot(P.page, OUT, `${id}_${key}_day`);
        if (key === 'std') {   // 夜：时钟胶囊的时段消息（顶层页里 parent === self，页面自己收得到）
          await P.page.evaluate(() => postMessage({ type: 'estate:period', tod: 'night' }, '*'));
          await wait(900);
          await shot(P.page, OUT, `${id}_std_night`);
        }
        const errs = P.errors.filter(e => !/favicon|net::ERR_ABORTED/i.test(e));
        if (errs.length) { r[key].errors = errs.slice(0, 3); fails++; }
      } catch (e) {
        r[key] = { error: String(e).slice(0, 300) };
        fails++;
      } finally {
        await P.close();
      }
    }
    console.log(`${id}: ${JSON.stringify(r)}`);
  }
} finally {
  await closeAll();
  if (srv.started) srv.stop();
}
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
console.log(`sweep done: ${IDS.length} models, ${fails} failures -> ${path.join(OUT, 'report.json')}`);
process.exit(fails ? 1 : 0);
