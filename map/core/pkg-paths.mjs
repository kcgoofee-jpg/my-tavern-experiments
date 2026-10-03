// 跨包资源解析（DIST-2 / I-35）：运行时文件按包发到 npm，底图与三维模型不在引擎包里。
// 这里只做纯计算：给一条仓库相对路径（art/<层>.dzi、props/<模型>/<模型>.glb），
// 说出它归哪个包、以及那条线路上这个包的地址。宿主把表塞进 window.__edenPkg，查看器与三维页读它。
// 没有表（本地打开 / 老脚本 / 还没发布）时一律原样返回，调用方照旧按 <base> 取——静默降级，不报错。
const MAP = 'map/';

/** 归一化 assets.json 的 paths 段：前缀按长度从长到短排（art/<层> 必须排在 art/<层>_<时段> 之后命中）。 */
export function pkgIndex(a) {
  const paths = a && typeof a.paths === 'object' && a.paths ? a.paths : {};
  const prefixes = Object.entries(paths)
    .filter(([p, v]) => typeof p === 'string' && p && typeof v === 'string' && v)
    .sort((x, y) => y[0].length - x[0].length);
  return { version: typeof a?.version === 'string' ? a.version : '', prefixes };
}

/** 去掉可能带的 map/ 前缀（有的调用点拿的是仓库相对路径，有的是 map/ 相对路径）。 */
export const stripMap = rel => (typeof rel === 'string' && rel.startsWith(MAP) ? rel.slice(MAP.length) : rel);

/** 这条相对路径归哪个包；'' = 引擎包或索引里没有（照旧按 <base> 取）。不猜：猜错就是 404。 */
export function pkgOf(index, rel) {
  const r = stripMap(rel);
  if (!index || !r) return '';
  for (const [p, pkg] of index.prefixes) if (r.startsWith(p)) return pkg;
  return '';
}

/**
 * 相对路径 → 绝对地址（同一线路、同一个版本的那个包）。
 * table = { engine, index, bases }：bases 是包名 → 该线路上的包地址（到 /map/ 结尾）。
 * 归不到包、或表里没有那个包 → 原样返回（调用方继续按 <base> 解析，行为与从前一致）。
 */
export function pkgUrl(table, rel) {
  const base = table && table.bases ? table.bases[pkgOf(table.index, rel)] : '';
  return base ? base + stripMap(rel) : rel;
}

/** 窗口里那张表（查看器与三维页共用）。没有就是没有，不猜。 */
export function readTable(w = globalThis) {
  try { const t = w.__edenPkg; return t && typeof t === 'object' ? t : null; } catch (e) { return null; }
}

/** 引擎包自己的地址（宿主注入时记在 table.engine）。给「三维库在引擎包里」这类要往回上跳的用法。 */
export function engineBase(table) {
  const b = (table && table.bases) || {};
  return table && typeof b[table.engine] === 'string' ? b[table.engine] : '';
}

/**
 * 给不引模块的两个页面（viewer.html 的首帧脚本、props/viewer3d.html）用的一行解析器：
 * 宿主连同 window.__edenPkg 一起注入window.__edenPkgAt(path)，页面里写 __edenPkgAt?.(p) || p 就行。
 * 逻辑与 pkgUrl 同一套（tests/pkg_paths.test.mjs 钉住两者对同一批路径给同一个答案）。
 */
export function pkgResolverSrc() {
  return 'window.__edenPkgAt=function(p){var t=window.__edenPkg;if(!t||typeof p!=="string")return p;'
    + 'if(p.indexOf("map/")===0)p=p.slice(4);var q=t.index.prefixes;'
    + 'for(var i=0;i<q.length;i++){if(p.indexOf(q[i][0])===0){var b=t.bases[q[i][1]];return b?b+p:p;}}return p;};';
}

/** 注入一个页面（查看器里的三维子页）的那一整段：包表 + 两个解析器。宿主与查看器共用这一份，免得两处写法走偏。 */
export function tableSrc(t) {
  return 'window.__edenPkg=' + JSON.stringify({ engine: t.engine, index: t.index, bases: t.bases }).replace(/</g, '\\u003c')
    + ';' + pkgResolverSrc() + 'window.__edenArtAt=window.__edenPkgAt;';
}
