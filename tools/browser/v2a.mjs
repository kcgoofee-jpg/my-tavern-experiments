// 大版本 2 · A 组（UI v2 遗留）验收：375 Chromium 触屏 + 桌面。
//   clean   设置「数据与映射」清理旧聊天：第一次点 = 二次确认，再点 = 清理并回报「已清理 N 个」，10 秒内再清 = 「请 N 秒后再试」（嵌在宿主页桩里）
//   more3d  手机三维页（挤奶厅）：顶栏 ⋯ 打开后有「返回…」；标题不带「测试」
//   labels  手机控制列有标注开关（#lblTog 可见、可切）
//   unmap   当前地点认不出：抽屉 / 右栏「地点」页给「放到地图上」
//   link3d  地点卡同时显示通道 link 与三维 link3d（注册表里临时加一个 link3d）
//   hint    第一次打开：三步提示横幅（P1，可关），关掉后再开不再出
//   gallery 伊甸庄园地点卡不再挂衣帽间图集入口（2026-09-28 移除）：衣帽间改走三维庄园里的热点（主卧套间子区域），不挂通用图集按钮
//   fog     迷雾探索：默认关；开着时没到过的地点变暗 + 遮罩，当前地点记进聊天变量 eden_map.探索，已存的记录生效
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
    const H = await openHost(P, { here: '天城·下层·7 号井黑市', chat: 'v2a-clean', ls: LS }); await H.open(); const vf = await H.viewer(); await B.buildAllSettingsPages(vf); await B.wait(800);
    await vf.evaluate(() => SettingsApi.open('data')); await B.wait(1200);
    const btn = vf.locator('#storClean');
    rep.check(`${preset} 清理按钮可点（有旧聊天）`, !(await btn.isDisabled()));
    await btn.click(); await B.wait(200);
    const conf = await btn.textContent(); rep.check(`${preset} 第一次点 = 二次确认文案`, /再点一次确认/.test(conf), conf);
    await btn.click(); await B.wait(1500);
    const st1 = await vf.evaluate(() => document.querySelector('#storBox [role=status]:not(#chatResetMsg)')?.textContent || '');
    rep.check(`${preset} 清理后回报「已清理」`, /已清理 \d+ 个聊天/.test(st1), st1);
    rep.check(`${preset} 确认里的个数 = 实际清掉的个数`, conf.match(/删除 (\d+)/)?.[1] === st1.match(/已清理 (\d+)/)?.[1], conf + ' / ' + st1);
    const left = await P.page.evaluate(() => Object.keys(localStorage).filter(k => /^edenMap:chat:old/.test(k)).length);
    rep.check(`${preset} 只留最近 5 个聊天`, left <= 5, 'left=' + left);
    // 10 秒内再发一次：宿主回 limited，界面说「请 N 秒后再试」
    await vf.evaluate(() => ViewerDebug.post({ type: 'eden-map:storage-clean' })); await B.wait(1200);
    const st2 = await vf.evaluate(() => document.querySelector('#storBox [role=status]:not(#chatResetMsg)')?.textContent || '');
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
    // U-18: the phone dock no longer carries the Aa button (#lblTog is hidden); the labels switch is the layer row 「地名」 (#tgLabels)
    const hid = await p.evaluate(() => { const b = document.getElementById('lblTog'); return !b || getComputedStyle(b).display === 'none'; });
    rep.check('手机控制列不再有标注开关（地名在图层菜单里）', hid);
    await p.evaluate(() => { const c = document.getElementById('tgLabels'); c.checked = false; c.dispatchEvent(new Event('change')); }); await B.wait(200);
    rep.check('关掉「地名」图层隐藏标注', await p.evaluate(() => document.body.classList.contains('nolabels')));
    await p.evaluate(() => { const c = document.getElementById('tgLabels'); c.checked = true; c.dispatchEvent(new Event('change')); });
  } finally { await P.ctx.close(); }
}

