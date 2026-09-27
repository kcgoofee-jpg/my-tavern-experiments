// 庄园网页三维（map/estate/，estate2 整岛 + 分层房间）：外观 / 内透 / 剖切 F1 / B1 截图（桌面 + 375），加载时间、档位、draw call，
// 卡设定房间飞行（estate:room + card）、区域热点、标注开关、主卧图集按钮。
// 用法：node tools/browser/estate3d.mjs <输出目录> [--drafts docs/drafts]（--drafts 时把 8 张图另存为 estate3d_<视图>_<desktop|375>.png）
import * as B from './lib.mjs';
import fs from 'node:fs';
import path from 'node:path';
const OUT = process.argv[2]; if (!OUT || OUT.startsWith('--')) { console.log('用法：node tools/browser/estate3d.mjs <输出目录> [--drafts dir]'); process.exit(2); }
const di = process.argv.indexOf('--drafts'), DRAFTS = di > 0 ? path.resolve(process.argv[di + 1]) : null;
const srv = await B.ensureServer(); const rep = B.reporter(OUT);
const VIEWS = [['exterior', 'ext'], ['xray', 'xray'], ['section_F1', 'F1'], ['section_B1', 'B1']];
try {
  for (const [preset, tag] of [['desktop', 'desktop'], ['iphone', '375']]) {
    const P = await B.newPage(preset);
    const r = await B.openEstate(P, { stats: true });
    const f = P.page.mainFrame();
    const st = await f.evaluate(() => { const s = window.__estate.stats(); return { tier: s.tier, low: s.low, site: s.files.site, calls: s.calls, tris: Math.round(s.tris) }; });
    rep.metric('load_' + tag, { ...r, ...st });
    rep.check(`${tag}：整岛第一帧`, r.firstFrameMs > 0, `${r.firstFrameMs} ms，${(r.bytes / 1048576).toFixed(2)} MB，${st.site}，${st.calls} calls，${st.tris} tris`);
    for (const [name, m] of VIEWS) {
      await f.evaluate(m => window.__estate.setMode(m), m);
      if (m !== 'ext') await f.waitForFunction(() => window.__estate.houseState() !== 1, null, { timeout: 30000 }).catch(() => {});
      await B.wait(1400);
      await B.shot(P.page, OUT, `${name}_${tag}`);
      if (DRAFTS) { fs.mkdirSync(DRAFTS, { recursive: true }); await P.page.screenshot({ path: path.join(DRAFTS, `estate3d_${name}_${tag}.png`) }); }
    }
    if (tag === 'desktop') {
      // 查看器「自定义 → 在地图上看」：卡设定房间带 floor + poly
      await f.evaluate(() => window.postMessage({ type: 'estate:room', name: '个人寝室', card: { name: '个人寝室', floor: 'F3', poly: [[3.8, 3], [7.4, 3], [7.4, 8], [3.8, 8]] } }, '*'));
      await B.wait(1200);
      const pr = await f.evaluate(() => ({ mode: window.__estate.mode(), pin: window.__estate.pinned() }));
      rep.check('卡设定房间飞行（F3 个人寝室，按多边形取那一间）', pr.mode === 4 && pr.pin?.id === 'F3-91', JSON.stringify(pr));
      await f.evaluate(() => window.postMessage({ type: 'estate:room', name: '无菌处置室', card: { name: '无菌处置室', floor: 'B2' } }, '*')); await B.wait(1200);
      const pm = await f.evaluate(() => ({ mode: window.__estate.mode(), pin: window.__estate.pinned(), med: !!window.__estate.scene.getObjectByName('f_B2_med') }));
      rep.check('B2 医疗中心（无菌处置室 → B2 剖切，医疗设备块已载入）', pm.mode === 0 && pm.pin?.name === '无菌处置室' && pm.med, JSON.stringify(pm));
      await f.evaluate(() => window.postMessage({ type: 'estate:room', name: '玫瑰园' }, '*')); await B.wait(1000);
      const pz = await f.evaluate(() => ({ mode: window.__estate.mode(), pin: window.__estate.pinned() }));
      rep.check('室外区域热点（玫瑰园 → 外观并高亮）', pz.mode === 'ext' && pz.pin?.name === '玫瑰园', JSON.stringify(pz));
      await f.evaluate(() => window.postMessage({ type: 'estate:room', name: '更衣室' }, '*')); await B.wait(1000);
      const g = await f.evaluate(() => ({ pin: window.__estate.pinned(), gal: !!document.querySelector('#card .gal'), label: document.querySelector('#card .gal')?.textContent }));
      rep.check('旧名「更衣室」→ 主卧套间里的衣帽间热点，卡有「衣帽间图集」', g.pin?.name === '衣帽间' && g.gal && g.label === '衣帽间图集 ›', JSON.stringify(g));
      if (g.gal) { await P.page.click('#card .gal'); await B.wait(1200); const o = await P.page.evaluate(() => ({ img: !!document.querySelector('.rg .rg-img'), title: document.querySelector('.rg')?.textContent.includes('衣帽间') })); rep.check('衣帽间图集打开（标题「衣帽间」）', o.img && o.title, JSON.stringify(o)); await P.page.keyboard.press('Escape'); }
      await P.page.keyboard.press('l'); await B.wait(300);
      const lb = await P.page.evaluate(() => ({ off: document.body.classList.contains('nolabels'), ls: localStorage.getItem('edenEstateLabels') }));
      await P.page.keyboard.press('l');
      rep.check('标注开关（L 键，本机记住）', lb.off && lb.ls === '0', JSON.stringify(lb));
    }
    rep.metric('errors_' + tag, P.errors.slice(0, 10));
    rep.check(`${tag}：无脚本错误`, !P.errors.length, P.errors.slice(0, 3).join(' | '));
    await P.close();
  }
  // 查看器休眠 / 唤醒：庄园 iframe 留着（隐藏 + 暂停），唤醒不再出加载页；第一帧 < 100 ms。再冷开一次：glb 从 Cache API 取
  {
    const P = await B.newPage('desktop');
    const V = await B.openInHost(P, B.BASE + 'viewer.html?map=tc_upper', { frameH: 760 });   // eden-map:* 只认宿主（parent）
    await V.waitForFunction(() => typeof go === 'function' && REG, null, { timeout: 30000 });
    await V.evaluate(() => go('eden_estate')); await V.waitForFunction(() => document.querySelector('#estate.on'), null, { timeout: 60000 });
    const hostPost = (m) => P.page.evaluate((m) => document.getElementById('f').contentWindow.postMessage(m, '*'), m);
    await hostPost({ type: 'eden-map:sleep' }); await B.wait(800);
    const fr = P.page.frames().find((x) => x.parentFrame() === V);
    const sl = { kept: !!fr, paused: fr ? await fr.evaluate(() => window.__estate.paused()) : null };
    await V.evaluate(() => { window.__ldSeen = false; const ld = document.getElementById('loading'); window.__mo = new MutationObserver(() => { if (!ld.classList.contains('done')) window.__ldSeen = true; }); window.__mo.observe(ld, { attributes: true }); });
    await hostPost({ type: 'eden-map:wake' }); await B.wait(800);
    const fr2 = P.page.frames().find((x) => x.parentFrame() === V);
    const wk = await V.evaluate(() => ({ cur, ld: window.__ldSeen, vis: document.getElementById('estate')?.style.visibility || 'visible' }));
    const rf = fr2 ? await fr2.evaluate(() => ({ same: !!window.__estate, resumeMs: Math.round(window.__estate.resumeFrameMs ?? -1), paused: window.__estate.paused() })) : null;
    rep.metric('sleep_wake', { sl, wk, rf });
    rep.check('休眠：庄园 iframe 保留并暂停渲染', sl.kept && sl.paused === true, JSON.stringify(sl));
    rep.check('唤醒：不出加载页，第一帧 < 100 ms', wk.cur === 'eden_estate' && !wk.ld && wk.vis !== 'hidden' && rf && !rf.paused && rf.resumeMs >= 0 && rf.resumeMs < 100, JSON.stringify({ wk, rf }));
    await P.close();
    const Q2 = await B.newPage('desktop'); await B.openEstate(Q2, { stats: false }); await Q2.page.reload({ waitUntil: 'commit' }); await Q2.page.waitForFunction(() => window.__ffAt, null, { timeout: 90000 });
    const c = await Q2.page.evaluate(() => window.__estate.stats().files.cached || 0);
    rep.check('冷开：glb 从 Cache API 取（不重下）', c >= 1, `cached=${c}`);
    await Q2.close();
  }
} finally { await B.closeAll(); srv.stop(); }
const ok = rep.save(); console.log(`${ok ? '全部通过' : '有失败'} → ${OUT}/summary.md`); process.exit(ok ? 0 : 1);
