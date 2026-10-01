// S7-2 T8 probe (R0: P4-9): every button, switch, tab and link in the 2D shell and with the estate view open has a non-empty accessible name; menu buttons say aria-haspopup / aria-expanded.
// page.accessibility is gone from current Playwright, so the name is computed here the way the accessible-name algorithm orders it: aria-labelledby, aria-label, an associated label, the content (text and
// the title / aria-label of an inner image or svg), alt, title. Runs in the tavern host stub (host page + viewer frame + 3D frame), desktop and phone.
//   node tools/browser/a11y_tree.mjs [out dir]
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';

const OUT = process.argv[2] || '/tmp/a11y_tree';
const rep = B.reporter(OUT);
B.quietWait();
const srv = await B.ensureServer();
const audit = (fr, scope = 'body') => fr.evaluate(scope => {
  const vis = e => { if (!e.isConnected || e.closest('[hidden], [aria-hidden="true"], [inert]')) return false; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const txt = e => e.getAttribute('aria-labelledby') ? e.getAttribute('aria-labelledby').split(/\s+/).map(i => document.getElementById(i)?.textContent || '').join(' ').trim() : '';
  const name = e => {
    let n = txt(e) || (e.getAttribute('aria-label') || '').trim(); if (n) return n;
    if (e.labels?.length) { n = [...e.labels].map(l => l.textContent).join(' ').trim(); if (n) return n; }
    n = (e.textContent || '').replace(/\s+/g, ' ').trim(); if (n) return n;
    for (const c of e.querySelectorAll('[aria-label], img[alt], svg title')) { n = (c.getAttribute('aria-label') || c.getAttribute('alt') || c.textContent || '').trim(); if (n) return n; }
    return (e.getAttribute('title') || e.getAttribute('alt') || e.getAttribute('value') || '').trim();
  };
  const sel = 'button, a[href], input:not([type=hidden]):not([type=range]), select, textarea, [role=button], [role=switch], [role=tab], [role=menuitem], [role=checkbox], summary';
  const bad = [], total = [...document.querySelector(scope).querySelectorAll(sel)].filter(vis);
  for (const e of total) if (!name(e)) bad.push((e.id ? '#' + e.id : e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0]) + (e.closest('[id]')?.id ? ' in #' + e.closest('[id]').id : ''));
  const menus = [...document.querySelectorAll('[aria-haspopup]')].filter(vis).filter(e => !e.hasAttribute('aria-expanded')).map(e => e.id || e.className);
  return { n: total.length, bad: bad.slice(0, 12), nbad: bad.length, menusMissing: menus };
}, scope);
try {
  for (const [w, preset] of [['1440', 'desktop'], ['375', 'phone']]) {
    const P = await B.newPage(preset, { tier: 'save', scheme: 'dark' });
    try {
      const H = await openHost(P, { here: '天城·中层·大学', chat: 'a11y' }); await H.open(); const vf = await H.viewer();
      await vf.evaluate(() => ViewerDebug.go('tc_mid')); await B.wait(2500);
      const host = await audit(P.page, '#eden-map-root'), view = await audit(vf);
      rep.check(`${w}: 2D shell, host page: every button / switch / tab / link has a name`, host.nbad === 0, JSON.stringify(host));
      rep.check(`${w}: 2D shell, viewer: every button / switch / tab / link has a name`, view.nbad === 0, JSON.stringify(view));
      await vf.evaluate(() => { SettingsApi.open('adv'); }); await B.wait(500); await vf.evaluate(() => { const c = document.querySelector('#optEdit'); if (c && !c.checked) c.click(); }); await B.wait(500);
      await vf.evaluate(() => { ViewerDrawer.set('half'); ViewerDebug.showSet(false); }); await B.wait(600);
      const edit = await vf.evaluate(() => { const b = document.getElementById('editMore'), bar = document.getElementById('editBar'); return { has: !!b, popup: b?.getAttribute('aria-haspopup'), expanded: b?.getAttribute('aria-expanded'), bar: !!bar }; });
      rep.check(`${w}: the edit menu button has aria-haspopup and aria-expanded${preset === 'desktop' ? ' (folds only on phones: the bar itself is the control group)' : ''}`, edit.has && edit.popup === 'true' && edit.expanded !== null, JSON.stringify(edit));
      await vf.evaluate(() => { const c = document.querySelector('#optEdit'); if (c?.checked) c.click(); }); await B.wait(300);
      await vf.evaluate(() => ViewerDebug.go('eden_estate')); await B.wait(7000);
      const v2 = await audit(vf), ef = await (await vf.$('#estate'))?.contentFrame(), est = ef ? await audit(ef) : { n: 0, nbad: 1, bad: ['no estate frame'] };
      rep.check(`${w}: estate view open: viewer and 3D page controls all have names`, v2.nbad === 0 && est.nbad === 0 && est.n > 0, JSON.stringify({ viewer: v2, estate: est }));
      rep.check(`${w}: no page errors`, P.errors.filter(e => !/404|favicon/.test(e)).length === 0, P.errors.slice(0, 3).join(' | '));
    } finally { await P.close(); }
  }
} catch (e) { rep.check('probe ran to the end', false, String(e.message).split('\n')[0]); }
rep.save(); await B.closeAll(); srv.stop();
process.exit(0);
