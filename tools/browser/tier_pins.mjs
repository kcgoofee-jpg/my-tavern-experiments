// TIER-1 probe: on every tier a pin stays on the image point under it (offset 0 +- 1 px) during a programmatic pan and 2 s after,
// and the upper night view with the "show city below" base is tinted (that base has no period images).
//   node tools/browser/tier_pins.mjs [out dir]
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';
import fs from 'node:fs';
const OUT = process.argv[2] || '/tmp/tier_pins'; fs.mkdirSync(OUT, { recursive: true });
B.quietWait(); await B.ensureServer();
const rep = B.reporter(OUT);
const BANDS = [{ id: 'dawn' }, { id: 'day' }, { id: 'dusk' }, { id: 'night', dark: true }];
const SHOT = process.env.SHOT_DIR || '';
// pin screen offset from the image point it started on: the pin's viewport point is read once, then projected back to the screen after the pan
const offsets = vf => vf.evaluate(() => {
  const v = ViewerDebug.osdViewer, box = v.container.getBoundingClientRect(), R = [];
  for (const el of document.querySelectorAll('.mk')) { const w = el.querySelector('.mki') || el, r = w.getBoundingClientRect();
    if (!r.width || el.hidden || getComputedStyle(el).visibility === 'hidden') continue;
    const x = r.left + r.width / 2 - box.left, y = r.bottom - box.top;
    if (x < 0 || y < 0 || x > box.width || y > box.height) continue;
    R.push({ id: el.textContent.trim().slice(0, 12), x, y, vp: v.viewport.pointFromPixel(new OpenSeadragon.Point(x, y)) }); }
  window.__pins0 = R; return R.length; });
const drift = vf => vf.evaluate(() => {
  const v = ViewerDebug.osdViewer, box = v.container.getBoundingClientRect(); let max = 0, n = 0;
  for (const p of window.__pins0) { const el = [...document.querySelectorAll('.mk')].find(e => e.textContent.trim().slice(0, 12) === p.id); if (!el) continue;
    const w = el.querySelector('.mki') || el, r = w.getBoundingClientRect(), want = v.viewport.pixelFromPoint(p.vp, true);
    const ex = r.left + r.width / 2 - box.left, ey = r.bottom - box.top; max = Math.max(max, Math.hypot(ex - want.x, ey - want.y)); n++; }
  return { max: +max.toFixed(2), n }; });
try {
  const D = await B.newPage('desktop');
  const H = await openHost(D, { here: '天城执法局总局', ls: { edenMapInject: 'sys' } });
  await H.open(); const vf = await H.viewer();
  const toViewer = async msg => { await D.page.evaluate(m => { document.querySelector('#eden-map-root .em-frame')?.contentWindow?.postMessage(m, '*'); }, msg); await B.wait(1800); };
  const metrics = {};
  for (const id of ['tc_upper', 'tc_mid', 'tc_low']) {
    await B.goMap(vf, id); await B.wait(2500);
    const n = await offsets(vf);
    rep.check(`${id}: pins on screen to measure`, n >= 1, `n=${n}`);
    // pan: three animated pans in different directions, sampled mid-flight and 2 s after
    let worstMid = 0;
    for (const [dx, dy] of [[.05, .02], [-.07, .03], [.02, -.06]]) {
      await vf.evaluate(([dx, dy]) => ViewerDebug.osdViewer.viewport.panBy(new OpenSeadragon.Point(dx, dy), false), [dx, dy]);
      for (let k = 0; k < 4; k++) { await B.wait(80); const d = await drift(vf); worstMid = Math.max(worstMid, d.max); }
      if (SHOT && id === 'tc_upper') await B.shot(D.page, SHOT, `upper_midpan_${worstMid > 1 ? 'before' : 'after'}`);
    }
    await B.wait(2000); const post = await drift(vf);
    metrics[id] = { mid: worstMid, after: post.max, n: post.n };
    rep.check(`${id}: pin offset from its image point 0 +- 1 px during a pan`, worstMid <= 1, `max ${worstMid} px`);
    rep.check(`${id}: pin offset 2 s after the pan 0 +- 1 px`, post.max <= 1, `max ${post.max} px over ${post.n} pins`);
  }
  rep.metric('pin_drift_px', metrics); console.log('METRICS', JSON.stringify(metrics));
  // upper night + city below: tinted
  await B.goMap(vf, 'tc_upper'); await B.wait(1500);
  await toViewer({ type: 'eden-map:clock', v: 2, day: 1, min: 23 * 60, time: '23:00', night: true, tod: 'night', bands: BANDS });
  const st = () => vf.evaluate(() => ({ tint: document.body.classList.contains('nighttint'), baseTod: document.body.dataset.baseTod || '', tod: document.body.dataset.tod || '', alt: document.getElementById('tgAltBox')?.checked,
    overlay: getComputedStyle(document.getElementById('osd'), '::after').backgroundImage !== 'none' }));
  const own = await st();
  rep.check('upper night, own night image: no extra tint (unchanged)', !own.tint && own.baseTod === 'night', JSON.stringify(own));
  await vf.evaluate(() => { const b = document.getElementById('tgAltBox'); if (b && !b.checked) b.click(); }); await B.wait(2500);
  const city = await st();
  rep.check('upper night with the city-below base: tinted', city.alt && city.tint && !city.baseTod && city.overlay, JSON.stringify(city));
  if (SHOT) await B.shot(D.page, SHOT, 'upper_city_night');
  await vf.evaluate(() => { const b = document.getElementById('tgAltBox'); if (b && b.checked) b.click(); }); await B.wait(2000);
  const back = await st();
  rep.check('city-below off again: back to the night image, no extra tint', !back.tint && back.baseTod === 'night', JSON.stringify(back));
  // the flag is uniform: every tier with period images carries it
  const maps = JSON.parse(fs.readFileSync(B.REPO_ROOT + '/map/data/maps.json', 'utf8')).maps;
  rep.check('x-tint flag on every tier that has period images', ['tc_upper', 'tc_mid', 'tc_low'].every(k => maps[k].tint === 'period' && Object.keys(maps[k].periods || {}).length === 4), '');
} catch (e) { rep.check('probe ran', false, String(e.message).split('\n')[0]); }
await B.closeAll();
process.exit(rep.save() ? 0 : 1);
