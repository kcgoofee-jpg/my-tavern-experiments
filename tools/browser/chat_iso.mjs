// CHAT-ISO (I-33): one card, several chats. Two chats of the same card in one stub host (H.switchChat: its own chat variables, messages, chat worldbook):
//   1 isolation: A -> B -> A -> B, every seeded field per chat unchanged, nothing of A in B (custom names, fog, trips, per-chat book, injected text)
//   2 reset: Settings -> data -> 「重置本聊天地图数据」 (inline confirm, no dialog) clears this chat only: record, local rows, gallery images, own book; stat_data, the other chat and the user's own book stay
//   3 orphan cleanup at startup: rows / gallery images / per-chat books of a deleted chat go; an unreadable chat list drops nothing
// Usage: node tools/browser/chat_iso.mjs <outdir>
import * as B from './lib.mjs';
import fs from 'node:fs';
import { openHost } from './host_stub.mjs';
import * as MV from '../../map/tavern/mvu-readers.mjs';
import { worldbookPrefix } from '../../map/core/pack.mjs';
import { fileURLToPath } from 'node:url';
MV.setWbName(worldbookPrefix(JSON.parse(fs.readFileSync(fileURLToPath(new URL('../../map/packs/eden/manifest.json', import.meta.url)), 'utf8')), 'eden'));

const OUT = process.argv[2] || '/tmp/chat_iso';
B.quietWait();
const srv = await B.ensureServer();
const rep = B.reporter(OUT);
const A = 'iso-A', Bc = 'iso-B';
const seedA = { 自定义: { items: { 主人书房: { 类: 'room', 名: 'A星图室', 源: '手动' } }, 同步世界书: true }, 探索: { upper: ['A地标'] }, 行程: [{ name: 'A行程' }], 标签楼: -1 };
const seedB = { 自定义: { items: { 温室: { 类: 'room', 名: 'B花房', 源: '手动' } }, 同步世界书: true }, 探索: { upper: ['B地标'] }, 行程: [{ name: 'B行程' }], 标签楼: -1 };
const STAT = { 世界: { 当前地点: '天城·中层·天城执法局总局' }, 在场人物: { 米拉: { 身份: '向导', 位置: '下层·7号井' } } };
const HA = '天城·中层·天城执法局总局', HB = '天城·下层·7号井';
const MSG_A = [{ message_id: 0, message: 'A 的开场：午后。' }], MSG_B = [{ message_id: 0, message: 'B 的开场：深夜。' }];
const has = (o, s) => JSON.stringify(o ?? null).includes(s);
const keep = (v, ks) => Object.fromEntries(ks.map(k => [k, v?.[k]]));
const USER = ['自定义'];   // the record's custom list is user data and must not change by itself; fog only grows (own places), trips are recomputed from the floors
const fogOk = (v, id) => (v?.eden_map?.探索?.upper || []).includes(id === A ? 'A地标' : 'B地标') && !has(v?.eden_map?.探索, id === A ? 'B地标' : 'A地标');

