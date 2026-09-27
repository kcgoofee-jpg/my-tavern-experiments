// E2 浏览器验收（GOAL 阶段 4 第 3 条 / E2）：node tools/browser/accept.mjs <输出目录> [--only first,layers,cloud,fly,estate,wheel,dead,embed,phone,matrix]
// 省流首屏 ≤ 3 s（本地服务器）、切层、云雾开关（上层「显示下方城市」）、事态飞行、庄园进入与缩放、滚轮以光标为中心、
// 死区探针、嵌入时父页不滚、桌面 1440 与 375 手机（Chromium + WebKit）截图、中 / EN × 深 / 浅截图。
// 产出：<输出目录>/results.json、summary.md、*.png；任何一项 ✗ 时退出码 1。
import * as B from './lib.mjs';

const OUT = process.argv[2];
if (!OUT || OUT.startsWith('--')) { console.log('用法：node tools/browser/accept.mjs <输出目录> [--only a,b,...]'); process.exit(2); }
const oi = process.argv.indexOf('--only'), ONLY = oi > 0 ? new Set(process.argv[oi + 1].split(',')) : null;
const on = k => !ONLY || ONLY.has(k);
const FIRST_MS = +(process.env.FIRST_MS || 3000);

B.quietWait();
const srv = await B.ensureServer();
const rep = B.reporter(OUT);
const step = async (name, fn) => { try { await fn(); } catch (e) { rep.check(name, false, '异常：' + e.message.split('\n')[0]); } };

