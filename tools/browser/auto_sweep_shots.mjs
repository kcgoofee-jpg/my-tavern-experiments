// AUTO-SWEEP 截图矩阵：桩宿主（host_stub）里跑卡内脚本，桌面 1440 与手机 375 各走一遍。
//   node tools/browser/auto_sweep_shots.mjs <输出目录>
// 产出：各层 × 时段 × 斜视/俯视、世界图昼夜、庄园外观昼夜与楼层、抽屉页签、设置页、通知层、空白卡。
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';
import fs from 'node:fs'; import path from 'node:path';
const OUT = process.argv[2] || path.join(process.env.HOME, 'eden-map-review/auto-sweep/shots');
const EV = ['⌖火灾｜天城中层·霓虹街｜2｜霓虹街一栋公寓起火｜执法局', '⌖异象｜某个不存在的地方｜1｜远处传来奇怪的钟声｜',
  '⌖盗窃｜天城下层·C区检查点｜2｜珠宝店失窃｜巡卫', '绫濑遥从地上捡起了一把「黄铜钥匙」，收进口袋。']
  .map((message, i) => ({ message_id: i + 1, message, is_user: false }));
const BANDS = [{ id: 'dawn' }, { id: 'day' }, { id: 'dusk' }, { id: 'night', dark: true }];
const HH = { dawn: 360, day: 720, dusk: 1080, night: 1380 };
B.quietWait(); const srv = await B.ensureServer(); fs.mkdirSync(OUT, { recursive: true });
let n = 0;
const clock = (P, tod) => P.page.evaluate(([tod, min, bands]) => document.querySelector('#eden-map-root .em-frame')
  .contentWindow.postMessage({ type: 'eden-map:clock', v: 2, day: 1, min, time: `${String(min / 60 | 0).padStart(2, '0')}:00`, night: tod === 'night', tod, bands }, '*'), [tod, HH[tod], BANDS]);
const waitBase = async (vf, want) => { const t0 = Date.now();
  for (;;) { const src = await vf.evaluate(() => { try { const s = ViewerDebug.osdViewer.world.getItemAt(0)?.source; return s?.tilesUrl || s?.url || ''; } catch (e) { return ''; } });
    if (src.includes(want)) return true; if (Date.now() - t0 > 15000) return false; await B.wait(200); } };
