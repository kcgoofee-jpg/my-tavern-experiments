// v0.9.6 验收：手机实测问题修复 + 尺度过渡（世界 ↔ 天城交接、「天城周边」过渡环、切层重取景到本层核心区）。
// 用法：node tools/browser/v096.mjs [输出目录] [--shots 前缀]   （375×812 Chromium 触屏 + 1440×900 桌面；--shots 时截图到 docs/drafts/v096_<前缀>_*.png）
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';
import { readFileSync } from 'node:fs';
const MAPS = (JSON.parse(readFileSync(B.REPO_ROOT + '/map/data/maps.json', 'utf8')).maps || {});   // 各层 view.phone 核心区（fix3：切层 / 进城都取景到这）

const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '/tmp/v096';
const si = process.argv.indexOf('--shots'), shotTag = si > 0 ? process.argv[si + 1] || 'after' : null;
const SHOTS = B.REPO_ROOT + '/docs/drafts';
B.quietWait();
const srv = await B.ensureServer();
const rep = B.reporter(out);
const snap = async (page, name) => { if (shotTag) await B.shot(page, SHOTS, `v096_${shotTag}_${name}`); };
const ev = (p, f, a) => p.evaluate(f, a);

// ---------- 手机 375×812 ----------
{
  const P = await B.newPage('phone', { scheme: 'light' }), p = P.page;
  await B.openViewer(P, { map: 'world' }); await B.wait(2000);
  // 1 世界图取景：视野在图内、图铺满视口（不再偏到一边留空）
  const fit = () => ev(p, () => { const b = viewer.viewport.getBounds(true), it = viewer.world.getItemAt(0).getBounds(true);
    return { inX: b.x >= it.x - 1e-3 && b.x + b.width <= it.x + it.width + 1e-3, inY: b.y >= it.y - 1e-3 && b.y + b.height <= it.y + it.height + 1e-3 }; });
  let f = await fit(); rep.check('world_fit_375', f.inX && f.inY, JSON.stringify(f));
  await p.setViewportSize({ width: 812, height: 375 }); await B.wait(900); f = await fit();
  rep.check('world_refit_landscape', f.inX && f.inY, JSON.stringify(f));
  await p.setViewportSize({ width: 375, height: 812 }); await B.wait(900);
  await snap(p, 'world_375');
  // 2 覆盖物可收起：署名是 ⓘ、缩放按钮在触屏上不显示、层切换器收成一个
  await B.goMap(p, 'tc_mid'); await B.wait(1500);
  const ui = await ev(p, () => ({ credit: document.getElementById('credit').hidden, cbtn: !!document.getElementById('creditBtn')?.offsetParent,
    zoom: getComputedStyle(document.getElementById('zoom')).display }));
  rep.check('credit_collapsed', ui.credit && ui.cbtn, JSON.stringify(ui));
  rep.check('zoom_in_thumb_column', ui.zoom === 'flex', ui.zoom);   // UI v2 §10.1：手机控制列常驻 ⋯ + − ⌂
  await p.click('#creditBtn'); const open1 = await ev(p, () => !document.getElementById('credit').hidden);
  rep.check('credit_expands', open1);
  const vis = () => ev(p, () => [...document.querySelectorAll('#layers button')].filter(b => b.offsetParent && getComputedStyle(b).display !== 'none').length);
  rep.check('layers_compact', await vis() === 1, String(await vis()));
  await p.click('#layers button.on'); await B.wait(200);
  rep.check('layers_expand', await vis() >= 3, String(await vis()));
  await p.mouse.click(180, 300); await B.wait(200);
  rep.check('layers_recollapse', await vis() === 1);
  await snap(p, 'mid_375');
  // 3 切层：重取景到本层核心区（fix3），转场结束后不留云 / 快照
  const before = await ev(p, () => { const c = viewer.viewport.getCenter(true); return [c.x, c.y, viewer.viewport.getZoom(true)]; });
  const t0 = Date.now(); await ev(p, () => go('tc_low')); await B.wait(400); await snap(p, 'tierswitch_375');
  await p.waitForFunction(() => cur === 'tc_low' && !document.querySelector('.tier-snap') && !window.__clouds.state().busy, null, { timeout: 5000 }).catch(() => {});
  const ms = Date.now() - t0;
  const after = await ev(p, () => { const c = viewer.viewport.getCenter(true); return [c.x, c.y, viewer.viewport.getZoom(true)]; });
  const leftovers = await ev(p, () => [...document.querySelectorAll('#clCover.run, .tier-snap, .snap')].length);
  rep.check('tier_switch_clears', leftovers === 0 && ms < 2500, `${ms} ms, 残留 ${leftovers}`);
  // fix3（用户 2026-09-28）：切层一律重取景到本层 view.phone 核心区（locate.mjs focusStart → fitIn 夹进图内），不再沿用旧 x / y——期望中心按同一条 frameRect 公式镜像计算
  const expTier = await ev(p, (core) => { const cs = viewer.viewport.getContainerSize(), s = viewer.world.getItemAt(0).getContentSize(), asp = s.y / s.x, ar = cs.x / cs.y;
    let [x, y, w, h] = core; y *= asp; h *= asp;   // core = [x, y, w, h] 归一化，y/h 换算到视口坐标（× 图高比）
    if (w / h < ar) { const nw = h * ar; x -= (nw - w) / 2; w = nw; } else { const nh = w / ar; y -= (nh - h) / 2; h = nh; }
    const k = Math.min(1, 1 / w, asp / h); if (k < 1) { const cx = x + w / 2, cy = y + h / 2; w *= k; h *= k; x = cx - w / 2; y = cy - h / 2; }
    x = Math.max(0, Math.min(1 - w, x)); y = Math.max(0, Math.min(asp - h, y));
    return [x + w / 2, y + h / 2]; }, MAPS.tc_low.view.phone);
  rep.check('tier_reframes_core', Math.abs(after[0] - expTier[0]) < .01 && Math.abs(after[1] - expTier[1]) < .01, JSON.stringify({ after, expTier }));
  await B.wait(1500); await snap(p, 'low_375');
  // 4 过渡环：缩到最远 → 环可见、面包屑「天城周边」；再推 → 回世界图
  await ev(p, () => { viewer.viewport.zoomTo(viewer.viewport.getMinZoom(), null, true); viewer.viewport.applyConstraints(true); }); await B.wait(1200);
  const ring = await ev(p, () => ({ w: viewer.viewport.getBounds(true).width, holder: !!document.querySelector('.tc-ring canvas'), vis: document.querySelector('.tc-ring')?.style.visibility, crumb: document.getElementById('crumbs').textContent }));
  rep.check('ring_visible', ring.holder && ring.vis !== 'hidden' && ring.w > 6, JSON.stringify(ring));
  rep.check('ring_crumb', /天城周边/.test(ring.crumb), ring.crumb);
  await snap(p, 'ring_375');
  await ev(p, () => { for (let i = 0; i < 2; i++) { viewer.viewport.zoomBy(1 / 1.3); viewer.viewport.applyConstraints(); } });
  await p.waitForFunction(() => cur === 'world', null, { timeout: 4000 }).catch(() => {}); await B.wait(1500);
  const w1 = await ev(p, () => { const b = viewer.viewport.getBounds(true), pl = M.places.find(q => q.id === 'tiancheng'), [nx, ny] = toImg(pl.x, pl.y), c = b.getCenter();
    return { cur, zoomAtMax: viewer.viewport.getZoom(true) / viewer.viewport.getMaxZoom(), d: Math.hypot(c.x - nx, c.y - ny * aspect) / b.width }; });
  rep.check('handoff_out_to_world', w1.cur === 'world' && w1.zoomAtMax > .8 && w1.d < .2, JSON.stringify(w1));
  await snap(p, 'handoff_world_375');
  await ev(p, () => { for (let i = 0; i < 2; i++) { viewer.viewport.zoomBy(1.3); viewer.viewport.applyConstraints(); } });
  await p.waitForFunction(() => TCScale.isTier(cur), null, { timeout: 4000 }).catch(() => {}); await B.wait(1500);
  const w2 = await ev(p, () => ({ cur, w: viewer.viewport.getBounds(true).width, crumb: document.getElementById('crumbs').textContent }));
  const w2c = await ev(p, () => { const c = viewer.viewport.getCenter(true); return [c.x, c.y]; });
  const coreLow = MAPS.tc_low.view.phone;
  rep.check('handoff_in_to_tier', w2.cur === 'tc_low' && w2.w > .15 && w2.w < .6 && Math.abs(w2c[0] - (coreLow[0] + coreLow[2] / 2)) < .35, JSON.stringify({ ...w2, c: w2c }));   // U2/fix3：手机竖屏进城 → handoffIn 用核心区宽（view.phone[2]）→ fitIn 夹图内，落在 w≈0.3 的近核心取景（不再是最远一档 w≥1 的云雾圈）
  // 5 三维测试件：整屏加载页、热点不重叠、围栏标记落在网格上、菜单抽屉有标题栏和关闭
  await ev(p, () => go('dairy')); await B.wait(300);
  const ld = await ev(p, () => { const l = document.getElementById('loading'); return { over: l.classList.contains('over'), bg: getComputedStyle(l).backgroundColor }; });
  rep.check('v3d_loading_opaque', !ld.over, JSON.stringify(ld));
  await snap(p, 'dairy_loading_375');
  const fr = await (async () => { for (let i = 0; i < 100; i++) { const f = await B.estateFrame(p); if (f && await f.evaluate(() => window.__v3d?.ready).catch(() => false)) return f; await B.wait(200); } return null; })();
  if (fr) {
    await B.wait(800);
    const pins = await fr.evaluate(() => [...document.querySelectorAll('.pin:not([hidden])')].map(e => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }));
    let minD = Infinity; for (let i = 0; i < pins.length; i++) for (let j = i + 1; j < pins.length; j++) minD = Math.min(minD, Math.hypot(pins[i][0] - pins[j][0], pins[i][1] - pins[j][1]));
    rep.check('v3d_pins_no_overlap', pins.length >= 4 && minD >= 26, `${pins.length} 个，最近 ${minD.toFixed(0)} px`);   // U12 + viewer3d 2026-09-29 小修：≤640px 上挤在一起的编号直接隐藏、编号圈收进 UI 安全区——手机可见数变少是设计避让；「不重叠（≥26px）」仍是硬约束
    const cam = await fr.evaluate(() => { const s = window.__v3d; return { ok: Object.values(s).length > 0 }; });
    rep.check('v3d_ready', cam.ok);
  } else rep.check('v3d_ready', false, '三维页没就绪');
  await B.wait(500); await snap(p, 'dairy_375');
  await p.click('#setBtn'); await B.wait(400);   // UI v2：三维页上查看器的「⋯」在顶栏（控制列让给三维外壳）
  const sh = await ev(p, () => ({ open: !document.getElementById('setPop').hidden, x: !!document.getElementById('setX')?.offsetParent, top: document.getElementById('setPop').scrollTop,
    about: document.getElementById('aboutBox').textContent }));
  rep.check('sheet_header_close', sh.open && sh.x && sh.top === 0, JSON.stringify(sh));
  rep.check('about_version', /v\d+\.\d+\.\d+/.test(sh.about), sh.about);
  await snap(p, 'menu_375');
  await p.click('#setX'); await B.wait(200);
  rep.check('sheet_closes', await ev(p, () => document.getElementById('setPop').hidden));
  rep.check('phone_no_errors', !P.errors.filter(e => !/favicon/.test(e)).length, P.errors.slice(0, 3).join(' | '));
  await P.close();
}
// ---------- 桌面 1440×900 ----------
{
  const P = await B.newPage('desktop'), p = P.page;
  await B.openViewer(P, { map: 'tc_upper' }); await B.wait(1500);
  const d = await ev(p, () => ({ zoom: getComputedStyle(document.getElementById('zoom')).display, credit: document.getElementById('credit').hidden,
    layers: [...document.querySelectorAll('#layers button')].filter(b => getComputedStyle(b).display !== 'none').length }));
  rep.check('desktop_zoom_and_layers', d.zoom !== 'none' && d.layers >= 3 && d.credit, JSON.stringify(d));
  await ev(p, () => go('tc_mid')); await p.waitForFunction(() => cur === 'tc_mid' && !document.querySelector('.tier-snap'), null, { timeout: 5000 }).catch(() => {});
  rep.check('desktop_tier_switch_clears', await ev(p, () => !document.querySelector('.tier-snap, #clCover.run')));
  await ev(p, () => { viewer.viewport.zoomTo(viewer.viewport.getMinZoom(), null, true); viewer.viewport.applyConstraints(true); }); await B.wait(1000);
  rep.check('desktop_ring', await ev(p, () => !!document.querySelector('.tc-ring canvas') && TCScale.ringOn));
  if (shotTag) await B.shot(p, SHOTS, `v096_${shotTag}_ring_desktop`);
  rep.check('desktop_no_errors', !P.errors.filter(e => !/favicon/.test(e)).length, P.errors.slice(0, 3).join(' | '));
  await P.close();
}
// ---------- 嵌入（宿主桩）：语言以标题栏为准、线路按钮短名、关于 / 检查更新 ----------
{
  const P = await B.newPage('phone', { lang: 'zh' }), p = P.page;
  await p.route(/data\.jsdelivr\.com\/v1\/packages\/gh\//, r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ versions: [{ version: 'map-v0.9.5' }, { version: 'map-v9.9.9' }] }) }));
  await p.route(/@map-v9\.9\.9\/map\/data\/build\.json/, r => r.fulfill({ contentType: 'application/json', body: '{"version":"9.9.9","code":"S1-9909-R-9999"}' }));
  const H = await openHost(P, { here: '旷野高地' }); await H.open(); const vf = await H.viewer();
  const lang = await vf.evaluate(() => ({ lang: LANG, crumb: document.getElementById('crumbs').textContent }));
  rep.check('embed_lang_consistent', lang.lang === 'zh' && !/World/.test(lang.crumb), JSON.stringify(lang));
  await vf.evaluate(() => { document.getElementById('thumbBtn').click(); document.querySelector('#setPop .sgroups button[data-page="update"]').click(); }); await B.wait(500);   // UI v2：版本与检查更新在「更新与版本」页
  const ab = await vf.evaluate(() => document.getElementById('aboutBox').textContent);
  rep.check('embed_about', /地图版本 v/.test(ab) && /检查更新/.test(ab), ab);
  await vf.locator('#updBtn').click();   // 真实点击：按钮点完即重绘，设置弹层不能因此关掉
  rep.check('embed_update_keeps_sheet', await vf.evaluate(() => !document.getElementById('setPop').hidden));
  await vf.waitForFunction(() => /有新版|已是最新|检查失败/.test(document.getElementById('aboutBox').textContent), null, { timeout: 15000 }).catch(() => {});
  const res = await vf.evaluate(() => document.getElementById('aboutBox').textContent);
  rep.check('embed_update_result_inline', await vf.evaluate(() => !document.getElementById('setPop').hidden && !!document.querySelector('#aboutBox .res')));
  rep.check('embed_check_update', /有新版 v9\.9\.9/.test(res) && /更新说明/.test(res), res);
  if (shotTag) await B.shot(p, SHOTS, `v096_${shotTag}_about_375`);
  rep.check('embed_no_errors', !P.errors.filter(e => !/favicon|jsdelivr|jsdmirror/.test(e)).length, P.errors.slice(0, 3).join(' | '));
  await P.close();
}
await B.closeAll(); srv.stop();
process.exit(rep.save() ? 0 : 1);
