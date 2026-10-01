// 跟随 / 分支加载的地址选择：纯函数，不碰 DOM、不取网络（I-14）。
// 原因（实测，见 docs/branching.md）：CDN 的分支路径（@preview）是可变的——jsDelivr 回 max-age=604800（浏览器可缓存 7 天），
// jsdmirror 回 max-age=300 + stale-while-revalidate=86400 且不理会 query string；`import()` 的模块地址又没法加 query。
// 所以内容文件（代码 / 查看器页 / 数据 / 包 / 瓦片）一律走提交号地址 @<sha>（不可变），分支路径只用来读 head.json。
// 正式版（标签）不受影响：标签地址本来就不可变，仍是 @map-v…。

const SHA = /^[0-9a-f]{7,40}$/, TAG = /^map-(?:s\d+-)?v\d+\.\d+\.\d+(?:\.\d+)?$/;

/** ref 的种类：'sha'（提交号）| 'tag'（正式版标签）| 'branch'（分支名，如 preview / main）| ''（空）。 */
export function refKind(ref) {
  const r = String(ref || '').trim(); if (!r) return '';
  return SHA.test(r) ? 'sha' : TAG.test(r) ? 'tag' : 'branch';
}

/** 「检查更新」走哪条链：跟随链（head.json 构建号）| 正式版链（标签）。分支名 = 跟随；标签 / 提交号 / 其余 = 正式版链。 */
export function updateChannel({ channel, ref } = {}) {
  return channel === 'follow' || refKind(ref) === 'branch' ? 'follow' : 'release';
}

/** 脚本自己的加载地址 → { origin, repo, ref }（只认 <origin>/gh/<owner>/<repo>@<ref>/map/ 这种形状；其余 = null） */
export function parseScriptBase(url) {
  const m = /^(https?:\/\/[^/]+)\/gh\/([^@/]+\/[^@/]+)@([^/]+)\/map\//.exec(String(url || ''));
  return m ? { origin: m[1], repo: m[2], ref: decodeURIComponent(m[3]) } : null;
}

/** 内容文件的根地址（.../map/）。
 *  follow / 分支：@<完整 sha>（没有 sha = null，调用方保持现状，绝不拼 @preview 去取内容）；
 *  release：标签地址（tag 必须是 map-v… 形状，否则 null）。host = 'cdn.jsdelivr.net' 这类域名（含 http(s):// 也行）。 */
export function contentBase({ channel, ref, sha, host, repo, tag }) {
  const origin = /^https?:\/\//.test(host) ? String(host).replace(/\/$/, '') : `https://${host}`;
  if (updateChannel({ channel, ref }) === 'follow') return SHA.test(String(sha || '')) ? `${origin}/gh/${repo}@${sha}/map/` : null;
  const t = tag || (refKind(ref) === 'tag' ? ref : '');
  return refKind(t) === 'tag' ? `${origin}/gh/${repo}@${t}/map/` : null;
}

/** head.json 的内容提交号 → 入口脚本地址（用于「加载新 sha 的入口」） */
export function entryUrl(base) { return String(base || '') + 'tavern/eden-map.js'; }
