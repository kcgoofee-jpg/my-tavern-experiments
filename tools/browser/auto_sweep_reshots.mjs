// AUTO-SWEEP 第二轮补拍：抽屉页签（在中层、无横幅）、庄园外观夜、庄园 F1、世界图白天全幅。
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';
import fs from 'node:fs'; import path from 'node:path';
const OUT = process.argv[2] || path.join(process.env.HOME, 'eden-map-review/auto-sweep/shots');
const EV = ['⌖火灾｜天城中层·霓虹街｜2｜霓虹街一栋公寓起火｜执法局', '⌖异象｜某个不存在的地方｜1｜远处传来奇怪的钟声｜',
  '⌖盗窃｜天城下层·C区检查点｜2｜珠宝店失窃｜巡卫', '绫濑遥从地上捡起了一把「黄铜钥匙」，收进口袋。']
  .map((message, i) => ({ message_id: i + 1, message, is_user: false }));
const BANDS = [{ id: 'dawn' }, { id: 'day' }, { id: 'dusk' }, { id: 'night', dark: true }];
B.quietWait(); const srv = await B.ensureServer();
const clock = (P, tod, min) => P.page.evaluate(([tod, min, bands]) => document.querySelector('#eden-map-root .em-frame')
  .contentWindow.postMessage({ type: 'eden-map:clock', v: 2, day: 1, min, time: `${String(min / 60 | 0).padStart(2, '0')}:00`, night: tod === 'night', tod, bands }, '*'), [tod, min, BANDS]);
for (const [preset, w] of [['desktop', '1440'], ['phone', '375']]) {
  const P = await B.newPage(preset, { tier: 'save', scheme: 'dark' });
  try {
    const H = await openHost(P, { here: '天城执法局总局', msgs: EV, ls: { edenMapInject: 'sys' } });
    await H.open(); const vf = await H.viewer();
    // 抽屉：先回中层、白天、不开设置
    await B.goMap(vf, 'tc_mid'); await clock(P, 'day', 720); await B.wait(1500);
    for (const [tab, name] of [['ev', 'events'], ['ch', 'people'], ['it', 'items']]) {
      await vf.evaluate(t => { ViewerDrawer.setTab(t, 'half'); }, tab); await B.wait(900);
      await B.shot(P.page, OUT, `${w}-drawer-${name}`); 
    }
    await vf.evaluate(() => window.EstateShell.fromPage({ type: 'estate:select', room: { name: '主人书房', floor: 'F1', kind: 'owner' }, node: '' }));
    await B.wait(800);
    await vf.evaluate(() => document.querySelector('#card .pr-acts button')?.click()); await B.wait(800);
    await B.shot(P.page, OUT, `${w}-drawer-place-editor`);
    await vf.evaluate(() => document.querySelector('#prDlg [type=button], #prDlg .pr-x')?.click());
    await vf.evaluate(() => ViewerDrawer.hide?.()); await B.wait(400);
    // 庄园：先把时钟切夜，再进三维（宿主会把时段推进三维页）；再拍 F1
    await clock(P, 'night', 1380); await B.wait(1500);
    await vf.evaluate(() => ViewerDebug.go('eden_estate'));
    await vf.waitForSelector('#estate.on', { timeout: 90000 }).catch(() => {}); await B.wait(3000);
    const f = P.page.frames().find(x => x.parentFrame() === vf);
    if (f) {
      await f.evaluate(() => window.postMessage({ type: 'estate:period', tod: 'night' }, '*')); await B.wait(3000);
      await B.shot(P.page, OUT, `${w}-estate-ext-night`);
      await f.evaluate(() => window.__estate.setMode('F1')); await B.wait(2500);
      await B.shot(P.page, OUT, `${w}-estate-F1`);
    }
    // 世界图白天全幅复查
    await B.goMap(vf, 'world'); await clock(P, 'day', 720); await B.wait(2000);
    await B.shot(P.page, OUT, `${w}-world-day`);
  } catch (e) { console.log(`${w} 出错：`, String(e.message || e).split('\n')[0]); }
  const errs = P.errors.filter(x => !/404/.test(x));
  if (errs.length) console.log(`${w} 页面错误：`, errs.slice(0, 5).join(' | '));
  await P.close();
}
await B.closeAll(); srv.stop();
console.log('补拍完成');
