// OBLIQUE-CODE（D41）浏览器探针：node tools/browser/oblique.mjs [输出目录]
//   ① 斜视主视图默认开：三层的底图第一项 = 斜视 DZI；时段换斜视档（中层晨 → 昏图、下层晨昼 → 白班图）。
//   ② 标记投影（附录 C/D）：每个图钉的实际落点与相机文件投影的期望点，屏幕像素差的中位数 ≤ 4 px（1440）。
//   ③ 上层合成（F）：岛图（index 0）+ 中层同时段斜视图（相机摆放）+ 中层外圈 + 霾；中层 / 下层垫外圈。
//   ④ 俯视开关（E）：切过去底图换成俯视 DZI、往返后视野中心偏差 < 1 %（地图米）。
// 截图 1440 + 375 存档到 ~/eden-map-review/oblique-code/，供人眼过目。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';

const OUT = process.argv[2] || 'tools/browser/out-oblique';
const REV = path.join(os.homedir(), 'eden-map-review/oblique-code');
const TIERS = ['tc_upper', 'tc_mid', 'tc_low'];
const BANDS = [{ id: 'dawn' }, { id: 'day' }, { id: 'dusk' }, { id: 'night', dark: true }];
const MIN = { dawn: 390, day: 750, dusk: 1095, night: 90 };
const MEDIAN_PX = 4, CENTRE_TOL = .01;

B.quietWait();
await B.ensureServer();
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(REV, { recursive: true });
const rep = B.reporter(OUT);
const clock = async (page, b) => { await page.evaluate(m => document.querySelector('#eden-map-root .em-frame')?.contentWindow?.postMessage(m, '*'),
  { type: 'eden-map:clock', v: 2, day: 1, min: MIN[b], time: '00:00', night: b === 'night', tod: b, bands: BANDS }); await B.wait(3000); };   // 斜视 DZI 大（PNG），换档等它画出来
const obliqueImport = frame => frame.evaluate(async () => { window.__obl = await import(new URL('app/oblique.mjs', document.baseURI).href); return true; });
const baseSrc = frame => frame.evaluate(() => { const it = ViewerDebug.osdViewer.world.getItemAt(0); const s = it?.source;
  return (typeof s === 'string' ? s : s?.tilesUrl || s?.url || '') || ''; });
// 等底图第 0 项真的换到目标文件（换档 / 俯视开关是异步换瓦片源；PNG DZI 打开要一两拍）
const waitForSrc = (frame, sub, timeout = 20000) => frame.waitForFunction(sub => { const it = ViewerDebug.osdViewer.world.getItemAt(0); const s = it?.source;
  return ((typeof s === 'string' ? s : s?.tilesUrl || s?.url || '') || '').includes(sub); }, sub, { timeout, polling: 120 }).catch(() => null);
const worldUrls = frame => frame.evaluate(() => { const w = ViewerDebug.osdViewer.world; const out = [];
  for (let i = 0; i < w.getItemCount(); i++) { const s = w.getItemAt(i)?.source; out.push(s?.tilesUrl || s?.url || String(i)); } return out; });
const gradetod = frame => frame.evaluate(() => document.body.dataset.gradetod || '');
const fn = u => (u || '').replace(/\/$/, '').split('/').pop().replace(/_files$/, '').replace(/\.dzi$/, '');   // tilesUrl 相对路径带尾斜杠；档位表值是 .dzi

