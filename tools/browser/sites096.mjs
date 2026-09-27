// v0.9.6 开局地点地图验收：起始图是伊甸庄园（或它的平面替身）；世界图上点每个开局地点 → 卡片里的「进入」→ 它自己的地图；
// 缩到最远再推 → 回世界图（该地点居中）；再放大推 → 回到该地点的地图。手机 375×812 与桌面 1440×900 各跑一遍。
// 用法：EDEN_PORT=5191 node tools/browser/sites096.mjs [输出目录] [--shots 前缀]   （--shots 时截图到 docs/drafts/sites_<前缀>_*.png）
import * as B from './lib.mjs';

const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '/tmp/sites096';
const si = process.argv.indexOf('--shots'), shotTag = si > 0 ? process.argv[si + 1] || 'after' : null;
B.quietWait();
const srv = await B.ensureServer();
const rep = B.reporter(out);
const ev = (p, f, a) => p.evaluate(f, a);
const drawn = p => p.waitForFunction(() => !!viewer?.world.getItemCount() && viewer.world.getItemAt(0).getFullyLoaded?.() !== undefined, null, { timeout: 8000 }).catch(() => {});

for (const preset of ['phone', 'desktop']) {
  const P = await B.newPage(preset), p = P.page, tag = preset === 'phone' ? '375' : 'desktop';
  // 1 起始：不带参数打开 → 世界图（用户 2026-09-28：总是先开世界图）
  await B.openViewer(P, {}); await B.wait(2500);
  const st = await ev(p, () => ({ cur }));
  rep.check(`${tag}_start_world`, st.cur === 'world', JSON.stringify(st));
  const groups = await ev(p, () => Object.entries(REG.groups).filter(([k, g]) => g.place && k !== 'tiancheng').map(([k, g]) => ({ gid: k, place: g.place, layers: g.layers,
    name: [...M.places, ...M.fiefs].find(q => q.id === g.place)?.name })));
  rep.check(`${tag}_site_groups`, groups.length >= 8, groups.map(g => g.gid).join(','));
  for (const g of groups) {
    await B.goMap(p, 'world'); await B.wait(600);
    // 2 世界图上点这个地点 → 卡片里每一层都有「进入」
    const links = await ev(p, name => { const el = [...document.querySelectorAll('.mk')].find(e => e.dataset.name === name); if (!el) return null; el._open(); return [...document.querySelectorAll('#card [data-go]')].map(a => a.dataset.go); }, g.name);
    rep.check(`${tag}_${g.gid}_card_links`, links && g.layers.every(l => links.includes(l)), JSON.stringify(links));
    await ev(p, id => document.querySelector(`#card [data-go="${id}"]`).click(), g.layers[0]);
    await p.waitForFunction(id => cur === id && viewer.world.getItemCount(), g.layers[0], { timeout: 8000 }).catch(() => {}); await B.wait(1500);
    const s = await ev(p, () => ({ cur, n: document.querySelectorAll('.mk').length, crumb: document.getElementById('crumbs').textContent, layers: document.querySelectorAll('#layers button').length }));
    rep.check(`${tag}_${g.gid}_opens`, s.cur === g.layers[0] && s.n >= 3 && /世界/.test(s.crumb), JSON.stringify(s));
    if (shotTag && tag === '375') await B.shot(p, B.REPO_ROOT + '/docs/drafts', `sites_${shotTag}_${g.gid}_375`);
    // 3 缩到最远：过渡环可见、面包屑「…周边」；再推 → 世界图，地点居中
    await ev(p, () => { viewer.viewport.zoomTo(viewer.viewport.getMinZoom(), null, true); viewer.viewport.applyConstraints(true); }); await B.wait(1200);
    const r = await ev(p, () => ({ ring: !!document.querySelector('.tc-ring canvas') && TCScale.ringOn, crumb: document.getElementById('crumbs').textContent }));
    rep.check(`${tag}_${g.gid}_ring`, r.ring && /周边|outskirts/.test(r.crumb), JSON.stringify(r));
    if (shotTag && tag === '375') await B.shot(p, B.REPO_ROOT + '/docs/drafts', `sites_${shotTag}_${g.gid}_ring_375`);
    await ev(p, () => { for (let i = 0; i < 2; i++) { viewer.viewport.zoomBy(1 / 1.3); viewer.viewport.applyConstraints(); } });
    await p.waitForFunction(() => cur === 'world', null, { timeout: 4000 }).catch(() => {}); await B.wait(1500);
    const w = await ev(p, pl => { const q = [...M.places, ...M.fiefs].find(x => x.id === pl), [nx, ny] = toImg(q.x, q.y), b = viewer.viewport.getBounds(true), c = b.getCenter();
      return { cur, d: Math.hypot(c.x - nx, c.y - ny * aspect) / b.width }; }, g.place).catch(() => ev(p, () => ({ cur })));
    rep.check(`${tag}_${g.gid}_zoom_out_world`, w.cur === 'world' && w.d < .2, JSON.stringify(w));
    // 4 世界图最大放大处再推 → 回到这个地点的地图（不是天城）
    await ev(p, () => { for (let i = 0; i < 2; i++) { viewer.viewport.zoomBy(1.3); viewer.viewport.applyConstraints(); } });
    await p.waitForFunction(() => TCScale.isTier(cur), null, { timeout: 4000 }).catch(() => {}); await B.wait(1200);
    const b2 = await ev(p, () => ({ cur, grp: REG.maps[cur]?.group }));
    rep.check(`${tag}_${g.gid}_zoom_in_site`, b2.grp === g.gid, JSON.stringify(b2));
  }
  // 5 天城照旧：世界 ↔ 天城交接
  await B.goMap(p, 'world'); await B.wait(500);
  await ev(p, () => { const q = M.places.find(x => x.id === 'tiancheng'), [nx, ny] = toImg(q.x, q.y); viewer.viewport.panTo(new OpenSeadragon.Point(nx, ny * aspect), true);
    viewer.viewport.zoomTo(viewer.viewport.getMaxZoom(), null, true); viewer.viewport.applyConstraints(true); }); await B.wait(600);
  await ev(p, () => { for (let i = 0; i < 2; i++) { viewer.viewport.zoomBy(1.3); viewer.viewport.applyConstraints(); } });
  await p.waitForFunction(() => TCScale.isTier(cur), null, { timeout: 4000 }).catch(() => {}); await B.wait(800);
  rep.check(`${tag}_tiancheng_handoff`, await ev(p, () => REG.maps[cur]?.group === 'tiancheng'), await ev(p, () => cur));
  rep.check(`${tag}_no_errors`, !P.errors.filter(e => !/favicon/.test(e)).length, P.errors.slice(0, 3).join(' | '));
  await P.close();
}
await B.closeAll(); srv.stop();
process.exit(rep.save() ? 0 : 1);
