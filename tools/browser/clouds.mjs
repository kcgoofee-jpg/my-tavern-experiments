// 查看器里的云（方案 B，map/viewer.html 文末「云」脚本块）：Chromium / WebKit，375 与桌面宽。
// 测：默认视野可见云团数、漂移帧率、CoC 切层帧率与用时、点一下跳过、减少动态（无漂移、直接换层）、省流（无漂移、零精灵请求、白幕淡入淡出）、云开关。
// node tools/browser/clouds.mjs [输出目录]
import * as B from './lib.mjs';
import fs from 'node:fs'; import path from 'node:path';
const OUT = process.argv[2] || '/tmp/viewer_clouds'; fs.mkdirSync(OUT, { recursive: true });
B.quietWait(); await B.ensureServer();
const measure = (pg, ms) => pg.evaluate(ms => new Promise(r => { const s = []; let p = 0; const t0 = performance.now();
  (function f(t) { if (p) s.push(t - p); p = t; if (t - t0 < ms) requestAnimationFrame(f); else { const q = [...s].sort((a, b) => a - b);
    r({ fps: +(1000 * s.length / s.reduce((a, b) => a + b, 0)).toFixed(1), p95: +q[Math.floor(q.length * .95)].toFixed(1), n: s.length }); } })(t0); }), ms);
const open = async (preset, opts = {}) => {
  const P = await B.newPage(preset, { scheme: 'light', tier: opts.tier });
  if (opts.rm) await P.page.emulateMedia({ reducedMotion: 'reduce' });
  await P.page.addInitScript(() => { try { localStorage.removeItem('edenMapAlt:tc_upper'); } catch (e) {} });
  await B.openViewer(P, { map: 'tc_upper' }); await B.wait(1500);
  return P;
};
const st = pg => pg.evaluate(() => window.__cloudsProbe.state());
const R = {}; let bad = [];
for (const preset of ['phone', 'iphone', 'desktop', 'desktopWk']) {
  const r = R[preset] = {};
  const P = await open(preset); const pg = P.page;
  const vis = []; for (let i = 0; i < 7; i++) { vis.push((await st(pg)).visible); await B.wait(500); }
  r.state = await st(pg); r.state.visible = vis.sort((a, b) => a - b)[3]; r.visSamples = vis;
  r.drift = await measure(pg, 3000);
  await B.shot(pg, OUT, `${preset}_drift`);
  const m = measure(pg, 2000); const t0 = Date.now();
  await pg.evaluate(() => { window.__sw = ViewerDebug.go('tc_mid'); }); await B.wait(300); await B.shot(pg, OUT, `${preset}_cover`);
  r.coc = await m; await pg.evaluate(() => window.__sw); r.cocMs = Date.now() - t0;
  r.afterMid = await st(pg); r.map = await pg.evaluate(() => ViewerDebug.currentMapId);
  // 跳过：扫入中点一下
  const t1 = Date.now(); await pg.evaluate(() => { window.__sw = ViewerDebug.go('tc_upper'); }); await B.wait(150);
  const vs = pg.viewportSize(); await pg.mouse.click(vs.width / 2, vs.height / 2); await pg.evaluate(() => window.__sw); r.skipMs = Date.now() - t1;
  await B.wait(400); r.backUpper = await st(pg);
  // 云开关：勾「显示下方城市」→ 漂移云消失；取消 → 回来
  await pg.evaluate(() => { const b = document.getElementById('tgAltBox'); b.checked = true; b.dispatchEvent(new Event('change', { bubbles: true })); }); await B.wait(300);
  r.altOn = (await st(pg)).shown;
  await pg.evaluate(() => { const b = document.getElementById('tgAltBox'); b.checked = false; b.dispatchEvent(new Event('change', { bubbles: true })); }); await B.wait(300);
  r.altOff = (await st(pg)).shown;
  r.errors = P.errors; await P.close();
  // 减少动态
  const Q = await open(preset, { rm: true }); r.rm = await st(Q.page);
  const t2 = Date.now(); await Q.page.evaluate(() => ViewerDebug.go('tc_mid')); r.rm.swapMs = Date.now() - t2; r.rm.cover = await Q.page.evaluate(() => !!document.getElementById('clCover')); await Q.close();
  // 省流
  const L = await open(preset, { tier: 'save' }); r.lean = await st(L.page);
  const t3 = Date.now(); await L.page.evaluate(() => ViewerDebug.go('tc_mid')); r.lean.swapMs = Date.now() - t3;
  r.lean.puffRequests = L.net.list.filter(x => /puff/.test(x[0])).length; await L.close();
  if (!r.state.shown || r.state.visible < 5 || r.state.visible > 8   /* 中位数 */) bad.push(`${preset} 可见云团 ${r.state.visible}`);
  if (r.map !== 'tc_mid' || r.afterMid.shown) bad.push(`${preset} 切层后 ${r.map} shown=${r.afterMid.shown}`);
  if (!r.backUpper.shown || r.altOn || !r.altOff) bad.push(`${preset} 开关 ${r.backUpper.shown}/${r.altOn}/${r.altOff}`);
  if (r.rm.shown || r.rm.cover) bad.push(`${preset} 减少动态仍有云`);
  if (r.lean.shown || r.lean.puffRequests) bad.push(`${preset} 省流仍有云 / 精灵请求 ${r.lean.puffRequests}`);
  if (r.errors.length) bad.push(`${preset} 错误 ${r.errors.join(' | ')}`);
}
await B.closeAll();
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(R, null, 1));
console.log(JSON.stringify(R, null, 1));
console.log(bad.length ? '未通过：\n  ' + bad.join('\n  ') : '全部通过');
process.exit(bad.length ? 1 : 0);