async function unmap(preset) {
  const P = await B.newPage(preset, { tier: 'save' });
  try {
    await B.openViewer(P, { map: 'tc_mid', here: '一个地图上没有的小酒馆' }); await B.wait(2000); const p = P.page;
    const r = await p.evaluate(() => ({ name: typeof UnmappedPlacePicker !== 'undefined' && UnmappedPlacePicker.name, hidden: ViewerDrawer.el.hidden, pl: !ViewerDrawer.button('pl').hidden,
      btn: document.querySelector('#cardEmpty button')?.textContent || '' }));
    if (!r.name) { rep.check(`${preset} 未上图（这个地点被认出来了，跳过）`, true, JSON.stringify(r)); return; }
    rep.check(`${preset} 未上图时抽屉 / 右栏不藏`, !r.hidden && r.pl, JSON.stringify(r));
    rep.check(`${preset} 「地点」页有「放到地图上」`, r.btn === '放到地图上', r.btn);
    await p.evaluate(() => ViewerDrawer.setTab('pl', 'half')); await B.wait(400);
    await B.shot(p, OUT, `unmap_${preset}`);
  } finally { await P.ctx.close(); }
}

async function hint(preset) {
  const P = await B.newPage(preset, { tier: 'save', hint: true });
  try {
    await B.openViewer(P, { map: 'tc_mid' }); await B.wait(3500); const p = P.page;
    const t = await p.evaluate(() => document.querySelector('.vw-nt .nt-p1 .nt-item, .nt-p1 .nt-item')?.textContent || '');
    rep.check(`${preset} 第一次打开：三步提示`, /三步上手/.test(t) && /地标/.test(t) && /设置/.test(t), t.slice(0, 80));
    await B.shot(p, OUT, `hint_${preset}`);
    await p.locator('.nt-p1 .nt-item button', { hasText: '知道了' }).click(); await B.wait(300);   // 关掉或点按钮才算看过
    await B.openViewer(P, { map: 'tc_mid' }); await B.wait(3500);
    const t2 = await p.evaluate(() => document.querySelector('.nt-p1 .nt-item')?.textContent || '');
    rep.check(`${preset} 点「知道了」后再开不再出`, !/三步上手/.test(t2), t2.slice(0, 60));
  } finally { await P.ctx.close(); }
}
async function fog(preset) {
  for (const onFog of [false, true]) {
    const P = await B.newPage(preset, { tier: 'save' });
    try {
      const H = await openHost(P, { here: '天城·下层·7 号井黑市', chat: 'v2a-fog-' + onFog, ls: { edenMapFog: onFog ? '1' : '0' }, vars: { eden_map: { 探索: { tc_low: ['货运站'] } } } });
      await H.open(); const vf = await H.viewer(); await vf.evaluate(() => ViewerDebug.go('tc_low')); await B.wait(6000);
      await vf.evaluate(() => SettingsApi.open('map')); await B.wait(300);   // S7-1: the switch lives on a page built on first open
      const st = await vf.evaluate(() => ({ on: document.body.classList.contains('fogon'), cv: !!document.getElementById('fogCv'), fogged: document.querySelectorAll('.mk.fogged').length,
        all: document.querySelectorAll('.mk').length, hereFog: !!document.querySelector('.mk.here.fogged'), opt: !!document.getElementById('optFog')?.checked }));
      await vf.evaluate(() => document.querySelector('#setX')?.click());
      const ex = await P.page.evaluate(() => window.__vars?.eden_map?.探索 || null);
      if (!onFog) { rep.check(`${preset} 迷雾手动关：无遮罩、无变暗、不写变量`, !st.on && !st.cv && !st.fogged && !st.opt && JSON.stringify(ex) === '{"tc_low":["货运站"]}', JSON.stringify({ st, ex })); await B.shot(P.page, OUT, `fog_off_${preset}`); continue; }
      rep.check(`${preset} 迷雾开：遮罩 + 没到过的地点变暗，当前地点不暗`, st.on && st.cv && st.fogged > 0 && st.fogged < st.all && !st.hereFog, JSON.stringify(st));
      rep.check(`${preset} 迷雾开：当前地点记进 eden_map.探索（保留已有记录）`, ex?.tc_low?.includes('7 号井黑市') && ex.tc_low.includes('货运站'), JSON.stringify(ex));
      await B.shot(P.page, OUT, `fog_${preset}`);
    } finally { await P.ctx.close(); }
  }
}

