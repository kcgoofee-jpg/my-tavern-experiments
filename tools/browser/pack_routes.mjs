// S8-4b probe: the transit network, route planning, trips along the network and suggested routes (docs/transit-schema.md §10, K-R110..K-R113).
//   node tools/browser/pack_routes.mjs <out dir>
// The example pack (town) opens inside a host page; the host's messages are posted from that page (the only source the viewer accepts) and the viewer's messages to the host are collected there.
// Checks (town, desktop): the `transit` row exists and is unticked; ticked, the hill shows its district, both lines' paths, a ring at the market, the badge "2" and a stub toward the harbour; the harbour shows the
// pier label and no tram; with the location at the old keep the lighthouse card shows the route link with 15 min; clicking it draws the plan and the host gets `eden-map:route-plan`; the echo `eden-map:route` with null clears it;
// a stubbed rail trip clock tower -> keep is drawn along the tram (a path, not an arc); a stubbed `eden-map:ops` with one `routes` row draws a dashed suggestion and "use this route" turns it into the plan; a 375 px shot of the plan card.
// First pack: the `transit` row on tc_mid only, unticked; ticking it draws 5 lines and 4 districts; the route link on the enforcement headquarters card with the location at the cathedral.
import fs from 'node:fs';
import * as B from './lib.mjs';

const OUT = process.argv[2] || '/tmp/pack_routes';
const rep = B.reporter(OUT);
const srv = await B.ensureServer();
const initTown = [() => { try { localStorage.setItem('tcp.town.Lang', 'zh'); localStorage.setItem('tcp.town.Hint', '1'); localStorage.setItem('tcp.town.TierV2', 'save'); } catch (e) {} }];
const frameOf = P => P.page.frames().find(f => f.url().includes('viewer.html'));
const ready = async f => { await f.waitForFunction(() => document.getElementById('loading')?.classList.contains('done'), null, { timeout: 30000, polling: 50 }).catch(() => {}); await B.wait(1500); };
const hostPost = (P, m) => P.page.evaluate(msg => document.getElementById('f').contentWindow.postMessage(msg, '*'), { v: 2, ...m });
const got = P => P.page.evaluate(() => (window.__got || []).filter(m => /^eden-map:route/.test(m?.type || '')));
const go = async (f, id) => { await f.evaluate(m => ViewerDebug.go(m), id); await B.wait(2500); };
const count = (f, sel) => f.evaluate(s => document.querySelectorAll(s).length, sel);
const row = f => f.evaluate(() => { const l = document.getElementById('lyr-transit'); return l ? { hidden: l.hidden, checked: !!l.querySelector('input')?.checked, text: l.querySelector('span')?.textContent } : null; });
const until = async (f, fn, arg, ms = 8000) => { try { await f.waitForFunction(fn, arg, { timeout: ms, polling: 100 }); return true; } catch (e) { return false; } };
const openCard = (f, name) => f.evaluate(n => { const el = [...document.querySelectorAll('.mk')].find(e => e.dataset.name === n); if (!el) return false; el._open(); return true; }, name);
const hereAt = (f, v) => f.evaluate(x => { document.getElementById('here').value = x; }, v);
const shot = async (P, name) => { try { await B.shot(P.page, OUT, name); } catch (e) {} };

async function openTown(P, preset) {
  await P.page.addInitScript(() => { window.addEventListener('message', e => { (window.__got ||= []).push(e.data); }); });
  const f = await B.openInHost(P, B.BASE + 'viewer.html?pack=town'); await ready(f); return f;
}

