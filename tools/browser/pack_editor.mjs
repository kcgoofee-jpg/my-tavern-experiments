// node tools/browser/pack_editor.mjs <output dir> -- S9b: from tier 0 to a pack with a base map, no code, no terminal (docs/zero-config.md §7, §8; K-R100 .. K-R102; todo E-08).
// A stub tavern with an unfamiliar card (the S9-3 fixture en_harbour) -> the automatic schematic -> Settings -> Advanced -> edit mode on -> on the root "use a picture as this place's map" with a generated
// PNG -> drag one marker -> change one node's parent -> add one alias -> attach one picture to a node -> a private picture is added -> export -> discard the draft -> import the file ->
// the base map, the moved position (+-0.005), the parent, the alias and the picture are there; the private picture is not in the exported text. A pack whose picture `src` is `javascript:` or `http://`
// shows no picture and has one problem entry; an https picture is a placeholder while the link switch is off and an <img> when it is on. Desktop and 375 px.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { BASE, REPO_ROOT, closeAll, ensureServer, newPage, shot, wait } from './lib.mjs';
import { openHost } from './host_stub.mjs';
import { parseShape } from '../../map/core/yaml-shape.mjs';

const out = process.argv[2] || '/tmp/pack_editor';
fs.mkdirSync(out, { recursive: true });
await ensureServer();
const res = []; let fail = 0;
const ok = (name, cond, extra = {}) => { res.push({ name, ok: !!cond, ...extra }); if (!cond) fail++; };
const src = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'tests/fixtures/cardread/en_harbour.json'), 'utf8')).src;
const stubOf = chat => ({ charData: { data: { name: src.name, creator: src.creator, first_mes: src.greeting }, avatar: src.avatar }, charLive: true, rawStat: true, stat: parseShape(src.initvar), chat, msgs: [],
  charBooks: { names: { primary: 'book', additional: [] }, books: { book: src.books[0].entries.map(e => ({ name: e.title, strategy: { keys: e.keys }, enabled: e.enabled !== false, content: /initvar/i.test(e.title) ? src.initvar : 'text' })) } } });

// a made-up picture: a w x h PNG of one colour (written with zlib, no library)
const crc = b => { let c, t = crc.t ||= Array.from({ length: 256 }, (_, n) => { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; }); let x = ~0; for (const v of b) x = t[(x ^ v) & 255] ^ (x >>> 8); return ~x >>> 0; };
const chunk = (t, d) => { const b = Buffer.concat([Buffer.from(t), d]), l = Buffer.alloc(4), c = Buffer.alloc(4); l.writeUInt32BE(d.length); c.writeUInt32BE(crc(b)); return Buffer.concat([l, b, c]); };
const png = (w, h, [r, g, b]) => { const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())]), raw = Buffer.concat(Array.from({ length: h }, () => row)), ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); };
const FILES = { map: path.join(out, 'basemap.png'), pic: path.join(out, 'picture.png'), priv: path.join(out, 'private.png') };
fs.writeFileSync(FILES.map, png(320, 200, [40, 90, 140])); fs.writeFileSync(FILES.pic, png(64, 48, [200, 120, 30])); fs.writeFileSync(FILES.priv, png(30, 30, [10, 200, 80]));

