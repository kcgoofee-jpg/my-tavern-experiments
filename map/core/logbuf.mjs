// 控制台环形缓冲（反馈报告用）：包一层 console + 全局错误，按「打开地图的次数」分会话，反馈弹层可翻历史会话。
// 纯逻辑可离线单测（不碰 DOM）：push()/lines()/boot()/sessions()；install() 才动 window.console，浏览器环境外跳过。
// 为什么分会话：脚本跟随线每次打开地图都是一次新加载，内存缓冲随加载清零——「反复开关想看多份日志」就全丢了（v0.9.6 反馈报告
// 「最近日志 (none)」的另一半根因：install() 当时挂在 feedback.mjs 的 import 上，用户点开设置才装，启动日志一片空白）。
// 现在：模块一被求值就安装 + 开新会话（ES import 求值先于宿主代码，eden-map.js 第一行 import 本模块）；当前会话写进
// localStorage（edenMapLogCur，2s 节流 + pagehide 兜底），下次 boot() 发现里面有上一次的日志就归档进 edenMapLogPast（最多 4 份）。
const CAP = 400;            // 本次会话最多保留的行数
const LINE_CAP = 400;       // 单行文本上限（防超长对象刷爆内存与 localStorage）
const PAST_MAX = 4;         // 归档会话份数（上次、上上次…）
const PAST_LINE_CAP = 240;  // 每份归档保留的行数
import { currentId, nsKey } from './pack.mjs';
// 落盘的键按包换前缀（core/pack.mjs nsKey：第一个包原样 edenMapLogCur / edenMapLogPast，别的包 tcp.<id>.LogCur / .LogPast）；包 id 取宿主注入的 __tcPack 或地址 ?pack=，每次 boot() 重取
const keys = () => { const id = currentId(); return [nsKey('edenMapLogCur', id), nsKey('edenMapLogPast', id)]; };
let [CUR_KEY, PAST_KEY] = keys();
let buf = [], past = [], meta = null, lastSave = 0;

const store = {
  get(k) { try { return globalThis.localStorage?.getItem(k) || null; } catch (e) { return null; } },
  set(k, v) { try { globalThis.localStorage?.setItem(k, v); } catch (e) {} },   // 配额满 / 隐私模式：静默放弃，日志仍在内存里
};

const one = a => { try { return typeof a === 'object' && a !== null ? JSON.stringify(a) : String(a); } catch (e) { return String(a); } };
function norm(args) {
  // OpenSeadragon 等库按 printf 风格打日志（'Ignoring tile %s …: %s', 瓦片对象）：先把 %s/%d/%f 用后面的参数填掉
  // 再存，否则反馈报告里整行都是裸 %s + 一坨 JSON（用户 2026-09-29 反馈实测）。
  const a = args.slice();
  const text = typeof a[0] === 'string' && /%[sdf]/.test(a[0])
    ? a.shift().replace(/%[sdf]/g, () => (a.length ? one(a.shift()) : '')) + (a.length ? ' ' + a.map(one).join(' ') : '')
    : a.map(one).join(' ');
  return text.length > LINE_CAP ? text.slice(0, LINE_CAP - 1) + '…' : text;
}
export function push(level, args) {
  const tag = typeof args[0] === 'string' && /%[sdf]/.test(args[0]) ? args[0] : null;   // 同一模板连发 → 合并成 ×N（换图时 OSD 的 reset 瓦片警告一次几十条刷屏）
  const last = buf[buf.length - 1];
  if (tag && last && last.tag === tag) { last.n = (last.n || 1) + 1; last.text = last.text0 + `（×${last.n}）`; }
  else { const text = norm(args); buf.push({ t: Date.now(), level, text, tag, text0: text }); }
  if (buf.length > CAP) buf.shift();
  const now = Date.now();
  if (now - lastSave > 2000) { lastSave = now; flush(); }   // 节流落盘：崩溃 / 直接关页也不至于全丢
}
export function lines() { return buf.slice(); }
export function sessions() { return past.slice(); }        // [{ meta, n, lines }] 旧的在前
export function clear() { buf = []; flush(); }
function flush() { store.set(CUR_KEY, JSON.stringify({ meta, lines: buf.slice(-PAST_LINE_CAP) })); }
function loadPast() { try { const v = JSON.parse(store.get(PAST_KEY) || '[]'); return Array.isArray(v) ? v.slice(-PAST_MAX) : []; } catch (e) { return []; } }
export function boot(m = {}) {
  [CUR_KEY, PAST_KEY] = keys();
  try {                                                     // 上一次会话还有内容：归档（新打开一次地图 = 新会话）
    const prev = JSON.parse(store.get(CUR_KEY) || 'null');
    if (prev && Array.isArray(prev.lines) && prev.lines.length) {
      const p = loadPast(); p.push({ meta: prev.meta || null, n: prev.lines.length, lines: prev.lines });
      store.set(PAST_KEY, JSON.stringify(p.slice(-PAST_MAX)));
    }
  } catch (e) {}
  past = loadPast();
  meta = { t0: Date.now(), ...m };
  buf = []; lastSave = 0; flush();
}
let installed = false;
export function install(target = (typeof console !== 'undefined' ? console : null)) {
  if (installed || !target) return;
  installed = true;
  for (const level of ['log', 'warn', 'error', 'info', 'debug']) {
    const orig = target[level]?.bind(target); if (!orig) continue;
    target[level] = (...args) => { try { push(level, args); } catch (e) {} orig(...args); };
  }
  // 全局错误与未处理的 Promise 拒绝：报障最常见的就是这两类，之前完全没抓
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function' && !window.__logHooksInstalled) {
    window.__logHooksInstalled = true;
    window.addEventListener('error', e => push('error', ['Uncaught: ' + (e?.message || e) + ' @ ' + (e?.filename || '') + ':' + (e?.lineno ?? '')]));
    window.addEventListener('unhandledrejection', e => push('error', ['Unhandled rejection: ' + (e?.reason?.stack || e?.reason || e)]));
    window.addEventListener('pagehide', flush);           // 关页前兜底存一次（同步 API，来得及）
  }
}
if (typeof window !== 'undefined' && typeof document !== 'undefined') { install(); boot(); }   // 浏览器里随模块求值立即生效；node 单测不受影响
