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
      const g = await f.evaluate(() => ({ pin: window.__estate.pinned(), gal: !!document.querySelector('#card .gal') }));
      rep.check('旧名「更衣室」→ 主卧，房间卡有「图集」', g.pin?.name === '主卧' && g.gal, JSON.stringify(g));
      if (g.gal) { await P.page.click('#card .gal'); await B.wait(1200); const o = await P.page.evaluate(() => !!document.querySelector('.rg .rg-img')); rep.check('图集打开', o); await P.page.keyboard.press('Escape'); }
      await P.page.keyboard.press('l'); await B.wait(300);
      const lb = await P.page.evaluate(() => ({ off: document.body.classList.contains('nolabels'), ls: localStorage.getItem('edenEstateLabels') }));
      await P.page.keyboard.press('l');
      rep.check('标注开关（L 键，本机记住）', lb.off && lb.ls === '0', JSON.stringify(lb));
    }
    rep.metric('errors_' + tag, P.errors.slice(0, 10));
    rep.check(`${tag}：无脚本错误`, !P.errors.length, P.errors.slice(0, 3).join(' | '));
    await P.close();
  }
} finally { await B.closeAll(); srv.stop(); }
const ok = rep.save(); console.log(`${ok ? '全部通过' : '有失败'} → ${OUT}/summary.md`); process.exit(ok ? 0 : 1);
