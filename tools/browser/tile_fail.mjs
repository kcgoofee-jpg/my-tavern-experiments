// N13 probe: what the map does when its tiles (or a DZI) fail to load on the route a build was pinned to.
// A fake CDN answers https://cdn.jsdmirror.com/gh/o/r@<sha>/map/... and https://cdn.jsdelivr.net/gh/o/r@<sha>/map/... from the local map/ folder
// (same idea as follow_pin.mjs), so a route can be made to fail with page.route aborts while the other one works. The host script is loaded
// "pinned" (script base = .../r@<sha>/map/, window.__edenMapScript.sha set), the route is 'cn' (jsdmirror, the user's 没梯子).
// Cases (tc_upper at day and at night unless noted):
//   pinned      both routes up: every art request (DZI and tiles) goes to the pinned base on the chosen route (never @preview), base fills the extent,
//               markers inside the image; also with fog (迷雾探索) and the minimap on
//   switch      tiles blocked on the chosen route only: one automatic switch to the other route, tiles come from there, no toast, base in frame
//   both down   tiles blocked on both: toast shown and docked (does not cover the map centre), base still in the view frame, markers inside it
//   dzi down    the DZI blocked on both: a placeholder base placed by the view frame (bounds = extent), markers inside, toast docked
//   levels      the highest levels missing (404) on a working route: no toast, base fills the extent, for every sharpness tier x map x period
// Screenshots go to ~/eden-map-review/n13/.   node tools/browser/tile_fail.mjs [outdir]
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';
import fs from 'node:fs'; import path from 'node:path';
const OUT = process.argv[2] || 'tools/browser/out-tile-fail'; fs.mkdirSync(OUT, { recursive: true });
const SHOTS = path.join(process.env.HOME, 'eden-map-review/n13'); fs.mkdirSync(SHOTS, { recursive: true });
B.quietWait(); await B.ensureServer();
const rep = B.reporter(OUT);
const MAP = path.resolve(B.REPO_ROOT, 'map');
const SHA = 'c0ffee0123456789c0ffee0123456789c0ffee01', SHA12 = SHA.slice(0, 12), HOSTS = { cn: 'cdn.jsdmirror.com', vpn: 'cdn.jsdelivr.net' };
const TYPES = { '.json': 'application/json', '.mjs': 'text/javascript', '.js': 'text/javascript', '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.dzi': 'application/xml' };
const BANDS = [{ id: 'dawn' }, { id: 'day' }, { id: 'dusk' }, { id: 'night', dark: true }];
const HH = { dawn: 360, day: 720, dusk: 1080, night: 1380 };
const maps = JSON.parse(fs.readFileSync(path.join(MAP, 'data/maps.json'), 'utf8')).maps;
const near = (a, b) => Math.abs(a - b) <= 0.005 * Math.max(1, Math.abs(b));
const isTile = u => /_files\/\d+\/[\d_]+\.(jpg|png)$/.test(u), isDzi = u => /\.dzi$/.test(u);

// block = { cn: { tiles, dzi, levels: [n..] }, vpn: {...} }
async function openAt(block, { ls = {}, tier = 'hd', band = 'night', map = 'tc_upper', preset = 'desktop' } = {}) {
  const P = await B.newPage(preset, { tier }), reqs = [];
  await P.ctx.route(/^https:\/\/cdn\.(jsdmirror\.com|jsdelivr\.net)\/gh\/o\/r@[^/]+\/map\//, async route => {
    const u = new URL(route.request().url()), m = /\/gh\/o\/r@([^/]+)\/map\/(.*)$/.exec(u.pathname), ref = decodeURIComponent(m[1]), rel = decodeURIComponent(m[2]);
    const route_ = u.host === HOSTS.cn ? 'cn' : 'vpn', b = block[route_] || {}, lv = /_files\/(\d+)\//.exec(rel)?.[1];
    reqs.push({ route: route_, ref, rel });
    if (!SHA.startsWith(ref) || ref.length < 7) return route.fulfill({ status: 404, body: 'no such ref' });
    if (b.tiles && isTile(rel)) return route.abort();
    if (b.dzi && isDzi(rel)) return route.abort();
    if (b.levels && isTile(rel) && b.levels.includes(+lv)) return route.fulfill({ status: 404, body: 'nf' });
    if (rel === 'data/head.json') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ build: 9100, sha: SHA, branch: 'preview', at: '2026-10-01T06:24:52Z' }) });
    const f = path.resolve(MAP, rel); if (!f.startsWith(MAP + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f), headers: { 'access-control-allow-origin': '*' } });
  });
  await P.ctx.addInitScript(sha => { if (window.top !== window) window.__edenMapScript = { channel: 'ref', ref: sha, sha, build: 9100 }; }, SHA12);
  P.page.on('requestfailed', r => process.env.DBG && console.log('REQFAIL', r.url().slice(0, 140), r.failure()?.errorText)); P.page.on('console', m => process.env.DBG && console.log('CONSOLE', m.text().slice(0, 200)));
  const H = await openHost(P, { here: '天城执法局总局', ls: { edenMapLine: 'cn', edenMapLineManual: '1', ...ls }, scriptBase: `https://${HOSTS.cn}/gh/o/r@${SHA12}/map/` });
  return { P, H, reqs, band, map };
}
const clock = (D, b) => D.page.evaluate(m => { document.querySelector('#eden-map-root .em-frame')?.contentWindow?.postMessage(m, '*'); },
  { type: 'eden-map:clock', v: 2, day: 1, min: HH[b], time: `${String(HH[b] / 60 | 0).padStart(2, '0')}:00`, night: b === 'night', tod: b, bands: BANDS });
