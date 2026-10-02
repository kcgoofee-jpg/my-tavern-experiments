// FOG-1（D39 / D40）浏览器探针：node tools/browser/fog_probe.mjs [输出目录]
//   ① 城外雾：三个分层 × 白天 / 夜里 × 缩到下限（城区约占半个视口）/ 贴着城区边缘的中景。量三件事 ——
//      雾区平均亮度（夜里必须暗、白天必须浅）、雾与城区边缘带的落差（没有亮晕）、跨城区边界的单像素亮度台阶（没有硬边）；
//      近圈的离散度要高于远圈（世界地形只在近圈透得出来，远圈只剩雾）。
//   ② 缩放下限：再缩出去被夹住（城区 ≥ 半个视口宽），并且能交接到世界图；羽化只吃画面，边缘上的针脚与地名照常。
//   ③ 上层合成（D40）：「显示下方城市」打开时 = 下一层时段底图 + 掩模 + 高空霾都在，夜里下一层也换夜图。
//   ④ 375 px 一次缩到底；减少动态：雾团静布但仍按时段调色。
// 亮度不靠眼睛比截图：量的是 #osd 元素截图（画布 + 城外环 + 霾 + 漂移云，不含固定界面），剖面由 tools/fog_lum.py 算。
// 存档截图另存整页（含界面）在 ~/eden-map-review/fog-1/，供人眼过目。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';

const OUT = process.argv[2] || 'tools/browser/out-fog-1';
const REV = path.join(os.homedir(), 'eden-map-review/fog-1');
const LUM = path.join(B.REPO_ROOT, 'tools/fog_lum.py');
const TIERS = ['tc_upper', 'tc_mid', 'tc_low'];
const BANDS = [{ id: 'dawn' }, { id: 'day' }, { id: 'dusk' }, { id: 'night', dark: true }];
const MIN = { dawn: 390, day: 750, dusk: 1095, night: 90 };
// 阈值（亮度 0..255 / 比例）：夜里雾的上限、白天雾的下限、跨边界单像素台阶上限（用各扫描线最大值的中位数）、雾与城区边缘带的落差上限、城区占视口宽下限
const NIGHT_MAX = 55, DAY_MIN = 150, GRAD_MAX = 22, HALO_MAX = 30, CITY_MIN = .5;

B.quietWait();
await B.ensureServer();
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(REV, { recursive: true });
const rep = B.reporter(OUT);
const lum = (file, rect) => JSON.parse(execFileSync('python3', [LUM, file, '--rect', rect.map(v => v.toFixed(4)).join(',')], { encoding: 'utf8' }));
const brief = m => m && m.mist ? `雾 ${Object.entries(m.mist).filter(([, v]) => v).map(([k, v]) => `${k} ${v.mean}±${v.sd}`).join(' / ') || '(这一取景下没有可量的雾圈)'}；边缘 ${m.inside.edge?.mean}；台阶 ${m.grad_p50}/${m.grad_max}` : JSON.stringify(m);
// 雾的浓度曲线（item 3）：直接读环自己那张画布的 alpha —— 截图里只看得到屏幕内那 0.5 城宽，远处量不到。
// 沿城区横向中线往右量（城区在画布中央，宽 = 画布宽 / RING_W），所以 d 就是「几城宽」。
const ramp = frame => frame.evaluate(() => {
  const cv = document.querySelector('.tc-ring canvas'); if (!cv) return null;
  try {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, cw = W / 10, cx1 = W / 2 + cw / 2, y = Math.round(H / 2);
    const row = g.getImageData(0, y, W, 1).data, out = { size: [W, H], y };
    for (const f of [0, .25, .5, 1, 1.5, 2]) { const x = Math.round(cx1 + f * cw);
      out['at_' + f] = +([0, 1, 2].reduce((s, k) => s + row[(x + k) * 4 + 3], 0) / 3 / 255).toFixed(3); }
    return out;
  } catch (e) { return { error: String(e.message).split('\n')[0] }; }
});

