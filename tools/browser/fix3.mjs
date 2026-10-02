// fix3：用户桌面 TT 新开聊天（未选开局）场景的 UI 问题回归 + 截图。
// 用法：node tools/browser/fix3.mjs <输出目录> [--phone]
// 检查：各层打开时无大块纯白（white）、地点卡无着装（outfit）、人物不重复（dup）、开局前标注（pre）、线路 / 清晰度 / 版本行都有状态（rows）、模板说明与预览（tpl）。
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';
const OUT = process.argv[2]; if (!OUT || OUT.startsWith('--')) { console.log('用法：node tools/browser/fix3.mjs <输出目录> [--phone]'); process.exit(2); }
const PHONE = process.argv.includes('--phone'), TALL = process.argv.includes('--tall');   // --tall：桌面窄高窗口（1100×1000，TT 竖长面板）
B.quietWait(); await B.ensureServer(); const rep = B.reporter(OUT);
const STAT = { 世界: { 当前日期: '新历2088年01月01日', 当前时刻: '08:00', 当日时段: '日间', 当前地点: '谢高飞书房' },
  主角: { 着装: { 衣服: '黑色丝绸睡袍', 裤子: '无', 鞋子: '室内拖鞋' }, 庄园声望: 50 },
  已收服母畜: { 陈若曦: { 社会身份: '大学生' }, 凯莉: { 社会身份: '商人' }, 绫濑遥: { 社会身份: '女仆长' }, 伊莎贝拉: { 社会身份: '骑士' } },
  在场人物: { 陈若曦: { 身份: '大学生' }, 凯莉: { 身份: '商人' }, 绫濑遥: { 身份: '女仆长' } }, 狩猎清单: {} };
