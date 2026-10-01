// 入口门卫（I-14）：脚本若是从分支路径（@preview / @main）加载的——分支路径会被 CDN / 浏览器缓存（最长 7 天），
// 拿到的可能是旧代码——先取分支最新 head.json，换成「@<sha> 的入口」再加载；本入口随后什么也不挂（redirected = true）。
// 取不到 head / 加载失败 = 静默照旧（降级，不弹窗）。从 @<sha> 或标签加载的脚本这里直接放行。
// 顶层 await：入口模块（eden-map.js）静态 import 本模块，所以它的正文要等门卫判完才跑。
import { resolveFollow } from './branch-follow.mjs';
import { parseScriptBase, refKind, contentBase, entryUrl } from './follow-pin.mjs';

const TIMEOUT = 5000;
const getJson = async u => {
  const c = new AbortController(), to = setTimeout(() => c.abort(), TIMEOUT);
  try { const r = await (window.__edenMapFetch || fetch)(u, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: c.signal }); return r.ok ? await r.json() : null; }
  catch (e) { return null; } finally { clearTimeout(to); }
};

/** 取分支最新 head：公共 CDN 走 resolveFollow（多源取构建号最大）；其余地址（本地测试 CDN）只读它自己的 head.json */
export async function headOf(p) {
  if (/(^|\.)(jsdelivr\.net|jsdmirror\.com)$/.test(new URL(p.origin).host)) return resolveFollow(p.repo, p.ref, getJson, null);
  const h = await getJson(`${p.origin}/gh/${p.repo}@${p.ref}/map/data/head.json?t=${Date.now()}`);
  return h && Number.isInteger(h.build) && /^[0-9a-f]{7,40}$/.test(String(h.sha || '')) ? { build: h.build, sha: h.sha, at: h.at, source: 'branch' } : null;
}

async function run() {
  const p = parseScriptBase(import.meta.url);
  if (!p || refKind(p.ref) !== 'branch') return false;
  let h = null; try { h = await headOf(p); } catch (e) {}
  const base = h && contentBase({ channel: 'follow', ref: p.ref, sha: h.sha, host: p.origin, repo: p.repo });
  if (!base) return false;
  try {
    const S = (window.__edenMapScript ||= {}), prev = { ...S };
    Object.assign(S, { channel: S.channel || 'ref', ref: S.ref || p.ref, sha: String(h.sha).slice(0, 12), build: h.build, at: h.at || null, source: h.source || null });
    try { await import(entryUrl(base)); return true; } catch (e) { for (const k of Object.keys(S)) delete S[k]; Object.assign(S, prev); throw e; }
  } catch (e) { console.warn('[eden-map] 按提交号重载失败，沿用分支路径', e); return false; }
}

export const redirected = await run();
