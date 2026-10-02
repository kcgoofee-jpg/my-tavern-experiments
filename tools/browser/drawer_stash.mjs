// S6-3 probe: the Items tab of the drawer (K-R76) — the four groups, the badge, take / fly-to, an old host's payload, the example pack, 375 px.
// Usage: node tools/browser/drawer_stash.mjs [output dir] [--shots <dir>]
// The viewer is fed the way the host feeds it (StashMarkersApi.set for the world stash, StashView.fromHost for eden-map:inv); the waits are conditions, not delays.
import fs from 'node:fs';
import path from 'node:path';
import * as B from './lib.mjs';

const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '/tmp/drawer_stash';
const si = process.argv.indexOf('--shots'), SHOTS = si > 0 ? process.argv[si + 1] : null;
const T = 20000;
// ---- the data, from disk ----
const J = f => JSON.parse(fs.readFileSync(path.join(B.REPO_ROOT, 'map', f), 'utf8'));
const stashJson = J('data/stash.json'), maps = J('data/maps.json').maps;
const first = stashJson.items.find(r => { const m = maps[r.map]; return m?.data && J(m.data).markers.some(k => k.id === r.marker) && m.markers?.[r.marker]?.name; });
if (!first) { console.log('✗ no row of data/stash.json has its marker in its map data'); process.exit(1); }
const HERE = maps[first.map].markers[first.marker].name, MAP = first.map;
const candidates = Object.entries(maps).filter(([id, m]) => id !== MAP && m.kind === 'points' && m.markers).flatMap(([id, m]) => Object.values(m.markers).filter(k => k.name).map(k => ({ map: id, name: k.name })));
const store = (id, name, o = {}) => ({ id, name, place: '', map: '', node: '', hidden: false, src: 'text', carried: true, msgIndex: null, ...o });
const ROWS = other => [
  store('x1', 'Silver watch', { place: '' }),
  store('x2', 'Brass key', { place: other.name, map: other.map, qty: 2, note: 'found in a drawer' }),
  store('x3', 'Spare coin', { place: HERE, map: MAP, src: 'api', carried: false }),
  store('x4', 'Lantern', { place: other.name, map: other.map, src: 'api', carried: false }),
];
const legacy = rows => rows.map(r => ({ id: r.id, 名: r.name, 地点: r.place, 层: r.map, 暗格: r.hidden ? '暗格' : '', ...(r.note ? { 说明: r.note } : {}), ...(r.qty ? { 数量: r.qty } : {}) }));
const inv = other => { const rows = ROWS(other); return { type: 'eden-map:inv', items: legacy(rows), stash: { v: 1, rows, slot: null }, card: { path: 'inventory', rows: [{ name: 'Bandage', qty: 3 }, { name: 'Old photo', text: 'faded' }] } }; };

