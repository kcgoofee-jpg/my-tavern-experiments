// 酒馆助手（TH）平台接口的薄封装（docs/tavernhelper-audit.md §6 地基修复 + §2 采纳清单）。纯函数为主，node 单测 tests/th_foundation.test.mjs。
// 规则：每个 TH 接口都先功能探测（fn(name) 返回函数或 null），缺了静默退回旧行为；永远不按版本号分支。
// 不用 installExtension / builtin / 角色卡写接口；不调 generate*。**不改写任何聊天内容**——
// 渲染层的泄露清理（createLeakFence）只删显示出来的 DOM 节点与文本，聊天记录一个字节都不动（docs/rejected.md #8）。

/** 统一的外部请求（§3.6）：不带凭据、不带 Referer（酒馆的 origin 不发给 CDN）。eden-map.js 里有同一行的内联副本（启动路径要同步可用），tests/cdnfetch.test.mjs 对照 */
export const CDN_OPTS = Object.freeze({ credentials: 'omit', referrerPolicy: 'no-referrer' });
export const cdnFetch = (u, o = {}, f = globalThis.fetch) => f(u, { ...o, ...CDN_OPTS });

/** 取 TH 接口：全局优先，其次 TavernHelper 命名空间；拿不到 → null */
export function hostFns(scopes) {
  return n => { for (const s of scopes) { try { const g = s?.[n]; if (typeof g === 'function') return g; const th = s?.TavernHelper; if (typeof th?.[n] === 'function') return th[n].bind(th); } catch (e) {} } return null; };
}
const call = (fn, n, ...a) => { const f = fn(n); if (!f) return undefined; try { return f(...a); } catch (e) { return undefined; } };

// ---------------- A3 身份与多实例 ----------------
/** 本实例的身份：getScriptId()（TH 按脚本给的稳定 id，换版本 / 重载同一脚本不变）；没有时退回脚本地址 */
export function ownerId(fn, self) { const id = call(fn, 'getScriptId'); return typeof id === 'string' && id ? 's:' + id : 'u:' + self; }
/** 登记表 { owner: url } → 除自己（和切版本前的旧地址）之外还在跑的地图脚本地址 */
export function otherInstances(reg, owner, switchedFrom) {
  return [...new Set(Object.entries(reg || {}).filter(([k, u]) => k !== owner && u !== switchedFrom).map(([, u]) => u))];
}

// ---------------- A2 父页面孤儿节点 ----------------
export const OWNER_ATTR = 'data-eden-owner';
/** 清掉不属于 owner 的地图节点（子 iframe 被异常移除、pagehide 没派发时留下的）；owner 为 null = 全清。返回清掉的个数 */
export function sweepOrphans(doc, owner) {
  let n = 0; try { for (const el of [...doc.querySelectorAll(`[${OWNER_ATTR}]`)]) if (owner == null || el.getAttribute(OWNER_ATTR) !== owner) { el.remove(); n++; } } catch (e) {}
  return n;
}

// ---------------- A4 偏好：脚本变量优先，localStorage 回退，双写一个版本 ----------------
export const PREF_VAR = 'eden_prefs';
/** 启动迁移：脚本变量里有的 → 写回本机（查看器同源读本机）；只在本机有的 → 补进脚本变量。返回 { toLS: {k: v}, script: 合并后的对象, changed } */
export function mergePrefs(scriptObj, lsGet, keys) {
  const s = scriptObj && typeof scriptObj === 'object' && !Array.isArray(scriptObj) ? { ...scriptObj } : {}, toLS = {}; let changed = false;
  for (const k of keys) {
    const sv = s[k], lv = lsGet(k);
    if (sv != null) { if (String(sv) !== lv) toLS[k] = String(sv); }
    else if (lv != null) { s[k] = lv; changed = true; }
  }
  return { toLS, script: s, changed };
}
/** 本机当前值 → 脚本变量要不要写（只在有差异时写，避免每次都触发保存） */
export function prefsDiff(scriptObj, lsGet, keys) {
  const s = scriptObj && typeof scriptObj === 'object' ? scriptObj : {}, out = { ...s }; let changed = false;
  for (const k of keys) { const lv = lsGet(k); if (lv == null) { if (k in out) { delete out[k]; changed = true; } } else if (String(s[k]) !== lv || !(k in s)) { out[k] = lv; changed = true; } }
  return changed ? out : null;
}
export function readScriptPrefs(fn) { const v = call(fn, 'getVariables', { type: 'script' }); const p = v && typeof v === 'object' ? v[PREF_VAR] : null; return p && typeof p === 'object' ? p : null; }
export async function writeScriptPrefs(fn, obj) {
  try {
    if (fn('updateVariablesWith')) { await fn('updateVariablesWith')(v => { v[PREF_VAR] = obj; return v; }, { type: 'script' }); return true; }
    if (fn('insertOrAssignVariables')) { await fn('insertOrAssignVariables')({ [PREF_VAR]: obj }, { type: 'script' }); return true; }
  } catch (e) {}
  return false;
}

