// S7-3 T8 probe (P4-2): the keyboard path through the 3D building, keys only. Upper tier -> the building's marker (Enter) -> its card -> 「3D 查看」 (Enter) -> the level strip: B1 (Enter) ->
// a room from the drawer's room list (Enter) -> its card -> the people tab: a person (Enter) -> the person's card -> Esc steps back (card, then the 2D map). No mouse event reaches the page.
//   node tools/browser/estate_kbd.mjs [out dir]
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';

const OUT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '/tmp/estate_kbd';
const rep = B.reporter(OUT);
B.quietWait();
const srv = await B.ensureServer();
const WHO = '艾琳', MSGS = [{ message_id: 1, message: `<span style="display:none">⌖人物 ${WHO} @ 伊甸庄园·主调教室</span>` }];
const until = async (fn, ms = 8000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return v; await B.wait(150); } };
try {
  const P = await B.newPage('desktop', { tier: 'save', scheme: 'dark' });
  try {
    const pg = P.page;
    await pg.addInitScript(() => { window.__mouse = 0; for (const t of ['mousedown', 'mouseup', 'click', 'pointerdown', 'mousemove']) addEventListener(t, e => { if (e.isTrusted && (e.pointerType === 'mouse' || e.type.startsWith('mouse') || e.type === 'click' && e.detail > 0)) window.__mouse++; }, true); });
    const H = await openHost(P, { here: '天城·上层', msgs: MSGS, chat: 'kbd' }); await H.open(); const vf = await H.viewer();
    await vf.evaluate(() => ViewerDebug.go('tc_upper')); await B.wait(3500); await pg.evaluate(() => { window.__mouse = 0; });   // opening the stub's panel clicked; the walk below is keys only
    const key = async k => { await pg.keyboard.press(k); await B.wait(500); };
    const focus = (sel, text) => vf.evaluate(([s, t]) => { const e = [...document.querySelectorAll(s)].find(x => !t || (x.dataset.name || x.textContent).includes(t)); if (!e) return false; e.focus(); return document.activeElement === e; }, [sel, text || '']);
    rep.check('the building\'s marker takes keyboard focus', await focus('.mk', '伊甸庄园'), '');
    await key('Enter');
    rep.check('Enter opens the building\'s place card', await until(() => vf.evaluate(() => !document.getElementById('card').hidden && /伊甸庄园/.test(document.getElementById('cardTitle').textContent))), '');
    const enter = await vf.evaluate(() => [...document.querySelectorAll('#card [data-go]')].map(a => a.textContent.trim()));
    rep.check('the card has the one primary action 「3D 查看」', enter.includes('3D 查看'), enter.join('|'));
    await focus('#card [data-go]', '3D 查看'); await key('Enter');
    const ef = await until(async () => { const el = await vf.$('#estate'); const fr = el && await el.contentFrame(); return fr && await fr.evaluate(() => window.__estateFirstFrame === true).catch(() => false) ? fr : null; }, 60000);
    rep.check('Enter on 「3D 查看」 opens the 3D building', !!ef, '');
    await B.wait(1500);
    rep.check('the level strip takes focus on B1 and Enter selects it', await focus('#layers [data-floor]', 'B1'), '');
    await key('Enter'); await B.wait(1200);
    const mode = await ef.evaluate(() => window.__estate.mode());
    rep.check('the page shows the B1 section', mode === 1, String(mode));
    await vf.evaluate(() => { const S = window.ViewerDrawer; S.setTab('pl', 'half'); document.querySelectorAll('#cardEmpty .v3rooms details').forEach(d => d.setAttribute('open', '')); });
    await B.wait(400);
    rep.check('a room of the list takes focus; Enter opens its card', await focus('#cardEmpty .v3room', '体能训练室'), '');
    await key('Enter');
    rep.check('the room card is open and titled with the room', await until(() => vf.evaluate(() => !document.getElementById('card').hidden && document.getElementById('cardTitle').textContent.includes('体能训练室'))), '');
    await vf.evaluate(() => document.querySelector('#evbar .chtab').click()); await B.wait(500);
    rep.check('a person of the people tab takes focus; Enter opens the person card in place', await focus('#evbar .chpane .chgo', WHO), '');
    await key('Enter'); await B.wait(900);
    const pc = await vf.evaluate(() => ({ title: document.getElementById('cardTitle')?.textContent, map: ViewerDebug.currentMapId, shown: !document.getElementById('card').hidden }));
    rep.check('the person card is open and the viewer is still in the 3D building', pc.shown && pc.title.includes(WHO) && pc.map === 'eden_estate', JSON.stringify(pc));
    await key('Escape');
    rep.check('Esc closes the card first', await vf.evaluate(() => document.getElementById('card').hidden && ViewerDebug.currentMapId === 'eden_estate'), '');
    for (let i = 0; i < 4 && (await vf.evaluate(() => ViewerDebug.currentMapId)) === 'eden_estate'; i++) await key('Escape');
    rep.check('Esc steps back up to the 2D map', await until(() => vf.evaluate(() => ViewerDebug.currentMapId !== 'eden_estate'), 6000), String(await vf.evaluate(() => ViewerDebug.currentMapId)));
    rep.check('no mouse event fired during the whole walk', (await pg.evaluate(() => window.__mouse)) === 0 && (await vf.evaluate(() => window.__mouse || 0)) === 0, '');
  } catch (e) { rep.check('run', false, String(e?.message || e).split('\n')[0]); }
  await P.close();
} finally { await B.closeAll(); srv.stop(); }
const ok = rep.save(); console.log(ok ? '全部通过' : '有失败'); process.exit(ok ? 0 : 1);