try {
  // ---------- 桌面 1440×900，省流档 ----------
  const D = await B.newPage('desktop', { tier: 'save' });
  const p = D.page;
  if (on('first')) await step('省流首屏', async () => {
    const r = await B.openViewer(D);
    rep.metric('desktop_first', r);
    rep.check(`省流首屏 ≤ ${FIRST_MS / 1000} s`, r.loadingDoneMs <= FIRST_MS, `遮罩消失 ${r.loadingDoneMs} ms，首瓦片 ${r.firstTileMs} ms，${(r.bytes / 1024).toFixed(0)} KB / ${r.requests} 请求`);
    await B.shot(p, OUT, 'desk_first');
  }); else await B.openViewer(D);

  if (on('wheel')) await step('滚轮以光标为中心（查看器）', async () => {
    const w = await B.wheelDriftViewer(p, 1440 * .3, 900 * .45);
    rep.metric('viewer_wheel', w);
    rep.check('滚轮以光标为中心（查看器）', w.zoom1 > w.zoom0 && w.drift_px <= 3, `zoom ${w.zoom0}→${w.zoom1}，漂移 ${w.drift_px} px`);
  });

  if (on('layers')) await step('切层', async () => {
    await B.goMap(p, 'tc_upper');
    const layers = (await B.viewerState(p)).layers.filter(l => !l.disabled);
    const res = [];
    for (const L of layers) {
      const kind = await p.evaluate(id => REG.maps[id].kind, L.go);
      if (kind === 'estate') continue;                               // 庄园单独测
      const t0 = Date.now();
      await p.evaluate(id => { window.__drawn = cur === id; viewer.addOnceHandler('open', () => viewer.addOnceHandler('tile-drawn', () => { window.__drawn = true; })); }, L.go);
      await p.locator(`#layers button[data-go="${L.go}"]`).click().catch(() => {});
      await p.waitForFunction(() => window.__drawn, null, { timeout: 15000 }).catch(() => {});
      await B.wait(300);
      const s = await B.viewerState(p);
      res.push({ go: L.go, ok: s.map === L.go && s.layers.find(x => x.go === L.go)?.on, ms: Date.now() - t0 });
      await B.shot(p, OUT, 'desk_layer_' + L.go);
    }
    rep.metric('layers', res);
    rep.check('切层（点层按钮）', res.length >= 2 && res.every(r => r.ok), res.map(r => `${r.go}${r.ok ? '' : '✗'}`).join(' / '));
  });

  if (on('cloud')) await step('云雾开关', async () => {
    await B.goMap(p, 'tc_upper');
    const b0 = (await B.viewerState(p)).base;
    // E5：图层开关收进「图层 ▾」弹层（窄屏在「⋯」里），先打开
    const openLay = () => p.evaluate(() => { if (!document.querySelector('#tgAlt').offsetParent) showLay(true); });
    await openLay();
    await p.locator('#tgAlt').click(); await B.wait(2500);
    const b1 = (await B.viewerState(p)).base; await B.shot(p, OUT, 'desk_cloud_city');
    await openLay(); await p.locator('#tgAlt').click(); await B.wait(2000);
    const b2 = (await B.viewerState(p)).base;
    await p.evaluate(() => showLay(false));
    rep.check('云雾开关（上层 ↔ 显示下方城市）', !/upper_city/.test(b0) && /upper_city/.test(b1) && !/upper_city/.test(b2), [b0, b1, b2].map(x => x.replace(/\/$/, '').split('/').pop()).join(' → '));
  });

  if (on('fly')) await step('事态飞行', async () => {
    await B.goMap(p, 'tc_upper');
    const { items } = await B.postEvents(p.mainFrame(), [
      { floor: 100, text: '⌖火灾｜下层·7号井黑市｜3｜仓库起火' },
      { floor: 101, text: '⌖盗窃｜中层·霓虹街｜2｜珠宝店失窃' },
    ], e => JSON.stringify(e).includes('7号井'));
    await p.waitForFunction(() => cur === 'tc_low' && document.querySelector('#card') && !document.querySelector('#card').hidden, null, { timeout: 15000 }).catch(() => {});
    await B.wait(1200);
    const s = await B.viewerState(p);
    await B.shot(p, OUT, 'desk_fly');
    rep.check('事态飞行（上层 → 下层 7 号井，开卡片）', s.map === 'tc_low' && s.card != null, `解析 ${items.length} 条；落在 ${s.map}；卡片「${s.card ?? '无'}」`);
  });

  if (on('dead')) await step('死区（桌面）', async () => {
    await B.goMap(p, 'tc_mid'); await B.wait(1500);
    const d = await B.deadZones(p.mainFrame());
    rep.metric('dead_desktop', d);
    rep.check('死区探针（桌面 tc_mid）', d.dead === 0, `${d.dead}/${d.points} 点被挡` + (d.dead ? '：' + JSON.stringify(d.bySelector) : ''));
  });

  if (on('estate')) await step('庄园', async () => {
    const t = await B.goMap(p, 'eden_estate', 60000);
    const f = await B.estateFrame(p);
    const ok = f && await f.waitForFunction(() => window.__estate && window.__estateFirstFrame, null, { timeout: 60000 }).then(() => true).catch(() => false);
    await B.wait(1500); await B.shot(p, OUT, 'desk_estate');
    rep.check('进入庄园（查看器内嵌）', ok, `${t} ms 到 #estate.on`);
    if (ok) {
      const w = await B.wheelDriftEstate(p, 1440 * .3, 900 * .4, f);
      rep.metric('estate_wheel', w);
      rep.check('庄园滚轮以光标为中心', w.zoom1 > w.zoom0 && w.drift_px <= 3, `zoom ${w.zoom0}→${w.zoom1}，漂移 ${w.drift_px} px`);
      await B.shot(p, OUT, 'desk_estate_zoom');
    }
    await B.goMap(p, 'tc_upper');
    rep.check('离开庄园回上层', (await B.viewerState(p)).map === 'tc_upper' && !(await B.viewerState(p)).estateOn);
    // 独立打开庄园页取 draw calls（?stats=1）
    const E = await B.newPage('desktop');
    const r = await B.openEstate(E); await B.wait(1500);
    const st = await B.estateStats(E.page.mainFrame());
    rep.metric('estate_standalone', { ...r, ...st });
    rep.check('庄园独立页（?stats=1）', st.calls > 0, `第一帧 ${r.firstFrameMs} ms，draw calls ${st.calls}，三角形 ${st.tris}，档位 ${st.tier}，首屏 ${(r.bytes / 1024).toFixed(0)} KB`);
    await E.close();
  });
  rep.metric('desktop_errors', D.errors.slice(0, 20));
  await D.close();

  // ---------- 中 / EN × 深 / 浅（桌面）----------
  if (on('matrix')) await step('中英深浅', async () => {
    const bad = [];
    for (const lang of ['zh', 'en']) for (const scheme of ['dark', 'light']) {
      const M = await B.newPage('desktop', { lang, scheme, tier: 'save' });
      await B.openViewer(M, { map: 'tc_mid' }); await B.wait(800);
      const ov = await M.page.evaluate(() => [...document.querySelectorAll('header *, #layers button, #crumbs *')].filter(e => e.offsetParent && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible').map(e => e.tagName + (e.id ? '#' + e.id : '')).slice(0, 5));
      if (ov.length) bad.push(`${lang}/${scheme}: ${ov.join(',')}`);
      await B.shot(M.page, OUT, `desk_${lang}_${scheme}`); await M.close();
    }
    rep.check('中 / EN × 深 / 浅截图（无裁切溢出）', !bad.length, bad.join('；') || '4 张');
  });

  // ---------- 手机 375×812：Chromium + WebKit（iPhone）----------
  if (on('phone')) for (const preset of ['phone', 'iphone']) await step('手机 ' + preset, async () => {
    const M = await B.newPage(preset, { tier: 'save' });
    const r = await B.openViewer(M);
    await B.wait(800); await B.shot(M.page, OUT, `${preset}_first`);
    await B.goMap(M.page, 'tc_mid'); await B.wait(1000); await B.shot(M.page, OUT, `${preset}_mid`);
    const d = await B.deadZones(M.page.mainFrame(), { step: 25 });
    rep.metric(preset, { first: r, dead: d });
    rep.check(`手机 ${preset}（${M.page.viewportSize().width}px）首屏 ≤ ${FIRST_MS / 1000} s`, r.loadingDoneMs <= FIRST_MS, `${r.loadingDoneMs} ms，${(r.bytes / 1024).toFixed(0)} KB`);
    rep.check(`手机 ${preset} 死区`, d.dead === 0, `${d.dead}/${d.points}` + (d.dead ? '：' + JSON.stringify(d.bySelector) : ''));
    await M.close();
  });

  // ---------- 嵌入：宿主页不被带着滚 ----------
  if (on('embed')) await step('嵌入父页滚动', async () => {
    const H = await B.newPage('desktop', { tier: 'save' });
    const f = await B.openInHost(H);
    await f.waitForFunction(() => document.getElementById('loading')?.classList.contains('done'), null, { timeout: 20000 }).catch(() => {});
    const box = await (await f.frameElement()).boundingBox();
    const y = await B.parentScrollY(H.page, box.x + box.width / 2, box.y + box.height / 2);
    rep.metric('embed_parentScrollY', y);
    rep.check('嵌入时滚轮不带动宿主页', y === 0, `scrollY ${y}`);
    await H.close();
  });
} finally {
  await B.closeAll(); srv.stop();
}
const ok = rep.save();
console.log(`${ok ? '全部通过' : '有失败'} → ${OUT}/summary.md`);
process.exit(ok ? 0 : 1);
