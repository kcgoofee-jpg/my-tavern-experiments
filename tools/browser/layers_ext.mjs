// S8-3 probe: host-fed values, navigator overlays, local layers (EdenMap.addLayer), the local prop pack and the sound layer (docs/layers-schema.md §9-§12, K-R86..K-R89).
//   node tools/browser/layers_ext.mjs <out dir>
// The example pack (town) is opened inside a host page; the host's messages are posted from that page (the only source the viewer accepts). Checks:
//   (a) eden-map:layer-data with a fixture value and a test overlay layer `mvu:` -> points placed; applies.mvu gates a second test layer
//   (b) eden-map:ops with one clue (a town place name) and one marker -> `nav-ops` draws them on the right map, none on another map, none after the host clears them
//   (c) EdenMap.addLayer / setLayerData / removeLayer / layers(); an id without `local-` and a file: source are refused
//   (d) addProp with a generated PNG, WEBP, SVG and a minimal glb; placeProp -> `local-props` elements; a reload keeps the placements; an svg with <script is refused
//   (e) the town harbour-sound row exists, unticked; ticking it after a real click creates one AudioContext and SoundApi lists wind and crackle on town_harbour, nothing on town_hill;
//       a stored "on" creates no AudioContext until the first real click
//   (f) the first pack shows the two new kernel rows (pinned additions), hidden until they hold something
import fs from 'node:fs';
import path from 'node:path';
import * as B from './lib.mjs';

const OUT = process.argv[2] || '/tmp/layers_ext';
const rep = B.reporter(OUT);
const srv = await B.ensureServer();
const OVERLAY = JSON.parse(fs.readFileSync(path.join(B.REPO_ROOT, 'map/packs/town/overlay.v2.json'), 'utf8'));
const TEST_LAYERS = [
  { id: 'mvu-test', type: 'point', slot: 'markers', source: 'mvu:world.present', applies: { views: ['town_hill'] }, style: { color: '#ff00ff', size: 12 }, menu: { label: 'MVU test' } },
  { id: 'mvu-gate', type: 'area', slot: 'routes', applies: { views: ['town_hill'], mvu: { path: 'world.alert', min: 2 } }, style: { color: '#00ffff' }, data: { features: [{ view: 'town_hill', pts: [[0.1, 0.1], [0.3, 0.1], [0.3, 0.3]] }] }, menu: { label: 'MVU gate' } },
];
const initTown = [o => {
  try { localStorage.setItem('tcp.town.Lang', 'zh'); localStorage.setItem('tcp.town.Hint', '1'); localStorage.setItem('tcp.town.TierV2', 'save'); if (o.layers) localStorage.setItem('tcp.town.Layers', o.layers); } catch (e) {}
  try { const A = window.AudioContext; window.__acCount = 0; if (A) window.AudioContext = class extends A { constructor(...a) { super(...a); window.__acCount++; } }; } catch (e) {}   // counts the AudioContexts this page makes
}, { layers: '' }];
const frameOf = P => P.page.frames().find(f => f.url().includes('viewer.html'));
const ready = async f => { await f.waitForFunction(() => document.getElementById('loading')?.classList.contains('done'), null, { timeout: 30000, polling: 50 }).catch(() => {}); await B.wait(1500); };
async function openTown(P, q = '') {
  await P.page.route('**/packs/town/overlay.v2.json', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...OVERLAY, layers: [...OVERLAY.layers, ...TEST_LAYERS] }) }));
  const f = await B.openInHost(P, B.BASE + 'viewer.html?pack=town' + q); await ready(f); return f;
}
const hostPost = (P, m) => P.page.evaluate(msg => document.getElementById('f').contentWindow.postMessage(msg, '*'), { v: 2, ...m });   // posted by the host page, the only source the viewer accepts
const go = async (f, id) => { await f.evaluate(m => ViewerDebug.go(m), id); await B.wait(2500); };
const decl = f => f.evaluate(() => Object.fromEntries((window.DeclaredLayersApi?.describe() || []).map(d => [d.id, d])));
const row = (f, id) => f.evaluate(i => { const l = document.getElementById('lyr-' + i); return l ? { hidden: l.hidden, checked: !!l.querySelector('input')?.checked, text: l.querySelector('span')?.textContent } : null; }, id);
const count = (f, sel) => f.evaluate(s => document.querySelectorAll(s).length, sel);
const sound = f => f.evaluate(() => ({ ac: window.__acCount, desc: window.SoundApi?.describe?.() || null }));