async function matrix(preset, w) {
  const P = await B.newPage(preset, { tier: 'save', scheme: 'dark' });
  try {
    const H = await openHost(P, { here: '天城执法局总局', msgs: EV, ls: { edenMapInject: 'sys' } });
    await H.open(); const vf = await H.viewer();
    // 1) 三层 × 四时段 × 斜视/俯视（默认斜视）
    for (const tier of ['tc_upper', 'tc_mid', 'tc_low']) {
      await B.goMap(vf, tier); await B.wait(1200);
      for (const tod of ['dawn', 'day', 'dusk', 'night']) {
        await clock(P, tod); await B.wait(1800);
        await B.shot(P.page, OUT, `${w}-${tier}-${tod}-obl`); n++;
        await vf.evaluate(() => document.getElementById('tgTopBox').click());
        if (await waitBase(vf, `${tier}_day`)) await B.wait(1200);
        await B.shot(P.page, OUT, `${w}-${tier}-${tod}-top`); n++;
        await vf.evaluate(() => document.getElementById('tgTopBox').click());
        await waitBase(vf, `${tier}_obl_${tod}`); await B.wait(600);
      }
    }
    // 2) 世界图 昼 / 夜
    await B.goMap(vf, 'world'); await B.wait(1500);
    for (const tod of ['day', 'night']) { await clock(P, tod); await B.wait(1800); await B.shot(P.page, OUT, `${w}-world-${tod}`); n++; }
    // 3) 通知层：更新 / 同步 / 错误
    const notes = [
      ['update', { key: 'u', level: 1, title: '地图已更新', lines: ['刷新酒馆页面即可用上新版本。'], actions: [{ label: '更新说明', primary: true }] }],
      ['sync', { key: 's', level: 1, title: '世界书同步完成', lines: ['新增 2 条，更新 5 条；你改过的 1 条保留原样。'] }],
      ['error', { key: 'e', level: 0, title: '地图资源加载失败', lines: ['检查网络后重试，或稍后再打开地图。'], actions: [{ label: '重试', primary: true }, { label: '关闭' }] }],
    ];
    for (const [name, m] of notes) { await vf.evaluate(m => showNotice(m), m); await B.wait(800); await B.shot(P.page, OUT, `${w}-notice-${name}`); n++; await vf.evaluate(() => [...document.querySelectorAll('.pop button')].find(b => /关闭/.test(b.textContent))?.click()); await B.wait(400); }
    // 4) 设置：首页 / 数据与映射 / 版权声明
    for (const pg of ['home', 'data', 'license']) { await vf.evaluate(p => SettingsApi.open(p), pg); await B.wait(700); await B.shot(P.page, OUT, `${w}-settings-${pg}`); n++; }
    await vf.evaluate(() => SettingsApi.close?.() || document.querySelector('#setPop .btn')?.click()); await B.wait(400);
    // 5) 抽屉页签：事态 / 人物 / 物品 / 地点（地点含编辑器）
    await clock(P, 'day');
    for (const [tab, name] of [['ev', 'events'], ['ch', 'people'], ['it', 'items']]) {
      await vf.evaluate(t => { ViewerDrawer.set('peek'); ViewerDrawer.setTab(t); }, tab); await B.wait(800);
      await B.shot(P.page, OUT, `${w}-drawer-${name}`); n++;
    }
    await vf.evaluate(() => window.EstateShell.fromPage({ type: 'estate:select', room: { name: '主人书房', floor: 'F1', kind: 'owner' }, node: '' }));
    await B.wait(800);
    await vf.evaluate(() => document.querySelector('#card .pr-acts button')?.click()); await B.wait(800);
    await B.shot(P.page, OUT, `${w}-drawer-place-editor`); n++;
    await vf.evaluate(() => document.querySelector('#prDlg [type=button], #prDlg .pr-x')?.click()); await B.wait(400);
    // 6) 庄园三维：外观昼 / 外观夜 / 楼层 B2 / F1
    await vf.evaluate(() => ViewerDebug.go('eden_estate'));
    await vf.waitForSelector('#estate.on', { timeout: 90000 }).catch(() => {}); await B.wait(2500);
    const f = P.page.frames().find(x => x.parentFrame() === vf);
    if (f) {
      await B.shot(P.page, OUT, `${w}-estate-ext-day`); n++;
      await f.evaluate(() => window.postMessage({ type: 'estate:period', tod: 'night' }, '*')); await B.wait(2500);
      await B.shot(P.page, OUT, `${w}-estate-ext-night`); n++;
      await f.evaluate(() => window.__estate.setMode('B2')); await B.wait(2500);
      await B.shot(P.page, OUT, `${w}-estate-B2`); n++;
      await f.evaluate(() => window.__estate.setMode('F1')); await B.wait(2500);
      await B.shot(P.page, OUT, `${w}-estate-F1`); n++;
    } else console.log(`${w}: 庄园 iframe 没找到`);
  } catch (e) { console.log(`${w} 出错：`, String(e.message || e).split('\n')[0]); }
  const errs = P.errors.filter(x => !/404/.test(x));
  if (errs.length) console.log(`${w} 页面错误：`, errs.slice(0, 5).join(' | '));
  await P.close();
}
async function blank(preset, w) {
  const P = await B.newPage(preset, { tier: 'save', scheme: 'dark' });
  try {
    const H = await openHost(P, { charData: { data: { name: '测试空白卡' } }, charLive: true, rawStat: true, stat: {}, chat: 'blank-' + w, msgs: [] });
    await H.open();
    await B.wait(2000);
    await B.shot(P.page, OUT, `${w}-blank-card`); n++;
  } catch (e) { console.log(`${w} 空白卡出错：`, String(e.message || e).split('\n')[0]); }
  await P.close();
}
for (const [preset, w] of [['desktop', '1440'], ['phone', '375']]) { await matrix(preset, w); await blank(preset, w); }
await B.closeAll(); srv.stop();
console.log(`完成 ${n} 张 → ${OUT}`);
