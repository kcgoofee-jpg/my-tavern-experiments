// UI v2 实现截图：对应 docs/design/ui-v2/mockups.html 的 7 个场景（s1–s7），输出 docs/design/ui-v2/impl/*.png。
// 用法：node tools/browser/uiv2_shots.mjs [输出目录]（默认 docs/design/ui-v2/impl）
import * as B from './lib.mjs';
import path from 'node:path';
const OUT = process.argv[2] || path.join(B.REPO_ROOT, 'docs/design/ui-v2/impl');
const EV = ['⌖巡空令｜中层·核心区｜1｜骑士团巡空', '⌖气候故障｜中层·霓虹街｜2｜酸雨', '⌖盗窃｜中层·C区检查点｜2｜珠宝店失窃', '⌖火灾｜中层·大学｜3｜实验楼起火', '⌖公开行程｜中层·星渊｜1｜首相视察']
  .map((text, i) => ({ floor: 100 + i, text }));
const srv = await B.ensureServer();
const errs = [];
const viewer = async (preset, map, o = {}) => { const P = await B.newPage(preset, { tier: 'save', ...o }); await B.openViewer(P, { map, here: o.here }); await B.wait(1800); return P; };
const done = async P => { errs.push(...P.errors.filter(e => !/404/.test(e))); await P.close(); };
try {
  // s1 层地图默认态：手机 375 + 桌面
  for (const pre of ['phone', 'desktop']) { const P = await viewer(pre, 'tc_upper'); await B.postEvents(P.page.mainFrame(), EV); await B.wait(800); await B.shot(P.page, OUT, `s1-tier-default-${pre}`); await done(P); }
  // s2 抽屉三档（手机）+ 桌面右栏收起
  { const P = await viewer('phone', 'tc_mid'); await B.postEvents(P.page.mainFrame(), EV); await B.wait(800);
    for (const st of ['peek', 'half', 'full']) { await P.page.evaluate(s => { TCSheet.setTab('ev'); TCSheet.set(s); }, st); await B.wait(500); await B.shot(P.page, OUT, `s2-sheet-${st}`); }
    await done(P); }
  { const P = await viewer('desktop', 'tc_mid'); await B.postEvents(P.page.mainFrame(), EV); await B.wait(800); await P.page.evaluate(() => TCSheet.set('peek')); await B.wait(400); await B.shot(P.page, OUT, 's2-sheet-rail-peek'); await done(P); }
  // s3 设置分页
  { const P = await viewer('phone', 'tc_upper'); await P.page.evaluate(() => TCSettings.open('home')); await B.wait(400); await B.shot(P.page, OUT, 's3-settings-home-phone');
    await P.page.evaluate(() => TCSettings.open('update')); await B.wait(400); await B.shot(P.page, OUT, 's3-settings-update-phone'); await done(P); }
  { const P = await viewer('desktop', 'tc_upper'); await P.page.evaluate(() => TCSettings.open('display')); await B.wait(400); await B.shot(P.page, OUT, 's3-settings-desktop'); await done(P); }
  // s4 通知层：P1 + 「还有 N 条」+ P2；P0
  { const P = await viewer('phone', 'tc_upper'); await B.wait(800);
    await P.page.evaluate(() => { TCNotify({ key: 'u', level: 1, title: '有新版本 v0.9.8', lines: ['跟随版刷新酒馆页面即可'], actions: [{ label: '更新说明', primary: true }] });
      TCNotify({ key: 's', level: 1, title: '本机存储快满了' }); TCNotify({ key: 'c', level: 1, title: '地图自检发现 1 项需要注意' });
      TCNotify({ key: 'e', level: 2, title: '港区有新事态', actions: [{ label: '查看', primary: true }] }); });
    await B.wait(800); await B.shot(P.page, OUT, 's4-notices-p1-p2');
    await P.page.evaluate(() => TCNotify({ key: 'f', level: 0, title: '需要更新', lines: ['当前版本低于最低要求，更新后继续使用。'], actions: [{ label: '更新日志' }, { label: '立即更新', primary: true }] }));
    await B.wait(600); await B.shot(P.page, OUT, 's4-notices-p0'); await done(P); }
  // s5 / s6 三维页：在查看器里（真实使用场景：顶栏标题 + 状态点 + ⚙/⋯，宿主栏 ✕），外加道具页单独打开
  for (const pre of ['phone', 'desktop']) { const P = await viewer(pre, 'tc_upper'); await P.page.evaluate(() => go('eden_estate'));
    await P.page.waitForFunction(() => document.querySelector('#estate.on'), null, { timeout: 90000 }).catch(() => {}); await B.wait(2500);
    const f = P.page.frames().find(x => x.parentFrame() === P.page.mainFrame());
    await f?.evaluate(() => window.__estate.setMode(2)); await B.wait(2000); await B.shot(P.page, OUT, `s5-estate-F1-${pre}`);
    await f?.evaluate(() => window.postMessage({ type: 'estate:room', name: '大厅' }, '*')); await B.wait(1500); await B.shot(P.page, OUT, `s5-estate-room-${pre}`);
    await P.page.evaluate(() => go('dairy')); await P.page.waitForFunction(() => document.querySelector('#estate.on'), null, { timeout: 90000 }).catch(() => {}); await B.wait(4000);
    await B.shot(P.page, OUT, `s6-props-dairy-${pre}`);
    const g = P.page.frames().find(x => x.parentFrame() === P.page.mainFrame());
    await g?.evaluate(() => __v3d.fly(document.querySelector('.pin').dataset.id, true)); await B.wait(900); await B.shot(P.page, OUT, `s6-props-dairy-hotspot-${pre}`); await done(P); }
  // s7 未上图：顶栏 chip + 选择器（桌面单独打开）
  { const P = await viewer('desktop', 'tc_upper', { here: '月之暗面观测站' }); await B.wait(800); await B.shot(P.page, OUT, 's7-unmapped-chip');
    await P.page.evaluate(() => document.getElementById('unmapped')?.click()); await B.wait(600); await B.shot(P.page, OUT, 's7-unmapped-picker'); await done(P); }
} finally { await B.closeAll(); srv.stop(); }
console.log('截图 →', OUT, errs.length ? '页面错误：' + errs.slice(0, 5).join(' | ') : '无页面错误');
