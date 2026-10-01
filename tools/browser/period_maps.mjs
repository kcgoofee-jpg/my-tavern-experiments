// I-24 probe: the period base follows the pack's band (dawn / day / dusk / night) on tc_upper; one screenshot per period.
// The world time is set through the host message eden-map:clock (the same message the card script sends: tod = band id, bands = the pack's order).
// node tools/browser/period_maps.mjs [outdir]
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';
import fs from 'node:fs'; import path from 'node:path';
const OUT = process.argv[2] || 'tools/browser/out-period-maps'; fs.mkdirSync(OUT, { recursive: true });
B.quietWait(); await B.ensureServer();
const rep = B.reporter(OUT);
const BANDS = [{ id: 'dawn' }, { id: 'day' }, { id: 'dusk' }, { id: 'night', dark: true }];
const maps = JSON.parse(fs.readFileSync(path.join(B.REPO_ROOT, 'map/data/maps.json'), 'utf8')).maps;
try {
  const D = await B.newPage('desktop');
  const H = await openHost(D, { here: '天城执法局总局', ls: { edenMapInject: 'sys' } });
  await H.open(); const vf = await H.viewer();
  const toViewer = async msg => { await D.page.evaluate(m => { document.querySelector('#eden-map-root .em-frame')?.contentWindow?.postMessage(m, '*'); }, msg); await B.wait(1800); };
  const state = () => vf.evaluate(() => { let s = ''; try { const it = ViewerDebug.osdViewer.world.getItemAt(0)?.source; s = it?.tilesUrl || it?.url || ''; } catch (e) {}
    return { map: ViewerDebug.currentMapId, src: s, tod: document.body.dataset.tod || '', tint: document.body.classList.contains('nighttint'), baseTod: document.body.dataset.baseTod || '', overlay: getComputedStyle(document.getElementById('osd'), '::after').backgroundImage !== 'none' }; });
  await B.goMap(vf, 'tc_upper'); await B.wait(1500);
  const seen = {}, outDir = path.join(process.env.HOME, 'eden-map-review/i24'); fs.mkdirSync(outDir, { recursive: true });
  const hh = { dawn: '06:00', day: '12:00', dusk: '18:00', night: '23:00' };
  for (const b of ['dawn', 'day', 'dusk', 'night']) {
    await toViewer({ type: 'eden-map:clock', v: 2, day: 1, min: +hh[b].slice(0, 2) * 60, time: hh[b], night: b === 'night', tod: b, bands: BANDS });
    const s = await state(); seen[b] = s.src;
    const want = maps.tc_upper.periods[b].replace(/\.dzi$/, '');
    rep.check(`tc_upper ${b}: base is ${maps.tc_upper.periods[b]}`, s.map === 'tc_upper' && s.src.includes(want) && (b !== 'day' || !/_dawn|_dusk|_night/.test(s.src)), JSON.stringify(s));
    rep.check(`tc_upper ${b}: no tint on top of its own base`, !s.tint && !s.overlay && (b === 'day' ? !s.tod : s.tod === b), JSON.stringify(s));
    await B.wait(600); const f = await B.shot(D.page, OUT, `period_${b}`); try { fs.copyFileSync(f, path.join(outDir, `period_${b}.png`)); } catch (e) {}
  }
  rep.check('the loaded tile source differs per period', new Set(Object.values(seen)).size === 4, JSON.stringify(seen));
  // a pack whose bands the map does not know: single base, and the band tint stays
  await toViewer({ type: 'eden-map:clock', v: 2, day: 1, min: 360, time: '06:00', night: false, tod: 'morning', bands: [{ id: 'morning' }, { id: 'evening', dark: true }] });
  const o = await state();
  rep.check('custom band the map has no file for: back to the single base', o.src.includes('tc_upper') && !o.baseTod && !/_dawn|_dusk|_night/.test(o.src), JSON.stringify(o));
} catch (e) { rep.check('probe ran', false, String(e.message).split('\n')[0]); }
await B.closeAll();
process.exit(rep.save() ? 0 : 1);
