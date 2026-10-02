// S7-2 probe: hit rectangles, switches, the blur budget, click-through of the info button, the layer popover on phones, the one top bar (docs/ui-refactor.md 2.2, 5, 7.3, T5, T8).
//   node tools/browser/s7_hit.mjs [out dir] [--labels]       --labels: only the map-label checks (tiers, caps, overlaps, declutter time)
// Runs inside the tavern host stub (openHost) at 1440 and 375; every check prints a line; a case that reproduces a bug on an untouched tree prints ✗ there and ✓ after the fix.
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';

const args = process.argv.slice(2), LABELS = args.includes('--labels'), OUT = args.find(a => !a.startsWith('--')) || '/tmp/s7_hit';
const rep = B.reporter(OUT);
B.quietWait();
const srv = await B.ensureServer();
const pages = ['home', 'map', 'people', 'ai', 'data', 'update', 'license', 'adv'];

const switchRects = async (vf, tag) => {
  const bad = [];
  for (const pg of pages) {
    const r = await vf.evaluate(async p => { SettingsApi.open(p); await new Promise(r => setTimeout(r, 500)); const page = document.querySelector(`#setPop .spage[data-page="${p}"]`); if (!page || page.hidden) return { skip: true };
      document.querySelectorAll('#setPop details[data-card]').forEach(d => d.setAttribute('open', ''));
      return { rows: [...page.querySelectorAll('input[role=switch]')].map(i => { const b = i.getBoundingClientRect(), row = page.getBoundingClientRect(); return { id: i.id, w: Math.round(b.width), h: Math.round(b.height), inside: b.left >= row.left - 1 && b.right <= row.right + 1, shown: i.offsetParent !== null }; }) }; }, pg);
    if (r.skip) continue;
    for (const s of r.rows) if (s.shown && (s.w < 36 || s.h < 20 || !s.inside)) bad.push(`${pg}/${s.id || '?'} ${s.w}x${s.h}${s.inside ? '' : ' outside'}`);
  }
  const keys = await vf.evaluate(async () => { SettingsApi.open('adv'); await new Promise(r => setTimeout(r, 500)); const i = document.getElementById('optKeys'); if (!i) return null; const b = i.getBoundingClientRect(), row = i.closest('label')?.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), shown: i.offsetParent !== null, rowW: Math.round(row?.width || 0), labelLines: Math.round((i.closest('label')?.querySelector('span')?.getBoundingClientRect().height || 0) / 17) }; });
  rep.check(`${tag}: B2 the 单字母快捷键 switch (#optKeys) is visible inside its row`, !!keys && keys.shown && keys.w >= 30 && keys.h >= 18, JSON.stringify(keys));
  rep.check(`${tag}: every switch in every settings page has a visible rect >= 36 x 20 inside its row`, bad.length === 0, bad.slice(0, 60).join('; '));
};
const blur = vf => vf.evaluate(() => { const hits = []; let area = 0; const vw = innerWidth * innerHeight;
  for (const e of document.querySelectorAll('*')) { const cs = getComputedStyle(e), bf = cs.backdropFilter || cs.webkitBackdropFilter; if (bf && bf !== 'none') { const r = e.getBoundingClientRect(); if (r.width && r.height && e.offsetParent !== null) { hits.push(e.id || e.className.toString().slice(0, 20) || e.tagName); area += r.width * r.height; } } }
  return { n: hits.length, hits, pct: +(100 * area / vw).toFixed(1) }; });

