// N14 a probe: engine art is fetched at the stable key head.json art_sha (stamped as window.__edenMapScript.art), not at the per-head content sha.
// A fake CDN answers .../gh/o/r@<ref>/map/... from the local map/ folder for two content commits (C1, C2: two code-only heads) and the art commit.
// Cases (tc_upper at night, route cn):
//   two heads    the viewer opened at C1, then at C2 with the same art key: every art request (DZI + tiles) is at @<art>, the two sets of art URLs are
//                identical, and the viewer page / data come from each head's own commit
//   switch       tiles blocked on cn: the automatic route switch keeps the art key (tiles from vpn @<art>)
//   no key       no art key stamped (an older loader): art stays at the content commit, as before
//   node tools/browser/art_key.mjs [outdir]
import * as B from './lib.mjs';
import { openHost } from './host_stub.mjs';
import fs from 'node:fs'; import path from 'node:path';
const OUT = process.argv[2] || 'tools/browser/out-art-key'; fs.mkdirSync(OUT, { recursive: true });
B.quietWait(); await B.ensureServer();
const rep = B.reporter(OUT);
const MAP = path.resolve(B.REPO_ROOT, 'map');
const C1 = '1111111111111111111111111111111111111111', C2 = '2222222222222222222222222222222222222222', ART = 'abcabcabcabcabcabcabcabcabcabcabcabcabca';
const HOSTS = { cn: 'cdn.jsdmirror.com', vpn: 'cdn.jsdelivr.net' };
const TYPES = { '.json': 'application/json', '.mjs': 'text/javascript', '.js': 'text/javascript', '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.dzi': 'application/xml' };
const isArt = rel => /^art\//.test(rel), isTile = rel => /_files\/\d+\/[\d_]+\.(jpg|png)$/.test(rel);
const known = ref => ref.length >= 7 && [C1, C2, ART].some(s => s.startsWith(ref));

async function open(sha, { art = ART, block = {} } = {}) {
  const P = await B.newPage('desktop', { tier: 'hd' }), reqs = [];
  await P.ctx.route(/^https:\/\/cdn\.(jsdmirror\.com|jsdelivr\.net)\/gh\/o\/r@[^/]+\/map\//, async route => {
    const u = new URL(route.request().url()), m = /\/gh\/o\/r@([^/]+)\/map\/(.*)$/.exec(u.pathname), ref = decodeURIComponent(m[1]), rel = decodeURIComponent(m[2]);
    const r = u.host === HOSTS.cn ? 'cn' : 'vpn'; reqs.push({ route: r, ref, rel, url: u.href });
    if (!known(ref)) return route.fulfill({ status: 404, body: 'no such ref' });
    if (block[r] && isTile(rel)) return route.abort();
    const f = path.resolve(MAP, rel); if (!f.startsWith(MAP + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f), headers: { 'access-control-allow-origin': '*' } });
  });
  await P.ctx.addInitScript(([s, a]) => { if (window.top !== window) window.__edenMapScript = { channel: 'ref', ref: s, sha: s, build: 9200, ...(a ? { art: a } : {}) }; }, [sha.slice(0, 12), art ? art.slice(0, 12) : '']);
  const H = await openHost(P, { here: '天城执法局总局', ls: { edenMapLine: 'cn', edenMapLineManual: '1' }, scriptBase: `https://${HOSTS.cn}/gh/o/r@${sha.slice(0, 12)}/map/` });
  await P.page.locator('#eden-map-root .em-fab').click(); await B.wait(4500);
  let vf = await H.viewer();
  await P.page.evaluate(m => { document.querySelector('#eden-map-root .em-frame')?.contentWindow?.postMessage(m, '*'); },
    { type: 'eden-map:clock', v: 2, day: 1, min: 1380, time: '23:00', night: true, tod: 'night', bands: [{ id: 'dawn' }, { id: 'day' }, { id: 'dusk' }, { id: 'night', dark: true }] });
  await B.wait(1000); await vf.evaluate(() => ViewerDebug.go('world')).catch(() => {}); await B.wait(800);
  await vf.evaluate(() => ViewerDebug.go('tc_upper')).catch(() => {}); await B.wait(block.cn ? 14000 : 7000);
  vf = await H.viewer(); await vf.evaluate(() => ViewerDebug.currentMapId !== 'tc_upper' && ViewerDebug.go('tc_upper')).catch(() => {}); await B.wait(block.cn ? 6000 : 1500);
  const items = await vf.evaluate(() => ViewerDebug.osdViewer.world.getItemCount());
  return { P, reqs, items };
}
const A12 = ART.slice(0, 12);
try {
  const a = await open(C1), b = await open(C2);
  for (const [n, S, own] of [['head 1', a, C1], ['head 2', b, C2]]) {
    const art = S.reqs.filter(q => isArt(q.rel)), other = S.reqs.filter(q => !isArt(q.rel));
    rep.check(`${n}: art requested (DZI and tiles), all at @${A12} on the chosen route`, art.some(q => isTile(q.rel)) && art.some(q => /\.dzi$/.test(q.rel)) && art.every(q => q.ref === A12 && q.route === 'cn'),
      `${art.length} art, refs ${[...new Set(art.map(q => q.route + '@' + q.ref))].join(',')}`);
    rep.check(`${n}: the viewer page and data come from the head's own commit`, other.some(q => q.rel === 'viewer.html') && other.every(q => own.startsWith(q.ref)), [...new Set(other.map(q => q.ref))].join(','));
    rep.check(`${n}: the base map is open`, S.items >= 1, `items=${S.items}`);
  }
  const set = S => [...new Set(S.reqs.filter(q => isArt(q.rel)).map(q => q.url))].sort();
  const s1 = set(a), s2 = set(b), only1 = s1.filter(u => !s2.includes(u)), only2 = s2.filter(u => !s1.includes(u));
  rep.check('two code-only heads request identical art URLs', s1.length > 0 && !only1.length && !only2.length, `n=${s1.length}/${s2.length} only1=${only1.slice(0, 2)} only2=${only2.slice(0, 2)}`);
  await a.P.close(); await b.P.close();
  const s = await open(C2, { block: { cn: true } }), vt = s.reqs.filter(q => q.route === 'vpn' && isTile(q.rel));
  rep.check('route switch keeps the art key (tiles from vpn at @art)', vt.length > 0 && vt.every(q => q.ref === A12), `vpn tiles=${vt.length} refs=${[...new Set(vt.map(q => q.ref))]}`);
  await s.P.close();
  const n = await open(C1, { art: '' }), art = n.reqs.filter(q => isArt(q.rel));
  rep.check('no art key stamped: art at the content commit, as before', art.length > 0 && art.every(q => C1.startsWith(q.ref)), [...new Set(art.map(q => q.ref))].join(','));
  await n.P.close();
} catch (e) { rep.check('probe ran', false, String(e.stack || e.message).split('\n').slice(0, 4).join(' | ')); }
await B.closeAll();
process.exit(rep.save() ? 0 : 1);