try {
  // ================= town, desktop =================
  const P = await B.newPage('desktop', { lang: 'zh', tier: 'save', scheme: 'dark', init: initTown });
  let f = await openTown(P);
  await until(f, () => !document.getElementById('lyr-transit')?.hidden);
  const r0 = await row(f);
  rep.check('town: the `transit` row exists on the hill, unticked, with its kernel words', r0 && !r0.hidden && !r0.checked && r0.text === '交通网', JSON.stringify(r0));
  rep.check('town: unticked, nothing of the network is drawn', (await count(f, '[data-layer^="transit-"], .lyr-lb.badge')) === 0);
  await f.evaluate(() => document.querySelector('#lyr-transit input').click()); await B.wait(1500);
  const hill = await f.evaluate(() => ({
    dist: document.querySelectorAll('svg.lyr-svg[data-layer="transit-districts"] path.fill').length,
    lines: document.querySelectorAll('svg.lyr-svg[data-layer="transit-lines"] path:not(.halo)').length,
    rings: [...document.querySelectorAll('.lyr-pt')].filter(e => e.style.getPropertyValue('--ls') === '11px').length, dots: [...document.querySelectorAll('.lyr-pt')].filter(e => e.style.getPropertyValue('--ls') === '7px').length,
    badges: [...document.querySelectorAll('.lyr-lb.badge')].map(e => e.textContent).sort(), stub: [...document.querySelectorAll('.lyr-lb')].map(e => e.textContent).filter(t => t.startsWith('→')),
    labels: [...document.querySelectorAll('.lyr-lb')].map(e => e.textContent), stored: localStorage.getItem('tcp.town.Layers'),
  }));
  rep.check('town hill, ticked: the district (civic, old town) and the two tram segments are drawn', hill.dist === 1 && hill.lines === 2, JSON.stringify(hill));
  rep.check('town hill: a ring at the market (interchange) and dots at the keep and the clock tower', hill.rings === 1 && hill.dots === 2, JSON.stringify(hill));
  rep.check('town hill: badge 2 at both ends of the tram, badge 1 at the market (the funicular)', hill.badges.join() === '1,2,2', JSON.stringify(hill.badges));
  rep.check('town hill: a stub at the market toward the harbour', hill.stub.length === 1 && /鱼市/.test(hill.stub[0]) && /码头/.test(hill.stub[0]), JSON.stringify(hill.stub));
  rep.check('town hill: the district label carries its function (and no danger word at level 0)', hill.labels.some(t => t === '旧城 · 政务'), JSON.stringify(hill.labels));
  rep.check('town: the choice is stored in edenMapLayers (no new key)', /"transit":"1"/.test(hill.stored || ''), String(hill.stored));
  const lg = await f.evaluate(() => (LayerHostApi.registry.get('transit').legend || []).map(r => r.kind + ':' + r.label));
  rep.check('town hill: the legend rows (K-R84): one function, one per line', lg.join() === 'f-civic:政务,l-cable:缆车线,l-tram:山道电车', lg.join());
  await shot(P, 'town_hill_transit');
  await go(f, 'town_harbour');
  const hb = await f.evaluate(() => ({ labels: [...document.querySelectorAll('.lyr-lb')].map(e => e.textContent), lines: document.querySelectorAll('svg.lyr-svg[data-layer="transit-lines"]').length, dist: document.querySelectorAll('svg.lyr-svg[data-layer="transit-districts"] path.fill').length,
    links: document.querySelectorAll('svg.lyr-svg[data-layer="transit-links"] path:not(.halo)').length }));
  rep.check('town harbour: the pier label, the stub back to the hill, no tram or funicular path, two districts, two walk links', hb.labels.includes('栈桥') && hb.labels.some(t => t.startsWith('→ 集市广场')) && hb.lines === 0 && hb.dist === 2 && hb.links === 2, JSON.stringify(hb));
  rep.check('town harbour: the district labels carry function and danger words', hb.labels.includes('鱼市仓库 · 商业 · 危险') && hb.labels.includes('灯塔岬 · 自然 · 注意'), JSON.stringify(hb.labels));
  await shot(P, 'town_harbour_transit');

  // ---- the route: location at the old keep, the lighthouse card
  await hostPost(P, { type: 'eden-map:here', value: '旧堡' }); await B.wait(800);
  rep.check('town: the location is the old keep', (await f.evaluate(() => document.getElementById('here').value)) === '旧堡');
  await openCard(f, '灯塔');
  const linkOk = await until(f, () => !!document.querySelector('#card .extra [data-route]'));
  const link = await f.evaluate(() => document.querySelector('#card .extra [data-route]')?.textContent || '');
  rep.check('town: the lighthouse card shows the route link "路线 · 约 15 分钟"', linkOk && link === '路线 · 约 15 分钟', link);
  await f.evaluate(() => document.querySelector('#card .extra [data-route]').click()); await B.wait(1200);
  const plan = await f.evaluate(() => ({ title: document.querySelector('#card h2')?.textContent, sub: document.querySelector('#card .sub')?.textContent, legs: [...document.querySelectorAll('#card .rtleg')].map(e => e.textContent), badge: document.querySelector('#card .rtbadge')?.textContent,
    lc: document.querySelector('#card .rtbadge')?.style.getPropertyValue('--lc'), clear: !!document.querySelector('#card [data-route-clear]'), warn: document.querySelector('#card .rtwarn')?.textContent || '',
    pts: document.querySelectorAll('svg.lyr-svg[data-layer^="route-plan"], .lyr-pt').length, view: ViewerDebug.currentMapId }));
  rep.check('town: the plan card: title keep -> lighthouse, "约 15 分钟 · 换乘 1 次", three legs and a change row, the clear link', plan.title === '旧堡 → 灯塔' && plan.sub === '约 15 分钟 · 换乘 1 次' && plan.legs.length === 4 && plan.clear && /换乘/.test(plan.legs[1]), JSON.stringify(plan));
  rep.check('town: the tram leg has its badge in the line colour', plan.badge === '2' && plan.lc === '#e8b33a', JSON.stringify({ b: plan.badge, lc: plan.lc }));
  const m1 = await got(P);
  rep.check('town: the host received eden-map:route-plan with the plan (15 min, one change, danger 1)', m1.length === 1 && m1[0].type === 'eden-map:route-plan' && m1[0].plan?.min === 15 && m1[0].plan?.changes === 1 && m1[0].plan?.danger === 1 && m1[0].plan?.src === 'user', JSON.stringify(m1).slice(0, 300));
  const onHarbour = await f.evaluate(() => ({ lines: document.querySelectorAll('svg.lyr-svg[data-layer="route-plan-lines"] path:not(.halo)').length, ptsEls: [...document.querySelectorAll('.lyr-pt')].filter(e => e.style.getPropertyValue('--ls') === '12px').length, pulse: !!document.querySelector('.lyr-pt.pulse') }));
  rep.check('town harbour: the plan is drawn (the walk, an end point that pulses, a point at the boarding of the walk)', onHarbour.lines >= 1 && onHarbour.ptsEls === 2 && onHarbour.pulse, JSON.stringify(onHarbour));
  await shot(P, 'town_plan_harbour');
  await go(f, 'town_hill');
  const onHill = await f.evaluate(() => ({ lines: document.querySelectorAll('svg.lyr-svg[data-layer="route-plan-lines"] path:not(.halo)').length, ptsEls: [...document.querySelectorAll('.lyr-pt')].filter(e => e.style.getPropertyValue('--ls') === '12px').length }));
  rep.check('town hill: the plan is drawn (two tram segments... the keep -> market ride) with the start and the change at the market', onHill.lines >= 1 && onHill.ptsEls === 2, JSON.stringify(onHill));
  await shot(P, 'town_plan_hill');
  await hostPost(P, { type: 'eden-map:route', plan: null }); await B.wait(900);
  const cleared = await f.evaluate(() => ({ user: RoutePlanView.describe().user, drawn: document.querySelectorAll('svg.lyr-svg[data-layer^="route-plan"]').length }));
  rep.check('town: the host\'s echo with null clears the plan and its drawing', cleared.user === null && cleared.drawn === 0, JSON.stringify(cleared));

  // ---- a rail trip along the tram
  await hostPost(P, { type: 'eden-map:trips', items: [{ from: '钟楼', to: '旧堡', mode: 'rail', floor: 3, time: '夜' }, { from: '钟楼', to: '集市广场', mode: 'air', floor: 3 }] }); await B.wait(2500);
  const tr = await f.evaluate(() => [...document.querySelectorAll('svg.trip')].map(s => ({ cls: s.getAttribute('class'), d: s.querySelector('path')?.getAttribute('d') || '' })));
  rep.check('town: the rail trip clock tower -> keep is a path along the tram (M and L, no curve); the air trip stays an arc', tr.length === 2 && tr.some(t => /m-rail/.test(t.cls) && /^M[^QL]*L/.test(t.d) && !/Q/.test(t.d)) && tr.some(t => /m-air/.test(t.cls) && /Q/.test(t.d)), JSON.stringify(tr));
  await f.evaluate(() => { const h = document.querySelector('.tripin.hit'); h?._open?.(); }); await B.wait(500);
  const tcard = await f.evaluate(() => document.querySelector('#card .sub')?.textContent || '');
  rep.check('town: the routed trip\'s card says it runs along the network (estimated)', /沿交通网（估计）/.test(tcard), tcard);
  await hostPost(P, { type: 'eden-map:trips', items: [] }); await B.wait(500);

  // ---- a suggested route
  await hostPost(P, { type: 'eden-map:ops', clues: [], markers: [], routes: [{ from: '钟楼', to: '灯塔', fromNode: 'clock', toNode: 'light', why: '夜里涨潮，走缆车更稳', floor: 3, map: 'town_hill' }] }); await B.wait(2000);
  const sg = await f.evaluate(() => ({ n: RoutePlanView.describe().suggestions, dash: [...document.querySelectorAll('svg.lyr-svg[data-layer="route-plan-lines"] path:not(.halo)')].map(p => p.style.getPropertyValue('--ld')), hit: document.querySelectorAll('.tripin.hit').length }));
  rep.check('town: a suggested route is drawn dashed on the hill with a tap target on its end (here: the lighthouse is on the harbour, the line leaves the view)', sg.n === 1 && sg.dash.length >= 1 && sg.dash.every(x => x === '8 6'), JSON.stringify(sg));
  await go(f, 'town_harbour');
  await f.evaluate(() => { const h = document.querySelector('.tripin.hit'); h?._open?.(); }); await B.wait(600);
  const sc = await f.evaluate(() => ({ title: document.querySelector('#card h2')?.textContent, why: document.querySelector('#card .rtwhy')?.textContent, adopt: !!document.querySelector('#card [data-route-adopt]') }));
  rep.check('town harbour: tapping the suggestion\'s end opens "建议路线" with the reason and "采用这条路线"', /^建议路线/.test(sc.title || '') && sc.why === '夜里涨潮，走缆车更稳' && sc.adopt, JSON.stringify(sc));
  await f.evaluate(() => document.querySelector('#card [data-route-adopt]').click()); await B.wait(1200);
  const ad = await f.evaluate(() => ({ user: RoutePlanView.describe().user?.src, sug: RoutePlanView.describe().suggestions, clear: !!document.querySelector('#card [data-route-clear]') }));
  const m2 = await got(P);
  rep.check('town: "use this route" makes it the user\'s plan (sent to the host, the suggestion is gone)', ad.user === 'user' && ad.sug === 0 && ad.clear && m2.at(-1)?.type === 'eden-map:route-plan' && m2.at(-1).plan?.from?.node === 'clock', JSON.stringify({ ad, last: m2.at(-1) }).slice(0, 300));
  // arrival: a new location that is the destination clears the plan
  await hostPost(P, { type: 'eden-map:here', value: '灯塔' }); await B.wait(1500);
  const arr = await f.evaluate(() => RoutePlanView.describe().user), m3 = await got(P);
  rep.check('town: arriving at the destination clears the plan and tells the host', arr === null && m3.at(-1)?.type === 'eden-map:route-plan' && m3.at(-1).plan === null, JSON.stringify(m3.at(-1)));
  rep.check('town: no script errors or 404s', !P.errors.length, JSON.stringify(P.errors));
  await P.ctx.close();

  // ================= town, 375 px: the plan card =================
  const Q = await B.newPage('phone', { lang: 'zh', tier: 'save', scheme: 'dark', init: initTown });
  const q = await openTown(Q, 'phone');
  await hostPost(Q, { type: 'eden-map:here', value: '旧堡' }); await B.wait(800);
  await go(q, 'town_harbour'); await openCard(q, '灯塔'); await until(q, () => !!document.querySelector('#card .extra [data-route]'));
  await q.evaluate(() => document.querySelector('#card .extra [data-route]')?.click()); await B.wait(1500);
  const ph = await q.evaluate(() => ({ title: document.querySelector('#card h2')?.textContent, legs: document.querySelectorAll('#card .rtleg').length, w: document.documentElement.scrollWidth, vw: innerWidth }));
  rep.check('town 375 px: the plan card opens with its legs and the page does not scroll sideways', ph.title === '旧堡 → 灯塔' && ph.legs === 4 && ph.w <= ph.vw + 1, JSON.stringify(ph));
  await shot(Q, 'town_plan_card_375');
  rep.check('town 375 px: no script errors', !Q.errors.length, JSON.stringify(Q.errors));
  await Q.ctx.close();

  // ================= the first pack =================
  const E = await B.newPage('desktop', { lang: 'zh', tier: 'save', scheme: 'dark' });
  const e = E.page;
  await e.goto(B.BASE + 'viewer.html', { waitUntil: 'commit' });
  await ready(e);
  const w0 = await e.evaluate(() => { const l = document.getElementById('lyr-transit'); return l ? { hidden: l.hidden } : null; });
  rep.check('first pack: on the world map the `transit` row exists and is hidden (nothing to draw there)', w0 && w0.hidden === true, JSON.stringify(w0));
  await go(e, 'tc_mid');
  await until(e, () => !document.getElementById('lyr-transit')?.hidden);
  const m0 = await e.evaluate(() => { const l = document.getElementById('lyr-transit'); return { hidden: l?.hidden, checked: !!l?.querySelector('input')?.checked, drawn: document.querySelectorAll('[data-layer^="transit-"]').length }; });
  rep.check('first pack: on tc_mid the `transit` row shows, unticked, nothing drawn', m0.hidden === false && !m0.checked && m0.drawn === 0, JSON.stringify(m0));
  await shot(E, 'tc_mid_off');
  await e.evaluate(() => document.querySelector('#lyr-transit input').click()); await B.wait(2000);
  const mid = await e.evaluate(() => ({ lg: (LayerHostApi.registry.get('transit').legend || []).map(r => r.kind), dist: document.querySelectorAll('svg.lyr-svg[data-layer="transit-districts"] path.fill').length,
    segs: document.querySelectorAll('svg.lyr-svg[data-layer="transit-lines"] path:not(.halo)').length, rings: [...document.querySelectorAll('.lyr-pt')].filter(x => x.style.getPropertyValue('--ls') === '11px').length,
    badges: [...document.querySelectorAll('.lyr-lb.badge')].map(x => x.textContent).sort().join(''), links: document.querySelectorAll('svg.lyr-svg[data-layer="transit-links"] path:not(.halo)').length }));
  rep.check('first pack: ticking draws 5 lines (legend rows l1 l2 l3 l4 m) and 4 districts', mid.dist === 4 && ['l-l1', 'l-l2', 'l-l3', 'l-l4', 'l-m'].every(k => mid.lg.includes(k)) && mid.segs === 36, JSON.stringify(mid));
  rep.check('first pack: interchanges are rings, the badges are 1 2 3 4 M, six links (4 skywalks, 2 hover-taxi legs)', mid.rings >= 8 && mid.badges.includes('M') && mid.links === 6, JSON.stringify({ rings: mid.rings, badges: mid.badges, links: mid.links }));
  await shot(E, 'tc_mid_transit_fit');
  await e.evaluate(() => ViewerDebug.osdViewer.viewport.zoomTo(ViewerDebug.osdViewer.viewport.getZoom() * 2.2)); await B.wait(1200);
  await shot(E, 'tc_mid_transit_zoom');
  await e.evaluate(() => { document.getElementById('here').value = '辉光大教堂'; });
  await openCard(e, '天城执法局总局');
  const ok2 = await until(e, () => !!document.querySelector('#card .extra [data-route]'));
  const l2 = await e.evaluate(() => document.querySelector('#card .extra [data-route]')?.textContent || '');
  rep.check('first pack: with the location at the cathedral, the enforcement headquarters card shows a route link', ok2 && /^路线 · 约 \d+ 分钟$/.test(l2), l2);
  await e.evaluate(() => document.querySelector('#card .extra [data-route]')?.click()); await B.wait(1500);
  const p2 = await e.evaluate(() => ({ title: document.querySelector('#card h2')?.textContent, legs: [...document.querySelectorAll('#card .rtleg')].map(x => x.textContent) }));
  rep.check('first pack: the plan card lists legs on the maglev lines', p2.title === '辉光大教堂 → 天城执法局总局' && p2.legs.length >= 1 && /悬浮轨道/.test(p2.legs.join()), JSON.stringify(p2));
  await shot(E, 'tc_mid_plan');
  await e.evaluate(() => document.querySelector('#card [data-route-clear]')?.click()); await B.wait(500);
  rep.check('first pack: no script errors or 404s', !E.errors.length, JSON.stringify(E.errors));
  await E.ctx.close();
} catch (err) { rep.check('probe ran to the end', false, String(err?.stack || err).slice(0, 600)); }
const ok = rep.save();
srv.stop(); await B.closeAll();
process.exit(ok ? 0 : 1);