const P = await B.newPage(PHONE ? 'phone' : 'desktop', { tier: 'save' });
const sfx = PHONE ? '-375' : TALL ? '-tall' : '';
if (TALL) await P.page.setViewportSize({ width: 1100, height: 1000 });
// 视口里最大的一块「近乎纯白」连通区（按 16 px 格子统计，返回占比）
async function whiteFrac(page) {
  const box = await (await page.$('#eden-map-root .em-frame'))?.boundingBox();   // 只看地图面板（宿主页的输入框等不算）
  const buf = await page.screenshot({ type: 'png', ...(box ? { clip: box } : {}) });
  return page.evaluate(async b64 => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data, S = 16, W = Math.floor(c.width / S), H = Math.floor(c.height / S), wh = new Uint8Array(W * H);
    // 「纯白」= 格子里所有采样点都 > 246 且几乎没有起伏（云海底图有纹理，不算；透出来的白底 / 白边算）
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let n = 0, tot = 0, lo = 255, hi = 0;
      for (let yy = 0; yy < S; yy += 2) for (let xx = 0; xx < S; xx += 2) { const i = ((y * S + yy) * c.width + x * S + xx) * 4; tot++; const v = Math.min(d[i], d[i + 1], d[i + 2]); lo = Math.min(lo, v); hi = Math.max(hi, v); if (v > 246) n++; }
      wh[y * W + x] = n === tot && hi - lo <= 2 ? 1 : 0; }
    let best = 0; const seen = new Uint8Array(W * H);
    for (let s = 0; s < W * H; s++) { if (!wh[s] || seen[s]) continue; let k = 0; const st = [s]; seen[s] = 1;
      while (st.length) { const q = st.pop(); k++; const x = q % W, y = (q / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const r = Y * W + X; if (wh[r] && !seen[r]) { seen[r] = 1; st.push(r); } } }
      best = Math.max(best, k); }
    return best / (W * H);
  }, buf.toString('base64'));
}
try {
  const H = await openHost(P, { here: '谢高飞书房', stat: STAT, msgs: [], chat: 'fix3' });
  await H.open(); const vf = await H.viewer(); await B.wait(2500);
  await B.shot(P.page, OUT, 'open' + sfx);
  // 各层 / 地图打开时的取景：没有大块纯白
  for (const id of ['tc_upper', 'tc_mid', 'tc_low', 'world']) {
    await vf.evaluate(i => ViewerDebug.go(i), id); await vf.waitForFunction(() => ViewerDebug.osdViewer?.world?.getItemCount() && ViewerDebug.osdViewer.world.getItemAt(0).getFullyLoaded?.(), null, { timeout: 30000 }).catch(() => {}); await B.wait(2500);
    const f = await whiteFrac(P.page); await B.shot(P.page, OUT, 'layer-' + id + sfx);
    rep.check('white-' + id, f < 0.03, `最大纯白连通块 ${(f * 100).toFixed(1)}%`);
  }
  await vf.evaluate(() => ViewerDebug.go('tc_upper')); await B.wait(2500);
  // 人物页
  await vf.evaluate(() => { ViewerDrawer.setTab('ch'); ViewerDrawer.set('full'); }); await B.wait(800); await B.shot(P.page, OUT, 'people' + sfx);
  const dup = await vf.evaluate(() => { const n = [...document.querySelectorAll('#evbar .chpane .chgo b')].map(b => b.textContent); return n.filter((x, i) => n.indexOf(x) !== i); });
  rep.check('dup', !dup.length, '重复：' + dup.join('、'));
  const av = await vf.evaluate(() => { const a = document.querySelector('#evbar .chpane .chgo .av'); if (!a) return null; const s = getComputedStyle(a); return { w: a.offsetWidth, sh: s.boxShadow }; });
  rep.check('avatar', av && av.w >= 40 && (av.sh === 'none' || !/,.*,/.test(av.sh)), JSON.stringify(av));
  const pre = await vf.evaluate(() => document.querySelector('#evbar .chpane .chpre')?.textContent || '');
  rep.check('pre', /开局前/.test(pre), pre);
  const me = await vf.evaluate(() => document.querySelector('#evbar .chpane .chme')?.textContent || '');
  rep.check('outfit-people', /黑色丝绸睡袍/.test(me), me);
  // 地点卡：世界图上的天城
  await vf.evaluate(() => ViewerDebug.go('world')); await B.wait(2500);
  await vf.evaluate(() => { const m = [...document.querySelectorAll('.mk')].find(e => /天城/.test(e.dataset.name || '')) || document.querySelector('.mk.here') || document.querySelector('.mk'); m?._open?.(); }); await B.wait(800);
  await B.shot(P.page, OUT, 'placecard' + sfx);
  const oc = await vf.evaluate(() => !!document.querySelector('#card .cu-outfit'));
  rep.check('outfit-place', !oc, oc ? '地点卡还有着装' : '');
  // 设置：高级（线路）、显示（清晰度）、更新（版本）、数据（模板）、自定义
  const pages = ['home', 'adv', 'update', 'data'];
  for (const pg of pages) { await vf.evaluate(p => SettingsApi.open(p), pg); await B.wait(600); await B.shot(P.page, OUT, 'set-' + pg + sfx); }
  const rows = await vf.evaluate(() => {
    SettingsApi.open('adv'); const line = document.querySelector('#lineRow'); const lt = line && !line.hidden ? line.textContent + ' | ' + (document.querySelector('#lineNow')?.textContent || '') : '(hidden)';
    SettingsApi.open('home'); const q = document.querySelector('#tiers'); const qt = q && q.offsetParent ? q.querySelectorAll('button').length + ' 档 | ' + [...q.querySelectorAll('button')].map(b => b.textContent + (b.disabled ? '(灰)' : '')).join(' ') + ' | ' + (document.querySelector('#tierWhy')?.textContent || '') : '(none)';
    SettingsApi.open('update'); const v = document.querySelector('#aboutBox')?.textContent || '';
    return { lt, qt, v };
  });
  rep.check('line', /自动|手动|不可切换|不适用|等待/.test(rows.lt), rows.lt.slice(0, 120));
  rep.check('tier', /^4 档/.test(rows.qt), rows.qt.slice(0, 120));
  rep.check('version', !/版本编码\s*$/.test(rows.v), rows.v.slice(0, 120));
  await vf.evaluate(() => { SettingsApi.open('data'); document.querySelector('#cmpBox')?.setAttribute('open', ''); }); await B.wait(500);
  const tpl = await vf.evaluate(() => { const b = document.querySelector('#cmpBox'); b?.scrollIntoView(); return { ex: b?.querySelectorAll('.cmp-ex button').length || 0, pv: b?.querySelector('.cmp-pv')?.textContent || '' }; });
  await B.shot(P.page, OUT, 'set-template' + sfx);
  rep.check('tpl', tpl.ex >= 2 && tpl.pv.length > 0, JSON.stringify(tpl));
  // 自定义面板打开耗时
  await vf.evaluate(() => SettingsApi.open('data')); await B.wait(300);
  const ms = await vf.evaluate(async () => { const b = document.querySelector('#cuBox .cu-open') || document.querySelector('.cu-open'); if (!b) return -1; const t = performance.now(); b.click(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return performance.now() - t; });
  await B.shot(P.page, OUT, 'custom' + sfx);
  rep.check('custom-open', ms >= 0 && ms < 120, ms.toFixed?.(0) + ' ms');
  await vf.evaluate(() => document.querySelector('#cuDlg [data-close]')?.click());
  // 上层 ⓘ：只有一个提示；fps 不压顶栏
  await vf.evaluate(() => { SettingsApi.open('home'); document.querySelector('#setX')?.click(); ViewerDebug.go('tc_upper'); }); await B.wait(2000);
  const cr = await vf.evaluate(() => { const els = [...document.querySelectorAll('[title]')].filter(e => /署名|credit|作者|渲染/i.test(e.title) && e.offsetParent); return els.map(e => e.id || e.className).join(','); });
  const crTip = await vf.evaluate(() => [...document.querySelectorAll('.credit, #credit, .cr-i')].filter(e => e.title && e.offsetParent && e.querySelector('[role=tooltip], .tip')).length);
  rep.check('credit', crTip === 0, cr);
  // 庄园 B2 剖切
  await P.page.evaluate(() => caches?.delete?.('eden-estate-glb')).catch(() => {});
  await vf.evaluate(() => ViewerDebug.go('eden_estate')); await B.wait(900); await B.shot(P.page, OUT, 'estate-loading' + sfx);
  const lt = await vf.evaluate(() => document.querySelector('#loading .uiprog')?.getAttribute('aria-valuetext') || ''); rep.check('estate-progress', /已|%/.test(lt), lt);
  await vf.waitForFunction(() => document.querySelector('#estate.on'), null, { timeout: 90000 }).catch(() => {}); await B.wait(3000);
  await B.shot(P.page, OUT, 'estate' + sfx);
  await vf.evaluate(() => SettingsApi.open('home')); await B.wait(500); await B.shot(P.page, OUT, 'estate-set-display' + sfx);
  const e3 = await vf.evaluate(() => ({ n: [...document.querySelectorAll('#tiers button')].filter(b => b.offsetParent && b.disabled).length, why: document.querySelector('#tierWhy')?.textContent || '', build: '' }));
  // the local stub reports no build number (a local / standalone script has none), so give the page one: the line is I-15's "which build is running" and must show in the estate view too
  await vf.evaluate(async () => { const m = await import('./app/settings.mjs'); m.setAbout({ ...(m.about || {}), build: 293, sha: '961ca100aaaa', at: '2026-10-02T09:05:40Z' }); });
  await vf.evaluate(() => SettingsApi.open('update'));   // S7-1: the page is built on first open, so read the line after a wait
  await vf.waitForFunction(() => document.querySelector('#buildLine')?.offsetParent && document.querySelector('#buildLine').textContent.length > 4, null, { timeout: 8000 }).catch(() => {});
  e3.build = await vf.evaluate(() => document.querySelector('#buildLine')?.offsetParent ? document.querySelector('#buildLine').textContent : '');
  await B.shot(P.page, OUT, 'estate-set-update' + sfx);
  rep.check('estate-tier', e3.n === 4 && /三维/.test(e3.why), JSON.stringify(e3));
  rep.check('estate-build', e3.build.length > 4, e3.build);
} catch (e) { rep.check('run', false, String(e.stack || e)); }
finally { await P.close?.(); const ok = rep.save(); await B.closeAll(); process.exitCode = ok ? 0 : 1; }
