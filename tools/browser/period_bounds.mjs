// N10-P0 probe: the period base image is placed by the view's extent, whatever the DZI pixel size.
// For tc_upper / tc_mid / tc_low x dawn / day / dusk / night: open the map at that period (initial load), read the OSD base item
// bounds and assert they equal the view extent (width 1, height extent_m[1] / extent_m[0], tolerance 0.5 %), the base fills the
// view's frame and every marker element lies inside the image's on-screen rect; then switch day -> night -> day (and back) in place and re-assert.
// Also: every period DZI keeps the view's shape, the zoom limit after an in-place switch equals the one after a fresh open, and a clock
// change that lands while a map is still opening ends on the clock's period. One screenshot per case into ~/eden-map-review/n10/.   node tools/browser/period_bounds.mjs [outdir]
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';
import fs from 'node:fs'; import path from 'node:path';
import { aspectDrift } from '../../map/core/base-frame.mjs';
const OUT = process.argv[2] || 'tools/browser/out-period-bounds'; fs.mkdirSync(OUT, { recursive: true });
const SHOTS = path.join(process.env.HOME, 'eden-map-review/n10'); fs.mkdirSync(SHOTS, { recursive: true });
B.quietWait(); await B.ensureServer();
const rep = B.reporter(OUT);
const BANDS = [{ id: 'dawn' }, { id: 'day' }, { id: 'dusk' }, { id: 'night', dark: true }];
const HH = { dawn: 360, day: 720, dusk: 1080, night: 1380 };
const MAPS = ['tc_upper', 'tc_mid', 'tc_low'], TOL = 0.005;
const maps = JSON.parse(fs.readFileSync(path.join(B.REPO_ROOT, 'map/data/maps.json'), 'utf8')).maps;
const maxZ = {};   // map|band -> max zoom after a fresh open; an in-place switch must land on the same limit
const near = (a, b) => Math.abs(a - b) <= TOL * Math.max(1, Math.abs(b));
try {
  const D = await B.newPage(process.env.PRESET || 'desktop');
  const H = await openHost(D, { here: '天城执法局总局', ls: { edenMapInject: 'sys' } });
  await H.open(); const vf = await H.viewer();
  const clock = async b => { await D.page.evaluate(m => { document.querySelector('#eden-map-root .em-frame')?.contentWindow?.postMessage(m, '*'); },
    { type: 'eden-map:clock', v: 2, day: 1, min: HH[b], time: `${String(HH[b] / 60 | 0).padStart(2, '0')}:00`, night: b === 'night', tod: b, bands: BANDS }); await B.wait(1500); };
  const read = () => vf.evaluate(() => {
    const v = ViewerDebug.osdViewer, it = v.world.getItemAt(0), s = it?.source, vp = v.viewport;
    const r = x => { const q = vp.viewportToViewerElementRectangle(x), o = v.container.getBoundingClientRect(); return { x: q.x + o.x, y: q.y + o.y, w: q.width, h: q.height }; };
    const b = it.getBounds(), img = r(b);
    const mk = [...document.querySelectorAll('.mk, .ev, .realm')].filter(e => e.offsetParent !== null).map(e => { const q = e.getBoundingClientRect(); return { n: e.dataset.name || e.className, cx: q.x + q.width / 2, cy: q.y + q.height / 2 }; });
    return { map: ViewerDebug.currentMapId, count: v.world.getItemCount(), src: s?.tilesUrl || s?.url || '', px: [s?.dimensions?.x, s?.dimensions?.y], bounds: [b.x, b.y, b.width, b.height], img, mk };
  });
  const check = async (label, map, band, fresh) => {
    await B.wait(900);
    const s0 = await read(), ex = maps[map].view.extent_m, want = ex[1] / ex[0];
    const okB = s0.map === map && s0.count >= 1 && near(s0.bounds[0], 0) && near(s0.bounds[1], 0) && near(s0.bounds[2], 1) && near(s0.bounds[3], want);   // U-FIX-12: the oblique composite adds world items; the base is item 0
    rep.check(`${label}: base bounds = extent`, okB, `src=${s0.src} px=${s0.px} bounds=${s0.bounds.map(n => +n.toFixed(4))} want h=${want}`);
    rep.check(`${label}: DZI keeps the view shape`, aspectDrift(ex, s0.px) <= TOL, `px=${s0.px} extent=${ex}`);
    const mz = await vf.evaluate(() => ViewerDebug.osdViewer.viewport.getMaxZoom(true)), key = `${map}|${band}`;
    if (fresh) maxZ[key] = mz; else rep.check(`${label}: zoom limit as after a fresh open`, !(key in maxZ) || near(mz, maxZ[key]), `now=${mz} fresh=${maxZ[key]}`);
    await vf.evaluate(() => ViewerDebug.osdViewer.viewport.goHome(true)); await B.wait(700);
    const s = await read();
    const pad = 1, out = s.mk.filter(m => m.cx < s.img.x - pad || m.cx > s.img.x + s.img.w + pad || m.cy < s.img.y - pad || m.cy > s.img.y + s.img.h + pad);
    rep.check(`${label}: every marker inside the image (${s.mk.length})`, s.mk.length > 0 && out.length === 0, out.slice(0, 3).map(m => `${m.n}@${m.cx | 0},${m.cy | 0}`).join(' ') + ` img=${[s.img.x, s.img.y, s.img.w, s.img.h].map(Math.round)}`);
    const f = label.replace(/\W+/g, '_'); await B.shot(D.page, OUT, f); try { fs.copyFileSync(path.join(OUT, f + '.png'), path.join(SHOTS, f + '.png')); } catch (e) {}
  };
  // initial load at each period (clock first, then open the map from elsewhere)
  for (const band of ['dawn', 'day', 'dusk', 'night']) {
    await clock(band);
    for (const map of MAPS) { await B.goMap(vf, 'world'); await B.wait(500); await B.goMap(vf, map); await check(`${map} ${band} load`, map, band, true); }
  }
  // in-place switches: day -> night -> day, and dawn -> dusk -> day
  for (const map of MAPS) {
    await clock('day'); await B.goMap(vf, 'world'); await B.goMap(vf, map);
    for (const band of ['night', 'day', 'dusk', 'dawn', 'day']) { await clock(band); await check(`${map} switch ${band}`, map, band, false); }
  }
  // the clock changes while the map is still opening: the map ends on the clock's period, in its frame
  for (const map of MAPS) for (const d of [0, 40, 120, 300]) {
    await clock('night'); await B.goMap(vf, 'world'); await B.wait(500);
    vf.evaluate(id => ViewerDebug.go(id), map).catch(() => {}); await B.wait(d);
    await D.page.evaluate(m => { document.querySelector('#eden-map-root .em-frame')?.contentWindow?.postMessage(m, '*'); },
      { type: 'eden-map:clock', v: 2, day: 1, min: HH.day, time: '12:00', night: false, tod: 'day', bands: BANDS });
    await B.wait(4500);
    const s = await read(), file = (maps[map].views?.top?.periods || maps[map].periods || {}).day?.replace(/\.dzi$/, '') || '';   // U-FIX-12: periods moved to views.top.periods
    // U-FIX-12: the base may be the flat per-period DZI or the per-period oblique composite now sitting in its place (tc_low's is 「dayshift」)
    const isDay = s.src.includes(file) || /_obl_(day|dayshift)_/.test(s.src);
    rep.check(`${map} race +${d}ms: ends on day, one base, in frame`, s.map === map && s.count >= 1 && isDay && near(s.bounds[2], 1) && near(s.bounds[3], maps[map].view.extent_m[1] / maps[map].view.extent_m[0]), JSON.stringify({ src: s.src, n: s.count, b: s.bounds }));
  }
} catch (e) { rep.check('probe ran', false, String(e.stack || e.message).split('\n').slice(0, 3).join(' | ')); }
await B.closeAll();
process.exit(rep.save() ? 0 : 1);