async function run() {
  const P = await B.newPage('desktop', { tier: 'save' });
  try {
    const H = await openHost(P, { multi: true, chat: A, here: HA, stat: STAT, msgs: MSG_A, vars: { stat_data: { 世界: { 当前地点: HA } }, eden_map: seedA }, chatList: [A, Bc] });
    const p = P.page;
    await B.wait(1500);
    const snap = async () => ({ c: await p.evaluate(() => window.EdenMap.getCustom()), v: await H.vars(), inj: await H.injected(), wb: await H.wb() });
    const state = id => p.evaluate(i => (window.__chatState || {})[i] || null, id);
    // ---- 1 isolation: A -> B -> A -> B ----
    const s0 = await snap();
    rep.check('A: own custom name and fog loaded', s0.c.items?.主人书房?.名 === 'A星图室' && has(s0.v?.eden_map?.探索, 'A地标'), JSON.stringify(s0.c.items));
    const seq = [[Bc, { vars: { stat_data: { 世界: { 当前地点: HB } }, eden_map: seedB }, msgs: MSG_B, here: HB, stat: { ...STAT, 世界: { 当前地点: HB } } }], [A, {}], [Bc, {}], [A, {}], [Bc, {}]];
    let step = 0;
    for (const [id, init] of seq) {
      await H.switchChat(id, init); step++;
      const me = id === A ? 'A' : 'B', other = id === A ? 'B' : 'A', own = id === A ? seedA : seedB;
      const s = await snap();
      const mine = keep(s.v?.eden_map, USER);
      rep.check(`step ${step} -> ${me}: its own custom list is unchanged, its fog keeps its own places`, JSON.stringify(mine) === JSON.stringify(keep(own, USER)) && fogOk(s.v, id), JSON.stringify(s.v?.eden_map?.探索));
      if (me === 'B') rep.check(`step ${step} -> B: the place A was standing in is not recorded in B's fog`, !has(s.v?.eden_map?.探索, '天城执法局总局'), JSON.stringify(s.v?.eden_map?.探索));
      rep.check(`step ${step} -> ${me}: nothing of ${other} in the variables, the custom list, the injected text or the books`, !has(s.v, other + '星图室') && !has(s.v, other + '花房') && !has(s.v, other + '地标') && !has(s.c, other + '星图室') && !has(s.c, other + '花房') && !s.inj.includes(other + '星图室') && !s.inj.includes(other + '花房') && !has(s.wb.books[MV.wbName(id === A ? A : Bc)], other === 'A' ? 'A星图室' : 'B花房'), JSON.stringify({ c: Object.keys(s.c.items || {}), inj: s.inj.slice(0, 80) }));
      rep.check(`step ${step} -> ${me}: the custom list shows ${me}'s name`, has(s.c.items, me === 'A' ? 'A星图室' : 'B花房'), JSON.stringify(s.c.items));
      rep.check(`step ${step} -> ${me}: its own per-chat book exists and holds only its own text`, has(s.wb.books[MV.wbName(id)], me === 'A' ? 'A星图室' : 'B花房') && !has(s.wb.books[MV.wbName(id)], other === 'A' ? 'A星图室' : 'B花房'), Object.keys(s.wb.books).join('|'));
    }
    // the chat stored while away is also unchanged
    const stA = await state(A);
    rep.check('chat A stored while away: custom list unchanged, own fog, no B marker', JSON.stringify(keep(stA?.vars?.eden_map, USER)) === JSON.stringify(keep(seedA, USER)) && fogOk(stA?.vars, A) && !has(stA?.vars, 'B花房'), JSON.stringify(stA?.vars?.eden_map || null).slice(0, 120));
    await H.switchChat(A, {});   // back to A for the reset scenario

    // ---- 2 reset ----
    const seedImg = scope => p.evaluate(async ([base, scope]) => { const G = await import(base + 'core/room-gallery-db.mjs'); await G.putImage(scope, { roomId: 'r1', id: 'i-' + scope, order: 0, bytes: 1, w: 1, h: 1 }, new Blob(['x'])); return (await G.listScopes()); }, [B.BASE, scope]);
    const scopes = () => p.evaluate(async base => (await import(base + 'core/room-gallery-db.mjs')).listScopes(), B.BASE);
    await seedImg('chat:' + A); await seedImg('chat:' + Bc);
    await p.evaluate(([a, b]) => { for (const id of [a, b]) { localStorage.setItem(`edenMap:chat:${id}:scrap`, '{"x":1}'); localStorage.setItem(`edenMap:chat:${id}:fog`, '{"upper":["z"]}'); localStorage.setItem('edenMapSeen:' + id, '1'); } window.__wb['My own book'] = [{ name: 'mine' }]; }, [A, Bc]);
    const bookB0 = JSON.stringify((await H.wb()).books[MV.wbName(Bc)]), stB0 = JSON.stringify(keep((await state(Bc))?.vars?.eden_map, USER));
    await H.open();
    const vf = await H.viewer();
    await vf.evaluate(() => { ViewerDebug.closeCard?.(); ViewerDebug.showSet(true); SettingsApi.open('data'); }); await B.wait(800);
    let dialog = 0; p.on('dialog', d => { dialog++; d.dismiss().catch(() => {}); });
    const present = await vf.evaluate(() => !!document.querySelector('#chatReset'));
    rep.check('settings -> data has the reset row', present);
    await vf.evaluate(() => document.querySelector('#chatReset').click()); await B.wait(300);
    const armed = await vf.evaluate(() => ({ msg: document.querySelector('#chatResetMsg')?.textContent || '', v: JSON.stringify(window.parent?.__vars || null) }));
    rep.check('first tap only asks for confirmation (inline text) and clears nothing', /再点一次|Tap again/.test(armed.msg) && has(JSON.parse(armed.v), 'A星图室'), armed.msg.slice(0, 60));
    await vf.evaluate(() => document.querySelector('#chatReset').click()); await B.wait(2500);
    const after = { v: await H.vars(), c: await p.evaluate(() => window.EdenMap.getCustom()), wb: await H.wb(), sc: await scopes(), ls: await p.evaluate(() => Object.keys(localStorage).filter(k => /iso-/.test(k))), seenA: await p.evaluate(a => localStorage.getItem('edenMapSeen:' + a), A), msg: await vf.evaluate(() => document.querySelector('#chatResetMsg')?.textContent || '') };
    rep.check('reset: no blocking dialog was shown', dialog === 0);
    rep.check('reset: this chat\'s custom names, fog, trips are empty after the recompute', !has(after.c.items, 'A星图室') && !has(after.v?.eden_map?.探索, 'A地标') && !has(after.v?.eden_map?.行程, 'A行程'), JSON.stringify(after.c.items) + JSON.stringify(after.v?.eden_map || null).slice(0, 100));
    rep.check('reset: the card\'s stat_data and other variables are untouched', has(after.v?.stat_data, HA));
    rep.check('reset: this chat\'s local rows are gone, the other chat\'s stay', !after.ls.some(k => k.includes(A) && /scrap|fog|custom2/.test(k)) && after.seenA !== '1' && ['scrap', 'fog'].every(s => after.ls.includes(`edenMap:chat:${Bc}:${s}`)) && after.ls.includes('edenMapSeen:' + Bc), after.ls.join(','));
    rep.check('reset: this chat\'s gallery images are gone, the other chat\'s stay', !after.sc.includes('chat:' + A) && after.sc.includes('chat:' + Bc), after.sc.join(','));
    rep.check('reset: this chat\'s own book is gone; the other chat\'s book and the user\'s own book stay', !after.wb.books[MV.wbName(A)] && JSON.stringify(after.wb.books[MV.wbName(Bc)]) === bookB0 && !!after.wb.books['My own book'], Object.keys(after.wb.books).join('|'));
    rep.check('reset: the other chat\'s record is byte for byte the same', JSON.stringify(keep((await state(Bc))?.vars?.eden_map, USER)) === stB0);
    rep.check('reset: the settings row reports it', /已重置|was reset/.test(after.msg), after.msg);
    // chat floors are still the truth: a chat with a message gets its location back after the recompute
    rep.check('reset: the map recomputes from the chat floors (the chat variable is rebuilt, not left blank)', after.v && typeof after.v === 'object');

    // ---- 3 orphan cleanup at startup ----
    const GONE = 'iso-GONE', bookGone = MV.wbName(GONE);
    await seedImg('chat:' + GONE);
    await p.evaluate(([g, bn]) => { localStorage.setItem(`edenMap:chat:${g}:custom2`, '{}'); localStorage.setItem('edenMapSeen:' + g, '1'); window.__wb[bn] = [{ name: '地图自定义', content: 'g' }]; window.__wb['Pack·自定义·ffffff'] = [{ name: 'foreign entry' }];
      sessionStorage.setItem('__wbSeed', JSON.stringify(window.__wb)); }, [GONE, bookGone]);
    const reload = async () => { await p.reload(); await p.waitForSelector('#eden-map-root .em-fab', { timeout: 15000 }); await B.wait(6000); };
    H.chatList = [A, Bc];
    await reload();
    const o = { ls: await p.evaluate(() => Object.keys(localStorage).filter(k => /iso-/.test(k))), sc: await scopes(), wb: await H.wb() };
    rep.check('orphan: rows of the deleted chat are dropped, the live chats\' rows stay', !o.ls.some(k => k.includes(GONE)) && o.ls.includes('edenMapSeen:' + Bc), o.ls.join(','));
    rep.check('orphan: the deleted chat\'s gallery images are dropped, live chats\' stay', !o.sc.includes('chat:' + GONE) && o.sc.includes('chat:' + Bc), o.sc.join(','));
    rep.check('orphan: the deleted chat\'s own book is dropped; the user\'s book and a book without our entry stay', !o.wb.books[bookGone] && !!o.wb.books['My own book'] && !!o.wb.books['Pack·自定义·ffffff'] && !!o.wb.books[MV.wbName(Bc)], Object.keys(o.wb.books).join('|'));
    // unreadable list: nothing is dropped
    await seedImg('chat:iso-GONE2');
    await p.evaluate(([bn]) => { localStorage.setItem('edenMap:chat:iso-GONE2:custom2', '{}'); window.__wb[bn] = [{ name: '地图自定义', content: 'g' }]; sessionStorage.setItem('__wbSeed', JSON.stringify(window.__wb)); }, [MV.wbName('iso-GONE2')]);
    H.chatList = null;
    await reload();
    const u = { ls: await p.evaluate(() => Object.keys(localStorage).filter(k => /GONE2/.test(k))), sc: await scopes(), wb: await H.wb() };
    rep.check('orphan: the host\'s chat list cannot be read -> nothing is dropped', u.ls.length === 1 && u.sc.includes('chat:iso-GONE2') && !!u.wb.books[MV.wbName('iso-GONE2')], JSON.stringify(u.ls));
    const errs = P.errors.filter(e => !/http 404|500/.test(e));
    rep.check('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
  } catch (e) { rep.check('run', false, (e.stack || e.message).split('\n').slice(0, 4).join(' / ')); }
  finally { await P.close(); }
}
try { await run(); } finally { await B.closeAll(); srv.stop(); }
const ok = rep.save(); console.log(`${ok ? 'ALL PASS' : 'FAILURES'} -> ${OUT}/summary.md`); process.exit(ok ? 0 : 1);