// ---------------- B3 / B4 卡身份与版本 ----------------
/** getCharData('current') → { name, version, src }；没有接口 / 取不到 → 用旧办法（酒馆上下文的 name2） */
export async function cardIdentity(fn, ctx) {
  let c = null; try { c = await call(fn, 'getCharData', 'current'); } catch (e) {}
  if (c && typeof c === 'object' && (c.name || c.data?.name)) return { name: String(c.name || c.data.name), version: String(c.data?.character_version || ''), src: 'getCharData' };
  let n = ''; try { n = ctx?.()?.name2 || ''; } catch (e) {}
  return n ? { name: String(n), version: '', src: 'context' } : null;
}
/** 只用于报告；兼容判断永远靠功能探测 */
export function hostVersions(fn) {
  const v = n => { const r = call(fn, n); return typeof r === 'string' && r ? r : null; };
  return { th: v('getTavernHelperVersion'), st: v('getTavernVersion') };
}

// ---------------- B7 酒馆正则只读自检 ----------------
const SAMPLE_VARS = '<UpdateVariable>\n_.set("世界.当前地点", "A");\n</UpdateVariable>', SAMPLE_TAG = '<span style="display:none">⌖人物 某人 @ 中层·某处</span>';
/** 角色卡正则列表 → { n, hidesVars, hidesTags }：有没有启用的「显示时」正则把变量更新块 / 地图标签藏起来（只读，不写） */
export function regexFacts(list) {
  if (!Array.isArray(list)) return null;
  const on = list.filter(r => r && r.enabled !== false && r.destination?.display !== false && typeof r.find_regex === 'string');
  const hits = s => on.some(r => { try { const m = /^\/([\s\S]*)\/([a-z]*)$/.exec(r.find_regex); const re = m ? new RegExp(m[1], m[2].replace(/[^gimsuy]/g, '')) : new RegExp(r.find_regex); return re.test(s); } catch (e) { return false; } });
  return { n: list.length, hidesVars: hits(SAMPLE_VARS), hidesTags: hits(SAMPLE_TAG) };
}

// ---------------- B5 脚本库说明 ----------------
export function scriptInfo({ version, channel, build, checkAt, warns, en }) {
  const v = channel === 'follow' && build != null ? (en ? `follow build #${build}` : `跟随分支 构建 #${build}`) : version ? 'v' + version : (en ? 'dev' : '开发版');
  const t = checkAt ? new Date(checkAt).toLocaleString() : '';
  const c = warns == null ? (en ? 'self-check not run yet' : '自检未运行') : warns ? (en ? `self-check: ${warns} warning(s)` : `自检：${warns} 项需要注意`) : (en ? 'self-check OK' : '自检：全部正常');
  return `${en ? 'Eden map' : '伊甸地图'} ${v} · ${channel || 'local'} · ${c}${t ? ` (${t})` : ''}`;
}

// ---------------- B8 广播 ----------------
/** 只带地点数据；永不写 MVU / 数据库 */
export function movedPayload(from, to, extra = {}) {
  return { from: String(from || ''), to: String(to || ''), map: extra.map || null, source: extra.source || 'mvu', at: Date.now() };
}

// ---------------- B9 类宏（默认关） ----------------
// eden_fly（W8）：{{eden_fly}} / {{eden_fly 地点名}} → 隐藏 data-eden-fly 标记，宿主扫到后经 eden-map:fly 聚焦地图（裁决 14：协议首个仓内发送方）
export const MACROS = [['eden_here', /\{\{eden_here\}\}/gi], ['eden_route', /\{\{eden_route\}\}/gi], ['eden_fly', /\{\{eden_fly(?:\s+([^}]+?))?\}\}/gi]];
/** 登记 / 撤销类宏；返回撤销函数。get(key, match)：带参数的宏（eden_fly）从 match 里取地名。 */
export function registerMacros(fn, get) {
  const reg = fn('registerMacroLike'); if (!reg) return () => {};
  const hs = [];
  for (const [k, re] of MACROS) { try { hs.push(reg(re, (...a) => String(get(k, a[0]) ?? ''))); } catch (e) {} }
  return () => { for (const h of hs.splice(0)) { try { h?.unregister?.(); } catch (e) {} } if (fn('unregisterMacroLike')) for (const [, re] of MACROS) { try { fn('unregisterMacroLike')(re); } catch (e) {} } };
}

