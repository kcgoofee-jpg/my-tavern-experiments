// UI-COH-1 probe (docs/ui-coherence.md §6): one chrome. Computed styles — rail / stack buttons share radius, size and icon stroke,
// no bordered icon boxes inside the strips, one badge class, the phone dock is one strip, the loaded state hides its text,
// the phone breadcrumb uses the free width. Also takes the before / after screenshot set (2D upper night, 2D mid day, 3D, settings, drawer; 1440 + 375).
//   node tools/browser/ui_coh.mjs [out dir] [--shots dir]
import * as B from './lib.mjs';
const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '/tmp/ui_coh';
const si = process.argv.indexOf('--shots'), SHOTS = si > 0 ? process.argv[si + 1] : null;
B.quietWait(); await B.ensureServer();
const rep = B.reporter(out);
const T = 60000;
const clock = (p, tod) => p.evaluate(async t => {   // standalone: host messages are not accepted, drive the period directly
  const msg = { type: 'eden-map:clock', v: 2, day: 1, min: t === 'night' ? 1380 : 600, time: t === 'night' ? '23:00' : '10:00', night: t === 'night', tod: t === 'night' ? 'night' : 'day', bands: [{ id: 'dawn' }, { id: 'day' }, { id: 'dusk' }, { id: 'night', dark: true }] };
  const pl = await import('/app/plugins.mjs'); pl.plugins?.CustomNamesView?.setClock?.(msg);
  const ms = await import('/app/map-switch.mjs'); ms.applyPeriod();
}, tod);
const round = v => Math.round(parseFloat(v) * 10) / 10;
const styles = page => page.evaluate(() => {
  const round = v => Math.round(parseFloat(v) * 10) / 10, cs = e => e ? getComputedStyle(e) : null, vis = e => e && e.offsetParent !== null;
  const btn = sel => [...document.querySelectorAll(sel)].filter(vis).map(e => { const c = cs(e), i = e.querySelector('svg');
    return { r: round(c.borderRadius), w: round(e.getBoundingClientRect().width), h: round(e.getBoundingClientRect().height),
      bw: c.borderTopWidth + '/' + c.borderBottomWidth, sw: i ? getComputedStyle(i).strokeWidth : '', iw: i ? round(getComputedStyle(i).width) : '' }; });
  return {
    zoom: btn('#zoom button'), rail: btn('.uis.rail[data-state="peek"] .uis-tabs [role=tab]'), sheetTabs: btn('.uis[data-mode="sheet"] .uis-tabs [role=tab]'),
    dockBtns: btn('#dock > button, #dock .btn'), dock: (() => { const d = document.getElementById('dock'), c = cs(d); return d ? { r: round(c.borderRadius), bg: c.backgroundImage === 'none' && c.backgroundColor !== 'rgba(0, 0, 0, 0)', pad: round(c.paddingTop) } : null; })(),
    badges: [...document.querySelectorAll('.bdg')].length, otherBadges: [...document.querySelectorAll('[class*="badge"], [class*="bdg"]')].filter(e => !e.classList.contains('bdg') && !e.querySelector('.bdg') && !e.classList.contains('bdg new')).length,
    togText: (() => { const t = document.querySelector('.uis .uis-tog .t'); if (!t) return 'none'; const c = cs(t); return c.display === 'none' ? 'hidden' : 'visible'; })(),
    crumbFlex: (() => { const b = document.querySelector('#crumbs b'); return b ? round(cs(b).flexGrow) : null; })(),
    tierOk: (() => { const t = document.getElementById('tierState'); t.className = 'ok'; const c = cs(t); const r = { pos: c.position, w: round(c.width) }; t.className = ''; return r; })(),
    plIcon: (() => { const b = document.querySelector('[data-tab="pl"]'); const d = b?.querySelector('svg path')?.getAttribute('d') || ''; if (!window.UIIcon) return d.slice(0, 12);
      const first = n => UIIcon.P[n].match(/d="([^"]+)"/)[1]; return d === first('room') ? 'room' : d === first('pin') ? 'pin' : 'other'; })(),
  };
});
async function run(preset) {
  const P = await B.newPage(preset), p = P.page, tag = `[${preset}]`, shot = n => SHOTS ? B.shot(p, SHOTS, `${n}_${preset}`) : null;
  try {
    await B.openViewer(P, { map: 'tc_upper' }); await B.wait(800);
    await clock(p, 'night'); await B.wait(1500); await shot('2d_upper_night');
    const s1 = await styles(p);
    rep.check(`${tag} zoom strip: every button same radius, size, no border box, 1.75 stroke, 20 px icon`,
      s1.zoom.length >= 3 && s1.zoom.every(b => b.r === s1.zoom[0].r && b.w === s1.zoom[0].w && b.bw === '0px/0px' && b.sw === '1.75px' && b.iw === 20), JSON.stringify(s1.zoom));
    rep.check(`${tag} the loaded state hides its text (dot only)`, s1.tierOk.pos === 'absolute' && s1.tierOk.w === 1, JSON.stringify(s1.tierOk));
    // events + characters: the drawer (rail on desktop, sheet on the phone) appears
    await p.evaluate(() => { EventsView.set({ type: 'eden-map:events', items: [{ id: 'e1', name: '晚宴', floor: 140, kind: 'social' }], floor: 140 }); CharactersView?.set?.({ type: 'eden-map:chars', items: [], floor: 140 }); });
    await B.wait(600);
    const s2 = await styles(p);
    if (preset === 'desktop') rep.check(`${tag} collapsed rail: bare icon buttons (no border box) with the shared size`, s2.rail.length >= 1 && s2.rail.every(b => b.bw === '0px/0px' && b.w === s2.rail[0].w), JSON.stringify(s2.rail));
    else rep.check(`${tag} sheet tabs: bare (no border box)`, s2.sheetTabs.length >= 1 && s2.sheetTabs.every(b => b.bw === '0px/0px'), JSON.stringify(s2.sheetTabs));
    rep.check(`${tag} the places tab carries the building glyph, not the map pin`, s2.plIcon === 'room', s2.plIcon);
    rep.check(`${tag} one badge class (.bdg)`, s2.badges >= 0 && s2.otherBadges === 0, JSON.stringify({ badges: s2.badges, other: s2.otherBadges }));
    if (preset === 'phone') {
      rep.check(`${tag} the phone dock is one strip and its buttons are bare`, s2.dock && s2.dock.r === 14 && s2.dock.bg && s2.dockBtns.length >= 1 && s2.dockBtns.every(b => b.bw === '0px/0px'), JSON.stringify({ dock: s2.dock, btns: s2.dockBtns }));
      rep.check(`${tag} the drawer toggle is icon-only (words in aria-label)`, s2.togText === 'hidden', s2.togText);
      rep.check(`${tag} the last crumb uses the free width`, s2.crumbFlex === 1, String(s2.crumbFlex));
    }
    await p.evaluate(() => ViewerDrawer.setTab('ev', 'half')); await B.wait(500); await shot('drawer_open');
    await p.keyboard.press('Escape');
    // 2D mid day
    await p.evaluate(() => ViewerDebug.go('tc_mid')); await p.waitForFunction(() => ViewerDebug.currentMapId === 'tc_mid', null, { timeout: T }); await clock(p, 'day'); await B.wait(1500); await shot('2d_mid_day');
    // settings home
    await (preset === 'desktop' ? p.click('#setBtn') : p.click('#thumbBtn')); await B.wait(600); await shot('settings_home');
    await p.keyboard.press('Escape'); await B.wait(300);
    // 3D
    await p.evaluate(() => ViewerDebug.go('eden_estate')); await p.waitForFunction(() => document.querySelectorAll('#layers [data-floor]').length > 1, null, { timeout: 90000 }).catch(() => {});
    await B.wait(1000); await shot('3d_estate');
    rep.check(`${tag} no page errors`, !P.errors.filter(e => !/http 404/.test(e)).length, P.errors.slice(0, 3).join(' | '));
  } finally { try { await P.close?.(); } catch (e) { /* closed */ } }
}
await run('desktop'); await run('phone');
process.exit(rep.save() ? 0 : 1);
