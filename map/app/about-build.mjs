// 「关于」页的当前构建行（I-15）：纯函数，测试直接断言。数据来自宿主随 about 消息发来的 build / sha / at（加载器或入口门卫烘进脚本信息）。
// 时间：有 head.json 的提交时间（at）就用它，否则用本次加载时间并标明是加载时间。

const pad = n => String(n).padStart(2, '0');
const stamp = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** about: { build, sha, at }；tx(key, fallback, vars) = 文案查找；loadedAt = 加载时间（Date 或毫秒）。没有构建号 = 没有这一行（sha 只进诊断复制，不上屏——COPY-1）。 */
export function buildLine(about, tx, loadedAt = Date.now()) {
  const a = about || {}, hasN = Number.isInteger(a.build);
  if (!hasN) return '';
  const at = a.at ? new Date(a.at) : null, ok = at && !isNaN(at);
  const when = ok ? stamp(at) : tx('about.build_loaded', '加载于 {t}', { t: stamp(new Date(loadedAt)) });
  return tx('about.build_line', '当前构建 head #{n} · {t}', { n: a.build, t: when });
}

/** buildDate(about, loadedAt) -> 'YYYY-MM-DD'（提交时间；没有就用加载时间） */
export function buildDate(about, loadedAt = Date.now()) { const at = about?.at ? new Date(about.at) : null, d = at && !isNaN(at) ? at : new Date(loadedAt); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
/** buildTag(about, tx, loadedAt) -> 'head #N · 日期'（设置首页的一行摘要；没有构建号 = ''） */
export function buildTag(about, tx, loadedAt = Date.now()) { return Number.isInteger(about?.build) ? tx('s.update_sub', 'head #{n} · {d}', { n: about.build, d: buildDate(about, loadedAt) }) : ''; }
let head = null, headAsked = false;
/** viewerHead(onLoad) -> 地图文件自己的 { build, at }（data/head.json，第一次问时才取；取到后调 onLoad 重画）；还没取到 = null */
export function viewerHead(onLoad) {
  if (!headAsked && typeof fetch === 'function') { headAsked = true; fetch('data/head.json').then(r => (r.ok ? r.json() : null)).then(j => { if (j && Number.isInteger(j.build)) { head = { build: j.build, at: j.at || null }; onLoad?.(); } }).catch(() => {}); }
  return head;
}