const sleep = B.wait;
async function openMap({ P, H }, band, map, ms = 6000) {
  await P.page.locator('#eden-map-root .em-fab').click(); await sleep(4500);
  let vf = await H.viewer(); await clock(P, band); await sleep(1200);
  await vf.evaluate(() => ViewerDebug.go('world')).catch(() => {}); await sleep(800);
  await vf.evaluate(id => ViewerDebug.go(id), map).catch(() => {}); await sleep(ms);
  return vf;
}
const readView = vf => vf.evaluate(() => {
  const v = ViewerDebug.osdViewer, it = v.world.getItemAt(0), vp = v.viewport, o = v.container.getBoundingClientRect();
  const r = x => { const q = vp.viewportToViewerElementRectangle(x); return { x: q.x + o.x, y: q.y + o.y, w: q.width, h: q.height }; };
  const b = it?.getBounds(true), img = b && r(b), ld = document.getElementById('loading'), sp = ld?.querySelector('span'), sr = sp?.getBoundingClientRect();
  const mk = [...document.querySelectorAll('.mk, .ev, .realm')].filter(e => e.offsetParent !== null).map(e => { const q = e.getBoundingClientRect(); return { n: e.dataset.name || e.className, cx: q.x + q.width / 2, cy: q.y + q.height / 2 }; });
  return { map: ViewerDebug.currentMapId, count: v.world.getItemCount(), src: it?.source?.tilesUrl || it?.source?.url?.slice?.(0, 30) || '', bounds: b && [b.x, b.y, b.width, b.height], img, mk, c: { x: o.x + o.width / 2, y: o.y + o.height / 2 },
    toast: !!sp && !ld.classList.contains('done') && /失败|failed|unreachable|连不上/i.test(sp.textContent) && getComputedStyle(ld).opacity !== '0', toastText: sp?.textContent || '', dock: ld?.classList.contains('dock'),
    sr: sr && { x: sr.x, y: sr.y, w: sr.width, h: sr.height }, mini: !!document.querySelector('.navigator'), };
});
const inFrame = (label, s, map) => {
  const ex = maps[map].view.extent_m, want = ex[1] / ex[0];
  rep.check(`${label}: base item in the view frame (0, 0, 1, ${want})`, s.count === 1 && s.bounds && near(s.bounds[0], 0) && near(s.bounds[1], 0) && near(s.bounds[2], 1) && near(s.bounds[3], want), `count=${s.count} bounds=${s.bounds?.map(n => +n.toFixed(4))}`);
};
const markersIn = async (label, vf, s) => {
  await vf.evaluate(() => ViewerDebug.osdViewer.viewport.goHome(true)); await sleep(700); s = await readView(vf);
  const pad = 1, out = s.mk.filter(m => m.cx < s.img.x - pad || m.cx > s.img.x + s.img.w + pad || m.cy < s.img.y - pad || m.cy > s.img.y + s.img.h + pad);
  rep.check(`${label}: every marker inside the image (${s.mk.length})`, s.mk.length > 0 && out.length === 0, out.slice(0, 3).map(m => `${m.n}@${m.cx | 0},${m.cy | 0}`).join(' '));
  return s;
};
const shot = async (D, name) => { await B.shot(D.page, OUT, name); try { fs.copyFileSync(path.join(OUT, name + '.png'), path.join(SHOTS, name + '.png')); } catch (e) {} };
const artReqs = reqs => reqs.filter(q => /^art\//.test(q.rel));

try {
  // ---- pinned: both routes up
  for (const band of ['day', 'night']) for (const variant of ['plain', 'fog+minimap']) {
    const label = `pinned ${band} ${variant}`, ls = variant === 'plain' ? {} : { edenMapFog: '1', edenMapMinimap: '1' };
    const S = await openAt({}, { ls, band }); const vf = await openMap(S, band, 'tc_upper');
    let s = await readView(vf); inFrame(label, s, 'tc_upper'); s = await markersIn(label, vf, s);
    const a = artReqs(S.reqs), tiles = a.filter(q => isTile(q.rel)), dz = a.filter(q => isDzi(q.rel));
    rep.check(`${label}: tiles requested, from the pinned base on the chosen route only`, tiles.length > 0 && a.every(q => SHA.startsWith(q.ref) && q.route === 'cn'), `n=${tiles.length} ${[...new Set(a.map(q => q.route + '@' + q.ref.slice(0, 7)))].join(',')}`);
    rep.check(`${label}: the DZI and its tiles share one base`, dz.length > 0 && new Set([...dz, ...tiles].map(q => q.route + '@' + q.ref)).size === 1, [...new Set([...dz, ...tiles].map(q => q.route + '@' + q.ref))].join(','));
    rep.check(`${label}: no failure toast`, !s.toast, s.toastText);
    await shot(S.P, `pinned_${band}_${variant.replace(/\W/g, '')}`); await S.P.close();
  }
  // ---- switch: tiles blocked on the chosen route only
  for (const band of ['day', 'night']) {
    const label = `switch ${band}`, S = await openAt({ cn: { tiles: true } }, { band }); await S.P.page.locator('#eden-map-root .em-fab').click(); await sleep(4000);
    let vf = await H0(S); await clock(S.P, band); await sleep(800);
    await vf.evaluate(() => ViewerDebug.go('world')).catch(() => {}); await sleep(600); await vf.evaluate(() => ViewerDebug.go('tc_upper')).catch(() => {}); await sleep(11000);
    vf = await H0(S); await vf.evaluate(() => ViewerDebug.currentMapId !== 'tc_upper' && ViewerDebug.go('tc_upper')).catch(() => {}); await sleep(6000);
    const s = await readView(vf), fromVpn = artReqs(S.reqs).filter(q => q.route === 'vpn' && isTile(q.rel) && SHA.startsWith(q.ref));
    rep.check(`${label}: one automatic switch to the other route, tiles come from it at the pinned sha`, fromVpn.length > 0, `vpn tiles=${fromVpn.length} cn tiles=${artReqs(S.reqs).filter(q => q.route === 'cn' && isTile(q.rel)).length}`);
    inFrame(label, s, 'tc_upper'); await markersIn(label, vf, s);
    rep.check(`${label}: no failure toast after the switch`, !(await readView(vf)).toast, s.toastText);
    await shot(S.P, `switch_${band}`); await S.P.close();
  }
  // ---- both down: toast, docked
  for (const band of ['day', 'night']) {
    const label = `both down ${band}`, S = await openAt({ cn: { tiles: true }, vpn: { tiles: true } }, { band }); const vf = await openMap(S, band, 'tc_upper', 5000);
    await sleep(12000); let s = await readView(vf);
    rep.check(`${label}: failure toast shown`, s.toast, s.toastText);
    const covers = s.sr && s.sr.x < s.c.x && s.c.x < s.sr.x + s.sr.w && s.sr.y < s.c.y && s.c.y < s.sr.y + s.sr.h;
    rep.check(`${label}: toast docked (class) and not over the map centre`, s.dock && !covers, JSON.stringify(s.sr) + ' centre ' + JSON.stringify(s.c));
    inFrame(label, s, 'tc_upper'); await markersIn(label, vf, s); await shot(S.P, `bothdown_${band}`); await S.P.close();
  }
  // ---- DZI down
  for (const band of ['day', 'night']) {
    const label = `dzi down ${band}`, S = await openAt({ cn: { dzi: true }, vpn: { dzi: true } }, { band }); const vf = await openMap(S, band, 'tc_upper', 5000);
    await sleep(8000); let s = await readView(vf);
    rep.check(`${label}: placeholder base (not an empty world)`, s.count === 1 && /^data:image/.test(s.src), `count=${s.count} src=${s.src}`);
    inFrame(label, s, 'tc_upper'); s = await markersIn(label, vf, s);
    const covers = s.sr && s.sr.x < s.c.x && s.c.x < s.sr.x + s.sr.w && s.sr.y < s.c.y && s.c.y < s.sr.y + s.sr.h;
    rep.check(`${label}: toast shown, docked, not over the centre`, s.toast && s.dock && !covers, s.toastText + ' ' + JSON.stringify(s.sr));
    await shot(S.P, `dzidown_${band}`); await S.P.close();
  }
  // ---- levels missing, every tier x map x period
  for (const tier of ['save', 'std', 'hd']) {
    const S = await openAt({ cn: { levels: [12, 13, 14] } }, { tier, band: 'day' }); await S.P.page.locator('#eden-map-root .em-fab').click(); await sleep(4500);
    const vf = await S.H.viewer();
    for (const band of ['day', 'night']) for (const map of ['tc_upper', 'tc_mid', 'tc_low']) {
      await clock(S.P, band); await sleep(900); await vf.evaluate(() => ViewerDebug.go('world')).catch(() => {}); await sleep(500); await vf.evaluate(id => ViewerDebug.go(id), map).catch(() => {}); await sleep(4000);
      const label = `levels ${tier} ${map} ${band}`, s = await readView(vf); inFrame(label, s, map); await markersIn(label, vf, s);
      rep.check(`${label}: no failure toast (missing levels fall back to the highest existing one)`, !s.toast, s.toastText);
      if (map === 'tc_upper') await shot(S.P, `levels_${tier}_${map}_${band}`);
    }
    await S.P.close();
  }
} catch (e) { rep.check('probe ran', false, String(e.stack || e.message).split('\n').slice(0, 4).join(' | ')); }
async function H0(S) { return S.H.viewer(); }
await B.closeAll();
process.exit(rep.save() ? 0 : 1);
