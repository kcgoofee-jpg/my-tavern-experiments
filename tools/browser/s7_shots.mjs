// S7 review screenshot set (docs/ui-refactor.md §8.2, states 1, 4-10, 12), taken inside the tavern host stub so the host bar and the AI link page exist.
//   node tools/browser/s7_shots.mjs <out-dir> [--only 01,04,...]
// Names: <1440|375>-<dark|light>-<nn>-<state>.png.  1 = map default (three events), 2 = layer popover / page, 3 = drawer half (events, people), 11 / 11b = estate exterior, B1 section and the props viewer, 4 = settings home, 5 = map page, 6 = AI link collapsed,
// 7 = AI link with the status-line and AI advisor cards open, 8 = data page, 9 = update page, 10 = P1 notice with three actions, 12 = phone only: edit mode on, drawer at half.
// Pages that a tree does not have yet (an older base) fall back to the page that held the same rows, so the set can be taken on both sides of a change.
// Uses only lib.mjs helpers and the host stub (host_stub.mjs): states 4-10 and 12 are in-tavern shots, never the standalone viewer.
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';
import fs from 'node:fs';

const OUT = process.argv[2];
if (!OUT || OUT.startsWith('--')) { console.log('usage: node tools/browser/s7_shots.mjs <out-dir> [--only 01,04,...]'); process.exit(2); }
const oi = process.argv.indexOf('--only'), ONLY = oi > 0 ? new Set(process.argv[oi + 1].split(',')) : null;
const want = nn => !ONLY || ONLY.has(nn);
const EV = ['⌖火灾｜中层·大学｜3｜实验楼起火', '⌖盗窃｜下层·7号井｜2｜失窃', '⌖巡空令｜上层·伊甸｜1｜巡空'];
const MSGS = EV.map((m, i) => ({ message_id: i + 1, message: m }));
fs.mkdirSync(OUT, { recursive: true });
B.quietWait();
const srv = await B.ensureServer();
const errs = [], done = [];

const hasPage = (vf, pg) => vf.evaluate(p => !!document.querySelector(`#setPop .spage[data-page="${p}"]`), pg);
const openPage = async (vf, pg, fallback) => { const use = await hasPage(vf, pg) ? pg : fallback; await vf.evaluate(p => SettingsApi.open(p), use); await B.wait(700); return use; };
const closeSet = vf => vf.evaluate(() => { ViewerDebug.showSet(false); ViewerDebug.closeCard?.(); });