const regOf = v => v.evaluate(() => { const rg = ViewerDebug.mapRegistry; return { cur: ViewerDebug.currentMapId, start: rg.start, maps: Object.fromEntries(Object.entries(rg.maps).map(([k, m]) => [k, { title: m.title, base: typeof m.base === 'string' ? m.base : m.base?.type === 'image' ? m.base.url.slice(0, 22) : '', marks: Object.entries(m.markers || {}).map(([id, x]) => [id, x.name]) }])) }; });
const spots = v => v.evaluate(async () => { const o = {}; for (const [k, p] of ViewerDebug.jsonCache) if (/^v2\//.test(k)) o[k] = (await p).markers.map(m => [m.id, +m.nx.toFixed(4), +m.ny.toFixed(4)]); return o; });
const tcp = host => host.evaluate(() => window.__tcPack ? { id: window.__tcPack.id, source: window.__tcPack.source, problems: (window.__tcPack.problems || []).map(p => p.code + ':' + (p.path || '')), manifest: window.__tcPack.manifest } : null);
const openCard = async (v, id) => { await v.locator(`.mk[data-mid="${id}"]`).click(); await v.waitForSelector('#card:not([hidden]) .editbox', { timeout: 8000 }); };
const chooser = async (P, v, label, file) => { const [fc] = await Promise.all([P.page.waitForEvent('filechooser', { timeout: 8000 }), v.locator('.editbox button', { hasText: label }).click()]); await fc.setFiles(file); };
const privateBytes = v => v.evaluate(async () => {   // every private record in the gallery database as a data URL
  const all = (await new Promise(res => { const q = indexedDB.open('edenRoomGallery'); q.onsuccess = () => { const g = q.result.transaction('images').objectStore('images').getAll(); g.onsuccess = () => res(g.result); }; })).filter(r => !/^edit:/.test(r.scope));   // private records only: the `edit:` scope holds the draft's own pack pictures
  const urls = []; for (const r of all) urls.push(await new Promise(res => { const f = new FileReader(); f.onload = () => res(f.result); f.readAsDataURL(r.blob); }));
  return { n: all.length, rooms: all.map(r => r.roomId), urls }; });

async function desktop() {
  const P = await newPage('desktop', { lang: 'en' }), pg = P.page;
  try {
    await P.ctx.addInitScript(() => { try { localStorage.setItem('edenMapLine', 'vpn'); localStorage.setItem('edenMapHint', '1'); } catch (e) {} });
    const H = await openHost(P, stubOf('pe-chat')); await wait(1500);
    const host = async () => (await pg.$('#card')).contentFrame();
    await H.open(); let v = await H.viewer();
    await v.waitForFunction(() => ViewerDebug.currentMapId && document.querySelectorAll('.mk').length > 2, null, { timeout: 25000 }).catch(() => {});
    let r = await regOf(v); const root = r.maps.root;
    ok('start: the automatic schematic opens with markers, no retry card', !!root && root.marks.length >= 3 && /^data:image\/svg/.test(root.base) && !(await v.evaluate(() => !!document.querySelector('#tileRetry:not([hidden])'))), { cur: r.cur, root });
    ok('edit mode is off by default: no edit bar, no edit box on a card, the switch is registered', !(await v.evaluate(() => !!document.querySelector('#editBar'))) && (await v.evaluate(() => localStorage.getItem('edenMapEdit') || localStorage.getItem('tcp.' + window.__packId + '.Edit'))) !== '1');
    // Settings -> Advanced -> edit mode on
    await v.evaluate(() => SettingsApi.open('adv')); await v.waitForSelector('#optEdit', { state: 'visible', timeout: 8000 });
    await v.locator('#optEdit').check(); await v.waitForSelector('#editBar', { timeout: 8000 });
    ok('edit mode on: the edit bar is drawn', await v.evaluate(() => !!document.querySelector('#editBar button')), {});
    await v.evaluate(() => ViewerDebug.showSet(false)); await wait(300);
    // (1) root: use a picture as this place's map
    await openCard(v, 'root'); await shot(pg, out, 'edit_card');
    await chooser(P, v, /Use a picture as this place's map|用一张图作这里的地图/, FILES.map);
    await v.waitForFunction(() => /^data:image\/webp/.test(ViewerDebug.mapRegistry.maps.root?.base?.url || ''), null, { timeout: 15000 }).catch(() => {});
    await wait(1500); r = await regOf(v);
    ok('(1) the root has its picture as base map (a WebP data URL), the children are still its markers, OSD opened it', /^data:image\/webp/.test(r.maps.root.base) && r.maps.root.marks.length >= 3 && (await v.evaluate(() => /^data:/.test(ViewerDebug.osdViewer.world.getItemAt(0)?.source?.url || ''))), { base: r.maps.root.base, marks: r.maps.root.marks.length });
    // (1b) two new places: a name in the bar, then a tap on the map
    const nm = v.locator('#editBar input'), canvas = await v.locator('#osd canvas').first().boundingBox();
    for (const [name, fx, fy] of [['Boathouse', 0.3, 0.7], ['Signal Hill', 0.7, 0.3]]) {
      await nm.fill(name); await v.locator('#editNew, #editBar button', { hasText: /New place|新地点/ }).first().click();
      await pg.mouse.click(canvas.x + canvas.width * fx, canvas.y + canvas.height * fy); await wait(1500);
    }
    r = await regOf(v); const names = r.maps.root.marks.map(m => m[1]);
    ok('(1b) "New place" puts two new places on the map as markers', names.includes('Boathouse') && names.includes('Signal Hill') && r.maps.root.marks.length >= 5, { names });
    const ids = r.maps.root.marks.map(m => m[0]).filter(id => id !== 'root'); const [A, B, C, D, E] = [...ids, ...ids];
    const before = (await spots(v))[Object.keys(await spots(v)).find(k => /\/root\.json$/.test(k))];
    await shot(pg, out, 'edit_basemap');
    // (2) drag one marker
    const mk = v.locator(`.mk[data-mid="${A}"]`), bb = await mk.boundingBox();
    await pg.mouse.move(bb.x + 6, bb.y + 6); await pg.mouse.down(); await pg.mouse.move(bb.x + 40, bb.y + 30, { steps: 6 }); await pg.mouse.move(bb.x + 90, bb.y + 60, { steps: 6 }); await pg.mouse.up(); await wait(1800);
    const afterDrag = (await spots(v))[Object.keys(await spots(v)).find(k => /\/root\.json$/.test(k))], pa = before.find(m => m[0] === A), pb = afterDrag.find(m => m[0] === A);
    ok('(2) dragging a marker moved it (the new position is kept in the draft and shown at once)', !!pa && !!pb && (Math.abs(pa[1] - pb[1]) > 0.02 || Math.abs(pa[2] - pb[2]) > 0.02), { before: pa, after: pb });
    // (3) change one node's parent
    await openCard(v, B); const opts = await v.evaluate(() => [...document.querySelectorAll('#card .editbox select option')].map(o => [o.value, o.textContent]));
    const to = opts.find(([id]) => id !== 'root' && id !== B && id !== A && id !== C) || opts[1];
    await v.locator('#card .editbox select').selectOption(to[0]); await wait(1200);
    // (4) add one alias to node C
    await v.evaluate(() => ViewerDebug.closeCard()); await openCard(v, C);
    const nameC = (await regOf(v)).maps.root.marks.find(m => m[0] === C)?.[1];
    await v.locator('#card .editbox input[type=text]').fill('the quiet corner'); await v.locator('#card .editbox button', { hasText: /^(Add|加上)$/ }).first().click(); await wait(1000);
    const hit = await v.evaluate(w => { const x = ViewerDebug.hereRes(w); return x ? { map: x.map, marker: x.marker || '', word: x.word } : null; }, 'the quiet corner');
    ok('(4) the alias locates the node (the vocabulary was rebuilt)', !!hit && hit.marker === C, { hit, C, nameC });
    // (5) attach one picture to node D; (6) a private picture on node E through its gallery
    await v.evaluate(() => ViewerDebug.closeCard()); await openCard(v, D);
    await chooser(P, v, /Add picture|加图片/, FILES.pic); await wait(1200);
    await v.evaluate(() => ViewerDebug.closeCard()); await openCard(v, E);
    await v.locator('#card .editbox button', { hasText: /Pictures|图片 ›/ }).click(); await v.waitForSelector('.rgp-file', { state: 'attached', timeout: 8000 });
    await v.locator('.rgp-file').setInputFiles(FILES.priv);
    await v.waitForFunction(() => document.querySelector('.rgp-item[data-id]'), null, { timeout: 8000 }).catch(() => {});
    const gal = await v.evaluate(() => ({ priv: document.querySelectorAll('.rgp-item[data-id]').length, addBtn: !!document.querySelector('.rgp-item[data-id] [data-act="pack"]'), badge: [...document.querySelectorAll('.rgp-badge')].map(b => b.textContent) }));
    ok('(6) a private picture can be added to a node; "add to pack" is offered in edit mode', gal.priv === 1 && gal.addBtn, gal);
    await shot(pg, out, 'edit_gallery'); await v.evaluate(() => document.querySelector('.rgp-x')?.click());
    const pbytes = await privateBytes(v);
    // (7) export
    const dl = pg.waitForEvent('download', { timeout: 10000 }).catch(() => null);
    await v.locator('#editBar button', { hasText: /Export|导出/ }).click();
    const d = await dl; let text = '', fname = ''; if (d) { fname = d.suggestedFilename(); text = fs.readFileSync(await d.path(), 'utf8'); }
    const file = text ? JSON.parse(text) : null, t0 = await tcp(await host());
    ok('(7) export writes <id>.pack.json with the base map, the moved position, the parent, the alias and the picture', !!file && fname === t0.id + '.pack.json' && /^data:image\/webp/.test(file.media[file.views.root.media]?.src || '') && file.nodes.find(n => n.id === B).parent === to[0]
      && file.nodes.find(n => n.id === C).alias.includes('the quiet corner') && file.nodes.find(n => n.id === D).media?.length === 1 && Math.abs(file.nodes.find(n => n.id === A).at.x - pb[1]) <= 0.005, { fname, views: file?.views, to });
    const leak = pbytes.urls.some(u => text.includes(u.slice(u.indexOf(',') + 1, u.indexOf(',') + 61)) && u.length > 100) || /"n:/.test(text) || pbytes.rooms.some(room => text.includes(room));
    ok('(7) the private picture is in the browser (' + pbytes.n + ' record) and not in the exported text', pbytes.n >= 1 && !leak, { rooms: pbytes.rooms });
    const want = { spots: (await spots(v)), parent: to[0] };
    // (8) discard the draft, then import the file: everything is back
    await v.locator('#editDiscard').click(); await wait(1500); r = await regOf(v);
    ok('(8) discarding the draft shows the schematic again', /^data:image\/svg/.test(r.maps.root.base), { base: r.maps.root.base });
    await v.evaluate(() => { window.__noop = 1; }); await pg.evaluate(() => { window.__vars = {}; });
    await v.evaluate(t => ViewerDebug.post({ type: 'eden-map:pack-pick', kind: 'file', text: t }), text);
    await wait(6500); const t1 = await tcp(await host());
    await H.open(); v = await H.viewer();
    await v.waitForFunction(() => ViewerDebug.currentMapId && document.querySelectorAll('.mk').length > 2, null, { timeout: 25000 }).catch(() => {});
    r = await regOf(v); const sp2 = await spots(v), key = Object.keys(sp2).find(k => /\/root\.json$/.test(k)), wantKey = Object.keys(want.spots).find(k => /\/root\.json$/.test(k));
    const moved = key && sp2[key].every(([id, x, y]) => { const w = want.spots[wantKey].find(m => m[0] === id); return w && Math.abs(w[1] - x) <= 0.005 && Math.abs(w[2] - y) <= 0.005; });
    ok('(8) import: the file is this card\'s pack, the base map is there, every marker is within 0.005 of where it was', t1 && t1.source === 'choice' && t1.id === t0.id && /^data:image\/webp/.test(r.maps.root.base) && moved, { source: t1?.source, base: r.maps.root.base, moved });
    ok('(8) import: parent, alias and picture are in the imported pack; the draft is empty', t1.manifest.nodes.find(n => n.id === B).parent === to[0] && t1.manifest.nodes.find(n => n.id === C).alias.includes('the quiet corner') && Object.keys(t1.manifest.media).length === 2 && t1.problems.length === 0, { problems: t1.problems });
    await v.evaluate(() => ViewerDebug.closeCard()); await openCard(v, D); await v.locator('#card .editbox button', { hasText: /Pictures|图片 ›/ }).click(); await v.waitForSelector('.rgp-grid', { timeout: 8000 });
    const picG = await v.evaluate(() => ({ pack: [...document.querySelectorAll('.rgp-item[data-pack] img')].map(i => i.src.slice(0, 22)), priv: document.querySelectorAll('.rgp-item[data-id]').length }));
    ok('(8) the node\'s gallery shows the pack picture first (a WebP data URL) and no private picture of node E', picG.pack.length === 1 && /^data:image\/webp/.test(picG.pack[0]) && picG.priv === 0, picG);
    await v.evaluate(() => document.querySelector('.rgp-x')?.click());
    ok('no script error in the main flow', !P.errors.some(e => /^pageerror/.test(e)), { errors: P.errors.slice(0, 3) });
    // (9) refused sources: one problem each, no picture; https is a placeholder while the switch is off
    const base = JSON.parse(text), nid = base.nodes.find(n => n.id === D).id;
    const variant = (media, list) => { const m = JSON.parse(text); m.media = { ...m.media, ...media }; m.nodes.find(n => n.id === nid).media = [...(m.nodes.find(n => n.id === nid).media || []), ...list]; return JSON.stringify(m); };
    const load = async (t) => { await v.evaluate(x => ViewerDebug.post({ type: 'eden-map:pack-pick', kind: 'file', text: x }), t); await wait(6500); await H.open(); v = await H.viewer(); await v.waitForFunction(() => ViewerDebug.currentMapId && document.querySelectorAll('.mk').length > 2, null, { timeout: 25000 }).catch(() => {}); };
    const gallery = async () => { await v.evaluate(() => ViewerDebug.closeCard()); await openCard(v, D); await v.locator('#card .editbox button', { hasText: /Pictures|图片 ›/ }).click(); await v.waitForSelector('.rgp-grid', { timeout: 8000 }); await wait(400);
      const g = await v.evaluate(() => ({ imgs: [...document.querySelectorAll('.rgp-item[data-pack] img')].map(i => i.getAttribute('src').slice(0, 40)), ph: [...document.querySelectorAll('.rgp-item[data-pack] .rgp-ph')].map(p => p.textContent) })); await v.evaluate(() => document.querySelector('.rgp-x')?.click()); return g; };
    for (const [label, srcv] of [['javascript:', 'javascript:alert(1)'], ['http://', 'http://cdn.example.test/a.png']]) {
      await load(variant({ bad: { src: srcv } }, ['bad'])); const t = await tcp(await host()), g = await gallery();
      ok(`(9) a picture with src ${label} is refused: one problem entry, no picture shown`, t.problems.filter(p => /^pattern:media\.bad/.test(p)).length === 1 && t.problems.length === 1 && !g.imgs.some(s => /javascript|http:/.test(s)) && !g.ph.some(s => s) && g.imgs.length === 1, { problems: t.problems, g });
    }
    await load(variant({ link: { src: 'https://cdn.example.test/pics/a.png', note: 'a link picture' } }, ['link'])); let g = await gallery();
    ok('(9) an https picture is a placeholder with its note while the link switch is off', g.imgs.length === 1 && g.ph.length === 1 && /link picture/.test(g.ph[0]), g);
    await v.evaluate(() => SettingsApi.open('adv')); await v.locator('#optPackRemote').check(); await wait(500); await v.evaluate(() => ViewerDebug.showSet(false)); g = await gallery();
    ok('(9) with the switch on the https picture is an <img>', g.imgs.some(s => s.startsWith('https://cdn.example.test/')) && g.ph.length === 0, g);
    await v.evaluate(() => SettingsApi.open('adv')); await v.locator('#optPackRemote').uncheck(); await v.locator('#optEdit').uncheck(); await wait(500);
    ok('turning edit mode off removes the bar', !(await v.evaluate(() => !!document.querySelector('#editBar'))), {});
    ok('no script error after the refused-source packs', !P.errors.some(e => /^pageerror/.test(e)), { errors: P.errors.slice(0, 3) });
  } catch (e) { ok('the desktop flow did not throw: ' + e.message.split('\n')[0], false, { stack: String(e.stack).split('\n').slice(0, 4) }); }
  await P.ctx.close().catch(() => {});
}
async function phone() {   // 375 px: the bar and the card controls are reachable and at least 44 px high
  const P = await newPage('phone', { lang: 'en' });
  try {
    await P.ctx.addInitScript(() => { try { localStorage.setItem('edenMapLine', 'vpn'); localStorage.setItem('edenMapHint', '1'); localStorage.setItem('edenMapEdit', '1'); } catch (e) {} });
    const H = await openHost(P, stubOf('pe-ph')); await wait(1500);
    await P.page.evaluate(() => document.querySelector('#eden-map-root .em-fab').click()); await wait(3000); const v = await H.viewer();
    await v.waitForSelector('#editBar', { timeout: 20000 }).catch(() => {});
    const spot = await v.evaluate(() => { const m = [...document.querySelectorAll('.mk[data-mid]')].map(e => ({ id: e.dataset.mid, r: e.getBoundingClientRect() })).find(x => x.r.width > 0 && x.r.left >= 0 && x.r.right <= innerWidth && x.r.top >= 60 && x.r.bottom <= innerHeight * 0.55); return m ? { id: m.id, x: m.r.left + m.r.width / 2, y: m.r.top + m.r.height / 2 } : null; });
    if (spot) { const f = await (await P.page.$('#eden-map-root .em-frame')).boundingBox(); await P.page.touchscreen.tap(f.x + spot.x, f.y + spot.y); }
    await v.waitForSelector('#card:not([hidden]) .editbox', { timeout: 8000 }).catch(() => {});
    const m = await v.evaluate(() => { const hs = el => [...el.querySelectorAll('button, select, input')].filter(e => e.offsetParent).map(e => Math.round(e.getBoundingClientRect().height)); const b = document.querySelector('#editBar'), c = document.querySelector('#card .editbox'); return { w: innerWidth, bar: b ? { hs: hs(b), right: Math.round(b.getBoundingClientRect().right) } : null, box: c ? hs(c) : null, scroll: document.documentElement.scrollWidth }; });
    ok('375 px: the edit bar and the card controls are drawn, every control is at least 44 px high, nothing overflows sideways', !!m.bar && !!m.box && m.bar.hs.every(h => h >= 44) && m.box.every(h => h >= 44) && m.bar.right <= m.w && m.scroll <= m.w + 1, m);
    await shot(P.page, out, 'edit_phone');
  } catch (e) { ok('the phone flow did not throw: ' + e.message.split('\n')[0], false); }
  await P.ctx.close().catch(() => {});
}
try { await desktop(); await phone(); } catch (e) { ok('the probe itself did not throw: ' + e.message, false); } finally { await closeAll(); }
for (const r of res) console.log(r.ok ? '✓' : '✗', r.name, r.ok ? '' : JSON.stringify(r).slice(0, 600));
console.log(`pack_editor: ${res.filter(r => r.ok).length}/${res.length}`); console.log(fail ? `FAIL ${fail}` : 'PASS'); process.exit(fail ? 1 : 0);
