// The drawer's tab registry (S6-1; docs/kernel-schema.md K-R72, design docs/entity-protocol.md §3). The tab set is the kernel's (core/drawer-tabs.mjs);
// the module that owns a tab provides its content here, and one refresh decides which buttons show, whether the drawer hides, which tab is selected,
// the labels, and paints the open tab. The rules are pure (core/drawer-tabs.mjs); this file only reads the DOM and the drawer (window.ViewerDrawer).
//   provideTab(id, def)   def = { hasData(), applies?(ctx), label?() -> { html, short } | null, mount?(panel) (once, the first time the tab is open), render?(panel) }
//   initTabs(sheet)       the drawer exists: remember it, watch the open map and the host's "here" / "wake" messages (a new place re-renders the open tab)
//   setTabEnv(env)        what the shell knows: { card(), um(), layChip(), legendOk(), scene(), beforeRefresh() }
//   refreshTabs(reason)   recompute visibility, drawer hide and fallback tab, set the labels, paint the open tab; a call made while one runs returns at once
//   tabContext()          { map, owner, kind, scene, narrow, mode }; mode = 'macro' | 'micro' | null (core/entities.mjs levelMode)
//   tabSeen() / saveTabSeen()   the per-chat "seen" sets behind the tab badges; describeTabs()   one row per kernel tab, for probes (the debug face's `tabs` getter)
import { currentMapId } from './state.mjs';
import { RT, viewField } from './nodes-runtime.mjs';
import { chatId } from './extension-api.mjs';
import { narrowNow } from './subpage3d-host.mjs';
import { busOn } from './bus.mjs';
import { KERNEL_TABS, tabOrder, applyTo } from '../core/drawer-tabs.mjs';
import { levelMode } from '../core/entities.mjs';

const providers = new Map(), mounted = new Set();
let sheet = null, env = {}, order = KERNEL_TABS.slice(), busy = false, wired = false;

export function provideTab(id, def) { providers.set(id, { applies: () => true, ...def }); }
export function setTabEnv(e) { env = e || {}; }

const safe = (f, ...a) => { try { return !!f(...a); } catch (e) { return false; } };
const shows = (id, ctx) => { const p = providers.get(id); return !!p && safe(p.applies, ctx) && safe(p.hasData, ctx); };

export function tabContext() {
  return {
    map: currentMapId, owner: RT?.host(currentMapId) ?? null, kind: RT?.kind(currentMapId) ?? null,
    scene: document.body.classList.contains('estate'), narrow: narrowNow(),
    mode: RT ? levelMode({ children: id => RT.children(id) ?? [], viewField }, currentMapId) : null,
  };
}

export function refreshTabs(reason = '') {
  const S = sheet; if (!S || busy) return;
  busy = true;
  try {
    env.beforeRefresh?.();
    const ctx = tabContext(), vis = {};
    for (const t of order) if (t.keepsDrawer) vis[t.id] = shows(t.id, ctx);
    applyTo(S, { vis, scene: !!env.scene?.(), card: !!env.card?.(), layChip: !!env.layChip?.(), um: env.um?.() ?? null, legendOk: !!env.legendOk?.() }, order);
    for (const t of order) {
      const l = providers.get(t.id)?.label?.(); if (l) S.label(t.id, l.html, l.short);
    }
    const p = S.tab ? providers.get(S.tab) : null, panel = p?.render && S.open ? S.panel(S.tab) : null;
    if (panel) {
      if (p.mount && !mounted.has(S.tab)) { mounted.add(S.tab); p.mount(panel); }
      p.render(panel);
    }
  } finally { busy = false; }
}

export function initTabs(s, o = tabOrder(RT?.ui?.tabs)) {
  sheet = s; order = o;
  if (wired) return; wired = true;
  try { new MutationObserver(() => setTimeout(() => refreshTabs('map'), 0)).observe(document.body, { attributes: true, attributeFilter: ['data-map'] }); } catch (e) {}
  busOn({ key: 'tabs.hostMsg', type: 'message', fn: e => {
    if (!window.__isFromHost?.(e)) return;
    const t = e.data?.type; if (t === 'eden-map:here' || t === 'eden-map:wake') setTimeout(() => refreshTabs('here'), 0);
  } });
}

// 抽屉标签角标的「看过」（用户 2026-09-28）：按聊天记在 edenMap:chat:<id>:tabseen（core/storage.mjs 按聊天前缀登记，参与 LRU）。
// ev = 看过的「事件 id@最后更新」；ch = 看过的人物名。某个聊天第一次记录时把当前人物当作已看过，只有后来出现的才标红
const seenKey = () => 'edenMap:chat:' + (chatId || '-') + ':tabseen';
let seenMem = null, seenFor = null;
export function tabSeen() { if (seenFor !== seenKey()) { seenFor = seenKey(); let o = null; try { o = JSON.parse(window.LocalStore?.get(seenFor)); } catch (e) {} seenMem = o && typeof o === 'object' ? { ev: new Set(o.ev || []), ch: o.ch ? new Set(o.ch) : null } : { ev: new Set(), ch: null }; } return seenMem; }
export function saveTabSeen() { const v = JSON.stringify({ ev: [...seenMem.ev].slice(-400), ch: [...(seenMem.ch || [])].slice(-200) }); try { window.LocalStore?.set(seenFor, v); } catch (e) {} }

export function describeTabs() {
  const ctx = tabContext();
  return KERNEL_TABS.map(t => {
    const p = providers.get(t.id), b = sheet?.button(t.id);
    return { id: t.id, name: t.name, provided: !!p, applies: !!p && safe(p.applies, ctx), hasData: !!p && safe(p.hasData, ctx), visible: !!b && !b.hidden, mounted: mounted.has(t.id), selected: sheet?.tab === t.id };
  });
}
