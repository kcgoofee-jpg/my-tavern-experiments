// LEGEND-1 probe (D35): the estate section view has no kind plate meshes and no #kinds colour key, a selected room shows the neutral outline highlight,
// the room card has no colour chip, and the 2D drawer of the first pack has no legend tab.
//   node tools/browser/legend1.mjs [out dir]     (shots: B1 section, upper tier drawer; copy them to ~/eden-map-review/legend-1/)
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';

const OUT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '/tmp/legend1';
const rep = B.reporter(OUT);
B.quietWait();
const srv = await B.ensureServer();
const until = async (fn, ms = 6000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return v; await B.wait(150); } };
try {
  const P = await B.newPage('desktop', { tier: 'save', scheme: 'dark' });
  try {
    const H = await openHost(P, { here: '伊甸庄园·主调教室', msgs: [], chat: 'lg1' }); await H.open(); const vf = await H.viewer();
    await B.wait(1500);
    const tabs = await vf.evaluate(() => ({ btn: !!document.querySelector('#evbar .lgtab') && !document.querySelector('#evbar .lgtab').hidden, pane: !!document.getElementById('legendPane') && !!document.querySelector('#legendPane').offsetParent }));
    rep.check('2D: the drawer has no visible legend tab for the first pack', !tabs.btn && !tabs.pane, JSON.stringify(tabs));
    await B.shot(P.page, OUT, 'upper-drawer');
    await vf.evaluate(() => ViewerDebug.go('eden_estate'));
    const ef = await until(async () => { const el = await vf.$('#estate'); const fr = el && await el.contentFrame(); return fr && await fr.evaluate(() => !!window.__estate && window.__estateFirstFrame === true).catch(() => false) ? fr : null; }, 20000);
    if (!ef) throw new Error('no estate frame');
    await B.wait(1500);
    await until(() => vf.evaluate(() => !!document.querySelector('#layers [data-floor="B1"]')), 8000);
    await vf.evaluate(() => document.querySelector('#layers [data-floor="B1"]').click()); await B.wait(3500);
    const st = await ef.evaluate(() => ({ plates: window.__estate.plates(), kinds: !!document.getElementById('kinds'), kc: document.querySelectorAll('.kc').length }));
    rep.check('3D B1 section: no plate meshes, no #kinds, no colour chip', st.plates.on === false && st.plates.meshes === 0 && !st.kinds && st.kc === 0, JSON.stringify(st));
    await ef.evaluate(() => window.__estate.pick('主调教室')); await B.wait(1200);
    const hi = await ef.evaluate(() => window.__estate.hi());
    rep.check('3D B1 section: a selected room shows the neutral outline highlight', hi.pin === true, JSON.stringify(hi));
    const chip = await vf.evaluate(() => document.querySelectorAll('#card .kc').length);
    rep.check('the room card has no colour chip', chip === 0, String(chip));
    await B.shot(P.page, OUT, 'b1-section');
  } catch (e) { rep.check('probe ran', false, e.message.split('\n')[0]); }
  await P.close();
} finally { await B.closeAll(); srv.stop(); }
const ok = rep.save(); console.log(ok ? 'all passed' : 'failures'); process.exit(ok ? 0 : 1);
