// node tools/browser/pack_minimal.mjs <outDir> -- the minimal pack (map/packs/minimal: kernel contract v2, 5 nodes, no base map) in a real browser.
// Stage A acceptance ("the minimal, town and first packs all run", plan section 5). Two layers:
//   (1) the kernel pipelines (core/nodes.mjs + core/pack-v2.mjs, served from the viewer origin) load the pack's manifest and blocks over HTTP,
//       validate it, build the 5-node tree and locate a place from text -- this is how a v2 pack runs today;
//   (2) the viewer itself: viewer.html?pack=minimal. The viewer's pack loader (core/pack.mjs) accepts schema 1 only until a later step wires
//       v2 packs into it, so opening it must fail quietly (the retry card, no uncaught error) -- the "renders" check is a registered known failure.
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

  // (2) the viewer with ?pack=minimal
  const V = await B.newPage('desktop'); const vg = V.page;
  await vg.goto(B.BASE + 'viewer.html?pack=minimal', { waitUntil: 'commit' });
  await B.wait(4000);
  const s = await vg.evaluate(() => ({ map: window.ViewerDebug?.currentMapId || null, marks: document.querySelectorAll('.mk').length, retry: !!document.querySelector('#retry, .retry, [data-act="retry"]') || /重试|retry/i.test(document.body.innerText) }));
  rep.check('viewer ?pack=minimal degrades quietly: a retry card, no marker soup, no uncaught page error',
    s.retry && !s.map && !s.marks && !V.errors.some(e => /^pageerror/.test(e)), JSON.stringify({ ...s, errors: V.errors.length }));
  await B.shot(vg, OUT, 'viewer_minimal');
  rep.check('viewer renders the minimal pack (schema 2 loaded by the viewer)', !!s.map && s.marks > 0, JSON.stringify(s));
  await V.ctx.close();
} catch (e) { rep.check('run', false, String(e?.message || e).split('\n')[0]); }
const ok = rep.save();
await B.closeAll(); srv.stop();
console.log(ok ? '全部通过' : '有失败'); process.exit(ok ? 0 : 1);