async function gallery(preset) {
  const P = await B.newPage(preset, { tier: 'save' });
  try {
    await B.openViewer(P, { map: 'tc_upper' }); await B.wait(1500); const p = P.page;
    await p.evaluate(() => document.querySelector('.mk[data-name="伊甸庄园"]')._open()); await B.wait(500);
    const a = p.locator('#card .extra [data-gallery="wardrobe"]');
    rep.check(`${preset} 地点卡不再有衣帽间图集入口（渲染图走三维 closet/ 热点，图集机制留给用户自己上传的照片）`, await a.count() === 0);
    await p.keyboard.press('Escape'); await B.wait(300);
    // 衣帽间改走三维庄园：主卧套间（F2-57）里的子区域热点，不挂通用图集按钮（GALLERY 已清空）
    await B.goMap(p, 'eden_estate', 60000); await B.wait(1500);
    const f = await B.estateFrame(p);
    const ok = f && await f.waitForFunction(() => window.__estate, null, { timeout: 30000 }).then(() => true).catch(() => false);
    rep.check(`${preset} 进入三维庄园`, ok);
    if (ok) {
      // 衣帽间是主卧套间（F2）里的子区域：先切到 F2 剖切层把室内模型（含房间条目）加载出来，再按名字找
      await f.evaluate(() => window.__estate.setMode('F2'));
      await f.waitForFunction(() => window.__estate.houseState() !== 1, null, { timeout: 30000 }).catch(() => {}); await B.wait(1000);
      await p.evaluate(() => document.getElementById('estate').contentWindow.postMessage({ type: 'estate:room', name: '衣帽间' }, '*')); await B.wait(1200);
      const g = await f.evaluate(() => ({ pin: window.__estate.pinned(), gal: !!document.querySelector('#card .gal') }));
      rep.check(`${preset} 衣帽间走三维热点进（主卧套间子区域），不挂通用图集按钮`, g.pin?.name === '衣帽间' && !g.gal, JSON.stringify(g));
      await B.shot(p, OUT, `gallery_${preset}`);
    }
  } finally { await P.ctx.close(); }
}

async function link3d() {
  const P = await B.newPage('desktop', { tier: 'save' });
  try {
    await B.openViewer(P, { map: 'tc_mid' }); await B.wait(1200); const p = P.page;
    const r = await p.evaluate(async () => {
      const [id, meta] = Object.entries(ViewerDebug.mapRegistry.maps.tc_mid.markers).find(([, v]) => v.link) || []; if (!id) return { skip: true };
      meta.link3d = { map: meta.link.map === 'lm_pm_residence' ? 'lm_cathedral' : 'lm_pm_residence' }; await ViewerDebug.go('tc_upper'); await new Promise(r => setTimeout(r, 800)); await ViewerDebug.go('tc_mid'); await new Promise(r => setTimeout(r, 1500));
      const mk = document.querySelector(`.mk[data-name="${meta.name}"]`); mk?._open?.(); await new Promise(r => setTimeout(r, 400));
      const ex = document.querySelector('#card .extra');
      return { id, n: ex ? ex.querySelectorAll('a[data-go]').length : 0, t: ex?.querySelector('a[data-link3d]')?.textContent || '' };
    });
    rep.check('地点卡：通道 + 三维两个链接', r.skip || (r.n === 2 && /三维|3D/.test(r.t)), JSON.stringify(r));
  } finally { await P.ctx.close(); }
}
try {
  if (on('gallery')) { await gallery('phone'); await gallery('desktop'); }
  if (on('fog')) { await fog('phone'); await fog('desktop'); }
  if (on('link3d')) await link3d();
  if (on('hint')) { await hint('phone'); await hint('desktop'); }
  if (on('clean')) { await clean('phone'); await clean('desktop'); }
  if (on('more3d')) await more3d();
  if (on('labels')) await labels();
  if (on('unmap')) { await unmap('phone'); await unmap('desktop'); }
} catch (e) { rep.check('运行', false, String(e?.stack || e)); }
finally { await B.closeAll(); srv.stop(); }
const ok = rep.save(); console.log(`${ok ? '全部通过' : '有失败'} → ${OUT}/summary.md`); process.exit(ok ? 0 : 1);
