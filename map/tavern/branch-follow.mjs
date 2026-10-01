// 跟随分支：解析分支最新构建（2026-09-28，没梯子时卡在旧提交的修复；同日补丁：jsdmirror 没有清缓存接口、缓存可能长期落后，加更多镜像 + 分钟级缓存破坏参数）。
// 分支上的 map/data/head.json = { build: 递增构建号, sha: 内容提交号, at }，由 tools/bump_head.py 在推送前单独提交（见 docs/tooling.md）。
// 同时向 jsdmirror / jsDelivr（含 fastly / gcore / testingcf 三个二级节点）/ raw.githubusercontent 取分支路径上的 head.json，取构建号最大的；都取不到再问 GitHub 接口（contents，也是 head.json）。
// 缓存破坏参数 t 取整到分钟：CDN 若认query string 就每分钟都能拿到新的；jsdmirror 经实测不理会 query string（分支路径命中的是它自己按 URL 前缀缓存的老内容），
// 所以给它加参数不解决问题，真正兜底靠「取构建号最大」——jsdmirror 一直很旧也没关系，其他源会赢。
// fastly / gcore / testingcf 三个域名都在 jsdelivr.net 之下，如果 GFW 按域名整体封锁 jsdelivr.net，这三个不比 cdn.jsdelivr.net 更好用；留着是因为它们有时分别走不同边缘节点，命中率不完全一样。
// 本机记住的构建号更大时用本机的（CDN 缓存可能旧），但本机的永远不会盖过更新的构建。
// 注意：tools/build_preview_script.py 把 resolveFollow 的源码原样嵌进跟随分支加载器（去掉 export），这里只能用浏览器自带的东西。
export async function resolveFollow(repo, branch, getJson, stored) {
  const P = 'map/data/head.json', t = Math.floor(Date.now() / 60000), ok = h => h && Number.isInteger(h.build) && /^[0-9a-f]{7,40}$/.test(String(h.sha || ''));
  const srcs = [
    ['jsdmirror', `https://cdn.jsdmirror.com/gh/${repo}@${branch}/${P}?t=${t}`],
    ['jsdelivr', `https://cdn.jsdelivr.net/gh/${repo}@${branch}/${P}?v=${t}`],
    ['fastly', `https://fastly.jsdelivr.net/gh/${repo}@${branch}/${P}?v=${t}`],
    ['gcore', `https://gcore.jsdelivr.net/gh/${repo}@${branch}/${P}?v=${t}`],
    ['testingcf', `https://testingcf.jsdelivr.net/gh/${repo}@${branch}/${P}?v=${t}`],
    ['raw', `https://raw.githubusercontent.com/${repo}/${branch}/${P}?t=${t}`],
  ];
  const hist = h => (Array.isArray(h.history) ? { history: h.history.filter(r => r && Number.isInteger(r.build) && /^[0-9a-f]{7,40}$/.test(String(r.sha || ''))).slice(0, 50).map(r => ({ build: r.build, sha: r.sha, ...(r.at ? { at: r.at } : {}) })) } : {});   // I-23：近期构建的 提交号 → 构建号
  const got = await Promise.all(srcs.map(([s, u]) => getJson(u).then(h => ok(h) ? { build: h.build, sha: h.sha, ...(h.at ? { at: h.at } : {}), ...hist(h), source: s } : null, () => null)));
  let best = got.reduce((a, b) => (b && (!a || b.build > a.build) ? b : a), null);
  if (!best) {
    const g = await getJson(`https://api.github.com/repos/${repo}/contents/${P}?ref=${encodeURIComponent(branch)}`).catch(() => null);
    let h = null; try { h = g && g.content ? JSON.parse(atob(String(g.content).replace(/\s/g, ''))) : null; } catch (e) {}
    if (ok(h)) best = { build: h.build, sha: h.sha, ...(h.at ? { at: h.at } : {}), ...hist(h), source: 'github' };
  }
  if (ok(stored) && (!best || stored.build > best.build)) best = { build: stored.build, sha: stored.sha, source: 'cache' };
  return best;
}