B.quietWait();
const srv = await B.ensureServer();
const rep = B.reporter(out);
const P = await B.newPage('desktop'), p = P.page;
const snap = async (pg, name) => { if (SHOTS) await B.shot(pg, SHOTS, name); };
const tabRow = id => p.evaluate(id => ViewerDebug.tabs().find(t => t.id === id), id);
const groups = pg => pg.evaluate(() => Object.fromEntries([...document.querySelectorAll('.itgrp')].map(g => [g.dataset.g, g.querySelectorAll('.itrow').length])));
const open = pg => pg.evaluate(() => ViewerDrawer.setTab('it', 'half'));
let ok = true;
try {
  // 1 / 2: before any data the tab is provided and hidden; the world stash alone makes it visible
  await B.openViewer(P, { map: MAP, here: HERE });
  await p.waitForFunction(() => window.StashMarkersApi && window.StashView && ViewerDebug.tabs?.().some(t => t.id === 'it'), null, { timeout: T });
  // a place on another map that the location resolver places on a landmark (so "show on map" switches the map)
  const other = await p.evaluate(c => { for (const k of c) { const r = ViewerDebug.hereRes(k.name); if (r?.marker && r.map && r.map !== ViewerDebug.currentMapId) return { ...k, map: r.map }; } return null; }, candidates);
  if (!other) throw new Error('no landmark of another map resolves from its name');
  const INV = inv(other), ROW = ROWS(other);
  const t0 = await tabRow('it');
  rep.check('it_provided_and_hidden_before_data', t0.provided === true && t0.visible === false, JSON.stringify(t0));
  await p.evaluate(j => StashMarkersApi.set(j), stashJson);
  await p.waitForFunction(() => ViewerDebug.tabs().find(t => t.id === 'it')?.visible, null, { timeout: T }).catch(() => {});
  const t1 = await tabRow('it');
  rep.check('world_row_here_makes_the_tab_visible', t1.visible === true && t1.hasData === true, JSON.stringify(t1));
  await open(p);
  const g1 = await p.waitForFunction(() => document.querySelectorAll('.itgrp[data-g=here] .itrow button').length > 0, null, { timeout: T }).then(() => true).catch(() => false);
  rep.check('world_row_has_a_take_button', g1);

  // 3 / 4: the host payload; the tab order
  await p.evaluate(d => StashView.fromHost(d), INV);
  await p.waitForFunction(() => document.querySelectorAll('.itgrp').length === 4, null, { timeout: T }).catch(() => {});
  const order = await p.evaluate(() => [...document.querySelectorAll('#evbar .uis-tabs [role=tab]')].map(b => b.dataset.tab));
  rep.check('tab_order_ev_ch_it_pl_lg', JSON.stringify(order) === '["ev","ch","it","pl","lg"]', JSON.stringify(order));

  // 5: the four groups
  const g = await groups(p);
  rep.check('groups_2_2_1_2', g.carried === 2 && g.here === 2 && g.other === 1 && g.card === 2, JSON.stringify(g));
  const badge = await p.evaluate(() => document.querySelector('#evbar [data-tab=it] .bdg')?.textContent || '');
  rep.check('badge_counts_carried_rows', badge === '2', badge);
  const dom = await p.evaluate(() => ({ cardButtons: document.querySelectorAll('.itgrp[data-g=card] button').length, nested: [...document.querySelectorAll('.itrow b')].filter(b => b.children.length).length,
    names: [...document.querySelectorAll('.itrow b')].map(b => b.textContent), head: [...document.querySelectorAll('.itgrp h4')].map(h => h.textContent) }));
  rep.check('card_rows_have_no_button_and_texts_are_plain', dom.cardButtons === 0 && dom.nested === 0, JSON.stringify(dom));
  await snap(p, 'items_tab_desktop');

  // 6: take sends exactly one eden-map:loot with the world row's id, then disables itself (needs a host: the viewer posts only when it is embedded)
  const H = await B.newPage('desktop');
  const fr = await B.openInHost(H, B.BASE + 'viewer.html?map=' + MAP + '&here=' + encodeURIComponent(HERE), { frameH: 700 });
  await fr.waitForFunction(() => document.getElementById('loading')?.classList.contains('done') && window.StashMarkersApi && window.StashView, null, { timeout: 30000 });
  await H.page.evaluate(() => { window.__loot = []; addEventListener('message', e => { if (e.data?.type === 'eden-map:loot') window.__loot.push(e.data); }); });
  await fr.evaluate(j => StashMarkersApi.set(j), stashJson);
  await fr.evaluate(() => ViewerDrawer.setTab('it', 'half'));
  await fr.waitForFunction(n => [...document.querySelectorAll('.itgrp[data-g=here] .itrow')].some(r => r.querySelector('b').textContent.includes(n) && r.querySelector('button.take')), first.name, { timeout: T });
  await fr.evaluate(n => [...document.querySelectorAll('.itgrp[data-g=here] .itrow')].find(r => r.querySelector('b').textContent.includes(n)).querySelector('button.take').click(), first.name);
  await H.page.waitForFunction(() => window.__loot.length > 0, null, { timeout: 5000 }).catch(() => {});
  const take = { n: await H.page.evaluate(() => window.__loot.length), id: await H.page.evaluate(() => window.__loot[0]?.id),
    dis: await fr.evaluate(n => [...document.querySelectorAll('.itgrp[data-g=here] .itrow')].find(r => r.querySelector('b').textContent.includes(n))?.querySelector('button.take')?.disabled, first.name) };
  rep.check('take_posts_one_loot_and_disables', take.n === 1 && take.id === first.id && take.dis === true, JSON.stringify(take));
  await H.close();

  // 7: show on the map: the elsewhere row's place is on another map
  await p.evaluate(() => document.querySelector('.itgrp[data-g=other] .itrow button').click());
  const flew = await p.waitForFunction(m => ViewerDebug.currentMapId !== m, MAP, { timeout: T }).then(() => true).catch(() => false);
  const cur = await p.evaluate(() => ViewerDebug.currentMapId);
  rep.check('show_on_map_goes_to_the_place', flew && cur === other.map, `${MAP} -> ${cur} (wanted ${other.map})`);
  await p.evaluate(m => ViewerDebug.go(m), MAP);
  await p.waitForFunction(m => ViewerDebug.currentMapId === m, MAP, { timeout: T }).catch(() => {});

  // 8: an old host sends only the legacy rows
  await open(p);
  await p.evaluate(d => StashView.fromHost(d), { type: 'eden-map:inv', items: legacy(ROW) });
  await p.waitForFunction(() => !document.querySelector('.itgrp[data-g=carried]'), null, { timeout: T }).catch(() => {});
  const g8 = await groups(p);
  rep.check('old_host_no_carried_group', g8.carried === undefined && g8.here === 2 && g8.other === 3 && g8.card === undefined, JSON.stringify(g8));

  // 9: the example pack: a stored row at a town place, no world stash, no console error
  const T9 = await B.newPage('desktop'), q = T9.page;
  await q.goto(B.BASE + 'viewer.html?pack=town&here=' + encodeURIComponent('集市广场'), { waitUntil: 'commit' });
  await q.waitForFunction(() => document.getElementById('loading')?.classList.contains('done'), null, { timeout: 30000, polling: 50 }).catch(() => {});
  await q.waitForFunction(() => window.StashView && ViewerDebug.tabs?.().some(t => t.id === 'it'), null, { timeout: T });
  const town = [{ id: 'y1', name: 'Fish basket', place: '集市广场', map: 'town_hill', src: 'api', carried: false, hidden: false, node: '', msgIndex: null }, { id: 'y2', name: 'Lamp oil', place: '鱼市', map: 'town_harbour', src: 'api', carried: false, hidden: false, node: '', msgIndex: null }];
  await q.evaluate(d => StashView.fromHost(d), { type: 'eden-map:inv', items: legacy(town), stash: { v: 1, rows: town, slot: null }, card: null });
  await q.waitForFunction(() => ViewerDebug.tabs().find(t => t.id === 'it')?.visible, null, { timeout: T }).catch(() => {});
  await open(T9.page);
  await q.waitForFunction(() => document.querySelectorAll('.itrow').length >= 2, null, { timeout: T }).catch(() => {});
  const g9 = await groups(q), w9 = await q.evaluate(() => (window.StashMarkersApi?.all?.() || []).length);
  rep.check('town_pack_stored_rows_listed', (g9.here || 0) + (g9.other || 0) === 2 && g9.carried === undefined && w9 === 0, JSON.stringify({ g9, world: w9 }));
  const e9 = T9.errors.filter(x => !/favicon|ERR_BLOCKED|net::/i.test(x));
  rep.check('town_pack_no_console_error', e9.length === 0, e9.slice(0, 3).join(' | '));
  await T9.close();

  // 10: 375 px
  const M = await B.newPage('phone'), m = M.page;
  await B.openViewer(M, { map: MAP, here: HERE });
  await m.waitForFunction(() => window.StashMarkersApi && window.StashView && ViewerDebug.tabs?.().some(t => t.id === 'it'), null, { timeout: T });
  await m.evaluate(j => StashMarkersApi.set(j), stashJson);
  await m.evaluate(d => StashView.fromHost(d), inv(other));
  await m.waitForFunction(() => ViewerDebug.tabs().find(t => t.id === 'it')?.visible, null, { timeout: T }).catch(() => {});
  await open(m);
  await m.waitForFunction(() => document.querySelectorAll('.itgrp').length === 4, null, { timeout: T }).catch(() => {});
  const g10 = await groups(m);
  const hs = await m.evaluate(() => [...document.querySelectorAll('.itrow button')].map(b => Math.round(b.getBoundingClientRect().height)));
  rep.check('phone_groups_render_and_buttons_44px', g10.carried === 2 && hs.length >= 3 && hs.every(h => h >= 44), JSON.stringify({ g10, hs }));
  await snap(m, 'items_tab_375');
  const e10 = M.errors.filter(x => !/favicon|ERR_BLOCKED|net::/i.test(x));
  rep.check('phone_no_console_error', e10.length === 0, e10.slice(0, 3).join(' | '));
  await M.close();
} catch (e) { rep.check('probe_ran', false, String(e.message).split('\n')[0]); }
// 11: no console error or unhandled rejection on the desktop page
const errs = P.errors.filter(x => !/favicon|ERR_BLOCKED|net::/i.test(x));
rep.check('no_page_errors', errs.length === 0, errs.slice(0, 3).join(' | '));
ok = rep.save();
await B.closeAll();
srv.stop();
process.exit(ok ? 0 : 1);
