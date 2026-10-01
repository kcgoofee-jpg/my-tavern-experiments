// 「关于」页的当前构建行（I-15）：纯函数，测试直接断言。数据来自宿主随 about 消息发来的 build / sha / at（加载器或入口门卫烘进脚本信息）。
// 时间：有 head.json 的提交时间（at）就用它，否则用本次加载时间并标明是加载时间。

const pad = n => String(n).padStart(2, '0');
const stamp = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** about: { build, sha, at }；tx(key, fallback, vars) = 文案查找；loadedAt = 加载时间（Date 或毫秒）。没有构建号 / 提交号 = 没有这一行（返回 ''）。 */
export function buildLine(about, tx, loadedAt = Date.now()) {
  const a = about || {}, hasN = Number.isInteger(a.build), sha = a.sha ? String(a.sha).slice(0, 7) : '';
  if (!hasN && !sha) return '';
  const at = a.at ? new Date(a.at) : null, ok = at && !isNaN(at);
  const when = ok ? stamp(at) : tx('about.build_loaded', '加载于 {t}', { t: stamp(new Date(loadedAt)) });
  return tx('about.build_line', '当前构建 head #{n} · {sha} · {t}', { n: hasN ? a.build : '?', sha: sha || '?', t: when });
}
