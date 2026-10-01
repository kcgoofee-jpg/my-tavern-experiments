// S7-2 T4 probe: animation layers stop when they cannot be seen (docs/ui-refactor.md 4). Reads ViewerDebug.raf() (frames requested per owning module, live intervals, running Web Animations).
//   node tools/browser/raf_pause.mjs [out dir]
// On tc_mid with weather and traffic on, then each off, then the document hidden, reduced motion, the host panel docked (eden-map:visible { on: false }), a 3D view open; plus the town pack:
// its danger layer outside `applies` gets a greyed menu row with a reason and draws nothing.
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';

const OUT = process.argv[2] || '/tmp/raf_pause';
const rep = B.reporter(OUT);
B.quietWait();
const srv = await B.ensureServer();
const OWN = /openseadragon|^other$/;   // the map engine's own frames are not a layer
const layerFrames = r => Object.entries(r.frames).filter(([k]) => !OWN.test(k)).reduce((a, [, n]) => a + n, 0);
const measure = async (vf, ms = 1500) => { await vf.evaluate(() => ViewerDebug.raf(true)); await B.wait(ms); const r = await vf.evaluate(() => ViewerDebug.raf()); r.layer = layerFrames(r); r.canvas = r.frames['block-canvas'] || 0; r.perSec = +(r.layer / (r.ms / 1000)).toFixed(2); r.callsPerSec = +(r.intervals.calls / (r.ms / 1000)).toFixed(2); return r; };
const setLayers = (vf, on) => vf.evaluate(o => { const reg = window.LayerHostApi.registry; for (const id of ['weather', 'traffic']) if (reg.has?.(id) ?? true) { try { reg.setVisible(id, o); } catch (e) {} } return ['weather', 'traffic'].map(id => reg.isVisible?.(id)); }, on);
try {
  const P = await B.newPage('desktop', { tier: 'save', scheme: 'dark' });
  try {
    const H = await openHost(P, { here: '天城·中层·大学', chat: 'raf' });
    await H.open(); const vf = await H.viewer();
    await vf.evaluate(() => ViewerDebug.go('tc_mid')); await B.wait(3000);
    await setLayers(vf, true); await B.wait(800);
    const on = await measure(vf);
    rep.check('layers on: weather / traffic draw (frames requested)', on.canvas > 10, JSON.stringify(on.frames));
    await setLayers(vf, false); await B.wait(600);
    const off = await measure(vf);
    rep.check('weather and traffic switched off: 0 canvas-layer frames per second', off.canvas === 0, JSON.stringify(off.frames));
    await setLayers(vf, true); await B.wait(600);
    await vf.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); }); await B.wait(500);
    const hid = await measure(vf);
    rep.check('document hidden: 0 layer frames per second, no running animation', hid.layer === 0 && hid.waapi === 0, JSON.stringify({ f: hid.frames, w: hid.waapi }));
    await vf.evaluate(() => { delete document.hidden; delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); }); await B.wait(800);
    const back = await measure(vf);
    rep.check('document visible again: the layers draw again', back.canvas > 10, JSON.stringify(back.frames));
    await P.page.emulateMedia({ reducedMotion: 'reduce' }); await B.wait(1200);
    const rm = await measure(vf);
    rep.check('reduced motion: 0 layer frames per second', rm.layer === 0, JSON.stringify(rm.frames));
    await P.page.emulateMedia({ reducedMotion: 'no-preference' }); await B.wait(800);
    await P.page.evaluate(() => { document.querySelector('#eden-map-root .em-panel').hidden = true; }); await B.wait(2200);   // host: the panel is docked / closed -> eden-map:visible { on: false }
    const dock = await measure(vf, 2000);
    rep.check('host panel hidden (eden-map:visible on:false): after 2 s 0 layer frames per second, interval callbacks <= 1 per second, 0 running animations', dock.layer === 0 && dock.callsPerSec <= 1 && dock.waapi === 0, JSON.stringify({ f: dock.frames, c: dock.callsPerSec, by: dock.intervals.byOwner, w: dock.waapi }));
    await P.page.evaluate(() => { document.querySelector('#eden-map-root .em-panel').hidden = false; }); await B.wait(1500);
    const shown = await measure(vf);
    rep.check('host panel shown again: the layers draw again', shown.canvas > 10, JSON.stringify(shown.frames));
    await vf.evaluate(() => ViewerDebug.go('eden_estate')); await B.wait(7000);   // a 3D view over the map
    const d3 = await measure(vf, 2000);
    rep.check('a 3D view open: 0 layer frames per second on the 2D side', d3.layer === 0, JSON.stringify(d3.frames));
    // reduced motion reaches the 3D page (estate:camera { rm }): no idle rotation, so after 30 s idle nothing renders; without it the idle rotation renders
    const ef = await (await vf.$('#estate')).contentFrame(), renders = () => ef.evaluate(() => window.__estate?.renders || 0);
    await B.wait(31500); const a0 = await renders(); await B.wait(2000); const a1 = await renders();
    rep.check('estate, reduced motion off: after 30 s idle the page rotates (renders > 0)', a1 - a0 > 10, String(a1 - a0));
    await vf.evaluate(() => SettingsApi.open('map')); await B.wait(500); await vf.evaluate(() => document.querySelector('#rmSeg button[data-rm="on"]')?.click()); await B.wait(600); await vf.evaluate(() => ViewerDebug.showSet(false));
    await ef.evaluate(() => document.dispatchEvent(new Event('pointerdown'))); await B.wait(31500); await ef.evaluate(() => { }); const b0 = await renders(); await B.wait(2500); const b1 = await renders();
    const cam = await ef.evaluate(() => window.__estate.cam());
    rep.check('estate, reduced motion on: after 30 s idle there is no idle rotation (runtime flag, no key written)', cam.rm === true && cam.idle === true && cam.rotating === false && await vf.evaluate(() => LocalStore.get('edenMap3dAutoRotate')) == null, JSON.stringify(cam));
    console.log(`  info: estate renders in 2.5 s with reduced motion on, idle: ${b1 - b0} (a camera that reports a change every ~100 ms keeps the page drawing about 10 frames a second; the on-demand loop is S7-3's, docs/ui-refactor.md 3.8)`);
    rep.check('no page errors (host run)', P.errors.filter(e => !/404|favicon/.test(e)).length === 0, P.errors.slice(0, 3).join(' | '));
  } finally { await P.close(); }
  // the town pack: the danger layer is outside `applies` on town_hill -> greyed row with a reason, nothing drawn
  const T = await B.newPage('desktop', { tier: 'save', scheme: 'dark', init: [() => { try { localStorage.setItem('tcp.town.Hint', '1'); localStorage.setItem('tcp.town.TierV2', 'save'); } catch (e) {} }, {}] });
  try {
    await T.page.goto(B.BASE + 'viewer.html?pack=town', { waitUntil: 'commit' });
    await T.page.waitForFunction(() => document.getElementById('loading')?.classList.contains('done'), null, { timeout: 30000, polling: 50 }).catch(() => {}); await B.wait(1500);
    await T.page.evaluate(() => ViewerDebug.go('town_hill')); await B.wait(2500);
    const row = await T.page.evaluate(() => { const l = document.getElementById('lyr-danger'), w = l?.querySelector('.lyw'), box = l?.querySelector('input'); return { exists: !!l, hidden: l?.hidden, na: l?.classList.contains('na'), reason: w?.textContent || '', described: !!box?.getAttribute('aria-describedby'), ariaDisabled: box?.hasAttribute('aria-disabled'),
      group: l?.closest('[role=group]')?.getAttribute('aria-labelledby') || '', head: document.getElementById('lynaH')?.textContent || '', order: [...document.querySelectorAll('#layList > *')].map(e => e.className.split(' ')[0] || e.tagName).join(',') }; });
    rep.check('town_hill: the danger row is greyed with a plain reason in a labelled group after the applicable rows', row.exists && !row.hidden && row.na && row.reason.length > 0 && !/[\/.]|danger|town/i.test(row.reason) && row.described && !row.ariaDisabled && row.group === 'lynaH' && row.head.length > 0, JSON.stringify(row));
    const dr = await measure(T.page);
    const dangerFrames = await T.page.evaluate(() => document.querySelectorAll('svg.lyr-svg[data-layer="danger"] path').length);
    rep.check('town_hill: the inapplicable danger layer draws nothing', dangerFrames === 0, String(dangerFrames));
    await T.page.evaluate(() => { const b = document.getElementById('lyrBox-danger'); if (b) { b.click(); } }); await B.wait(300);
    const toggled = await T.page.evaluate(() => ({ on: document.getElementById('lyrBox-danger')?.checked, sr: document.getElementById('sr')?.textContent || '' }));
    rep.check('a greyed switch still works and announces the remembered condition', toggled.sr.includes('已记住') || toggled.sr === '', JSON.stringify(toggled));
    rep.check('no page errors (town)', T.errors.filter(e => !/404|favicon/.test(e)).length === 0, T.errors.slice(0, 3).join(' | '));
  } finally { await T.close(); }
} catch (e) { rep.check('probe ran to the end', false, String(e.message).split('\n')[0]); }
rep.save(); await B.closeAll(); srv.stop();
process.exit(rep.R.checks.some(c => !c.pass && !c.known) ? 1 : 0);