// ---------------- B10 泄露防御网（任务三）：渲染管道前置过滤器 ----------------
// 卡片没消费掉的占位标识符（<StatusPlaceHolderImpl/>）与模型整段吐出来的状态栏 HTML 源码会直接糊在
// 聊天界面上。这里在**渲染层**处理：拿到酒馆已经画出来的那一楼元素，删掉泄露块对应的节点、洗净命中
// 泄露形状的文本节点。**绝不改写聊天记录**——地图不审核、不过滤用户聊天内容（docs/rejected.md #8），
// 所以只动显示，原文 / 变量 / 事件解析一概不碰（解析侧另有 sanitize.stripLeaks 的纯文本净化）。
// 依赖全注入（retrieve / clean / has / log），node 单测喂假元素即可。tests/html_leak_filter.test.mjs。
import { stripLeaks as defaultClean, hasLeak as defaultHas } from './sanitize.mjs';   // 纯净化管线（同一层，无循环）
const LEAK_SEL = '[class*="statusbar-container"], statusplaceholderimpl, statusplaceholder';
const SHOW_TEXT = 4;   // NodeFilter.SHOW_TEXT（用数值，免得依赖全局 NodeFilter）
/**
 * o = { retrieve?(id) → 消息元素（jQuery 包装也认）, clean?(text) → 干净文本（缺省 sanitize.stripLeaks）,
 *        has?(text) → bool（缺省 sanitize.hasLeak）, log?(msg) }
 */
export function createLeakFence(o = {}) {
  const retrieve = typeof o.retrieve === 'function' ? o.retrieve : () => null;
  const clean = typeof o.clean === 'function' ? o.clean : defaultClean;
  const has = typeof o.has === 'function' ? o.has : defaultHas;
  const log = typeof o.log === 'function' ? o.log : () => {};
  let swept = 0, nodes = 0, errors = 0, last = null;
  /** 一个已渲染楼层 → 清掉泄露节点与泄露文本节点；返回清理处数（0 = 干净，什么都没动） */
  function sweepNode(el0) {
    const el = el0?.jquery ? el0[0] : el0;
    if (!el || typeof el.querySelectorAll !== 'function') return 0;
    let n = 0;
    try { for (const e of [...el.querySelectorAll(LEAK_SEL)]) { e.remove?.(); n++; } } catch (e) {}
    const doc = el.ownerDocument;
    if (!doc?.createTreeWalker) return n;
    const w = doc.createTreeWalker(el, SHOW_TEXT, null), texts = [];
    for (let t = w.nextNode(); t; t = w.nextNode()) texts.push(t);
    for (const t of texts) { if (!has(t.data)) continue; const nx = clean(t.data); if (nx !== t.data) { t.data = nx; n++; } }
    return n;
  }
  return {
    sweepNode,
    /** 对某一楼：id 非法的直接跳过（不报错、不抛） */
    sweep(id) {
      const f = Math.round(+id);
      if (!Number.isFinite(f) || f < 0) return 0;
      try {
        const n = sweepNode(retrieve(f));
        if (n) { swept++; nodes += n; last = { floor: f, n, at: Date.now() }; log(`泄露防御网：清理第 ${f} 楼 ${n} 处`); }
        return n;
      } catch (e) { errors++; return 0; }
    },
    /** 标准摘要（自检 / 设置页）：{ swept, nodes, errors, last } */
    describe: () => ({ swept, nodes, errors, last: last ? { ...last } : null }),
  };
}

// ---------------- B2 脚本按钮 ----------------
export const BUTTONS = [{ name: '地图', visible: true }, { name: '地图自检', visible: true }];
/** 追加按钮（不存在才加）并返回 { 按钮名: 事件名 }；接口缺 → null */
export function scriptButtons(fn) {
  if (!fn('appendInexistentScriptButtons') || !fn('getButtonEvent')) return null;
  try { fn('appendInexistentScriptButtons')(BUTTONS.map(b => ({ ...b }))); } catch (e) { return null; }
  const out = {}; for (const b of BUTTONS) { try { out[b.name] = fn('getButtonEvent')(b.name); } catch (e) {} }
  return out;
}
