// F1 原生扩展适配层（docs/extension-study.md §4 / §8）：当扩展跑在 SillyTavern / TauriTavern 主页面时，
// 用 getContext() 提供的原生接口代替酒馆助手的全局函数。对象形状与 host-adapter.mjs 完全一致，业务模块一概不动。
// MVU 读仍走全局 Mvu（由卡的 TH 脚本挂上），写不归地图管。
// 架构闸门 check 10 把本文件也列入适配层豁免（与 host-adapter.mjs 同等地位）。

import { TH_API } from './host-adapter.mjs';

const safe = (f, fallback = null) => { try { return f(); } catch (e) { return fallback; } };

/**
 * 建一个原生 ST 适配实例。ctx = SillyTavern.getContext() 的返回值（或测试用的假对象）。
 * extKey = extension_settings 下本扩展的键名（默认 'eden_map'）；用于 script 变量的读写。
 */
export function createNativeAdapter(ctx, extKey = 'eden_map') {
  const es = () => ctx?.eventSource ?? null;
  const et = () => ctx?.eventTypes ?? {};
  const chatArr = () => Array.isArray(ctx?.chat) ? ctx.chat : null;
  const meta = () => ctx?.chatMetadata ?? ctx?.chat_metadata ?? {};
  const extSet = () => ctx?.extensionSettings ?? ctx?.extension_settings ?? {};

  // fn / ok / okRaw / raw / hfn / top / fnsFor：原生模式下这些底层取法没有 TH 语义，
  // 但业务模块偶尔用 host.fn('xxx') 做功能探测——返回 null 即可，分组接口已覆盖全部能力。
  const fn = () => null;
  const raw = () => null;
  const ok = () => false;
  const okRaw = () => false;
  const hfn = () => null;
  const top = () => safe(() => window?.parent) ?? null;
  const fnsFor = () => () => null;

  // ---- 事件 ----
  const events = {
    present: () => es() !== null && typeof et() === 'object',
    name: key => safe(() => et()?.[key]) ?? null,
    on: (ev, handler) => { const s = es(); if (s) s.on(ev, handler); },
    onLast: (ev, handler) => { const s = es(); if (!s) return null;
      if (typeof s.makeLast === 'function') { s.makeLast(ev, handler); return { stop: () => s.removeListener(ev, handler) }; }
      s.on(ev, handler); return { stop: () => s.removeListener(ev, handler) }; },
    off: (ev, handler) => { const s = es(); if (s && typeof s.removeListener === 'function') s.removeListener(ev, handler); },
    emit: (ev, payload) => { const s = es(); if (s) s.emit(ev, payload); },
  };

  // ---- 楼层 ----
  const chat = {
    lastId: () => { const c = chatArr(); return c ? Math.max(-1, c.length - 1) : undefined; },
    messages: (range, opts) => {
      const c = chatArr(); if (!c) return undefined;
      const from = Math.max(0, Number(range?.first_message) || 0);
      const to = range?.last_message === -1 ? c.length - 1 : Math.min(c.length - 1, Number(range?.last_message ?? c.length - 1));
      return c.slice(from, to + 1).map(m => ({
        message: m?.mes ?? m?.message ?? '', name: m?.name ?? '', is_user: !!m?.is_user,
        extra: m?.extra || {}, swipe_id: m?.swipe_id ?? 0,
      }));
    },
    floors: () => chatArr(),
    floorCount: () => { const c = chatArr(); return c && c.length ? c.length : -1; },
    floorAt: i => { const c = chatArr(); return c ? (c[i] ?? null) : null; },
    context: () => ctx ?? null,
    parentContext: () => safe(() => top()?.SillyTavern?.getContext?.()) ?? null,
  };

  // ---- MVU（仍走全局；原生扩展不替代 TH 的 MVU 写入）----
  const mvuOf = () => safe(() => window?.Mvu ?? globalThis?.Mvu);
  const mvu = {
    present: () => mvuOf() !== null,
    usable: () => typeof mvuOf()?.getMvuData === 'function',
    data: query => safe(() => mvuOf()?.getMvuData?.(query)) ?? null,
    events: () => safe(() => mvuOf()?.events),
    wait: name => safe(() => {
      if (typeof window?.[name] !== 'undefined') return Promise.resolve(true);
      return new Promise(resolve => {
        const iv = setInterval(() => { if (typeof window?.[name] !== 'undefined') { clearInterval(iv); resolve(true); } }, 200);
        setTimeout(() => { clearInterval(iv); resolve(false); }, 10000);
      });
    }, Promise.resolve()),
  };

  // ---- 变量 ----
  const readChatVars = () => { const v = meta()?.variables; return v && typeof v === 'object' ? { ...v } : {}; };
  const saveMeta = () => { ctx?.saveMetadataDebounced?.(); };
  const vars = {
    read: kind => {
      if (kind === 'chat') return readChatVars();
      if (kind === 'script') return safe(() => { const s = extSet()?.[extKey]; return s && typeof s === 'object' ? { ...s } : {}; }, {});
      return {};
    },
    assign: (obj, kind) => {
      if (kind === 'chat') { const m = meta(); if (m) { m.variables = { ...(m.variables || {}), ...obj }; saveMeta(); } }
      else if (kind === 'script') { const s = extSet(); if (s) { s[extKey] = { ...(s[extKey] || {}), ...obj }; ctx?.saveSettingsDebounced?.(); } }
    },
    replace: (obj, kind) => {
      if (kind === 'chat') { const m = meta(); if (m) { m.variables = { ...obj }; saveMeta(); } }
      else if (kind === 'script') { const s = extSet(); if (s) { s[extKey] = { ...obj }; ctx?.saveSettingsDebounced?.(); } }
    },
    update: (mut, kind) => {
      if (kind === 'chat') { const m = meta(); if (m) { m.variables = mut(m.variables || {}); saveMeta(); } }
      else if (kind === 'script') { const s = extSet(); if (s) { s[extKey] = mut(s[extKey] || {}); ctx?.saveSettingsDebounced?.(); } }
    },
    canWrite: () => !!(ctx?.saveMetadataDebounced || ctx?.saveSettingsDebounced),
  };

  // ---- 注入 ----
  const setExtPrompt = () => ctx?.setExtensionPrompt ?? null;
  const inject = {
    present: () => setExtPrompt() !== null,
    apply: prompts => {
      const sep = setExtPrompt(); if (!sep) return undefined;
      for (const p of Array.isArray(prompts) ? prompts : []) {
        sep(p.id, p.value ?? p.content ?? '', p.position ?? 2, p.depth ?? 4, p.scan ?? false, p.role ?? 0);
      }
      return prompts?.length;
    },
    remove: ids => {
      const sep = setExtPrompt(); if (!sep) return;
      const ep = ctx?.extensionPrompts ?? ctx?.extension_prompts;
      for (const id of Array.isArray(ids) ? ids : [ids]) {
        sep(id, '', -1, 0);
        if (ep) delete ep[id];
      }
    },
    swap: (ids, prompts) => {
      const sep = setExtPrompt(); if (!sep) return false;
      const ep = ctx?.extensionPrompts ?? ctx?.extension_prompts;
      for (const id of Array.isArray(ids) ? ids : [ids]) {
        sep(id, '', -1, 0);
        if (ep) delete ep[id];
      }
      if (prompts?.length) {
        for (const p of prompts) sep(p.id, p.value ?? p.content ?? '', p.position ?? 2, p.depth ?? 4, p.scan ?? false, p.role ?? 0);
      }
      return true;
    },
  };

  // ---- 世界书 ----
  const wi = {
    load: ctx?.loadWorldInfo ?? null,
    save: ctx?.saveWorldInfo ?? null,
    names: ctx?.getWorldInfoNames ?? null,
    updateList: ctx?.updateWorldInfoList ?? null,
  };
  const wb = {
    names: async () => wi.names ? wi.names() : [],
    book: async name => wi.load ? wi.load(name) : null,
    create: async (name, entries) => { if (!wi.save) return false; await wi.save(name, { entries: entries || [] }, true); return true; },
    createOrReplace: async (name, entries) => { if (!wi.save) return false; await wi.save(name, { entries: entries || [] }, true); return true; },
    update: async (name, updater) => {
      if (!wi.load || !wi.save) return [];
      const data = await wi.load(name);
      const list = updater(data?.entries || []);
      await wi.save(name, { ...data, entries: list }, true);
      return list;
    },
    replace: async (name, entries) => { if (!wi.save) return false; await wi.save(name, { entries: entries || [] }, true); return true; },
    remove: async name => {
      if (!wi.save) return false;
      await wi.save(name, { entries: [] }, true);
      return true;
    },
    globalNames: async () => {
      const sel = extSet()?.world_info?.globalSelect;
      return Array.isArray(sel) ? [...sel] : [];
    },
    charNames: async () => {
      const chid = ctx?.characterId;
      const chars = ctx?.characters;
      if (chid == null || !chars) return [];
      const ch = chars[chid];
      return Array.isArray(ch?.extensions?.world) ? [...ch.extensions.world] : [];
    },
    chatName: async () => {
      const m = meta();
      return m?.world_info ?? null;
    },
    bindGlobal: async list => {
      const s = extSet();
      if (s) { if (!s.world_info) s.world_info = {}; s.world_info.globalSelect = [...(list || [])]; ctx?.saveSettingsDebounced?.(); }
    },
    bindChar: async (which, books) => {
      const chars = ctx?.characters;
      const chid = ctx?.characterId;
      if (chars && chid != null && chars[chid]) {
        if (!chars[chid].extensions) chars[chid].extensions = {};
        chars[chid].extensions.world = [...(books || [])];
        ctx?.saveSettingsDebounced?.();
      }
    },
    bindChat: async (which, name) => {
      const m = meta();
      if (m) { m.world_info = name; saveMeta(); }
    },
    canCreate: () => wi.save !== null,
  };

  // ---- 类宏 ----
  const macroSys = () => ctx?.macros ?? null;
  const macro = {
    present: () => macroSys() !== null || ok('registerMacroLike'),
    register: (re, get) => {
      const ms = macroSys();
      if (ms && typeof ms.register === 'function') {
        const name = String(re).replace(/[{}]/g, '');
        return ms.register(name, { handler: () => (typeof get === 'function' ? get() : String(get)) });
      }
      return null;
    },
    unregister: re => {
      const ms = macroSys();
      if (ms?.registry && typeof ms.registry.unregisterMacro === 'function') {
        const name = String(re).replace(/[{}]/g, '');
        ms.registry.unregisterMacro(name);
      }
    },
  };

  // ---- UI / 宿主暴露 ----
  const ui = {
    scriptId: () => undefined,
    scriptInfo: () => undefined,
    globalApi: (name, value) => { safe(() => { window[name] = value; }); },
    // F3 TT 聊天界面：原生模式下「取某楼层渲染后的 DOM」= 直接查酒馆聊天列（docs/extension-study.md §4），
    // 与 TH 的 retrieveDisplayedMessage 同义；越界或非数字返回 undefined，调用方（泄露防御网）自行跳过。
    displayedMessage: id => safe(() => {
      const n = Math.round(Number(id));
      if (!Number.isFinite(n) || n < 0) return undefined;
      return document.querySelector(`#chat .mes[mesid="${n}"]`) ?? undefined;
    }),
    charData: which => {
      const chid = ctx?.characterId;
      const chars = ctx?.characters;
      if (chid != null && chars && chars[chid]) return { data: chars[chid] };
      return null;
    },
    regexes: () => {
      const s = extSet();
      return s?.regex ?? null;
    },
    preset: () => null,
    probeContext: w => safe(() => (w ?? window)?.SillyTavern?.getContext?.()),
    probeCharName: w => safe(() => {
      const c = (w ?? window)?.SillyTavern?.getContext?.();
      return c?.name2 ?? null;
    }),
  };

  return { fn, ok, okRaw, raw, hfn, top, fnsFor, events, chat, mvu, vars, inject, wb, macro, ui };
}