try {
  for (const [w, preset] of [['1440', 'desktop'], ['375', 'phone']]) for (const scheme of ['dark', 'light']) {
    const P = await B.newPage(preset, { tier: 'save', scheme });
    const tag = `${w}-${scheme}`, snap = async (nn, name) => { await B.shot(P.page, OUT, `${tag}-${nn}-${name}`); done.push(`${tag}-${nn}-${name}`); };
    try {
      const H = await openHost(P, { here: '天城·中层·大学', msgs: MSGS, chat: 's7-' + tag, vars: {} });
      await H.open(); const vf = await H.viewer();
      await vf.evaluate(() => { try { ViewerDebug.go('tc_mid'); } catch (e) {} }); await B.wait(2500);
      if (want('01')) { await snap('01', 'map-default'); }
      if (want('02')) {   // layer popover (a layer outside its `applies` is greyed with a reason); on the phone the 地图与图层 page opens instead
        await vf.evaluate(() => document.getElementById('layBtn').click()); await B.wait(700); await snap('02', preset === 'phone' ? 'layers-page' : 'layers-popover'); await closeSet(vf); await vf.evaluate(() => ViewerDebug.showLay(false)); await B.wait(300);
      }
      if (want('03')) {   // drawer half on events, then on people
        await vf.evaluate(() => { ViewerDrawer.setTab('ev'); ViewerDrawer.set('half'); }); await B.wait(700); await snap('03', 'drawer-events');
        await vf.evaluate(() => { ViewerDrawer.setTab('ch'); ViewerDrawer.set('half'); }); await B.wait(700); await snap('03', 'drawer-people'); await vf.evaluate(() => ViewerDrawer.set('peek')); await B.wait(300);
      }
      if (want('04')) { await openPage(vf, 'home', 'home'); await snap('04', 'settings-home'); }
      if (want('05')) { await openPage(vf, 'map', 'display'); await snap('05', 'settings-map'); }
      if (want('06') || want('07')) {
        const pg = await openPage(vf, 'ai', 'data');
        if (want('06')) { await B.wait(800); await snap('06', 'ai-collapsed'); }
        if (want('07')) {
          await vf.evaluate(() => { for (const id of ['state', 'nav']) document.querySelector(`#setPop [data-card="${id}"]`)?.setAttribute('open', ''); document.querySelector('#setPop [data-card="nav"]')?.scrollIntoView({ block: 'center' }); }); await B.wait(500);
          await snap('07', pg === 'ai' ? 'ai-cards-open' : 'th-rows-base');
        }
      }
      if (want('08')) { await openPage(vf, 'data', 'data'); await snap('08', 'settings-data'); }
      if (want('09')) { await openPage(vf, 'update', 'update'); await snap('09', 'settings-update'); }
      if (want('10')) {
        await closeSet(vf);
        await vf.evaluate(() => showNotice({ key: 's7n', level: 1, title: '有新构建', lines: ['刷新酒馆页面即可使用'], actions: [{ label: '更新说明' }, { label: '稍后' }, { label: '立即刷新', primary: true }] })); await B.wait(900);
        await snap('10', 'notice-p1'); await vf.evaluate(() => { try { showNotice.dismiss?.('s7n'); } catch (e) {} document.querySelectorAll('.nt-p1 .nt-x').forEach(b => b.click()); }); await B.wait(300);
      }
      if (want('11')) {   // the estate page (exterior, then the B1 section) and the generic props viewer, in the shell
        await closeSet(vf); await vf.evaluate(() => ViewerDebug.go('eden_estate')); await B.wait(7000); await snap('11', 'estate-exterior');
        const ef = await (await vf.$('#estate'))?.contentFrame(); if (ef) { await ef.evaluate(() => window.__estate?.setMode('B1')).catch(() => {}); await B.wait(2500); await snap('11b', 'estate-section-b1'); }
        await vf.evaluate(() => ViewerDebug.go('dairy')); await B.wait(7000); await snap('11', 'props-viewer'); await vf.evaluate(() => ViewerDebug.go('tc_mid')); await B.wait(3000);
      }
      if (want('12') && preset === 'phone') {
        await closeSet(vf); await openPage(vf, 'adv', 'adv');
        await vf.evaluate(() => { const c = document.querySelector('#optEdit'); if (c && !c.checked) c.click(); }); await B.wait(400);
        await closeSet(vf); await vf.evaluate(() => { ViewerDrawer.setTab('ev'); ViewerDrawer.set('half'); }); await B.wait(700);
        await snap('12', 'edit-mode-drawer-half');
        await vf.evaluate(() => { const c = document.querySelector('#optEdit'); if (c?.checked) c.click(); });
      }
    } catch (e) { console.log('  failed', tag, e.message.split('\n')[0]); errs.push(tag + ': ' + e.message.split('\n')[0]); }
    errs.push(...P.errors.filter(e => !/404|favicon/.test(e)).map(e => tag + ' ' + e)); await P.close();
  }
} finally { await B.closeAll(); srv.stop(); }
fs.writeFileSync(OUT + '/README.txt', 'S7 review shots (tools/browser/s7_shots.mjs): ' + done.length + ' files\n' + done.join('\n') + '\n');
console.log(done.length, 'shots ->', OUT, errs.length ? '\nproblems: ' + errs.slice(0, 8).join(' | ') : '\nno problems');
