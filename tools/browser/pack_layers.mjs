// S8-2 acceptance probe: the example pack declares two layers with data only (map/packs/town/overlay.v2.json) and the kernel draws them.
//   node tools/browser/pack_layers.mjs <out dir>
// Desktop (zh, then ?lang=en) and one 375 px run. Checks: both menu rows with the pack's labels; on town_hill the patrol flow draws (path + dots on its canvas)
// and the danger row does not apply; on town_harbour the danger polygon is drawn and the patrol row does not apply; the legend lists the layer rows with swatches;
// unticking a row removes its drawing, is stored in tcp.town.Layers and survives a reload; the first pack: the estate ward layer (off by default), the routes layer on by default, the legend pane unchanged.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as B from './lib.mjs';

const OUT = process.argv[2] || '/tmp/pack_layers';
const REVIEW = path.join(os.homedir(), 'eden-map-review', 's8-2');
fs.mkdirSync(REVIEW, { recursive: true });
const rep = B.reporter(OUT);
const srv = await B.ensureServer();
const initTown = [o => { try { localStorage.setItem('tcp.town.Lang', o.lang); localStorage.setItem('tcp.town.Hint', '1'); localStorage.setItem('tcp.town.TierV2', 'save'); } catch (e) {} }, { lang: 'zh' }];
const initEn = [o => { try { localStorage.setItem('tcp.town.Lang', o.lang); localStorage.setItem('tcp.town.Hint', '1'); localStorage.setItem('tcp.town.TierV2', 'save'); } catch (e) {} }, { lang: 'en' }];
const ready = async p => { await p.waitForFunction(() => document.getElementById('loading')?.classList.contains('done'), null, { timeout: 30000, polling: 50 }).catch(() => {}); await B.wait(1500); };
const goto = async (p, q = '') => { await p.goto(B.BASE + 'viewer.html?pack=town' + q, { waitUntil: 'commit' }); await ready(p); };
const view = async (p, id) => { await p.evaluate(m => ViewerDebug.go(m), id); await B.wait(2500); };
const rows = p => p.evaluate(() => Object.fromEntries(['patrol', 'danger'].map(id => { const l = document.getElementById('lyr-' + id), b = document.getElementById('lyrBox-' + id); return [id, l ? { text: l.querySelector('span')?.textContent, hidden: l.hidden, checked: !!b?.checked } : null]; })));
const desc = p => p.evaluate(() => Object.fromEntries((window.DeclaredLayersApi?.describe() || []).map(d => [d.id, d])));
const flowPixels = p => p.evaluate(async () => {   // non-transparent samples of the patrol canvas over two frames (it animates)
  const cv = document.querySelector('.vpslot[data-slot="routes"] canvas.lyr-cv'); if (!cv || cv.hidden) return { ok: false, hidden: !!cv?.hidden };
  const n = () => { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let k = 0; for (let i = 3; i < d.length; i += 4 * 13) if (d[i] > 8) k++; return k; };
  const a = n(); await new Promise(r => setTimeout(r, 500)); return { ok: true, a, b: n(), w: cv.width };
});
const svgOf = (p, id) => p.evaluate(i => ({ n: document.querySelectorAll(`svg.lyr-svg[data-layer="${i}"] path`).length, d: document.querySelector(`svg.lyr-svg[data-layer="${i}"] path.fill`)?.getAttribute('d') || '' }), id);
const legend = p => p.evaluate(() => ({ heads: [...document.querySelectorAll('#legendPane h4')].map(h => h.textContent), sw: document.querySelectorAll('#legendPane .lgsw').length, tab: (() => { const b = document.querySelector('.lgtab'); return !!b && !b.hidden && getComputedStyle(b).display !== 'none'; })() }));
const shot = async (p, name) => { const f = await B.shot(p, OUT, name); try { fs.copyFileSync(f, path.join(REVIEW, name + '.png')); } catch (e) {} };

