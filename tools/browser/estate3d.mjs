// 庄园网页三维（map/estate/，estate2 整岛 + 分层房间）：外观 / 内透 / 剖切 F1 / B1 截图（桌面 + 375），加载时间、档位、draw call，
// 卡设定房间飞行（estate:room + card）、区域热点、标注开关；衣帽间不再挂通用图集按钮（渲染图走 closet/ 三维入口）。
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
      await f.evaluate(() => window.postMessage({ type: 'estate:room', name: '正式母畜个人寝室', card: { name: '正式母畜个人寝室', floor: 'F3', poly: [[3.8, 3], [7.4, 3], [7.4, 8], [3.8, 8]] } }, '*'));
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
      const g = await f.evaluate(() => ({ pin: window.__estate.pinned(), gal: !!document.querySelector('#card .gal') }));
      rep.check('旧名「更衣室」→ 主卧套间里的衣帽间热点，通用图集按钮已移除（渲染图走三维 closet/ 入口）', g.pin?.name === '衣帽间' && !g.gal, JSON.stringify(g));
      await P.page.keyboard.press('l'); await B.wait(300);
      const lb = await P.page.evaluate(() => ({ off: document.body.classList.contains('nolabels'), ls: localStorage.getItem('edenEstateLabels') }));
      await P.page.keyboard.press('l');
      rep.check('标注开关（L 键，本机记住）', lb.off && lb.ls === '0', JSON.stringify(lb));
      // 相机控制（U，2026-09-28）：滚轮缩放到光标（ctrlKey=捏合）、双击换轨道目标、视角预设按钮
      await f.evaluate(() => window.__estate.setMode('ext'));
      await B.wait(600);
      const cvs = await f.evaluate(() => { const r = document.getElementById('app').getBoundingClientRect(); return { x: Math.round(r.left + r.width * 0.55), y: Math.round(r.top + r.height * 0.5) }; });
      const zBefore = await f.evaluate(() => window.__estate.camera.zoom);
      await P.page.mouse.move(cvs.x, cvs.y);
      await P.page.keyboard.down('Control');
      await P.page.mouse.wheel(0, -180);
      await P.page.keyboard.up('Control');
      await B.wait(200);
      const zAfter = await f.evaluate(() => window.__estate.camera.zoom);
      rep.check('滚轮捏合（ctrlKey）缩放到光标：zoom 变化', Math.abs(zAfter - zBefore) > 1e-6, `${zBefore} → ${zAfter}`);
      const tgBefore = await f.evaluate(() => window.__estate.controls.target.toArray());
      await P.page.mouse.dblclick(cvs.x, cvs.y);
      await B.wait(900);
      const tgAfter = await f.evaluate(() => window.__estate.controls.target.toArray());
      const moved = Math.hypot(...tgAfter.map((v, i) => v - tgBefore[i]));
      rep.check('双击换轨道目标（controls.target 位移）', moved > 0.05, `Δ=${moved.toFixed(2)}`);
      const presetsOk = await f.evaluate(() => {
        const btns = [...document.querySelectorAll('.cc-presets button')];
        if (btns.length !== 4) return { n: btns.length };
        btns.find((b) => b.textContent === '俯视')?.click();
        return { n: btns.length, phi: 0 };
      });
      rep.check('视角预设按钮（俯视/斜视45°/正面/自由）存在且可点', presetsOk.n === 4, JSON.stringify(presetsOk));
    }
    rep.metric('errors_' + tag, P.errors.slice(0, 10));
    rep.check(`${tag}：无脚本错误`, !P.errors.length, P.errors.slice(0, 3).join(' | '));
    await P.close();
  }
  // 查看器休眠 / 唤醒：庄园 iframe 留着（隐藏 + 暂停），唤醒不再出加载页；第一帧 < 100 ms。再冷开一次：glb 从 Cache API 取
  {
    const P = await B.newPage('desktop');
    const V = await B.openInHost(P, B.BASE + 'viewer.html?map=tc_upper', { frameH: 760 });   // eden-map:* 只认宿主（parent）
    await V.waitForFunction(() => typeof ViewerDebug !== 'undefined' && typeof ViewerDebug.go === 'function' && ViewerDebug.mapRegistry, null, { timeout: 30000 });
    await V.evaluate(() => ViewerDebug.go('eden_estate')); await V.waitForFunction(() => document.querySelector('#estate.on'), null, { timeout: 60000 });
    const hostPost = (m) => P.page.evaluate((m) => document.getElementById('f').contentWindow.postMessage(m, '*'), m);
    await hostPost({ type: 'eden-map:sleep' }); await B.wait(800);
    const fr = P.page.frames().find((x) => x.parentFrame() === V);
    const sl = { kept: !!fr, paused: fr ? await fr.evaluate(() => window.__estate.paused()) : null };
    await V.evaluate(() => { window.__ldSeen = false; const ld = document.getElementById('loading'); window.__mo = new MutationObserver(() => { if (!ld.classList.contains('done')) window.__ldSeen = true; }); window.__mo.observe(ld, { attributes: true }); });
    await hostPost({ type: 'eden-map:wake' }); await B.wait(800);
    const fr2 = P.page.frames().find((x) => x.parentFrame() === V);
    const wk = await V.evaluate(() => ({ cur: ViewerDebug.currentMapId, ld: window.__ldSeen, vis: document.getElementById('estate')?.style.visibility || 'visible' }));
    const rf = fr2 ? await fr2.evaluate(() => ({ same: !!window.__estate, resumeMs: Math.round(window.__estate.resumeFrameMs ?? -1), paused: window.__estate.paused() })) : null;
    rep.metric('sleep_wake', { sl, wk, rf });
    rep.check('休眠：庄园 iframe 保留并暂停渲染', sl.kept && sl.paused === true, JSON.stringify(sl));
    rep.check('唤醒：不出加载页，第一帧 < 100 ms', wk.cur === 'eden_estate' && !wk.ld && wk.vis !== 'hidden' && rf && !rf.paused && rf.resumeMs >= 0 && rf.resumeMs < 100, JSON.stringify({ wk, rf }));
    // FPS 只留一份（U，2026-09-28）：开着庄园三维子页时，外层顶栏那个绿色读数该让位给子页自己画的那份
    const fpsDup = await V.evaluate(async () => {
      window.LocalStore.set('edenMapFps', '1');
      const [{ setFpsMeter }, { estateLook }] = await Promise.all([import('./app/fps.mjs'), import('./app/subpage3d-host.mjs')]);
      setFpsMeter(true); estateLook();
      await new Promise((r) => setTimeout(r, 300));
      const outer = document.getElementById('fpsMeter');
      return { outerVisible: !!outer && outer.style.display !== 'none' };
    });
    const innerFps = fr2 ? await fr2.evaluate(() => { const s = document.getElementById('stats'); return { innerVisible: !!s && getComputedStyle(s).display === 'block' }; }) : null;
    rep.check('FPS 只留一份（外层顶栏让位给子页自己的读数）', !fpsDup.outerVisible && innerFps?.innerVisible, JSON.stringify({ fpsDup, innerFps }));
    await P.close();
    const Q2 = await B.newPage('desktop'); await B.openEstate(Q2, { stats: false }); await Q2.page.reload({ waitUntil: 'commit' }); await Q2.page.waitForFunction(() => window.__ffAt, null, { timeout: 90000 });
    const c = await Q2.page.evaluate(() => window.__estate.stats().files.cached || 0);
    rep.check('冷开：glb 从 Cache API 取（不重下）', c >= 1, `cached=${c}`);
    await Q2.close();
  }
} finally { await B.closeAll(); srv.stop(); }
const ok = rep.save(); console.log(`${ok ? '全部通过' : '有失败'} → ${OUT}/summary.md`); process.exit(ok ? 0 : 1);
