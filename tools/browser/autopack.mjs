// node tools/browser/autopack.mjs <output dir> -- S9-3: an unfamiliar card gets an automatic pack (docs/zero-config.md §3, §4, §6; K-R93 .. K-R95, K-R98) in a stub tavern.
// Per made-up card (tests/fixtures/cardread: en_harbour, zh_city): (a) the viewer opens a schematic of the card's places, no retry card, the root named after the card; (b) the current place (the
// location variable) lands on its node; (c) a place tag in a message grows a node under its parent (rev 2) and the viewer shows it; (d) a person of the roster table is in the characters tab and a
// picked-up item is in the Items tab; (e) export -> import the file -> the same node ids, the same located node, the same marker positions; (f) desktop and 375 px screenshots.
import fs from 'node:fs';
import path from 'node:path';
import { BASE, REPO_ROOT, closeAll, ensureServer, newPage, shot, wait } from './lib.mjs';
import { openHost } from './host_stub.mjs';
import { parseShape } from '../../map/core/yaml-shape.mjs';

const out = process.argv[2] || '/tmp/autopack';
await ensureServer();
const res = []; let fail = 0;
const ok = (name, cond, extra = {}) => { res.push({ name, ok: !!cond, ...extra }); if (!cond) fail++; };
const fx = n => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'tests/fixtures/cardread', n + '.json'), 'utf8')).src;
const CASES = {
  en_harbour: { here: 'The Salty Anchor Inn', tag: 'The fog lifts. Wren picks up the \'Brass Key\' from the counter.\n⌖地点 Lantern Docks · Harbour Office', grown: 'Harbour Office', parent: 'Lantern Docks', person: 'Mara Venn', item: 'Brass Key', setup: 'Docks' },
  zh_city: { here: '听雨阁', tag: '林三娘拿起了「铜钥匙」，转身走进后院。\n⌖地点 听雨阁·后院', grown: '后院', parent: '听雨阁', person: '林三娘', item: '铜钥匙', setup: '主街' },
};
const stubOf = (src, chat) => ({ charData: { data: { name: src.name, creator: src.creator, first_mes: src.greeting }, avatar: src.avatar }, charLive: true, rawStat: true, stat: parseShape(src.initvar), chat, msgs: [],
  charBooks: { names: { primary: 'book', additional: [] }, books: { book: src.books[0].entries.map(e => ({ name: e.title, strategy: { keys: e.keys }, enabled: e.enabled !== false, content: /initvar/i.test(e.title) ? src.initvar : 'text' })) } } });
const regOf = v => v.evaluate(() => { const cur = ViewerDebug.currentMapId, rg = ViewerDebug.mapRegistry; return { cur, maps: Object.fromEntries(Object.entries(rg.maps).map(([k, m]) => [k, { title: m.title, marks: Object.entries(m.markers || {}).map(([id, x]) => [id, x.name]) }])),
  retry: !!document.querySelector('#tileRetry:not([hidden])'), here: document.querySelector('.mk.here')?.dataset.name || '', title: document.title }; });