try {
  for (const preset of ['desktop', 'phone']) {
    const P = await B.newPage(preset, { lang: 'zh', tier: 'save', scheme: 'dark', init: initTown }); const p = P.page;
    await goto(p);
    const r1 = await rows(p), d1 = await desc(p);
    rep.check(`${preset}: menu rows lyr-patrol and lyr-danger carry the pack's labels (zh)`, r1.patrol?.text === '巡逻路线' && r1.danger?.text === '危险区域', JSON.stringify(r1));
    rep.check(`${preset}: town_hill: patrol applies and has a feature, danger does not apply; the danger row is hidden`, d1.patrol?.applicable && d1.patrol.count === 1 && d1.danger && !d1.danger.applicable && r1.danger.hidden && !r1.patrol.hidden, JSON.stringify({ d1, r1 }));
    const f1 = await flowPixels(p);
    rep.check(`${preset}: town_hill: the patrol canvas draws the path and the moving dots`, f1.ok && f1.a > 5 && f1.b > 5, JSON.stringify(f1));
    rep.check(`${preset}: town_hill: no danger polygon is drawn`, (await svgOf(p, 'danger')).n === 0);
    const l1 = await legend(p);
    rep.check(`${preset}: town_hill: the legend lists the patrol row with a swatch (the danger row does not apply here)`, l1.tab && l1.heads.join() === '巡逻路线' && l1.sw === 1, JSON.stringify(l1));
    await shot(p, `hill_${preset}`);
    await view(p, 'town_harbour');
    const r2 = await rows(p), d2 = await desc(p), s2 = await svgOf(p, 'danger');
    rep.check(`${preset}: town_harbour: danger applies and its polygon is drawn, patrol does not apply (row hidden)`, d2.danger?.applicable && d2.danger.count === 1 && s2.n === 1 && /Z$/.test(s2.d) && !d2.patrol.applicable && r2.patrol.hidden && !r2.danger.hidden, JSON.stringify({ d2, r2, s2 }));
    const f2 = await flowPixels(p);
    rep.check(`${preset}: town_harbour: the patrol canvas is empty and not animating`, !f2.ok || (f2.a === 0 && f2.b === 0), JSON.stringify(f2));
    const l2 = await legend(p);
    rep.check(`${preset}: town_harbour: the legend lists the danger row with a swatch`, l2.tab && l2.heads.join() === '危险区域' && l2.sw === 1, JSON.stringify(l2));
    await shot(p, `harbour_${preset}`);
    // untick danger here, then patrol on the hill; stored and kept across a reload
    await p.evaluate(() => document.getElementById('lyrBox-danger').click()); await B.wait(500);
    const st = await p.evaluate(() => ({ stored: localStorage.getItem('tcp.town.Layers'), keys: Object.keys(localStorage).filter(k => /Layers$/.test(k)) }));
    rep.check(`${preset}: unticking danger removes its drawing and stores it in tcp.town.Layers`, (await svgOf(p, 'danger')).n === 0 && /"danger":"0"/.test(st.stored || '') && !st.keys.includes('edenMapLayers'), JSON.stringify(st));
    await view(p, 'town_hill');
    await p.evaluate(() => document.getElementById('lyrBox-patrol').click()); await B.wait(700);
    const f3 = await flowPixels(p), st2 = await p.evaluate(() => localStorage.getItem('tcp.town.Layers'));
    rep.check(`${preset}: unticking patrol stops its drawing; stored "patrol":"0"`, (!f3.ok || (f3.a === 0 && f3.b === 0)) && /"patrol":"0"/.test(st2 || ''), JSON.stringify({ f3, st2 }));
    await goto(p);
    const r3 = await rows(p), d3 = await desc(p), f4 = await flowPixels(p);
    rep.check(`${preset}: after a reload both rows stay unticked and nothing is drawn`, r3.patrol?.checked === false && r3.danger?.checked === false && d3.patrol?.visible === false && (!f4.ok || f4.a === 0), JSON.stringify({ r3, d3, f4 }));
    rep.check(`${preset}: no page errors`, !P.errors.length, P.errors.join(' | '));
    await P.ctx.close();
  }
  // English labels
  {
    const P = await B.newPage('desktop', { lang: 'en', tier: 'save', scheme: 'dark', init: initEn }); const p = P.page;
    await goto(p, '&lang=en');
    const r = await rows(p);
    rep.check('desktop: ?lang=en: the rows read "Patrol route" and "Danger zone"', r.patrol?.text === 'Patrol route' && r.danger?.text === 'Danger zone', JSON.stringify(r));
    const l = await legend(p);
    rep.check('desktop: ?lang=en: the legend heading is in English', l.heads.join() === 'Patrol route', JSON.stringify(l));
    await shot(p, 'hill_en');
    await P.ctx.close();
  }
  // the first pack (scope additions): the estate ward is its one declared layer, off by default; the routes layer is on by default; the legend pane is the old markup
  {
    const P = await B.newPage('desktop', { lang: 'zh', tier: 'save', scheme: 'dark' }); const p = P.page;
    await p.goto(B.BASE + 'viewer.html', { waitUntil: 'commit' }); await ready(p);
    const e = await p.evaluate(() => ({ declared: window.DeclaredLayersApi?.describe().map(d => d.id), lyr: [...document.querySelectorAll('#layList > label[id^="lyr-"]')].map(l => l.id), rows: document.querySelectorAll('#layList > label').length,
      legendKids: [...(document.getElementById('legendPane')?.children || [])].map(c => c.tagName), canvases: document.querySelectorAll('canvas.lyr-cv').length, svgs: document.querySelectorAll('svg.lyr-svg').length }));
    // S8-3 (pinned additions, K-R86 / K-R88): the kernel rows lyr-nav-ops and lyr-local-props are two more rows (hidden until they hold something): 17 rows
    rep.check('first pack (world): the one declared layer is estate_ward; its row is there and hidden, after the two S8-3 kernel rows (hidden); 17 menu rows; nothing drawn', e.declared?.join() === 'estate_ward' && e.lyr.join() === 'lyr-nav-ops,lyr-local-props,lyr-estate_ward' && e.rows === 17 && !e.canvases && !e.svgs, JSON.stringify(e));
    rep.check('first pack: the legend pane markup is the old one (heading and one list)', e.legendKids.join() === 'H3,DL', JSON.stringify(e.legendKids));
    await p.evaluate(() => ViewerDebug.go('tc_upper')); await B.wait(3500);
    const u = await p.evaluate(() => { const r = document.getElementById('tgRoutes'), w = document.getElementById('lyr-estate_ward'), svg = document.querySelector('svg.routes');
      return { routesRow: r ? { hidden: r.hidden, checked: !!document.getElementById('tgRoutesBox')?.checked } : null, noroutes: document.body.classList.contains('noroutes'), svgVis: svg ? getComputedStyle(svg).visibility : null, paths: svg?.querySelectorAll('path').length || 0,
        stored: localStorage.getItem('edenMapRoutes'), ward: w ? { hidden: w.hidden, checked: !!document.getElementById('lyrBox-estate_ward')?.checked, text: w.querySelector('span')?.textContent } : null,
        wardSvg: document.querySelectorAll('svg.lyr-svg[data-layer="estate_ward"] path').length, legendHeads: [...document.querySelectorAll('#legendPane h4')].map(h => h.textContent) }; });
    rep.check('first pack, tc_upper: the routes row shows, is ticked by default, the route lines are visible (nothing stored)', u.routesRow && !u.routesRow.hidden && u.routesRow.checked && !u.noroutes && u.svgVis === 'visible' && u.paths > 0 && u.stored === null, JSON.stringify(u));
    rep.check('first pack, tc_upper: the estate ward row shows ("全域结界"), unticked, nothing drawn, no legend heading', u.ward && !u.ward.hidden && !u.ward.checked && u.ward.text === '全域结界' && u.wardSvg === 0 && !u.legendHeads.length, JSON.stringify(u));
    await shot(p, 'upper_routes_on');
    await p.evaluate(() => document.getElementById('lyrBox-estate_ward').click()); await B.wait(700);
    const w = await p.evaluate(() => ({ svg: document.querySelectorAll('svg.lyr-svg[data-layer="estate_ward"] path').length, closed: /Z$/.test(document.querySelector('svg.lyr-svg[data-layer="estate_ward"] path.fill')?.getAttribute('d') || ''), stored: localStorage.getItem('edenMapLayers'), heads: [...document.querySelectorAll('#legendPane h4')].map(h => h.textContent), sw: document.querySelectorAll('#legendPane .lgsw').length }));
    rep.check('first pack, tc_upper: ticking the estate ward draws one closed area and lists it in the legend with a swatch; stored', w.svg === 1 && w.closed && /"estate_ward":"1"/.test(w.stored || '') && w.heads.join() === '全域结界' && w.sw === 1, JSON.stringify(w));
    await shot(p, 'upper_ward_on');
    await p.evaluate(() => document.getElementById('tgRoutesBox').click()); await B.wait(500);
    const off = await p.evaluate(() => ({ noroutes: document.body.classList.contains('noroutes'), svgVis: getComputedStyle(document.querySelector('svg.routes')).visibility, stored: localStorage.getItem('edenMapRoutes') }));
    rep.check('first pack, tc_upper: unticking routes hides the lines and is stored ("0")', off.noroutes && off.svgVis === 'hidden' && off.stored === '0', JSON.stringify(off));
    rep.check('first pack: no page errors', !P.errors.length, P.errors.join(' | '));
    await P.ctx.close();
  }
} catch (err) { rep.check('probe ran to the end', false, String(err?.stack || err).slice(0, 400)); }
const ok = rep.save();
await B.closeAll(); srv.stop();
console.log(ok ? '全部通过' : '有失败');
process.exit(ok ? 0 : 1);
