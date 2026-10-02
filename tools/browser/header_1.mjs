// HEADER-1 / NAV-1 probe: one navigation, no duplicates. At 1440 and 375 px: no header locate button, no up button, no (i) button, no floating level strip in 2D,
// the breadcrumb switcher lists the levels and the 3D children (event badge and here-mark inside the menu only), switches by click and by keys,
// the 3D page keeps its floor strip and one locate icon, one status dot, one dots button on the phone, the place pill shows the resolved name.
//   node tools/browser/header_1.mjs [out dir] [--shots dir]
import * as B from './lib.mjs';
const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '/tmp/header_1';
const si = process.argv.indexOf('--shots'), SHOTS = si > 0 ? process.argv[si + 1] : null;
B.quietWait(); await B.ensureServer();
const rep = B.reporter(out);
const T = 60000;
async function run(preset) {
  const P = await B.newPage(preset), p = P.page, tag = `[${preset}]`, shot = n => SHOTS ? B.shot(p, SHOTS, `${n}_${preset}`) : null;
  try {
    await B.openViewer(P, { map: 'tc_upper' }); await B.wait(800);
    const gone = () => p.evaluate(() => ({ hereGo: !!document.getElementById('hereGo'), upBtn: !!document.getElementById('upBtn'), credit: !!document.getElementById('creditBtn'), actHere: !!document.getElementById('actHere'), actClose: !!document.getElementById('actClose'), qlayers: !!document.querySelector('.qlayers'), stripHidden: document.getElementById('layers').hidden, stripButtons: document.querySelectorAll('#layers button').length }));
    for (const id of ['tc_upper', 'tc_mid', 'tc_low']) {
      await p.evaluate(id => ViewerDebug.go(id), id); await p.waitForFunction(id => ViewerDebug.currentMapId === id, id, { timeout: T }); await B.wait(500);
      const g = await gone();
      rep.check(`${tag} ${id}: no locate button / up button / info button / quick-layer row, and no floating strip`, !g.hereGo && !g.upBtn && !g.credit && !g.actHere && !g.actClose && !g.qlayers && g.stripHidden && g.stripButtons === 0, JSON.stringify(g));
      const one = await p.evaluate(() => ({ locate: !!document.getElementById('zHome'), dots: [...document.querySelectorAll('#stDot, #setBtn, #thumbBtn')].filter(e => e.offsetParent !== null).map(e => e.id) }));
      rep.check(`${tag} ${id}: the locate icon is in the zoom column; one status dot at most`, one.locate && one.dots.filter(x => x === 'stDot').length <= (preset === 'phone' ? 1 : 1), JSON.stringify(one));
    }
    // ---- the switcher: levels, 3D children, here-mark and event badge only inside the menu ----
    await p.evaluate(() => { window.EventsView.countOn = id => (id === 'tc_low' ? 2 : 0); document.querySelector('#here').value = '下层'; document.querySelector('#here').dispatchEvent(new Event('input')); });
    await p.evaluate(id => ViewerDebug.go(id), 'tc_mid'); await p.waitForFunction(() => ViewerDebug.currentMapId === 'tc_mid', null, { timeout: T }); await B.wait(500);
    await p.click('#crumbs .cur'); await B.wait(200);
    const m = await p.evaluate(() => ({ open: !document.getElementById('crumbMenu').hidden, expanded: document.querySelector('#crumbs .cur').getAttribute('aria-expanded'),
      levels: [...document.querySelectorAll('#crumbMenu [role=menuitemradio]')].map(b => ({ go: b.dataset.go || null, on: b.getAttribute('aria-checked') === 'true', alt: b.querySelector('small')?.textContent || '', here: !!b.querySelector('.here'), n: b.querySelector('.n')?.textContent || '' })),
      scenes: [...document.querySelectorAll('#crumbMenu [role=menuitem]')].map(b => b.dataset.go), badgeOutside: !!document.querySelector('header .n, #crumbs .n') }));
    const cur = m.levels.filter(l => l.on);
    rep.check(`${tag} the breadcrumb menu lists the levels with altitude, marks the current one, and lists the 3D children`, m.open && m.expanded === 'true' && m.levels.length >= 3 && cur.length === 1 && cur[0].go === null && m.levels.every(l => l.alt) && m.scenes.length >= 1, JSON.stringify(m));
    rep.check(`${tag} the event badge and the here-mark appear in the menu only`, m.levels.some(l => l.n === '2') && !m.badgeOutside, JSON.stringify(m.levels.map(l => [l.go, l.n, l.here])));
    await shot('menu_open');
    await p.click('#crumbMenu [data-go="tc_low"]'); await p.waitForFunction(() => ViewerDebug.currentMapId === 'tc_low', null, { timeout: T });
    rep.check(`${tag} clicking a level switches to it and closes the menu`, await p.evaluate(() => document.getElementById('crumbMenu').hidden && document.querySelector('#crumbs .cur').getAttribute('aria-expanded') === 'false'));
    // keyboard: Enter opens, arrows move, Enter picks, Esc closes
    await B.wait(1200);   // the new map finishes opening (the crumbs are redrawn once more)
    await p.focus('#crumbs .cur'); await p.keyboard.press('Enter'); await B.wait(150);
    const k1 = await p.evaluate(() => ({ open: !document.getElementById('crumbMenu').hidden, focus: document.activeElement?.getAttribute('aria-checked') }));
    await p.keyboard.press('ArrowUp'); await p.keyboard.press('Enter');
    await p.waitForFunction(() => ViewerDebug.currentMapId !== 'tc_low', null, { timeout: T }).catch(() => {});
    const k2 = await p.evaluate(() => ViewerDebug.currentMapId);
    rep.check(`${tag} keyboard: Enter opens with focus in the menu, ArrowUp + Enter switches level`, k1.open && k1.focus === 'true' && k2 === 'tc_mid', JSON.stringify({ k1, k2 }));
    await p.focus('#crumbs .cur'); await p.keyboard.press('Enter'); await B.wait(150); await p.keyboard.press('Escape'); await B.wait(150);
    rep.check(`${tag} Esc closes the menu and returns focus to the crumb`, await p.evaluate(() => document.getElementById('crumbMenu').hidden && document.activeElement?.classList.contains('cur')));
    await p.keyboard.press('PageDown'); await p.waitForFunction(() => ViewerDebug.currentMapId === 'tc_low', null, { timeout: T }).catch(() => {});
    rep.check(`${tag} PageDown still switches level directly`, await p.evaluate(() => ViewerDebug.currentMapId === 'tc_low'));
    // ---- the pill and the unmapped name: drawer 地点 tab has no put-on-map button ----
    await p.evaluate(() => { document.querySelector('#here').value = '不存在的地点乙'; document.querySelector('#here').dispatchEvent(new Event('input')); }); await B.wait(500);
    const um = await p.evaluate(() => ({ pill: !!document.getElementById('unmapped') && !document.getElementById('unmapped').hidden, drawerBtn: !!document.querySelector('#cardEmpty button') }));
    rep.check(`${tag} an unmapped place: the header pill is the one entry, the drawer shows the name without its own button`, um.pill && !um.drawerBtn, JSON.stringify(um));
    await p.evaluate(() => { document.querySelector('#here').value = ''; document.querySelector('#here').dispatchEvent(new Event('input')); });
    // ---- 3D: floors stay, locate icon visible, one dots button on the phone ----
    await p.evaluate(() => ViewerDebug.go('eden_estate')); await p.waitForFunction(() => ViewerDebug.currentMapId === 'eden_estate' && document.querySelectorAll('#layers [data-floor]').length > 1, null, { timeout: 90000 }).catch(() => {});
    await B.wait(800);
    const d3 = await p.evaluate(() => { const vis = e => e && e.offsetParent !== null && getComputedStyle(e).visibility !== 'hidden'; return { floors: document.querySelectorAll('#layers [data-floor]').length, locate: vis(document.getElementById('zHome')), dots: ['setBtn', 'thumbBtn'].filter(i => vis(document.getElementById(i))), hereGo: !!document.getElementById('hereGo'), cur: !!document.querySelector('#crumbs .cur') }; });
    rep.check(`${tag} 3D: the floor strip stays, the locate icon is visible, no header locate button`, d3.floors > 1 && d3.locate && !d3.hereGo, JSON.stringify(d3));
    if (preset === 'phone') rep.check(`${tag} 3D on the phone: one dots button`, d3.dots.length === 1 && d3.dots[0] === 'thumbBtn', JSON.stringify(d3.dots));
    rep.check(`${tag} 3D: the breadcrumb switcher lists the parent's levels (a way back to a tier)`, d3.cur && await p.evaluate(() => window.CrumbMenuApi.levels().length >= 3), JSON.stringify(d3));
    await shot('three_d');
    rep.check(`${tag} no page errors`, !P.errors.filter(e => !/http 404/.test(e)).length, P.errors.slice(0, 3).join(' | '));
  } finally { try { await P.close?.(); } catch (e) { /* closed */ } }
}
try { await run('desktop'); await run('phone'); } finally { await B.closeAll(); }
process.exit(rep.save() ? 0 : 1);