// the map-label check (docs/ui-refactor.md 2.6): on tc_upper and tc_mid default views >= 5 L1 names visible and 0 overlapping label boxes; the declutter pass is short
const labelCheck = async (vf, tag, map) => {
  await vf.evaluate(m => ViewerDebug.go(m), map); await B.wait(3500);
  await vf.evaluate(() => { ViewerDebug.closeCard?.(); }); await B.wait(900);
  const r = await vf.evaluate(() => { const vis = e => { const l = e.querySelector('.lab'); if (!l || e.classList.contains('lhide')) return null; const cs = getComputedStyle(l); if (cs.visibility === 'hidden' || +cs.opacity < .15) return null; const b = l.getBoundingClientRect(); return b.width && b.right > 0 && b.left < innerWidth && b.bottom > 0 && b.top < innerHeight ? b : null; };
    const all = [...document.querySelectorAll('.mk')], shown = all.map(e => [e, vis(e)]).filter(x => x[1]), l1 = shown.filter(([e]) => e.classList.contains('l1'));
    let overlaps = 0; const rs = shown.map(x => x[1]); for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) { const a = rs[i], b = rs[j]; if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) overlaps++; }
    const onScreen = all.filter(e => { const b = e.querySelector('.pin')?.getBoundingClientRect(); return b && b.width && b.right > 0 && b.left < innerWidth && b.bottom > 0 && b.top < innerHeight; }).length;
    return { markers: all.length, onScreen, shown: shown.length, l1: l1.length, l1Names: l1.slice(0, 6).map(([e]) => e.dataset.name), overlaps, ms: +(ViewerDebug.declutterMs || 0).toFixed(2) }; });
  rep.check(`${tag} ${map}: >= 5 L1 names visible (or every marker on screen when fewer are in the default view), 0 overlapping label boxes, declutter <= 3 ms`, r.l1 >= Math.min(5, r.onScreen) && r.overlaps === 0 && r.ms <= 3, JSON.stringify(r));
};
try {
  if (LABELS) for (const [w, preset] of [['1440', 'desktop'], ['375', 'phone']]) {
    const P = await B.newPage(preset, { tier: 'save', scheme: 'dark', init: [() => { try { localStorage.setItem('edenMapFog', '0'); } catch (e) {} }, {}] });   // fog of war off: labels of unvisited places are hidden by design
    try { const H = await openHost(P, { here: '天城·中层·大学', chat: 's7lab' }); await H.open(); const vf = await H.viewer(); for (const m of ['tc_upper', 'tc_mid']) await labelCheck(vf, w, m); } finally { await P.close(); }
  }
  if (!LABELS) for (const [w, preset] of [['1440', 'desktop'], ['375', 'phone']]) {
    const P = await B.newPage(preset, { tier: 'save', scheme: 'dark' });
    try {
      const H = await openHost(P, { here: '天城·中层·大学', chat: 's7hit' }); await H.open(); const vf = await H.viewer();
      await vf.evaluate(() => ViewerDebug.go('tc_mid')); await B.wait(2500);
      await switchRects(vf, w);
      await vf.evaluate(() => ViewerDebug.showSet(false)); await B.wait(300);
      // the layer action: wherever it opens, > 0 visible rows, and the info button is not covered
      await vf.evaluate(() => { document.getElementById('layBtn').click(); }); await B.wait(600);
      const lay = await vf.evaluate(() => { const lp = document.getElementById('layPop'), sp = document.getElementById('setPop'), ci = document.querySelector('#crumbs .cur'); const vis = e => e && !e.hidden && e.getClientRects().length > 0;
        const popRows = vis(lp) ? [...lp.querySelectorAll('label.tg')].filter(l => l.offsetParent).length : 0, setRows = vis(sp) ? [...sp.querySelectorAll('#layList label.tg')].filter(l => l.offsetParent).length : 0;
        const r = ci.getBoundingClientRect(), top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { popOpen: vis(lp), setOpen: vis(sp), popRows, setRows, infoCovered: !(top === ci || ci.contains(top)) && vis(lp) }; });
      rep.check(`${w}: the layer action opens a list with > 0 visible rows (${preset === 'phone' ? 'the 地图与图层 page' : 'the popover'}), never an empty popover; the crumb switcher is not covered`, (lay.popOpen ? lay.popRows > 0 : lay.setOpen && lay.setRows > 0) && !lay.infoCovered && (preset !== 'phone' || (!lay.popOpen && lay.setOpen)), JSON.stringify(lay));
      await vf.evaluate(() => { ViewerDebug.showLay(false); ViewerDebug.showSet(false); }); await B.wait(300);
      // the crumb switcher: the centre hits the control, a click opens its menu and does not reach the map (no card opens)
      const info = await vf.evaluate(async () => { const ci = document.querySelector('#crumbs .cur'); if (!ci) return { none: true }; const r = ci.getBoundingClientRect(), top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        let osdClicks = 0; const h = () => { osdClicks++; }; document.getElementById('osd').addEventListener('click', h, true); ci.click(); await new Promise(r => setTimeout(r, 300)); document.getElementById('osd').removeEventListener('click', h, true);
        const opened = ci.getAttribute('aria-expanded') === 'true'; if (opened) ci.click();
        return { hit: top === ci || ci.contains(top), opened, card: document.getElementById('card')?.hidden === false, w: Math.round(r.width), h: Math.round(r.height) }; });
      rep.check(`${w}: the crumb switcher is hit at its centre, opens its menu and opens no card`, info.none || (info.hit && info.opened && !info.card), JSON.stringify(info));
      // the blur budget
      const bl = await B.shot ? await (async () => { const a = await blur(vf), h = await P.page.evaluate(() => { let n = 0, area = 0; const vw = innerWidth * innerHeight; for (const e of document.querySelectorAll('*')) { const cs = getComputedStyle(e), bf = cs.backdropFilter || cs.webkitBackdropFilter; if (bf && bf !== 'none' && e.offsetParent !== null) { const r = e.getBoundingClientRect(); n++; area += r.width * r.height; } } return { n, pct: +(100 * area / vw).toFixed(1) }; }); return { viewer: a, host: h }; })() : null;
      const n = bl.viewer.n + bl.host.n, pct = bl.viewer.pct + bl.host.pct;
      rep.check(`${w}: blur budget: <= 4 blurred elements, <= 12 % of the viewport${preset === 'phone' ? ', 0 at the phone preset (coarse pointer)' : ''}`, preset === 'phone' ? n === 0 : n <= 4 && pct <= 12, JSON.stringify(bl));
      // Esc closes in order: card -> popover -> drawer (half -> peek); the keys , and 1 / 2 / 3 work behind edenMapKeys
      if (preset === 'desktop') {
        const esc = await (async () => {
          await vf.evaluate(() => { LocalStore.set('edenMapKeys', '1'); document.querySelector('.mk')?._open?.(); document.getElementById('layBtn').click(); ViewerDrawer.set('half'); }); await B.wait(500);
          const st = () => vf.evaluate(() => ({ card: !document.getElementById('card').hidden, pop: !document.getElementById('layPop').hidden, drawer: ViewerDrawer.state }));
          const s0 = await st(); const seq = [s0];
          for (let i = 0; i < 3; i++) { await vf.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))); await B.wait(350); seq.push(await st()); }
          return seq; })();
        const [a0, a1, a2, a3] = esc;
        rep.check('1440: Esc closes the card first (its drawer page goes back to peek with it), then the popover', a0.card && a0.pop && !a1.card && a1.pop && !a2.pop && a2.drawer === 'peek', JSON.stringify(esc));
        await vf.evaluate(() => { ViewerDebug.showLay(false); }); 
        const keys = await vf.evaluate(async () => { LocalStore.set('edenMapKeys', '1'); document.dispatchEvent(new KeyboardEvent('keydown', { key: ',', bubbles: true })); await new Promise(r => setTimeout(r, 400)); return !document.getElementById('setPop').hidden; });
        rep.check('1440: the key , opens settings behind edenMapKeys', keys, String(keys)); await vf.evaluate(() => ViewerDebug.showSet(false));
      }
      if (preset === 'phone') {   // every interactive element has a 44 x 44 hit area (its box plus pseudo-element growth), and nothing else sits on that area
        const hitProbe = fr => fr.evaluate(() => {
          const sel = 'button, a[href], input:not([type=hidden]), select, summary, [role=button], [role=tab], [role=switch], .mk, .ev';
          const bad = [];
          for (const e of document.querySelectorAll(sel)) {
            if (e.closest('[hidden], [inert]') || !e.isConnected) continue; const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') continue;
            const r = e.getBoundingClientRect(); if (!r.width || !r.height || r.right < 0 || r.left > innerWidth || r.bottom < 0 || r.top > innerHeight) continue;
            if (e.matches('.mk, .ev')) continue;   // map pins are sized by the map (their own 44 px rule is the label / pin pair)
            const cx = r.left + r.width / 2, cy = r.top + r.height / 2, pts = [[0, 0], [-21, 0], [21, 0], [0, -21], [0, 21]];
            const fails = pts.filter(([dx, dy]) => { const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false; const t = document.elementFromPoint(x, y); if (!t) return false; return !(t && (t === e || e.contains(t) || t.contains(e) && t.matches('label, summary'))); });
            if (fails.length) bad.push((e.id ? '#' + e.id : e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0]) + ` ${Math.round(r.width)}x${Math.round(r.height)}`);
          }
          return bad.slice(0, 20);
        });
        const hb = [...await hitProbe(P.page).then(l => l.filter(x => !x.includes('em-fab')).map(x => 'host ' + x)), ...await hitProbe(vf).then(l => l.map(x => 'viewer ' + x))];
        rep.check('375: every interactive element has a 44 x 44 hit area with no other control on it (default state)', hb.length === 0, hb.slice(0, 14).join('; '));
        const bar = await P.page.evaluate(() => { const b = document.querySelector('#eden-map-root .em-bar'), h = document.querySelector('#eden-map-root .em-here'), f = document.querySelector('#eden-map-root .em-frame'); const br = b.getBoundingClientRect(), hr = h.getBoundingClientRect();
          const d = f.contentDocument, hdr = d.querySelector('header'), cr = d.getElementById('crumbs').getBoundingClientRect(), hh = hdr.getBoundingClientRect(), fr = f.getBoundingClientRect();
          const kids = [...hdr.children].filter(e => e.offsetParent && !e.classList.contains('grow')), last = Math.max(...kids.map(e => e.getBoundingClientRect().right + fr.left));
          return { barPct: Math.round(100 * br.width / innerWidth), herePct: Math.round(100 * hr.width / br.width), titlePct: Math.round(100 * cr.width / hh.width), overlap: Math.round(last - br.left) }; });
        rep.check('375: one top bar: host bar <= 45 %, place field >= 50 % of it, title >= 38 % of the header, no overlap between them', bar.barPct <= 45 && bar.herePct >= 50 && bar.titlePct >= 38 && bar.overlap <= 0, JSON.stringify(bar));
      }
      rep.check(`${w}: no page errors`, P.errors.filter(e => !/404|favicon/.test(e)).length === 0, P.errors.slice(0, 3).join(' | '));
    } finally { await P.close(); }
  }
} catch (e) { rep.check('probe ran to the end', false, String(e.message).split('\n')[0]); }
rep.save(); await B.closeAll(); srv.stop();
process.exit(0);