try {
  const P = await B.newPage('desktop', { lang: 'zh', tier: 'save', scheme: 'dark', init: initTown });
  let f = await openTown(P);

  // ---- (f-town) the two kernel rows exist in the town too, hidden, ticked by default
  const k0 = { nav: await row(f, 'nav-ops'), props: await row(f, 'local-props') };
  rep.check('start: the kernel rows nav-ops and local-props exist, hidden until they hold something, unticked by default (INV-2)', k0.nav?.hidden && k0.props?.hidden && !k0.nav.checked && !k0.props.checked, JSON.stringify(k0));
  await f.evaluate(() => { for (const id of ['tgNavOps', 'tgProps']) document.getElementById(id).click(); }); await B.wait(300);   // the rest of the probe draws them, so the user's explicit choice is stored here

  // ---- (a) MVU values
  let d = await decl(f);
  rep.check('(a) before any layer-data the mvu: layer has no feature and the applies.mvu layer does not apply', d['mvu-test']?.count === 0 && d['mvu-gate'] && !d['mvu-gate'].applicable, JSON.stringify({ t: d['mvu-test'], g: d['mvu-gate'] }));
  await hostPost(P, { type: 'eden-map:layer-data', values: { 'world.present': ['旧堡', '集市广场', '不存在的地方'], 'world.alert': 3 } }); await B.wait(900);
  d = await decl(f);
  const pts = await count(f, '.lyr-pt:not([data-nav]):not(.lyr-prop)');
  rep.check('(a) layer-data places the two known place names as points on town_hill (the unknown name is dropped)', d['mvu-test']?.count === 2 && pts === 2, JSON.stringify({ t: d['mvu-test'], pts }));
  rep.check('(a) applies.mvu {min 2}: world.alert = 3 makes the gated layer apply and its polygon is drawn', d['mvu-gate']?.applicable && (await count(f, 'svg.lyr-svg[data-layer="mvu-gate"] path')) === 1, JSON.stringify(d['mvu-gate']));
  await hostPost(P, { type: 'eden-map:layer-data', values: { 'world.present': ['钟楼'], 'world.alert': 1 } }); await B.wait(900);
  d = await decl(f);
  rep.check('(a) a new value moves the points (one now) and world.alert = 1 switches the gated layer off', d['mvu-test']?.count === 1 && !d['mvu-gate']?.applicable && (await count(f, 'svg.lyr-svg[data-layer="mvu-gate"] path')) === 0, JSON.stringify({ t: d['mvu-test'], g: d['mvu-gate'] }));
  await hostPost(P, { type: 'eden-map:layer-data', values: {} }); await B.wait(500);

  // ---- (b) navigator overlays
  await hostPost(P, { type: 'eden-map:ops', clues: [{ name: '钟楼', nx: 0.5, ny: 0.5, urgency: 3, src: 'op', floor: 5, map: 'town_hill' }], markers: [{ id: 'm1', nx: 0.3, ny: 0.4, label: '营地', src: 'op', floor: 5, map: 'town_hill' }] }); await B.wait(900);
  const n1 = await f.evaluate(() => ({ clue: document.querySelectorAll('[data-nav="clue"]').length, marker: document.querySelectorAll('[data-nav="marker"]').length, label: [...document.querySelectorAll('[data-nav="label"]')].map(e => e.textContent), pulse: !!document.querySelector('[data-nav="clue"].pulse'), tip: document.querySelector('[data-nav="clue"]')?.title, api: window.NavOpsApi?.describe(), row: (() => { const l = document.getElementById('lyr-nav-ops'); return l ? { hidden: l.hidden, text: l.querySelector('span')?.textContent } : null; })() }));
  rep.check('(b) eden-map:ops: one clue (placed by its place name) and one marker with its label are drawn on town_hill; the row shows', n1.clue === 1 && n1.marker === 1 && n1.label.join() === '营地' && n1.pulse && n1.row && !n1.row.hidden && n1.row.text === 'AI 参谋标注' && !!n1.tip, JSON.stringify(n1));
  await go(f, 'town_harbour');
  const n2 = await f.evaluate(() => ({ drawn: document.querySelectorAll('[data-nav]').length, row: document.getElementById('lyr-nav-ops')?.hidden }));
  rep.check('(b) on another map (town_harbour) nothing is drawn and the row is hidden', n2.drawn === 0 && n2.row === true, JSON.stringify(n2));
  await go(f, 'town_hill');
  rep.check('(b) back on town_hill the two are drawn again', (await count(f, '[data-nav="clue"], [data-nav="marker"]')) === 2);
  await hostPost(P, { type: 'eden-map:ops', clues: [], markers: [] }); await B.wait(700);   // what the host sends on a chat change
  const n3 = await f.evaluate(() => ({ drawn: document.querySelectorAll('[data-nav]').length, row: document.getElementById('lyr-nav-ops')?.hidden }));
  rep.check('(b) after the host clears them (chat change) nothing is drawn and the row is hidden', n3.drawn === 0 && n3.row === true, JSON.stringify(n3));
  await hostPost(P, { type: 'eden-map:ops', clues: [{ name: '', nx: 0.8, ny: 0.8, urgency: 1, floor: 9, map: 'town_hill' }], markers: [] }); await B.wait(600);
  rep.check('(b) a clue whose name is empty is placed by its own coordinates on its stamped map', (await count(f, '[data-nav="clue"]')) === 1);
  await f.evaluate(() => document.getElementById('tgNavOps').click()); await B.wait(500);
  rep.check('(b) unticking the nav-ops row removes the drawing and stores the choice', (await count(f, '[data-nav]')) === 0 && /"nav-ops":"0"/.test(await f.evaluate(() => localStorage.getItem('tcp.town.Layers') || '')));
  await f.evaluate(() => document.getElementById('tgNavOps').click()); await hostPost(P, { type: 'eden-map:ops', clues: [], markers: [] }); await B.wait(400);

  // ---- (c) EdenMap.addLayer and friends
  const add = await f.evaluate(() => EdenMap.addLayer({ id: 'local-test', type: 'area', slot: 'routes', data: { features: [{ view: 'town_hill', pts: [[0.2, 0.2], [0.4, 0.2], [0.4, 0.4]] }] } }));
  await B.wait(700);
  const c1 = { row: await row(f, 'local-test'), n: await count(f, 'svg.lyr-svg[data-layer="local-test"] path'), d: await f.evaluate(() => document.querySelector('svg.lyr-svg[data-layer="local-test"] path')?.getAttribute('d')) };
  rep.check('(c) addLayer({ id: "local-test", type: "area", ... }) -> ok, a menu row and one polygon', add.ok && add.id === 'local-test' && c1.row && !c1.row.hidden && c1.row.text === 'test' && c1.n === 1, JSON.stringify({ add, c1 }));
  const set = await f.evaluate(() => EdenMap.setLayerData('local-test', [{ view: 'town_hill', pts: [[0.5, 0.5], [0.7, 0.5], [0.7, 0.7], [0.5, 0.7]] }, { view: 'town_hill', pts: [[0, 0]] }])); await B.wait(700);
  const d2 = await f.evaluate(() => document.querySelector('svg.lyr-svg[data-layer="local-test"] path')?.getAttribute('d'));
  rep.check('(c) setLayerData moves the polygon (the bad feature is dropped and reported)', set.ok && d2 && d2 !== c1.d && set.problems.length > 0, JSON.stringify({ set, d2 }));
  const lst = await f.evaluate(() => EdenMap.layers().find(l => l.id === 'local-test'));
  const kern = await f.evaluate(() => EdenMap.layers().filter(l => ['nav-ops', 'local-props', 'weather'].includes(l.id)).map(l => l.id));
  rep.check('(c) layers() lists the local layer (visible, applicable, source inline, count 1) and the kernel layers', lst && lst.visible && lst.applicable && lst.source === 'inline' && lst.count === 1 && kern.length === 3, JSON.stringify({ lst, kern }));
  const bad1 = await f.evaluate(() => EdenMap.addLayer({ id: 'bad', type: 'point', slot: 'markers', data: { features: [] } }));
  const bad2 = await f.evaluate(() => EdenMap.addLayer({ id: 'local-f', type: 'point', slot: 'markers', source: 'file:x.json' }));
  const bad3 = await f.evaluate(() => EdenMap.addLayer({ id: 'routes', type: 'line', slot: 'routes', data: { features: [] } }));
  rep.check('(c) an id without local- is refused, so are a file: source and a kernel id', !bad1.ok && bad1.problems.includes('local-id') && !bad2.ok && !bad3.ok, JSON.stringify({ bad1, bad2, bad3 }));
  const gone = await f.evaluate(() => EdenMap.removeLayer('local-test')); await B.wait(600);
  rep.check('(c) removeLayer removes the row and the drawing; a kernel layer cannot be removed', gone === true && !(await row(f, 'local-test')) && (await count(f, 'svg.lyr-svg[data-layer="local-test"]')) === 0 && (await f.evaluate(() => EdenMap.removeLayer('weather'))) === false);

  // ---- (d) the local prop pack
  const reqs = []; P.page.on('request', r => reqs.push(r.method() + ' ' + r.url()));
  const mk = await f.evaluate(async () => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 16; const cx = cv.getContext('2d'); cx.fillStyle = '#e6c36a'; cx.fillRect(0, 0, 16, 16);
    const blob = t => new Promise(r => cv.toBlob(r, t));
    const glb = new Uint8Array(12); glb.set([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 12, 0, 0, 0]);
    const svg = t => new File([t], 'icon.svg', { type: 'image/svg+xml' });
    const r = {};
    r.png = await EdenMap.addProp(new File([await blob('image/png')], 'Sprite.png'), { name: 'Sprite' });
    r.webp = await EdenMap.addProp(new File([await blob('image/webp')], 'Tile.webp'), { name: 'Tile' });
    r.glb = await EdenMap.addProp(new File([glb], 'Lantern.glb'), { name: 'Lantern' });
    r.svg = await EdenMap.addProp(svg('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#c33"/></svg>'), { name: 'Mark' });
    r.script = await EdenMap.addProp(svg('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), { name: 'Evil' });
    r.handler = await EdenMap.addProp(svg('<svg xmlns="http://www.w3.org/2000/svg" onload="x()"><rect/></svg>'), { name: 'Evil2' });
    r.text = await EdenMap.addProp(new File(['just some text'], 'a.png'), { name: 'Text' });
    const big = new Uint8Array(1.2 * 1024 * 1024).fill(1); big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    r.big = await EdenMap.addProp(new File([big], 'big.png'), { name: 'Big' });
    r.list = await EdenMap.props();
    return r;
  });
  rep.check('(d) addProp accepts png, webp, glb and svg (four props listed with their types)', mk.png.ok && mk.webp.ok && mk.glb.ok && mk.svg.ok && mk.list.map(p => p.type).join() === 'png,webp,glb,svg', JSON.stringify({ ok: [mk.png, mk.webp, mk.glb, mk.svg].map(x => x.id), list: mk.list }));
  rep.check('(d) refused: an svg with <script, an svg with an on-handler, text that is not a picture, an image over 1 MB (four refusals, nothing stored)', !mk.script.ok && mk.script.problems.includes('svg-script') && !mk.handler.ok && mk.handler.problems.includes('svg-handler') && !mk.text.ok && mk.text.problems.includes('prop-type') && !mk.big.ok && mk.big.problems.includes('prop-size'), JSON.stringify({ s: mk.script.problems, h: mk.handler.problems, t: mk.text.problems, b: mk.big.problems }));
  const pl = await f.evaluate(async ([a, g]) => [await EdenMap.placeProp(a, { map: 'town_hill', at: [0.3, 0.6] }), await EdenMap.placeProp(g, { map: 'town_hill', at: [0.6, 0.65] }), await EdenMap.placeProp(a, { map: 'town_hill', at: [2, 0] })], [mk.png.id, mk.glb.id]);
  await B.wait(800);
  const e1 = await f.evaluate(() => ({ n: document.querySelectorAll('.lyr-prop').length, img: document.querySelector('.lyr-prop img')?.src.slice(0, 5), cube: !!document.querySelector('.lyr-prop svg'), name: document.querySelector('.lyr-prop span')?.textContent, row: document.getElementById('lyr-local-props')?.hidden }));
  rep.check('(d) placeProp: two local-props elements (an <img> with a blob: URL, a cube icon with the name); a placement outside 0..1 is refused; the row shows', pl[0].ok && pl[1].ok && !pl[2].ok && e1.n === 2 && e1.img === 'blob:' && e1.cube && e1.name === 'Lantern' && e1.row === false, JSON.stringify({ pl, e1 }));
  await go(f, 'town_harbour');
  rep.check('(d) on another map the placements are not drawn', (await count(f, '.lyr-prop')) === 0);
  const keyShape = await f.evaluate(() => Object.keys(localStorage).filter(k => /:chat:.*:props$/.test(k)));
  rep.check('(d) the placements are stored per chat in the registered prefix (tcp.town.:chat:<id>:props)', keyShape.length === 1, JSON.stringify(keyShape));
  await P.page.reload(); f = frameOf(P); await ready(f); await B.wait(800);
  const e2 = await f.evaluate(async () => ({ n: document.querySelectorAll('.lyr-prop').length, props: (await EdenMap.props()).length, map: ViewerDebug.currentMapId }));
  rep.check('(d) after a reload the props and the placements are still there (props: 4)', e2.props === 4 && (e2.map === 'town_hill' ? e2.n === 2 : (await (async () => { await go(f, 'town_hill'); return count(f, '.lyr-prop'); })()) === 2), JSON.stringify(e2));
  const un = await f.evaluate(async () => [EdenMap.unplaceProp('p_nope', 'town_hill'), await EdenMap.unplaceProp('Lantern', 'town_hill')]); await B.wait(600);
  rep.check('(d) unplaceProp removes the placements of one prop on a map; removeProp removes the prop and its placements', un[1] === true && (await count(f, '.lyr-prop')) === 1 && (await f.evaluate(async () => EdenMap.removeProp('Sprite'))) === true && (await count(f, '.lyr-prop')) === 0, JSON.stringify(un));
  await f.evaluate(async () => { for (const p of await EdenMap.props()) await EdenMap.removeProp(p.id); });
  rep.check('(d) nothing left the device: no POST and no request that names a prop file', !reqs.some(x => /^POST|Sprite|Lantern|Tile\.webp|icon\.svg/.test(x)), reqs.filter(x => /^POST|Sprite|Lantern/.test(x)).join(' | '));
  rep.check('no page errors (host page, town)', !P.errors.length, P.errors.join(' | '));
  await P.ctx.close();

  // ---- (e) the sound layer
  {
    const Q = await B.newPage('desktop', { lang: 'zh', tier: 'save', scheme: 'dark', init: initTown });
    const g = await openTown(Q);
    await go(g, 'town_harbour');
    await g.evaluate(() => ViewerDebug.showLay(true)); await B.wait(300);
    const r0 = await row(g, 'harbour-sound'), s0 = await sound(g);
    rep.check('(e) town_harbour: the harbour-sound row exists with the pack\'s label and is unticked by default; no AudioContext yet; SoundApi lists the layer as inactive', r0 && !r0.hidden && !r0.checked && r0.text === '港口环境声' && s0.ac === 0 && s0.desc?.[0]?.id === 'harbour-sound' && !s0.desc[0].active && !s0.desc[0].scenes.length, JSON.stringify({ r0, s0 }));
    await g.evaluate(() => { window.__noGesture = (() => { const v = navigator.userActivation?.hasBeenActive; return v === undefined ? 'n/a' : v; })(); });
    await g.click('#lyr-harbour-sound'); await B.wait(1200);
    const r1 = await row(g, 'harbour-sound'), s1 = await sound(g);
    rep.check('(e) ticking the row with a real click creates exactly one AudioContext and SoundApi lists wind and crackle on town_harbour', r1?.checked && s1.ac === 1 && s1.desc?.[0]?.active && ['wind', 'crackle'].every(x => s1.desc[0].scenes.includes(x)), JSON.stringify({ r1, s1 }));
    const st = await g.evaluate(() => localStorage.getItem('tcp.town.Layers'));
    await go(g, 'town_hill');
    const s2 = await sound(g), r2 = await row(g, 'harbour-sound');
    rep.check('(e) on town_hill the layer does not apply: its row is greyed (S7-2, L-06: shown with a reason) and SoundApi lists no scene (still one AudioContext)', r2 && !r2.hidden && !s2.desc?.[0]?.active && s2.desc[0].scenes.length === 0 && s2.ac === 1, JSON.stringify({ r2, s2 }));
    await go(g, 'town_harbour');
    const s3 = await sound(g);
    rep.check('(e) back on town_harbour the scenes return; the choice is stored ("harbour-sound":"1")', s3.desc?.[0]?.scenes.includes('wind') && /"harbour-sound":"1"/.test(st || ''), JSON.stringify({ s3, st }));
    await g.click('#lyr-harbour-sound'); await B.wait(800);
    const s4 = await sound(g);
    rep.check('(e) unticking silences it (no scene) and the stored choice is "0"', !s4.desc?.[0]?.active && s4.desc[0].scenes.length === 0 && /"harbour-sound":"0"/.test(await g.evaluate(() => localStorage.getItem('tcp.town.Layers') || '')), JSON.stringify(s4));
    rep.check('no page errors (sound)', !Q.errors.length, Q.errors.join(' | '));
    await Q.ctx.close();
  }
  {
    const Q = await B.newPage('desktop', { lang: 'zh', tier: 'save', scheme: 'dark', init: [initTown[0], { layers: JSON.stringify({ 'harbour-sound': '1' }) }] });
    const g = await openTown(Q, '&map=town_harbour'); await B.wait(1000);
    const s0 = await sound(g), r0 = await row(g, 'harbour-sound');
    rep.check('(e) a stored "on" creates no AudioContext before a user gesture (the row reads ticked)', r0?.checked && s0.ac === 0, JSON.stringify({ r0, s0 }));
    await Q.page.mouse.click(400, 400); await B.wait(1200);
    const s1 = await sound(g);
    rep.check('(e) after the first real click the context is made and the scenes play', s1.ac === 1 && s1.desc?.[0]?.scenes.includes('wind'), JSON.stringify(s1));
    await Q.ctx.close();
  }

  // ---- (f) the first pack: the two new kernel rows (pinned additions)
  {
    const E = await B.newPage('desktop', { lang: 'zh', tier: 'save', scheme: 'dark' });
    await E.page.goto(B.BASE + 'viewer.html', { waitUntil: 'commit' }); await ready(E.page);
    const e = await E.page.evaluate(() => { const reg = window.LayerHostApi?.describe(); const rows = id => { const l = document.getElementById('lyr-' + id); return l ? { hidden: l.hidden, checked: !!l.querySelector('input')?.checked, text: l.querySelector('span')?.textContent } : null; };
      return { markers: reg?.slots.find(s => s.id === 'markers')?.layers, nav: rows('nav-ops'), props: rows('local-props'), all: reg?.slots.reduce((n, s) => n + s.layers.length, 0), ids: reg?.slots.map(s => s.id + ':' + s.layers.length).join(), menu: document.querySelectorAll('#layList > label').length, api: typeof window.EdenMap?.addLayer, noop: document.querySelectorAll('[data-nav], .lyr-prop').length }; });
    rep.check('(f) the first pack gains exactly two layers (nav-ops, local-props: 23 registered, 18 menu rows — AMBIENT-SOUND added the tier-ambience sound row), both rows hidden and unticked (INV-2), nothing drawn', e.all === 23 && e.menu === 18 && e.nav?.hidden && e.props?.hidden && !e.nav.checked && !e.props.checked && e.nav.text === 'AI 参谋标注' && e.props.text === '本机道具' && e.noop === 0, JSON.stringify(e));
    rep.check('(f) both sit in the markers slot after security and markers', e.markers?.join() === 'markers,security,nav-ops,local-props' || e.markers?.slice(-2).join() === 'nav-ops,local-props', JSON.stringify(e.markers));
    rep.check('no page errors (first pack)', !E.errors.length, E.errors.join(' | '));
    await E.ctx.close();
  }
} catch (err) { rep.check('probe ran to the end', false, String(err?.stack || err).slice(0, 500)); }
const ok = rep.save();
await B.closeAll(); srv.stop();
console.log(ok ? '全部通过' : '有失败');
process.exit(ok ? 0 : 1);