try {
  const D = await B.newPage('desktop');
  const H = await openHost(D, { here: '天城执法局总局', ls: { edenMapInject: 'sys' } });
  await H.open();
  const vf = await H.viewer();
  const clock = async (page, b) => { await page.evaluate(m => document.querySelector('#eden-map-root .em-frame')?.contentWindow?.postMessage(m, '*'),
    { type: 'eden-map:clock', v: 2, day: 1, min: MIN[b], time: '00:00', night: b === 'night', tod: b, bands: BANDS }); await B.wait(1700); };
  // 城区矩形：底图第 0 项的边界经视口投到屏幕（容器坐标）
  const cityBox = frame => frame.evaluate(() => {
    const it = ViewerDebug.osdViewer.world.getItemAt(0); if (!it) return null;
    const b = it.getBounds(true), vp = ViewerDebug.osdViewer.viewport;
    const p0 = vp.pixelFromPoint(new OpenSeadragon.Point(b.x, b.y), true), p1 = vp.pixelFromPoint(new OpenSeadragon.Point(b.x + b.width, b.y + b.height), true);
    return { x0: p0.x, y0: p0.y, x1: p1.x, y1: p1.y, w: vp.getBounds(true).width, asp: b.height / b.width };
  });
  // 量测截图：只拍 #osd（画布 + 环 + 霾 + 云），城区矩形换算成这张图的分数
  const measure = async (name, frame) => {
    const el = frame.locator('#osd'), f = path.join(OUT, 'map-' + name + '.png');
    await el.screenshot({ path: f, timeout: 60000 });
    const box = await el.boundingBox(), c = await cityBox(frame);
    if (!box || !c) return null;
    return { f, m: lum(f, [(c.x0 - box.x) / box.width, (c.y0 - box.y) / box.height, (c.x1 - box.x) / box.width, (c.y1 - box.y) / box.height]), c };
  };
  const archive = async (name, page) => { const f = await B.shot(page, OUT, name); try { fs.copyFileSync(f, path.join(REV, name + '.png')); } catch (e) {} };
  // 取景：wNorm = 视口宽（图像宽 = 1）；中心用图像坐标，y 乘纵横比。null = 缩到下限
  const fit = (frame, wNorm, cx, cy) => frame.evaluate(([w, x, y]) => {
    const v = ViewerDebug.osdViewer.viewport, cs = v.getContainerSize(), h = w * cs.y / cs.x;
    if (w) { v.fitBounds(new OpenSeadragon.Rect(x - w / 2, y - h / 2, w, h), true); v.applyConstraints(true); }
    else { v.zoomTo(v.getMinZoom() * .5, v.getCenter(), true); v.applyConstraints(true); }
    return v.getBounds(true).width;
  }, [wNorm, cx, cy]);

  /* ---------------- ① 城外雾 ---------------- */
  const rows = {};
  for (const b of ['day', 'night']) {
    await clock(D.page, b);
    for (const id of TIERS) {
      await B.goMap(vf, id); await B.wait(1500);
      const c0 = await cityBox(vf);
      if (!c0) { rep.check(`${id} ${b}：底图有第 0 项`, false, '拿不到边界'); continue; }
      for (const [tag, w] of [['out', null], ['edge', .5]]) {
        await fit(vf, w, w ? -.1 : .5, c0.asp * .5);   // edge：城区左边界偏在中间，右侧留出雾
        await B.wait(1900);
        await archive(`fog-${id}-${b}-${tag}`, D.page);
        const r = await measure(`${id}-${b}-${tag}`, vf);
        if (!r) { rep.check(`${id} ${b} ${tag}：量到城区矩形`, false, '#osd 或第 0 项不在'); continue; }
        const m = r.m, near = m.mist.near?.mean, edge = m.inside.edge?.mean;
        rows[`${id} ${b} ${tag}`] = { cityW: +r.c.w.toFixed(3), edge, near, mid: m.mist.mid?.mean, grad: m.grad_p50 };
        rep.metric(`lum ${id} ${b} ${tag}`, m);
        rep.check(`${id} ${b} ${tag}：${b === 'night' ? `雾是暗的（< ${NIGHT_MAX}）` : `雾是浅色 mist（> ${DAY_MIN}）`}`,
          near != null && (b === 'night' ? near < NIGHT_MAX : near > DAY_MIN), brief(m));
        // 夜里不许有亮晕：雾和城区边缘带一个亮度（白天雾本来就比深色城市底图亮，那条按 p99 查有没有亮边）
        if (b === 'night') rep.check(`${id} ${b} ${tag}：雾紧贴城区边缘带，落差 < ${HALO_MAX}（没有亮晕）`, Math.abs(near - edge) < HALO_MAX, `雾 ${near} / 边缘 ${edge}`);
        else rep.check(`${id} ${b} ${tag}：城区外缘没有一圈亮边（p99 与均值同量级）`, !!m.mist.edge && m.mist.edge.p99 - m.mist.edge.mean < 45, `edge mean ${m.mist.edge?.mean} p99 ${m.mist.edge?.p99}`);
        rep.check(`${id} ${b} ${tag}：跨城区边界没有硬边（各扫描线台阶中位数 ≤ ${GRAD_MAX}）`, m.grad_p50 != null && m.grad_p50 <= GRAD_MAX, `中位 ${m.grad_p50} / 最大 ${m.grad_max} / 均值 ${m.grad_mean}`);
        // 环只有 320 px 宽：远场在屏幕上量不到，浓度曲线交给下面的 ramp
        if (tag === 'out') rep.check(`${id} ${b}：近圈透得出地形（离散度 > 4）`, m.mist.near.sd > 4, `near sd ${m.mist.near.sd}`);
        if (tag === 'edge') {
          // 羽化只淡画面：mask 挂在 OSD 那一块画布上，标记是它的兄弟节点，不在画布里
          const mk = await vf.evaluate(() => { const w = ViewerDebug.osdViewer.drawer.canvas.parentNode;
            return { marks: document.querySelectorAll('.mk').length, inCanvas: document.querySelectorAll('canvas[data-fade] .mk').length,
              onCanvas: document.querySelectorAll('#osd canvas[data-fade]').length, wrapMask: getComputedStyle(w).maskImage,
              osdBg: getComputedStyle(document.getElementById('osd')).backgroundColor }; });
          rep.check(`${id} ${b} edge：羽化只淡画面（mask 在画布上、标记不在画布里、底色是雾）`,
            mk.onCanvas === 1 && mk.inCanvas === 0 && mk.wrapMask === 'none' && !/rgba\(0, 0, 0, 0\)|transparent/.test(mk.osdBg), JSON.stringify(mk));
        }
      }
    }
    // item 3：浓度随距离上升 —— 读环自己画布的 alpha（截图只看得到屏幕内那半城宽）
    const rp = await ramp(vf);
    rep.metric(`ramp ${b}`, rp);
    rep.check(`${b}：雾贴着城区边很薄（alpha < 0.35）`, rp && rp.at_0 < .35, JSON.stringify(rp));
    rep.check(`${b}：雾向外变稠（1 城宽处比贴边高 0.3 以上）`, rp && rp['at_1'] > rp.at_0 + .3, JSON.stringify(rp));
    rep.check(`${b}：1.5 城宽外基本吃满（alpha ≥ 0.8，再远只拖出雾）`, rp && rp['at_1.5'] >= .8, JSON.stringify(rp));
  }
  rep.metric('rows', rows);

  /* ---------------- ② 缩放下限与交接 ---------------- */
  await clock(D.page, 'day'); await B.goMap(vf, 'tc_mid'); await B.wait(1300);
  const fl = await vf.evaluate(() => {
    const v = ViewerDebug.osdViewer.viewport;
    v.zoomTo(v.getMinZoom() * .35, v.getCenter(), true); v.applyConstraints(true);
    const b = v.getBounds(true);
    return { min: v.getMinZoom(), w: b.width, frac: 1 / b.width };
  });
  rep.check(`缩到最远：城区仍占视口宽 ${(fl.frac * 100).toFixed(1)}%（≥ ${CITY_MIN * 100}%）`, fl.frac >= CITY_MIN - .01, `视口宽 ${fl.w.toFixed(3)}（下限 ${fl.min}）`);
  await archive('fog-zoom-floor-day', D.page);
  await vf.evaluate(() => window.ScaleHandoffApi.handoffOut());
  await B.wait(2600);
  const back = await vf.evaluate(() => ViewerDebug.currentMapId);
  rep.check('再缩下去交接到世界图（不是雾海里的一小块城）', back === 'world', `currentMapId = ${back}`);
  await archive('fog-handoff-world', D.page);

  /* ---------------- ③ 上层合成（D40） ---------------- */
  const altBox = (on) => vf.evaluate(v => { const b = document.getElementById('tgAltBox'); b.checked = v; b.dispatchEvent(new Event('change', { bubbles: true })); }, on);
  for (const b of ['day', 'night']) {
    await clock(D.page, b); await B.goMap(vf, 'tc_upper'); await B.wait(1600);
    const asp = (await cityBox(vf)).asp;
    await altBox(true); await B.wait(2800);
    const st = await vf.evaluate(() => window.__tierFogProbe.state());
    rep.check(`上层 ${b}：合成三层都在（掩模 + 下一层时段底图 + 高空霾）`, !!(st.comp && st.comp.mask && st.comp.under && st.veil), JSON.stringify(st));
    rep.check(`上层 ${b}：下一层底图跟着当前时段（${b}）`, (b === 'night') === /_night/.test(st.comp?.underSrc || ''), st.comp?.underSrc || '(无)');
    await fit(vf, .62, .5, asp * .5); await B.wait(1900);
    await archive(`fog-composite-upper-${b}`, D.page);
    await fit(vf, 1.3, .5, asp * .5); await B.wait(1900);   // 城区矩形整个在画面里，跨边界才量得到
    const cm = await measure(`composite-${b}`, vf);
    rep.check(`上层 ${b} 合成：外缘没有硬边`, !!cm && cm.m.grad_p50 != null && cm.m.grad_p50 <= GRAD_MAX, cm ? brief(cm.m) : '没量到');
    // 放大到伊甸岛南端（item 11：夜里那里原先有一处亮斑）
    await fit(vf, .11, .5, asp * .652); await B.wait(2100);
    await archive(`fog-composite-upper-${b}-island`, D.page);
    const isl = (await measure(`composite-island-${b}`, vf))?.m;
    rep.metric(`island ${b}`, isl);
    // 夜里南端不许有亮斑：亮像素占比压得住（用户截图 12.webp 是 1.11 %，那是 ~190 的一大团）
    rep.check(`上层 ${b} 岛南端：${b === 'night' ? '夜里没有亮斑（亮于 120 的像素 < 0.5 %）' : '白天只记数'}`,
      !isl || b === 'night' ? isl?.hi_frac < .005 : true, isl ? `>120 占 ${(isl.hi_frac * 100).toFixed(2)} % / p99 ${isl.p99} / max ${isl.max}` : '没量到');
    await altBox(false); await B.wait(1400);
    const off = await vf.evaluate(() => window.__tierFogProbe.state());
    rep.check(`上层 ${b}：关掉开关回到本层底图（合成三层全摘）`, off.comp === null && !off.veil, JSON.stringify(off));
  }

  /* ---------------- ④ 375 px ---------------- */
  const P = await B.newPage('phone');
  const H2 = await openHost(P, { here: '天城执法局总局', ls: { edenMapInject: 'sys' } });
  await H2.open();
  const vf2 = await H2.viewer();
  await clock(P.page, 'night');
  await B.goMap(vf2, 'tc_mid'); await B.wait(1600);
  const c2 = await cityBox(vf2);
  await fit(vf2, null, .5, c2.asp * .5); await B.wait(1900);
  await archive('fog-375-mid-night-out', P.page);
  const m375 = await measure('375-mid-night', vf2);
  if (m375) {
    rep.metric('lum 375 mid night', m375.m);
    rep.check('375 夜里：雾是暗的、紧贴城区边缘、没有硬边',
      m375.m.mist.near.mean < NIGHT_MAX && Math.abs(m375.m.mist.near.mean - m375.m.inside.edge.mean) < HALO_MAX && m375.m.grad_p50 <= GRAD_MAX, brief(m375.m));
  } else rep.check('375 夜里：量到城区矩形', false, '#osd 或第 0 项不在');

  /* ---------------- ⑤ 减少动态 ---------------- */
  const br = await B.browser('chromium');
  const rctx = await br.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', locale: 'zh-CN', reducedMotion: 'reduce' });
  const rpage = await rctx.newPage();
  const H3 = await openHost({ page: rpage, ctx: rctx }, { here: '天城执法局总局', ls: { edenMapInject: 'sys' } });
  await H3.open();
  const vf3 = await H3.viewer();
  await clock(rpage, 'night');
  await B.goMap(vf3, 'tc_upper'); await B.wait(2200);
  const cl = await vf3.evaluate(() => window.__cloudsProbe?.state());
  const filt = await vf3.evaluate(() => { const img = document.querySelector('.cl-drift img'); return img ? getComputedStyle(img).filter : '(no sprite)'; });
  rep.check('减少动态：雾团静布（漂移动画 0 个）但仍按时段调色（不是亮斑）',
    !!cl && cl.rm && cl.drift === 0 && cl.n > 0 && !!filt && filt !== 'none', `云 ${JSON.stringify(cl)}；滤镜 ${filt}`);
  await archive('fog-reduced-motion-night', rpage);
  await rctx.close();

  const noise = e => /Failed to load resource: the server responded with a status of 404/.test(e) || /setPointerCapture/.test(e);
  const errs = [...D.errors, ...P.errors].filter(e => !noise(e));
  rep.check('除已知 404 外无控制台错误', errs.length === 0, errs.slice(0, 4).join(' | '));
} catch (e) {
  rep.check('探针跑完', false, String(e.message).split('\n')[0]);
}
await B.closeAll();
const ok = rep.save();
try { fs.cpSync(OUT, path.join(REV, 'probe'), { recursive: true, filter: s => !s.endsWith('results.json') }); } catch (e) {}
console.log('存档 → ' + REV);
process.exit(ok ? 0 : 1);
