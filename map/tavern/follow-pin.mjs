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

/** N14 a：art/ 底图的根地址。内容按 @<sha> 取（每个 head 一个新缓存键），美术只在改动时才变：head.json 的 art_sha（最后改动 map/art 的提交，
 *  加载器 / 门卫写进 window.__edenMapScript.art）给出一个稳定的键，同一线路、同一仓库、只换提交号。
 *  base 不是 @<提交号> 地址（标签本来就稳定、分支 / 本地不换）或 art 不是提交号 → ''（调用方照旧按 base 取）。 */
export function artBase(base, art) {
  const p = parseScriptBase(base), a = String(art || '').toLowerCase();
  return p && refKind(p.ref) === 'sha' && SHA.test(a) ? `${p.origin}/gh/${p.repo}@${a.slice(0, 12)}/map/` : '';
}

/** head.json 的内容提交号 → 入口脚本地址（用于「加载新 sha 的入口」） */
export function entryUrl(base) { return String(base || '') + 'tavern/eden-map.js'; }

/** The build a pinned commit belongs to (I-23): head = { build, sha, at?, history?: [{ build, sha, at? }] } (the branch's head.json), sha = the commit the script was loaded at
 *  (7–40 hex; a prefix of the recorded one, either way). → { build, at? } | null (older than the recorded history = unknown). */
export function buildOfSha(head, sha) {
  const s = String(sha || '').toLowerCase(); if (!SHA.test(s) || !head || typeof head !== 'object') return null;
  const same = r => r && Number.isInteger(r.build) && SHA.test(String(r.sha || '').toLowerCase()) && (String(r.sha).toLowerCase().startsWith(s) || s.startsWith(String(r.sha).toLowerCase()));
  const hit = [head, ...(Array.isArray(head.history) ? head.history : [])].find(same);
  return hit ? { build: hit.build, ...(hit.at ? { at: hit.at } : {}) } : null;
}

/** What About says about how the script was loaded (I-23). loaded = the ref in the script's own address (a commit, a tag or a branch); SCRIPT = the loader's stamp.
 *  kind: 'follow' (a bootstrap or a branch: the branch is `branch`; `sha` = the commit it loaded) | 'pinned' (loaded at a commit, nothing follows) | 'tag' | 'latest' | 'local'.
 *  `selector` is what the branch selector shows: the branch for follow, 'pin' for a pinned commit (never the release channel), the release branch only for a tag. */
export function loadInfo({ script = {}, loaded = '', ver = null, swappable = false } = {}) {
  const ch = script.channel || (ver ? 'tag' : swappable ? 'ref' : 'local'), ref = String(script.ref || loaded || ''), kind = refKind(ref);
  if (ch === 'follow' || (ch === 'ref' && kind === 'branch')) return { kind: 'follow', branch: kind === 'branch' ? ref : 'preview', sha: String(script.sha || (refKind(loaded) === 'sha' ? loaded : '')), selector: kind === 'branch' ? ref : 'preview' };
  if (ch === 'ref' && (kind === 'sha' || refKind(loaded) === 'sha')) { const sha = kind === 'sha' ? ref : String(loaded); return { kind: 'pinned', sha, selector: 'pin' }; }
  if (ch === 'tag' || ch === 'latest') return { kind: ch, sha: '', selector: 'main' };
  return { kind: ch === 'ref' ? 'pinned' : 'local', sha: String(script.sha || ''), selector: ch === 'ref' ? 'pin' : '' };
}
