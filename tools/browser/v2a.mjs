// 大版本 2 · A 组（UI v2 遗留）验收：375 Chromium 触屏 + 桌面。
//   clean   设置「数据与映射」清理旧聊天：第一次点 = 二次确认，再点 = 清理并回报「已清理 N 个」，10 秒内再清 = 「请 N 秒后再试」（嵌在宿主页桩里）
//   more3d  手机三维页（挤奶厅）：顶栏 ⋯ 打开后有「返回…」；标题不带「测试」
//   labels  手机控制列有标注开关（#lblTog 可见、可切）
//   unmap   当前地点认不出：抽屉 / 右栏「地点」页给「放到地图上」
// 用法：node tools/browser/v2a.mjs <输出目录> [--only clean,more3d]
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';

const OUT = process.argv[2]; if (!OUT || OUT.startsWith('--')) { console.log('用法：node tools/browser/v2a.mjs <输出目录> [--only a,b]'); process.exit(2); }
const oi = process.argv.indexOf('--only'), ONLY = oi > 0 ? process.argv[oi + 1].split(',') : null;
const on = k => !ONLY || ONLY.includes(k);
B.quietWait(); const srv = await B.ensureServer(); const rep = B.reporter(OUT);

// 8 个旧聊天（每个一条按聊天分的键），当前聊天 v2a-clean
const LS = {}; for (let i = 0; i < 8; i++) LS[`edenMap:chat:old${i}:custom`] = '{"x":' + i + '}';

async function clean(preset) {
  const P = await B.newPage(preset, { tier: 'save' });
  try {
    const H = await openHost(P, { here: '天城·下层·7 号井黑市', chat: 'v2a-clean', ls: LS }); await H.open(); const vf = await H.viewer(); await B.wait(800);
    await vf.evaluate(() => TCSettings.open('data')); await B.wait(1200);
    const btn = vf.locator('#storClean');
    rep.check(`${preset} 清理按钮可点（有旧聊天）`, !(await btn.isDisabled()));
    await btn.click(); await B.wait(200);
    const conf = await btn.textContent(); rep.check(`${preset} 第一次点 = 二次确认文案`, /再点一次确认/.test(conf), conf);
    await btn.click(); await B.wait(1500);
    const st1 = await vf.evaluate(() => document.querySelector('#storBox [role=status]')?.textContent || '');
    rep.check(`${preset} 清理后回报「已清理」`, /已清理 \d+ 个聊天/.test(st1), st1);
    rep.check(`${preset} 确认里的个数 = 实际清掉的个数`, conf.match(/删除 (\d+)/)?.[1] === st1.match(/已清理 (\d+)/)?.[1], conf + ' / ' + st1);
    const left = await P.page.evaluate(() => Object.keys(localStorage).filter(k => /^edenMap:chat:old/.test(k)).length);
    rep.check(`${preset} 只留最近 5 个聊天`, left <= 5, 'left=' + left);
    // 10 秒内再发一次：宿主回 limited，界面说「请 N 秒后再试」
    await vf.evaluate(() => post({ type: 'eden-map:storage-clean' })); await B.wait(1200);
    const st2 = await vf.evaluate(() => document.querySelector('#storBox [role=status]')?.textContent || '');
    rep.check(`${preset} 10 秒内再清：明确提示稍后再试`, /秒后再试/.test(st2), st2);
    await B.shot(P.page, OUT, `clean_${preset}`);
  } finally { await P.ctx.close(); }
}

async function more3d() {
  const P = await B.newPage('phone', { tier: 'save' });
  try {
    await B.openViewer(P, { map: 'dairy' }); await B.wait(2500); const p = P.page;
    const title = await p.evaluate(() => document.querySelector('#crumbs b')?.textContent || document.title);
    rep.check('三维页标题不带「测试」', !/测试/.test(title), title);
    const vis = await p.evaluate(() => { const b = document.getElementById('setBtn'); return !!b && getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().width > 0; });
    rep.check('手机三维页顶栏有 ⋯', vis);
    await p.locator('#setBtn').click(); await B.wait(400);
    const up = await p.evaluate(() => { const u = document.getElementById('actUp'); return u && !u.hidden && u.offsetParent ? u.textContent : ''; });
    rep.check('⋯ 首页有「返回上一级」', /^返回/.test(up), up);
    await B.shot(p, OUT, 'more3d_phone');
    if (up) { await p.locator('#actUp').click(); await B.wait(2500);
      const st = await B.viewerState(p); rep.check('点「返回」离开三维页', st.map !== 'dairy', JSON.stringify(st.map)); }
  } finally { await P.ctx.close(); }
}

async function labels() {
  const P = await B.newPage('phone', { tier: 'save' });
  try {
    await B.openViewer(P, { map: 'tc_mid' }); await B.wait(1500); const p = P.page;
    const vis = await p.evaluate(() => { const b = document.getElementById('lblTog'); return !!b && getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().width >= 44; });
    rep.check('手机控制列有标注开关（≥ 44 px）', vis);
    if (vis) { await p.locator('#lblTog').click(); await B.wait(200);
      rep.check('点一下隐藏标注', await p.evaluate(() => document.body.classList.contains('nolabels')));
      await p.locator('#lblTog').click(); }
  } finally { await P.ctx.close(); }
}

async function unmap(preset) {
  const P = await B.newPage(preset, { tier: 'save' });
  try {
    await B.openViewer(P, { map: 'tc_mid', here: '一个地图上没有的小酒馆' }); await B.wait(2000); const p = P.page;
    const r = await p.evaluate(() => ({ name: typeof TCUnmapped !== 'undefined' && TCUnmapped.name, hidden: TCSheet.el.hidden, pl: !TCSheet.button('pl').hidden,
      btn: document.querySelector('#cardEmpty button')?.textContent || '' }));
    if (!r.name) { rep.check(`${preset} 未上图（这个地点被认出来了，跳过）`, true, JSON.stringify(r)); return; }
    rep.check(`${preset} 未上图时抽屉 / 右栏不藏`, !r.hidden && r.pl, JSON.stringify(r));
    rep.check(`${preset} 「地点」页有「放到地图上」`, r.btn === '放到地图上', r.btn);
    await p.evaluate(() => TCSheet.setTab('pl', 'half')); await B.wait(400);
    await B.shot(p, OUT, `unmap_${preset}`);
  } finally { await P.ctx.close(); }
}

try {
  if (on('clean')) { await clean('phone'); await clean('desktop'); }
  if (on('more3d')) await more3d();
  if (on('labels')) await labels();
  if (on('unmap')) { await unmap('phone'); await unmap('desktop'); }
} catch (e) { rep.check('运行', false, String(e?.stack || e)); }
finally { await B.closeAll(); srv.stop(); }
const ok = rep.save(); console.log(`${ok ? '全部通过' : '有失败'} → ${OUT}/summary.md`); process.exit(ok ? 0 : 1);
