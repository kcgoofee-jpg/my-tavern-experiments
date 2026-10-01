// node tools/browser/inset_eden.mjs —— 伊甸庄园局部高清插图：切换前后截图 + 基本对位检查（不比较像素，只人工看截图）
import { ensureServer, newPage, closeAll, BASE } from './lib.mjs';
const srv = await ensureServer();
const P = await newPage('desktop');
try {
  await P.page.setViewportSize({ width: 1440, height: 900 });
  await P.page.goto(BASE + 'viewer.html?map=tc_upper');
  await P.page.waitForTimeout(1500);
  const st = await P.page.evaluate(async base => {
    const S = await import(new URL('app/state.mjs', base).href);
    const L = await import(new URL('app/locate.mjs', base).href);
    const I = await import(new URL('app/hires-inset-tiles.mjs', base).href);
    // 飞到伊甸庄园 marker 附近，比插图激活范围略大一点先看「切换前」
    const OSD = window.OpenSeadragon;
    S.osdViewer.viewport.fitBounds(new OSD.Rect(.46, .34 * S.aspect, .18, .18 * S.aspect), true);
    await new Promise(r => setTimeout(r, 300));
    const before = { ratio: I.basePxRatio(), active: !!I.activeInset(), items: S.osdViewer.world.getItemCount() };
    return before;
  }, BASE);
  console.log('切换前（缩略，未到激活阈值预期）', JSON.stringify(st));
  await P.page.screenshot({ path: 'docs/drafts/tc_upper_eden_inset_before.jpg', quality: 90, type: 'jpeg' });
  const st2 = await P.page.evaluate(async base => {
    const S = await import(new URL('app/state.mjs', base).href);
    const I = await import(new URL('app/hires-inset-tiles.mjs', base).href);
    const OSD = window.OpenSeadragon;
    S.osdViewer.viewport.zoomTo(S.osdViewer.viewport.getMaxZoom(), new OSD.Point(.55, .4573 * S.aspect), true);
    await new Promise(r => setTimeout(r, 900));
    I.updateInsets();
    await new Promise(r => setTimeout(r, 1200));
    return { ratio: I.basePxRatio(), active: !!I.activeInset(), items: S.osdViewer.world.getItemCount(), maxZoom: S.osdViewer.viewport.getMaxZoom(), zoom: S.osdViewer.viewport.getZoom(true) };
  }, BASE);
  console.log('放大到顶（预期插图已加载）', JSON.stringify(st2));
  await P.page.waitForTimeout(500);
  await P.page.screenshot({ path: 'docs/drafts/tc_upper_eden_inset_after.jpg', quality: 90, type: 'jpeg' });
  // 再缩出插图范围之外，确认插图被摘掉（省流量）
  const st3 = await P.page.evaluate(async base => {
    const S = await import(new URL('app/state.mjs', base).href);
    const I = await import(new URL('app/hires-inset-tiles.mjs', base).href);
    S.osdViewer.viewport.fitBounds(new (window.OpenSeadragon).Rect(0, 0, 1, S.aspect), true);
    await new Promise(r => setTimeout(r, 800));
    I.updateInsets();
    return { active: !!I.activeInset(), items: S.osdViewer.world.getItemCount() };
  }, BASE);
  console.log('缩回全图（预期插图瓦片已摘掉，activeInset 只看范围不看阈值，仍可能是 true）', JSON.stringify(st3));
  console.log(st.items === 1 && st2.items === 2 && st3.items === 1 ? '✓ 插图按阈值加载/摘掉正常' : '✗ 需要人工检查');
} catch (e) { console.log('✗ 运行', e.stack || e.message); process.exitCode = 1; }
finally { await P.close(); await closeAll(); srv?.stop?.(); }