const pointFiles = v => v.evaluate(async () => { const o = {}; for (const [k, p] of [...ViewerDebug.jsonCache].sort((a, b) => (a[0] < b[0] ? -1 : 1))) if (/^v2\//.test(k)) o[k] = await p; return o; });
const treeSig = v => v.evaluate(() => { const rg = ViewerDebug.mapRegistry; return Object.fromEntries(Object.entries(rg.maps).map(([k, m]) => [k, Object.keys(m.markers || {}).sort()])); });

async function flow(name, C) {
  const src = fx(name), P = await newPage('desktop'), pg = P.page;
  try {
    await P.ctx.addInitScript(() => { try { localStorage.setItem('edenMapLine', 'vpn'); localStorage.setItem('edenMapHint', '1'); } catch (e) {} });
    const H = await openHost(P, stubOf(src, 'ap-' + name));
    const host = async () => (await pg.$('#card')).contentFrame();
    const tcp = async () => (await host()).evaluate(() => window.__tcPack ? { id: window.__tcPack.id, source: window.__tcPack.source, rev: window.__tcPack.rev, fp: window.__tcPack.fp, nodes: window.__tcPack.manifest.nodes.length } : null);
    await wait(1500);
    const t0 = await tcp();
    ok(`${name}: the gate resolved the automatic pack (source auto, foreign, rev 1)`, t0 && t0.source === 'auto' && /^c_/.test(t0.id) && t0.rev === 1 && !!t0.fp, t0 || {});
    await H.open(); let v = await H.viewer();
    await v.waitForFunction(() => ViewerDebug.currentMapId && document.querySelectorAll('.mk').length > 0, null, { timeout: 20000 }).catch(() => {});
    let r = await regOf(v);
    ok(`${name} (a): a schematic opens (the greeting's view), no retry card, the root map is named after the card`, !!r.maps[r.cur] && r.maps[r.cur].marks.length >= 2 && r.maps.root?.title === src.name && r.maps.root.marks.length >= 3 && !r.retry, { cur: r.cur, title: r.maps.root?.title, marks: r.maps[r.cur]?.marks.length, retry: r.retry });
    await shot(pg, out, `${name}_open`);
    const here = await v.evaluate(h => { const x = ViewerDebug.hereRes(h); return x ? { map: x.map, marker: x.marker || '', word: x.word } : null; }, C.here);
    const hereMarkName = r.maps.root.marks.find(([id]) => id === here?.marker)?.[1];
    ok(`${name} (b): the current place lands on its node`, !!here && !!here.marker && /inn|阁|Anchor/i.test(hereMarkName || ''), { here, hereMarkName, mk: r.here });
    // (c) a place tag grows a node under its parent
    await H.setMsgs([{ message_id: 1, message: C.tag, role: 'assistant', is_user: false }]);
    await v.waitForFunction(g => Object.values(ViewerDebug.mapRegistry.maps).some(m => Object.values(m.markers || {}).some(x => x.name === g)), C.grown, { timeout: 20000 }).catch(() => {});
    r = await regOf(v); const t1 = await tcp();
    const owner = Object.entries(r.maps).find(([, m]) => m.title === C.parent)?.[0], onParent = !!owner && r.maps[owner].marks.some(([, n]) => n === C.grown);   // the parent became a map of its own: the new node is its marker
    ok(`${name} (c): "${C.grown}" appears under "${C.parent}" after the message (rev 2)`, onParent && t1.rev === 2, { owner, rev: t1.rev, nodes: t1.nodes, marks: owner ? r.maps[owner].marks.map(m => m[1]) : [] });
    // (d) people and items
    await v.evaluate(() => { ViewerDebug.closeCard(); document.querySelector('#evbar .chtab')?.click(); }); await wait(600);
    const ppl = await v.evaluate(() => [...document.querySelectorAll('#evbar .chgrp li')].map(li => li.textContent));
    ok(`${name} (d): a person of the roster table is in the characters tab`, ppl.some(t => t.includes(C.person)), { ppl: ppl.slice(0, 6) });
    await v.evaluate(() => ViewerDrawer.setTab('it', 'half')); await v.waitForFunction(i => [...document.querySelectorAll('.itrow b')].some(b => b.textContent.includes(i)), C.item, { timeout: 12000 }).catch(() => {});
    const items = await v.evaluate(() => [...document.querySelectorAll('.itrow b')].map(b => b.textContent));
    ok(`${name} (d): the picked-up item is in the Items tab`, items.some(t => t.includes(C.item)), { items });
    // (e) export, then import the file as the pack of this card
    const before = { files: await pointFiles(v), sig: await treeSig(v), here: await v.evaluate(h => ViewerDebug.hereRes(h)?.marker, C.here) };
    await v.evaluate(() => SettingsApi.open('adv')); await v.waitForSelector('#packBox button', { timeout: 8000 }).catch(() => {});
    const dl = pg.waitForEvent('download', { timeout: 8000 }).catch(() => null);
    await v.evaluate(() => [...document.querySelectorAll('#packBox button')].find(b => /Export as pack|导出为设定包/.test(b.textContent))?.click());
    const d = await dl; let text = '', fname = '';
    if (d) { fname = d.suggestedFilename(); text = fs.readFileSync(await d.path(), 'utf8'); }
    const note = await v.evaluate(() => document.querySelector('#packNote')?.textContent || '');
    const file = text ? JSON.parse(text) : null;
    ok(`${name} (e): export writes <id>.pack.json with the grown node and the card credits, and says whether it fits a card`, !!file && fname === t1.id + '.pack.json' && file.nodes.some(n => n.name === C.grown && n.id.startsWith('g_')) && file.credits?.card?.name === src.name && /KB/.test(note), { fname, note, nodes: file?.nodes.length });
    await shot(pg, out, `${name}_export`);
    await pg.evaluate(() => { window.__stub.msgs = window.__stub.msgs; window.__vars = {}; });   // a clean chat variable: nothing of the automatic pack's cache is left to help the import
    await v.evaluate(t => ViewerDebug.post({ type: 'eden-map:pack-pick', kind: 'file', text: t }), text);
    await wait(5500); const t2 = await tcp();
    ok(`${name} (e): the exported file imports as this card's pack (source choice, same id)`, t2 && t2.source === 'choice' && t2.id === t1.id, t2 || {});
    await H.open(); v = await H.viewer();
    await v.waitForFunction(() => ViewerDebug.currentMapId && document.querySelectorAll('.mk').length > 0, null, { timeout: 20000 }).catch(() => {});
    const after = { files: await pointFiles(v), sig: await treeSig(v), here: await v.evaluate(h => ViewerDebug.hereRes(h)?.marker, C.here) };
    ok(`${name} (e): the same node ids, the same located node, the same marker positions after the import`, JSON.stringify(after.sig) === JSON.stringify(before.sig) && after.here === before.here && JSON.stringify(after.files) === JSON.stringify(before.files) && Object.keys(before.files).length >= 2,
      { same: JSON.stringify(after.sig) === JSON.stringify(before.sig), here: [before.here, after.here], files: Object.keys(before.files), afterFiles: Object.keys(after.files) });
    ok(`${name}: no script error`, !P.errors.some(e => /^pageerror/.test(e)), { errors: P.errors.slice(0, 3) });
  } catch (e) { ok(`${name}: the flow did not throw (${e.message})`, false); }
  await P.ctx.close().catch(() => {});
}
async function phone(name, C) {   // 375 px: the schematic opens in the embedded panel
  const src = fx(name), P = await newPage('phone');
  try {
    await P.ctx.addInitScript(() => { try { localStorage.setItem('edenMapLine', 'vpn'); localStorage.setItem('edenMapHint', '1'); } catch (e) {} });
    const H = await openHost(P, stubOf(src, 'ap-ph-' + name)); await wait(1500);
    await P.page.evaluate(() => document.querySelector('#eden-map-root .em-fab').click()); await wait(3000); const v = await H.viewer();
    await v.waitForFunction(() => ViewerDebug.currentMapId && document.querySelectorAll('.mk').length > 0, null, { timeout: 20000 }).catch(() => {});
    const r = await regOf(v), w = await v.evaluate(() => innerWidth);
    ok(`${name} (f): 375 px opens the schematic with its markers`, !!r.maps[r.cur] && !r.retry && r.maps[r.cur].marks.length >= 2 && w <= 400, { cur: r.cur, w, marks: r.maps[r.cur]?.marks.length });
    await shot(P.page, out, `${name}_phone`);
  } catch (e) { ok(`${name} (f): phone flow (${e.message})`, false); }
  await P.ctx.close().catch(() => {});
}
try { for (const [n, C] of Object.entries(CASES)) { await flow(n, C); await phone(n, C); } } catch (e) { ok('the probe itself did not throw: ' + e.message, false); } finally { await closeAll(); }
for (const r of res) console.log(r.ok ? '✓' : '✗', r.name, r.ok ? '' : JSON.stringify(r).slice(0, 500));
console.log(fail ? `FAIL ${fail}` : 'PASS'); process.exit(fail ? 1 : 0);