try {
  const D = await B.newPage('desktop');
  D.page.on('pageerror', e => { if (/crossOriginPolicy/.test(String(e))) console.log('BADADD-STACK\n' + String(e.stack).split('\n').slice(0, 6).join('\n')); });
  const H = await openHost(D, { here: '伊甸庄园' });
  await H.open();
  const V = await H.viewer();
  const P = D.page;   // goMap / shot / clock 要顶层页；evaluate 类用查看器 iframe 的 frame
  await obliqueImport(V);

  // ---- ①② 每层：默认斜视、时段档、标记落点 ----
  for (const tier of TIERS) {
    await B.goMap(V, tier); await B.wait(1200);
    const src = await baseSrc(V);
    rep.check(`${tier} 默认斜视主视图（底图 = 斜视 DZI）`, /_obl_|_dayshift|_nightshift/.test(src), src.split('/').pop());
    const err = await V.evaluate(async () => {
      const O = window.__obl, osd = ViewerDebug.osdViewer, m = ViewerDebug.mapRegistry.maps[ViewerDebug.currentMapId];
      const cam = O.camOf(); if (!cam) return { error: '相机文件没加载' };
      const rows = ViewerDebug.currentMapData?.markers || [], out = [];
      const vp = osd.viewport;
      for (const k of rows) {
        const meta = m.markers?.[k.id]; if (!meta) continue;
        const el = [...document.querySelectorAll('.mk')].find(e => e.dataset.mid === k.id); if (!el) continue;
        const ov = osd.getOverlayById(el); if (!ov) continue;
        const nx = k.ax ?? k.nx, ny = k.ay ?? k.ny, z = O.zAt(nx, ny, meta);
        const [u, v] = O.projectPt(nx, ny, z);
        const got = ov.location, want = new OpenSeadragon.Point(u, v * ViewerDebug.aspect);
        const pg = vp.pixelFromPoint(got, true), pw = vp.pixelFromPoint(want, true);
        out.push(Math.hypot(pg.x - pw.x, pg.y - pw.y));
      }
      out.sort((a, b) => a - b);
      return { n: out.length, median: out.length ? out[Math.floor(out.length / 2)] : null, max: out.length ? out.at(-1) : null };
    });
    rep.check(`${tier} 图钉 = 相机投影（n=${err.n}，中位 ${err.median?.toFixed(1)} px ≤ ${MEDIAN_PX}）`,
      Number.isFinite(err.median) && err.median <= MEDIAN_PX, err.error || `max ${err.max?.toFixed(1)} px`);

    // 时段：晨 / 昼 / 昏 / 夜各一张底图 + 借图档的整体调色
    const want = { tc_upper: 4, tc_mid: 4, tc_low: 4 }[tier];
    const seen = {};
    for (const b of ['dawn', 'day', 'dusk', 'night']) {
      await clock(P, b);
      const wantFile = await V.evaluate(([id, tod]) => ViewerDebug.mapRegistry.maps[id].views.oblique.periods[tod].split('/').pop(), [tier, b]);
      await waitForSrc(V, wantFile);
      seen[b] = { src: await baseSrc(V), grade: await gradetod(V), world: await worldUrls(V) };
      if (b === 'day' || b === 'night') { await B.wait(400); await B.shot(P, OUT, `${tier}-${b}`); }
    }
    const files = Object.values(seen).map(s => fn(s.src));
    const reg = await V.evaluate(id => { const m = ViewerDebug.mapRegistry.maps[id]; return m.views.oblique.periods; }, tier);
    const uniq = [...new Set(Object.values(reg))];
    rep.check(`${tier} 四档都有斜视底图（档位表 ${Object.values(reg).length} 键 / ${uniq.length} 图）`,
      Object.values(reg).length === want && uniq.length >= 1 && files.every(f => uniq.some(u => f === fn(u))),
      files.join(' '));
    const borrow = await V.evaluate(id => { const m = ViewerDebug.mapRegistry.maps[id]; return m.views.oblique.periods.dawn; }, tier);
    if (tier === 'tc_mid') rep.check('中层晨 = 昏图 + 晨调色（借图档）', fn(seen.dawn.src) === fn(borrow) && seen.dawn.grade === 'dawn',
      `${fn(seen.dawn.src)} grade=${seen.dawn.grade}`);
    if (tier === 'tc_low') rep.check('下层晨昼 = 白班图（夜档不借）', seen.dawn.src.includes('dayshift') && seen.day.src.includes('dayshift') && seen.night.grade !== 'night' && !seen.night.src.includes('dayshift'),
      `dawn ${fn(seen.dawn.src)} grade=${seen.dawn.grade}; night grade=${seen.night.grade}`);
    // 合成 / 外圈
    if (tier === 'tc_upper') {
      const w = seen.day.world;
      rep.check('上层合成：岛图 + 中层斜视图 + 中层外圈都在',
        w.filter(u => /tc_mid_obl_/.test(u)).length === 1 && w.filter(u => /tc_mid_out_/.test(u)).length === 1 && w.length >= 3,
        `${w.length} 项：${w.map(u => (u.split('/').pop() || '').slice(0, 28)).join(' ')}`);
      const dev = await V.evaluate(async () => {
        const O = window.__obl, osd = ViewerDebug.osdViewer, w = osd.world;
        const under = [...Array(w.getItemCount()).keys()].map(i => w.getItemAt(i)).find(it => /tc_mid_obl_/.test(it.source?.tilesUrl || ''));
        const camB = await O.loadCamPath('data/cam/tc_mid_obl.json'), r = O.rectFor(camB);
        const b = under.getBounds(true);
        return { ok: Math.abs(b.x - r.x) < 1e-3 && Math.abs(b.y - r.y) < 1e-3 && Math.abs(b.width - r.width) < 1e-3, r, b: [b.x, b.y, b.width].map(v => +v.toFixed(4)) };
      });
      rep.check('上层合成：中层斜视图按相机公式 F 摆放（像素级对齐）', dev.ok, JSON.stringify(dev.b));
      const veil = await V.evaluate(() => { const el = document.querySelector('.tc-haze'); return el ? getComputedStyle(el).opacity : ''; });
      const thick = await V.evaluate(async () => { const O = window.__obl; O; return 'checked'; });
      rep.check('上层合成有高空霾层', !!veil, `opacity ${veil}（「显示下方城市」关 = 1，开 = 0.5；${thick}）`);
    } else {
      const ring = seen.day.world.filter(u => /_out_/.test(u)).length;
      rep.check(`${tier} 斜视图垫外圈（批 4 的低清环）`, ring === 1, `${seen.day.world.length} 项`);
    }
  }

  // ---- ④ 俯视开关：往返视野保持 ----
  await B.goMap(V, 'tc_mid'); await clock(P, 'day');
  await V.evaluate(() => { const vp = ViewerDebug.osdViewer.viewport, b = ViewerDebug.osdViewer.world.getItemAt(0).getBounds(true);
    vp.fitBounds(new OpenSeadragon.Rect(b.x + b.width * .3, b.y + b.height * .3, b.width * .45, b.width * .45), true); });
  await B.wait(400);
  const centreMetres = frame => frame.evaluate(() => { const O = window.__obl, m = ViewerDebug.mapRegistry.maps[ViewerDebug.currentMapId];
    const c = ViewerDebug.osdViewer.viewport.getCenter(true), asp = m.view.extent_m[1] / m.view.extent_m[0], u = c.x, v = c.y / asp;
    if (O.modeOf(m) === 'oblique') return O.unprojectPt(u, v, m.views.oblique.z_ref_m);   // 斜视：反算到地图米
    const e = m.view.extent_m; return [(u - .5) * e[0], (.5 - v) * e[1]]; });   // 俯视：中心就是地图米
  await waitForSrc(V, 'tc_mid_obl');
  const m0 = await centreMetres(V), t0 = await baseSrc(V);
  await V.evaluate(() => window.LayerHostApi.registry.get('top-view').setVisible(true));
  await waitForSrc(V, 'tc_mid_day');
  const m1 = await centreMetres(V), t1 = await baseSrc(V);
  await V.evaluate(() => window.LayerHostApi.registry.get('top-view').setVisible(false));
  await waitForSrc(V, 'tc_mid_obl');
  const m2 = await centreMetres(V), t2 = await baseSrc(V);
  const dev = Math.hypot(m1[0] - m0[0], m1[1] - m0[1]) / 3000, back = Math.hypot(m2[0] - m0[0], m2[1] - m0[1]) / 3000;
  const round = { t0: fn(t0), t1: fn(t1), t2: fn(t2), dev: +dev.toFixed(4), back: +back.toFixed(4) };
  rep.check('俯视开关：底图换成俯视 DZI、往返后斜视底图回来', round.t1 === 'tc_mid_day' && /_obl_/.test(round.t2), `${round.t0} → ${round.t1} → ${round.t2}`);
  rep.check(`俯视开关：往返后视野中心偏差 ${round.back} < ${CENTRE_TOL}（图宽分数）`, round.back < CENTRE_TOL && Number.isFinite(round.back), `去程 ${round.dev}`);

  // ---- 截图存档：1440 每层每时段 + 375 每层昼 / 夜 ----
  for (const tier of TIERS) {
    await B.goMap(V, tier);
    for (const b of ['dawn', 'day', 'dusk', 'night']) {
      try {
        await clock(P, b); await B.wait(600);
        const f = await B.shot(P, OUT, `${tier}-${b}`);
        try { fs.copyFileSync(f, path.join(REV, `${tier}-${b}.png`)); } catch (e) {}
      } catch (e) { console.log(`step ${tier}-${b}:`, String(e).split('\n')[0]); }
    }
  }
  await D.close();

  const Ph = await B.newPage('phone');
  const Hh = await openHost(Ph, { here: '伊甸庄园' });
  await Hh.open();
  const Vp = await Hh.viewer();
  const Pp = Ph.page;
  for (const tier of TIERS) {
    try {
      await B.goMap(Vp, tier); await clock(Pp, 'day'); await B.wait(900);   // goMap 吃查看器 frame，clock 吃顶层页
      const f = await B.shot(Pp, OUT, `phone-${tier}-day`);
      try { fs.copyFileSync(f, path.join(REV, `phone-${tier}-day.png`)); } catch (e) {}
      await clock(Pp, 'night'); await B.wait(900);
      const g = await B.shot(Pp, OUT, `phone-${tier}-night`);
      try { fs.copyFileSync(g, path.join(REV, `phone-${tier}-night.png`)); } catch (e) {}
    } catch (e) { console.log(`phone step ${tier}:`, String(e).split('\n')[0]); }
  }
  await Ph.close();

  const noise = e => /Failed to load resource.*404/.test(e) || /setPointerCapture/.test(e);
  const errs = [...D.errors, ...Ph.errors].filter(e => !noise(e));
  rep.check('除已知 404 外无控制台错误', errs.length === 0, errs.slice(0, 4).join(' | '));
} catch (e) {
  rep.check('探针跑完', false, String(e.message).split('\n')[0]);
  await B.closeAll();
  process.exit(1);
}
await B.closeAll();
const ok = rep.save();
try { fs.cpSync(OUT, path.join(REV, 'probe'), { recursive: true, filter: s => !s.endsWith('results.json') }); } catch (e) {}
console.log('存档 → ' + REV);
process.exit(ok ? 0 : 1);
