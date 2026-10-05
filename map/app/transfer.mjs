// F3 TT 专项：在 TauriTavern（WKWebView）里把「复制到剪贴板」和「保存文件」做成能落地的路径。
// 真机实测（CCST，docs/extension-study.md §7）：TT 的网页剪贴板会一直不返回（不是报错，是挂住），
// <a download> 被整个忽略；TT 会往页面窗口注入 Tauri 桥 window.__TAURI__.core.invoke，
// 它自己的复制按钮走 'plugin:clipboard-manager|write_text'、打开外链走 'plugin:opener|open_url'。
// 所以：复制 = TT 桥 → 网页剪贴板（800 ms 超时）→ 隐藏文本框 + execCommand 三级兜底；
// 存文件 = 非 TT 照旧走 <a download>，TT 里改走复制，全都失败就挂出可手动选取复制的面板。
// 查看器在 srcdoc iframe 里、桥挂在外层窗口：查找沿 parent 链向上。
// 依赖全可注入（{ win, doc }）：node 单测喂假窗口即可（tests/f3_transfer.test.mjs）。
import { uiTextOr } from './text-lookup.mjs';

export const CLIP_TIMEOUT = 800;   // 网页剪贴板在 TT 里可能永远不结算：等 0.8 秒就换下一条路

const settled = p => Promise.resolve(p).then(() => true, () => false);
const readAt = (o, path) => { try { let v = o; for (const k of path) v = v?.[k]; return v; } catch (e) { return undefined; } };   // 跨窗口读属性可能被沙箱拒绝 → 当作没有

/** 沿本窗口 → parent 链找 TT 的 Tauri 桥；找不到 = null（普通浏览器）。返回绑好 this 的 invoke。 */
export function tauriInvoke(win = (typeof window !== 'undefined' ? window : null)) {
  for (let w = win, i = 0; w && i < 4; i++) {
    const core = readAt(w, ['__TAURI__', 'core']);
    if (typeof core?.invoke === 'function') return (cmd, args) => core.invoke(cmd, args);
    let p = null; try { p = w.parent ?? null; } catch (e) { p = null; }
    w = p !== w ? p : null;
  }
  return null;
}

const withTimeout = (p, ms) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('transfer: timeout')), ms);
  Promise.resolve(p).then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); });
});

/** 第三级兜底：隐藏文本框 + 传统复制命令。不需要权限，也不是安全上下文的专权。 */
export function execCopy(text, doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc?.body || typeof doc.execCommand !== 'function') return false;
  ensureCss(doc);
  const ta = doc.createElement('textarea');
  ta.className = 'emx-off'; ta.value = String(text); ta.readOnly = true;
  doc.body.append(ta);
  try { ta.focus(); ta.select(); return !!doc.execCommand('copy'); }   // WKWebView 亲测：不要 setSelectionRange（对只读文本框会「insecure」抛错），select() 已是全选
  catch (e) { console.warn('[map] transfer: execCommand copy failed', e); return false; }
  finally { ta.remove(); }
}

/**
 * 复制文本；true = 成功。顺序：TT 自己的剪贴板桥 → 网页剪贴板（带超时，它在 TT 里会挂住）→ execCommand。
 * 失败不抛：调用方接着降级（选中已有文本框，或 revealManual）。
 */
export async function copyText(text, o = {}) {
  const win = o.win ?? (typeof window !== 'undefined' ? window : null);
  const doc = o.doc ?? (typeof document !== 'undefined' ? document : null);
  const invoke = o.invoke !== undefined ? o.invoke : tauriInvoke(win);
  const t = String(text);
  if (invoke && await settled(withTimeout(Promise.resolve(invoke('plugin:clipboard-manager|write_text', { text: t })), CLIP_TIMEOUT))) return true;
  const clip = readAt(win, ['navigator', 'clipboard']);
  if (typeof clip?.writeText === 'function' && await settled(withTimeout(Promise.resolve(clip.writeText(t)), CLIP_TIMEOUT))) return true;
  return execCopy(t, doc);
}

