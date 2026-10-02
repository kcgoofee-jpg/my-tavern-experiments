// DRAWER-1 probe: hide one event (icon x, "hidden N", restore), items folded by pickup place (merge x N, fold kept per chat), no per-row "show on map" button,
// the "not an item" x with its restore, and the top-bar status mark. Embedded in a host stub so the intents the viewer posts can be read.
// Usage: node tools/browser/drawer_1.mjs [output dir] [--shots <dir>]   (--shots-only: only take the screenshots, no checks: used for the before / after pairs)
import * as B from './lib.mjs';

const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '/tmp/drawer_1';
const si = process.argv.indexOf('--shots'), SHOTS = si > 0 ? process.argv[si + 1] : null, ONLY = process.argv.includes('--shots-only');
const T = 20000;
B.quietWait();
const srv = await B.ensureServer();
const rep = B.reporter(out);
const ev = (id, cat, text, first) => ({ id, key: id, cat, layer: '', place: '', text, lvl: 2, first, last: first, count: 1, closed: false, tier: 'live', node: null, grp: '其他', ch: '!', color: '#e6c36a', isNew: false });
const EVENTS = [ev('e1', '结界警报', '主楼结界现异常缺口', 132), ev('e2', '空防', '低空出现不明飞行物', 140)];
const row = (id, name, place, msgIndex, o = {}) => ({ id, name, place, map: '', node: '', hidden: false, src: 'text', carried: true, msgIndex, ...o });
const ROWS = [row('x1', '晶石', '南侧地窖', 5), row('x2', '晶石', '南侧地窖', 7), row('x3', '凶器', '南侧地窖', 9), row('x4', '白丝巾', '后院', 3), row('x5', '银怀表', '', 2)];
const INV = { type: 'eden-map:inv', items: [], stash: { v: 1, rows: ROWS, slot: null, notItems: [] }, card: null };
let ok = true;
const P = await B.newPage('desktop');
try {
  const H = P;
  const fr = await B.openInHost(H, B.BASE + 'viewer.html', { frameH: 740 });
  await fr.waitForFunction(() => document.getElementById('loading')?.classList.contains('done') && window.EventsView && window.StashView, null, { timeout: 30000 });
  await H.page.evaluate(() => { window.__hide = []; addEventListener('message', e => { if (e.data?.type === 'eden-map:hide') window.__hide.push(e.data); }); });
  await fr.evaluate(m => EventsView.set(m), { type: 'eden-map:events', items: EVENTS, floor: 140 });
  await fr.evaluate(() => ViewerDrawer.setTab('ev', 'half'));
  await fr.waitForFunction(() => document.querySelectorAll('#evbar #evlist li').length === 2, null, { timeout: T }).catch(() => {});
  if (SHOTS) await B.shot(H.page, SHOTS, 'events_tab');
  if (!ONLY) {
    // ---- events ----
    const x0 = await fr.evaluate(() => [...document.querySelectorAll('#evlist li .hx button')].map(b => b.getAttribute('aria-label') + '|' + b.textContent.trim()));
    rep.check('event_rows_have_icon_only_hide', x0.length === 2 && x0.every(s => s === '隐藏这条|'), JSON.stringify(x0));
    await fr.evaluate(() => document.querySelector('#evlist li .hx button').click());
    await fr.waitForFunction(() => document.querySelectorAll('#evlist li:not(.hidrow)').length === 1, null, { timeout: T }).catch(() => {});
    const h1 = await H.page.evaluate(() => window.__hide.slice());
    const n1 = await fr.evaluate(() => ({ rows: document.querySelectorAll('#evlist li:not(.hidrow)').length, tog: document.querySelector('.evleg .hidtog')?.textContent, tab: document.querySelector('#evbar [data-tab=ev]')?.textContent.replace(/\s+/g, ' ').trim(), dots: document.querySelectorAll('.ev').length }));
    rep.check('hiding_an_event_posts_one_intent_and_drops_it', h1.length === 1 && h1[0].kind === 'event' && h1[0].on === true && n1.rows === 1 && n1.tog === '已隐藏 1', JSON.stringify({ h1, n1 }));
    rep.check('hidden_event_leaves_the_count', /1$/.test(n1.tab), n1.tab);
    await fr.evaluate(() => document.querySelector('.evleg .hidtog').click());
    const g1 = await fr.evaluate(() => ({ grey: document.querySelectorAll('#evlist li.hidrow').length, restore: document.querySelector('#evlist li.hidrow button[data-restore]')?.getAttribute('aria-label') }));
    rep.check('hidden_toggle_shows_greyed_row_with_restore', g1.grey === 1 && g1.restore === '恢复', JSON.stringify(g1));
    if (SHOTS) await B.shot(H.page, SHOTS, 'events_tab_hidden_shown');
    await fr.evaluate(() => document.querySelector('#evlist li.hidrow button[data-restore]').click());
    const r1 = await fr.evaluate(() => ({ rows: document.querySelectorAll('#evlist li:not(.hidrow)').length, tog: !!document.querySelector('.evleg .hidtog') }));
    const h2 = await H.page.evaluate(() => window.__hide.slice());
    rep.check('restore_brings_it_back', r1.rows === 2 && !r1.tog && h2.length === 2 && h2[1].on === false, JSON.stringify({ r1, h2 }));
    await fr.evaluate(k => EventsView.setHidden([k]), h1[0].key);   // the host's echo (eden-map:hidden) after a reload
    const e1 = await fr.evaluate(() => document.querySelectorAll('#evlist li:not(.hidrow)').length);
    rep.check('host_echo_hides_without_a_click', e1 === 1, String(e1));
    await fr.evaluate(() => EventsView.setHidden([]));
  }

  // ---- items ----
  await fr.evaluate(d => StashView.fromHost(d), INV);
  await fr.evaluate(() => ViewerDrawer.setTab('it', 'half'));
  await fr.waitForFunction(() => document.querySelectorAll('.itph').length >= 3, null, { timeout: T }).catch(() => {});
  if (SHOTS) await B.shot(H.page, SHOTS, 'items_tab');
  if (!ONLY) {
    const it = await fr.evaluate(() => ({ heads: [...document.querySelectorAll('.itgrp[data-g=carried] .itph')].map(h => h.textContent.replace(/\s+/g, ' ').trim()),
      names: [...document.querySelectorAll('.itrow b')].map(b => b.textContent), qty: [...document.querySelectorAll('.itrow em')].map(e => e.textContent),
      texts: [...document.querySelectorAll('.itpane button')].map(b => b.textContent.trim()).filter(Boolean), found: /拾于/.test(document.querySelector('.itpane').textContent) }));
    rep.check('carried_folds_by_place_newest_first', JSON.stringify(it.heads) === JSON.stringify(['南侧地窖3', '后院1', '未归位1']), JSON.stringify(it.heads));
    rep.check('same_name_merges_with_count', it.names.filter(n => n === '晶石').length === 1 && it.qty.includes('×2'), JSON.stringify({ names: it.names, qty: it.qty }));
    rep.check('no_per_row_text_button_and_no_found_at_line', !it.texts.includes('在地图上看') && !it.found, JSON.stringify(it.texts));
    await fr.evaluate(() => document.querySelector('.itgrp[data-g=carried] .itfold').click());
    const f1 = await fr.evaluate(() => ({ rows: document.querySelectorAll('.itgrp[data-g=carried] .itrow').length, ex: document.querySelector('.itgrp[data-g=carried] .itfold').getAttribute('aria-expanded'), key: LocalStore.get('edenMap:chat:local:itgrp') }));
    rep.check('fold_closes_and_is_kept_per_chat', f1.ex === 'false' && f1.rows === 2 && /南侧地窖/.test(f1.key || ''), JSON.stringify(f1));
    await fr.evaluate(d => StashView.fromHost(d), INV);
    const f2 = await fr.evaluate(() => document.querySelector('.itgrp[data-g=carried] .itfold').getAttribute('aria-expanded'));
    rep.check('fold_survives_a_refresh_of_the_rows', f2 === 'false', f2);
    await fr.evaluate(() => document.querySelector('.itgrp[data-g=carried] .itfold').click());
    // not an item
    const lab = await fr.evaluate(() => [...document.querySelectorAll('.itrow .hx button')].map(b => b.getAttribute('aria-label')));
    rep.check('item_rows_have_icon_only_not_an_item', lab.length === 4 && lab.every(l => l === '这不是物品'), JSON.stringify(lab));
    await fr.evaluate(() => [...document.querySelectorAll('.itrow')].find(r => r.querySelector('b').textContent === '银怀表').querySelector('.hx button').click());
    const n2 = await fr.evaluate(() => ({ names: [...document.querySelectorAll('.itrow b')].map(b => b.textContent), tog: document.querySelector('.ithid .hidtog')?.textContent }));
    const h3 = await H.page.evaluate(() => window.__hide.filter(m => m.kind === 'item'));
    rep.check('not_an_item_posts_the_name_and_removes_the_row', h3.length === 1 && h3[0].key === '银怀表' && h3[0].on === true && !n2.names.includes('银怀表') && n2.tog === '已隐藏 1', JSON.stringify({ h3, n2 }));
    await fr.evaluate(() => document.querySelector('.ithid .hidtog').click());
    await fr.evaluate(() => document.querySelector('.ithid button[data-restore]').click());
    const n3 = await fr.evaluate(() => ({ names: [...document.querySelectorAll('.itrow b')].map(b => b.textContent), tog: !!document.querySelector('.ithid') }));
    rep.check('restore_clears_the_hidden_list', !n3.tog, JSON.stringify(n3));   // the host owns the rows: the row returns with its next eden-map:inv
    await fr.evaluate(d => StashView.fromHost(d), INV);
    const n4 = await fr.evaluate(() => [...document.querySelectorAll('.itrow b')].map(b => b.textContent));
    rep.check('restored_item_is_back_after_the_next_inv', n4.includes('银怀表'), JSON.stringify(n4));
  }
  const e0 = P.errors.filter(x => !/favicon|ERR_BLOCKED|net::/i.test(x));
  if (!ONLY) rep.check('no_page_errors', e0.length === 0, e0.slice(0, 3).join(' | '));
  // ---- 375 px ----
  const M = await B.newPage('phone');
  await B.openViewer(M, {});
  await M.page.waitForFunction(() => window.StashView && window.EventsView, null, { timeout: 30000 });
  await M.page.evaluate(m => EventsView.set(m), { type: 'eden-map:events', items: EVENTS, floor: 140 });
  await M.page.evaluate(d => StashView.fromHost(d), INV);
  await M.page.evaluate(() => ViewerDrawer.setTab('it', 'half'));
  await M.page.waitForFunction(() => document.querySelectorAll('.itph').length >= 3, null, { timeout: T }).catch(() => {});
  if (SHOTS) await B.shot(M.page, SHOTS, 'items_tab_375');
  if (!ONLY) {
    const hs = await M.page.evaluate(() => [...document.querySelectorAll('.itpane button')].map(b => Math.round(b.getBoundingClientRect().height)).filter(Boolean));
    const ov = await M.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
    rep.check('phone_controls_44px_and_no_horizontal_scroll', hs.length > 3 && hs.every(h => h >= 44) && ov, JSON.stringify({ hs, ov }));
  }
  await M.page.evaluate(() => ViewerDrawer.setTab('ev', 'half'));
  if (SHOTS) await B.shot(M.page, SHOTS, 'events_tab_375');
  await M.close();
} catch (e) { rep.check('probe_ran', false, String(e.message).split('\n')[0]); }
ok = rep.save();
await B.closeAll();
srv.stop();
process.exit(ok ? 0 : 1);
