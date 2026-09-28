// 跟随分支：解析分支最新构建（2026-09-28，没梯子时卡在旧提交的修复）。
// 分支上的 map/data/head.json = { build: 递增构建号, sha: 内容提交号, at }，由 tools/bump_head.py 在推送前单独提交（见 docs/tooling.md）。
// 同时向 jsdmirror / jsDelivr / raw.githubusercontent 取分支路径上的 head.json，取构建号最大的；都取不到再问 GitHub 接口（contents，也是 head.json）。
// 本机记住的构建号更大时用本机的（CDN 缓存可能旧），但本机的永远不会盖过更新的构建。
// 注意：tools/build_preview_script.py 把 resolveFollow 的源码原样嵌进跟随分支加载器（去掉 export），这里只能用浏览器自带的东西。
export async function resolveFollow(repo, branch, getJson, stored) {
  const P = 'map/data/head.json', t = Date.now(), ok = h => h && Number.isInteger(h.build) && /^[0-9a-f]{7,40}$/.test(String(h.sha || ''));
  const srcs = [['jsdmirror', `https://cdn.jsdmirror.com/gh/${repo}@${branch}/${P}?t=${t}`], ['jsdelivr', `https://cdn.jsdelivr.net/gh/${repo}@${branch}/${P}?t=${t}`],
    ['raw', `https://raw.githubusercontent.com/${repo}/${branch}/${P}?t=${t}`]];
  const got = await Promise.all(srcs.map(([s, u]) => getJson(u).then(h => ok(h) ? { build: h.build, sha: h.sha, source: s } : null, () => null)));
  let best = got.reduce((a, b) => (b && (!a || b.build > a.build) ? b : a), null);
  if (!best) {
    const g = await getJson(`https://api.github.com/repos/${repo}/contents/${P}?ref=${encodeURIComponent(branch)}`).catch(() => null);
    let h = null; try { h = g && g.content ? JSON.parse(atob(String(g.content).replace(/\s/g, ''))) : null; } catch (e) {}
    if (ok(h)) best = { build: h.build, sha: h.sha, source: 'github' };
  }
  if (ok(stored) && (!best || stored.build > best.build)) best = { build: stored.build, sha: stored.sha, source: 'cache' };
  return best;
}