/** 打开外链：TT 走它的系统浏览器打开接口，其余 window.open；两条都没成 → false（调用方留出手动复制链接的路）。 */
export async function openExternal(url, o = {}) {
  const win = o.win ?? (typeof window !== 'undefined' ? window : null);
  const invoke = o.invoke !== undefined ? o.invoke : tauriInvoke(win);
  if (invoke && await settled(Promise.resolve(invoke('plugin:opener|open_url', { url })))) return true;
  try { return !!win?.open(url, '_blank', 'noopener,noreferrer'); } catch (e) { return false; }
}

function clickDownload(name, text, type, doc) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = doc.createElement('a');
  a.href = url; a.download = name; doc.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * 保存文本文件。返回值：'downloaded'（普通浏览器，已触发下载）｜ 'copied'（TT：下载被忽略，改复制进剪贴板成功）｜
 * 'manual'（TT 且复制路径全挂：调用方 revealManual 或选已有的文本框）。TT 的判定 = 页面里有 Tauri 桥。
 */
export async function saveTextFile(name, text, o = {}) {
  const doc = o.doc ?? (typeof document !== 'undefined' ? document : null);
  const win = o.win ?? (typeof window !== 'undefined' ? window : null);
  const type = o.type || 'text/plain;charset=utf-8';
  const invoke = o.invoke !== undefined ? o.invoke : tauriInvoke(win);
  if (!invoke) { clickDownload(name, String(text), type, doc); return 'downloaded'; }
  if (await copyText(text, { win, doc, invoke })) return 'copied';
  return 'manual';
}

// 外观只走类 + 令牌（动态注入一次；不写内联样式）
function ensureCss(doc) {
  if (!doc?.head || doc.getElementById('emXferCss')) return;
  const s = doc.createElement('style'); s.id = 'emXferCss';
  s.textContent = '.emx-off{position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none}' +   // WebKit 实测：1px 见方 + pointer-events:none 会让 execCommand('copy') 返回 false，2px 正常
    '.emx-manual{position:fixed;left:var(--sp-4);right:var(--sp-4);bottom:var(--sp-4);z-index:var(--zu-dialog-2);display:flex;flex-direction:column;gap:var(--sp-3);padding:var(--sp-3) var(--sp-4);background:var(--surface-glass);border:1px solid var(--line-strong);border-radius:var(--r-m);color:var(--ink);font-size:var(--fs-small)}' +
    '.emx-manual p{margin:0}' +
    '.emx-manual textarea{width:100%;box-sizing:border-box;min-height:6em;max-height:40vh;font-family:var(--font-mono, monospace)}' +
    '.emx-manual .emx-close{align-self:flex-end;min-height:var(--hit)}';
  doc.head.append(s);
}

/** 手动复制面板：全选好的只读文本框 + 一句说明（{name} 是本来要保存的文件名）。重复调用换内容。 */
export function revealManual(name, text, o = {}) {
  const doc = o.doc ?? (typeof document !== 'undefined' ? document : null);
  if (!doc?.body) return null;
  ensureCss(doc);
  let box = doc.getElementById('emManual');
  if (!box) {
    box = doc.createElement('div'); box.id = 'emManual'; box.className = 'emx-manual'; box.setAttribute('role', 'dialog');
    const p = doc.createElement('p'); p.id = 'emManualHint';
    const ta = doc.createElement('textarea'); ta.id = 'emManualText'; ta.readOnly = true; ta.rows = 6;
    const close = doc.createElement('button'); close.type = 'button'; close.className = 'btn emx-close';
    close.textContent = uiTextOr('transfer.close', '关闭');
    close.addEventListener('click', () => box.remove());
    box.append(p, ta, close); doc.body.append(box);
  }
  box.querySelector('#emManualHint').textContent = uiTextOr('transfer.manual', '这个环境不支持直接下载或复制：下面的内容已选好，请手动复制，存成 {name}', { name });
  const ta = box.querySelector('#emManualText'); ta.value = String(text);
  try { ta.focus(); ta.select(); } catch (e) { console.warn('[map] transfer: manual reveal select failed', e); }
  return box;
}
