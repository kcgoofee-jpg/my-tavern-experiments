// node tools/browser/pack_minimal.mjs <outDir> -- the minimal pack (map/packs/minimal: kernel contract v2, 5 nodes, no base map) in a real browser.
// Stage A acceptance ("the minimal, town and first packs all run", plan section 5). Two layers:
//   (1) the kernel pipelines (core/nodes.mjs + core/pack-v2.mjs, served from the viewer origin) load the pack's manifest and blocks over HTTP,
//       validate it, build the 5-node tree and locate a place from text -- this is how a v2 pack runs today;
//   (2) the viewer itself: viewer.html?pack=minimal opens the schema-2 pack natively (S9-1, K-R96): its schematic map, five nodes as markers, the inn's card.
import * as B from './lib.mjs';

const OUT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '/tmp/pack_minimal';
const srv = await B.ensureServer();
const rep = B.reporter(OUT);
try {
  const P = await B.newPage('desktop'); const pg = P.page;

  // (1) kernel in the browser, from the served modules
  await pg.goto(B.BASE + 'viewer.html', { waitUntil: 'commit' });
  await pg.waitForFunction(() => document.getElementById('loading')?.classList.contains('done'), null, { timeout: 30000, polling: 50 }).catch(() => {});
  const k = await pg.evaluate(async () => {
    const N = await import('./core/nodes.mjs'), V = await import('./core/pack-v2.mjs');
    const get = p => fetch('packs/minimal/' + p).then(r => r.json());
    const { manifest, problems: rp } = await V.resolveBlocks(await get('manifest.json'), get);
    const { pack, problems } = V.validate2(manifest, { trusted: true });
    const tree = N.buildTree(pack.nodes, { title: pack.title });
    const vocab = N.vocabulary(tree, { lang: pack.lang, lexicon: pack.lexicon });
    return { rp, problems, id: pack.id, n: tree.ids().length, root: tree.root, depth: tree.maxDepth(), anc: tree.ancestors('inn'),
      inn: N.locate('heading to the inn', tree, vocab).node, cellar: N.locate('cellar', tree, vocab, { here: 'docks' }).node };
  });
  rep.check('kernel: manifest + blocks load over HTTP and validate (schema 2, no problems)', k.id === 'minimal' && !k.rp.length && !k.problems.length, JSON.stringify({ rp: k.rp, problems: k.problems }));
  rep.check('kernel: 5 nodes, root harrow, depth 3, inn under docks > brindle > harrow', k.n === 5 && k.root === 'harrow' && k.depth === 3 && k.anc.join() === 'docks,brindle,harrow', JSON.stringify(k));
  rep.check('kernel: locate resolves the inn from text, and "cellar" by the current place', k.inn === 'inn' && k.cellar === 'inn', JSON.stringify({ inn: k.inn, cellar: k.cellar }));
  await P.ctx.close();

  // (2) the viewer with ?pack=minimal: the schema-2 pack opens natively (K-R96), on its schematic map
  const V = await B.newPage('desktop'); const vg = V.page;
  await vg.goto(B.BASE + 'viewer.html?pack=minimal', { waitUntil: 'commit' });
  await vg.waitForFunction(() => window.ViewerDebug?.currentMapId && document.querySelectorAll('.mk').length > 0, null, { timeout: 30000, polling: 100 }).catch(() => {});
  await B.wait(1500);
  const s = await vg.evaluate(() => {
    const rg = window.ViewerDebug?.mapRegistry, cur = window.ViewerDebug?.currentMapId || null;
    return { map: cur, maps: Object.keys(rg?.maps || {}), marks: [...document.querySelectorAll('.mk')].map(e => e.dataset.name), pack: document.documentElement.dataset.pack,
      retry: !!document.querySelector('#tileRetry:not([hidden])'), base: typeof rg?.maps?.[cur]?.base, w: window.ViewerDebug?.osdViewer?.world?.getItemAt(0)?.source?.dimensions?.x || 0 };
  });
  rep.check('viewer ?pack=minimal opens the schema-2 pack: the current map is harrow (its schematic), no retry card', s.map === 'harrow' && s.pack === 'minimal' && !s.retry && s.w > 0, JSON.stringify(s));
  rep.check('viewer renders the minimal pack (schema 2 loaded by the viewer): five nodes as markers, no uncaught page error',
    s.marks.length === 5 && ['Harrow', 'Brindle', 'Lantern Docks', 'Gull & Lantern Inn', 'Old Market'].every(n => s.marks.includes(n)) && !V.errors.some(e => /^pageerror/.test(e)), JSON.stringify({ ...s, errors: V.errors }));
  await B.shot(vg, OUT, 'viewer_minimal');
  const card = await vg.evaluate(() => { const mk = [...document.querySelectorAll('.mk')].find(e => e.dataset.name === 'Gull & Lantern Inn'); if (!mk) return null; (mk._open || (() => mk.click()))();
    return new Promise(r => setTimeout(() => r({ text: document.querySelector('#card')?.textContent || '', shown: !!document.querySelector('#card:not([hidden])') }), 400)); });
  rep.check('clicking the inn opens its card', !!card && card.shown && /Gull & Lantern Inn/.test(card.text), JSON.stringify(card));
  // the same page at 375 px (mobile)
  const M = await B.newPage('phone'); const mg = M.page;
  await mg.goto(B.BASE + 'viewer.html?pack=minimal', { waitUntil: 'commit' });
  await mg.waitForFunction(() => window.ViewerDebug?.currentMapId && document.querySelectorAll('.mk').length > 0, null, { timeout: 30000, polling: 100 }).catch(() => {});
  await B.wait(1500);
  const m = await mg.evaluate(() => ({ map: window.ViewerDebug?.currentMapId || null, marks: document.querySelectorAll('.mk').length }));
  rep.check('viewer ?pack=minimal at 375 px renders the same map and markers, no uncaught page error', m.map === 'harrow' && m.marks === 5 && !M.errors.some(e => /^pageerror/.test(e)), JSON.stringify({ ...m, errors: M.errors }));
  await B.shot(mg, OUT, 'viewer_minimal_phone');
  // reachability: every node is a marker of the open map or of a map entered from it (here one map holds all five)
  rep.check('5 nodes reachable (markers on the open map, children through entering)', s.marks.length === 5 && s.maps.length === 1, JSON.stringify({ maps: s.maps, nodes: s.marks.length }));
  await V.ctx.close(); await M.ctx.close();
} catch (e) { rep.check('run', false, String(e?.message || e).split('\n')[0]); }
const ok = rep.save();
await B.closeAll(); srv.stop();
console.log(ok ? '全部通过' : '有失败'); process.exit(ok ? 0 : 1);
