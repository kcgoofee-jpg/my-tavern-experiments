// S7-2 T4 probe (R0: P6-4): frame times while panning and zooming with the glass chrome on screen. Desktop preset, 4x CPU throttle, tc_mid, weather and traffic on, the zoom column, level strip and
// layer popover open; a scripted pan (3 s) plus two zooms. Reports rAF interval p95 / p99, frames > 33 ms (%) and long tasks > 50 ms, then the same with html.noblur.
// Targets: p95 <= 20 ms, p99 <= 33 ms (one 60 Hz frame pair = 33.3), dropped <= 5 %, no task > 50 ms; glass vs noblur p95 difference <= 2 ms.  --json prints one JSON line (for before / after comparisons on another tree).
//   node tools/browser/pan_frame.mjs [out dir] [--json]
import * as B from './lib.mjs';

const OUT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '/tmp/pan_frame', JSON_ONLY = process.argv.includes('--json');
const rep = B.reporter(OUT);
B.quietWait();
const srv = await B.ensureServer();
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
const run = async (page, noblur) => {
  await page.evaluate(nb => document.documentElement.classList.toggle('noblur', nb), noblur); await B.wait(500);
  const r = await page.evaluate(async () => {
    const v = ViewerDebug.osdViewer, ts = [], long = []; let on = true;
    try { new PerformanceObserver(l => { for (const e of l.getEntries()) long.push(Math.round(e.duration)); }).observe({ entryTypes: ['longtask'] }); } catch (e) {}
    const loop = t => { ts.push(t); if (on) requestAnimationFrame(loop); }; requestAnimationFrame(loop);
    const t0 = performance.now(); let z1 = false, z2 = false;
    while (performance.now() - t0 < 3200) {
      const k = (performance.now() - t0) / 3200;
      if (!z1 && k > .33) { z1 = true; v.viewport.zoomBy(1.4); } if (!z2 && k > .66) { z2 = true; v.viewport.zoomBy(1 / 1.4); }
      v.viewport.panBy(new OpenSeadragon.Point(Math.cos(k * 12) * .004, Math.sin(k * 12) * .004));
      await new Promise(r => requestAnimationFrame(r));
    }
    on = false; return { ts, long };
  });
  const d = r.ts.slice(1).map((t, i) => t - r.ts[i]);
  return { p95: +pct(d, .95).toFixed(1), p99: +pct(d, .99).toFixed(1), dropped: +(100 * d.filter(x => x > 33).length / Math.max(1, d.length)).toFixed(1), longTasks: r.long.filter(x => x > 50).length, frames: d.length };
};
try {
  const P = await B.newPage('desktop', { tier: 'save', scheme: 'dark' });
  try {
    await B.openViewer(P, { map: 'tc_mid' }); await B.wait(2500);
    const cdp = await P.ctx.newCDPSession(P.page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await P.page.evaluate(() => { const reg = window.LayerHostApi.registry; for (const id of ['weather', 'traffic']) { try { reg.setVisible(id, true); } catch (e) {} } document.getElementById('layBtn')?.click(); }); await B.wait(1500);
    await run(P.page, false);   // warm-up (the first run pays for tile decoding and layer set-up and is thrown away)
    const glass = await run(P.page, false), flat = await run(P.page, true);
    const out = { glass, noblur: flat, delta: +(glass.p95 - flat.p95).toFixed(1) };
    if (JSON_ONLY) console.log(JSON.stringify(out));
    else {
      console.log(JSON.stringify(out));
      rep.check('pan / zoom: p95 <= 20 ms, p99 <= 33 ms (one 60 Hz frame pair = 33.3), dropped <= 5 %, no task > 50 ms (glass)', glass.p95 <= 20 && glass.p99 <= 33.4 && glass.dropped <= 5 && glass.longTasks === 0, JSON.stringify(glass));
      rep.check('glass vs noblur: p95 difference <= 2 ms', out.delta <= 2, JSON.stringify(out));
      rep.metric('pan_frame', out);
    }
  } finally { await P.close(); }
} catch (e) { rep.check('probe ran to the end', false, String(e.message).split('\n')[0]); }
if (!JSON_ONLY) rep.save(); await B.closeAll(); srv.stop();
process.exit(0);
