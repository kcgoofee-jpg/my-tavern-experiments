// 跨包资源表（DIST-2 / I-35）：底图与三维模型在各自的 npm 包里，包地址随线路变。
// 这里替入口取一次索引（map/data/assets.json 随引擎包一起发，tools/npm_layout.py 生成），按当前线路拼出
// 「包名 → 包地址」，并生成给不引模块的页面用的解析器。取不到就返 null，查看器照旧按 <base> 取。
// 注入的两个名字：__edenPkgAt（问包表，含三维模型）与 __edenArtAt（美术：先包表，再美术根，最后原样）。
import { pkgIndex, tableSrc } from '../core/pkg-paths.mjs';

/** 没有包表时的美术解析器：只有 art/ 开头的走 N14 a 的美术根（仓库线路的美术提交号），其余原样。 */
const ART_FALLBACK = "window.__edenArtAt=function(p){return typeof p==='string'&&p.indexOf('art/')===0?(window.__edenArtBase||'')+p:p;};";

/**
 * deps = { fetchJSON, base(), line(), lines, swappable, crossPkg, enginePkg, pkgBases(key, index) }
 * table() → { engine, index, bases } 或 null；src(t, art) 是注入 viewer.html / props/viewer3d.html 的那一整段。
 * 同一线路只取一次；换线路后地址变了，缓存按 base 作废。
 * crossPkg = 有没有「文件分在几个包里」这回事（npm 线路 = 有；仓库线路 = 没有，整个仓库同一个根，这里直接停用）。
 */
export function createPkgs({ fetchJSON, base, line, lines, swappable, crossPkg = true, enginePkg, pkgBases }) {
  let cache = null;
  async function table() {
    if (!swappable || !crossPkg || typeof fetchJSON !== 'function') return null;
    const b = base();
    if (cache && cache.base === b) return cache.table;
    cache = { base: b, table: null };
    try {
      const index = pkgIndex(await fetchJSON(b + 'data/assets.json'));
      if (!index.prefixes.length) return null;
      cache.table = { engine: enginePkg, index, bases: pkgBases(line() || lines[0]?.key, index) };
    } catch (e) { cache.table = null; }   // 取不到索引 = 没有包表：静默照旧，不报错
    return cache.table;
  }
  const src = (t, art = '') => (t ? tableSrc(t) : 'window.__edenArtBase=' + JSON.stringify(art || '') + ';' + ART_FALLBACK);
  return { table, src };
}
