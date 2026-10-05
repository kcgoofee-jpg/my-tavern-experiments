// F0 宿主适配层（docs/extension-study.md §4 / §8）：引擎碰酒馆助手（TH）与酒馆（SillyTavern / Mvu）接口的唯一一处。
// 接口按能力分组：events / chat（读楼层）/ mvu / vars（变量）/ inject（注入）/ wb（世界书与绑定）/ macro（类宏）/ ui（宿主暴露与卡信息）。
// 这一版实现是 TH 的（缺省查找 = 本窗口全局 → globalThis → window.TavernHelper 命名空间）；F1 的原生扩展实现给同一个对象形状，业务模块一概不动。
// 规则：每个接口先功能探测（hostAdapter.fn / .ok 给函数或 null），缺了静默按旧行为降级，永远不按版本号分支。
// 架构闸门：tools/check_architecture.py 检查 10 按 TH_API 名单扫引擎源码（剥注释与字符串）；名单里的名字在本文件之外不许出现。

/** 适配层代理的宿主接口名（冻结表；检查 10 的词表，加接口就加名字） */
export const TH_API = Object.freeze([
  'eventOn', 'eventMakeLast', 'eventRemoveListener', 'eventOff', 'eventEmit',
  'getChatMessages', 'getLastMessageId', 'getVariables', 'insertOrAssignVariables', 'updateVariablesWith', 'replaceVariables', 'waitGlobalInitialized',
  'getCharData', 'getTavernRegexes', 'getPreset', 'getScriptId', 'replaceScriptInfo', 'initializeGlobal', 'retrieveDisplayedMessage',
  'injectPrompts', 'uninjectPrompts',
  'getWorldbook', 'getWorldbookNames', 'createWorldbook', 'createOrReplaceWorldbook', 'updateWorldbookWith', 'replaceWorldbook', 'deleteWorldbook',
  'getGlobalWorldbookNames', 'getCharWorldbookNames', 'getChatWorldbookName', 'rebindGlobalWorldbooks', 'rebindCharWorldbooks', 'rebindChatWorldbook',
  'getLorebooks', 'getLorebookEntries', 'getLorebookSettings', 'getCharLorebooks', 'getChatLorebook',
  'registerMacroLike', 'unregisterMacroLike', 'appendInexistentScriptButtons', 'getButtonEvent',
  'tavern_events', 'Mvu', 'SillyTavern', 'TavernHelper',
]);

const glob = n => { try { const v = window?.[n]; return v === undefined ? globalThis?.[n] : v; } catch (e) { try { return globalThis[n]; } catch (x) { return undefined; } } };
// 全局优先，其次 TavernHelper 命名空间（地基 A3：有的版本不挂全局）；拿不到 → null
const thLook = n => { try { const g = glob(n); if (typeof g === 'function') return g; const t = glob('TavernHelper'); return typeof t?.[n] === 'function' ? t[n].bind(t) : null; } catch (e) { return null; } };
// 只认全局的函数取法（等价于以前在原地裸写 eventOn(...)：命名空间里的那份不算）
const rawLook = n => { try { const g = glob(n); return typeof g === 'function' ? g : null; } catch (e) { return null; } };
// 世界书面取法：全局 → 本窗口 TavernHelper → 父窗口 TavernHelper（自检与绑定检查用）
const hostLook = n => { try { const g = glob(n); if (typeof g === 'function') return g;
  const th = glob('TavernHelper') ?? glob('parent')?.TavernHelper; return typeof th?.[n] === 'function' ? th[n].bind(th) : null; } catch (e) { return null; } };
const parentWin = () => { try { return window.parent; } catch (e) { return null; } };   // 宿主页：脚本跑在卡的 iframe 里，面板与暴露都在那一层

/**
 * 建一个适配实例。env 覆盖底层查找（node 单测喂假接口表；F1 的原生实现走同一条路）：env = { fn?, ok?, okRaw?, raw?, hfn?, top? }
 */
export function createHostAdapter(env = {}) {
  const fn = env.fn ?? thLook;                                        // 功能探测：取接口（TH 语义：全局或命名空间）
  const raw = env.raw ?? rawLook;                                     // 只认全局（旧 fnOk 的口径，供 okRaw 用：调用方按它决定降级）
  const ok = env.ok ?? (n => !!raw(n) || !!thLook(n));                // 接口在不在（全局或命名空间都算）
  const okRaw = env.okRaw ?? (n => raw(n) !== null);                  // 旧 fnOk 口径：只认全局——调用方按它决定降级， widened 会改行为
  const hfn = env.hfn ?? hostLook;                                    // 世界书面取法
  const top = env.top ?? parentWin;
  const run = (f, ...a) => (f ? f(...a) : undefined);                 // 没装 → undefined；装了原样转发（异常由调用方按各自的旧降级接住）
  const floors = () => { try { return glob('SillyTavern')?.chat ?? null; } catch (e) { return null; } };
  const mvuOf = () => { try { return glob('Mvu') ?? null; } catch (e) { return null; } };
  const uninject = ids => run(fn('uninjectPrompts'), ids);
  const prop = (o, k) => { try { return o?.[k]; } catch (e) { return undefined; } };   // 跨窗口读属性可能被沙箱拒绝 → 当作没有
  // 按给定作用域（本窗口、父窗口，或 node 单测喂的假表）逐一找接口：全局优先，其次命名空间。自检 / 宿主检查用它跨窗口取接口。
  const fnsFor = scopes => n => { for (const s of (Array.isArray(scopes) ? scopes : [])) {
    const g = prop(s, n); if (typeof g === 'function') return g;
    const th = prop(s, 'TavernHelper'), f = prop(th, n); if (typeof f === 'function') return f.bind(th); } return null; };

  const events = {
    present: () => { try { return typeof glob('tavern_events') === 'object'; } catch (e) { return false; } },
    name: key => { try { return glob('tavern_events')?.[key] ?? null; } catch (e) { return null; } },
    on: (ev, handler) => run(fn('eventOn'), ev, handler),
    onLast: (ev, handler) => { const f = fn('eventMakeLast'); return f ? f(ev, handler) : null; },   // 排在同事件所有处理器之后；没这个接口 → null（调用方退回 on）
    off: (ev, handler, handle) => { const r = fn('eventRemoveListener'); return r ? r(ev, handler, handle) : run(fn('eventOff'), ev, handler); },
    emit: (ev, payload) => run(fn('eventEmit'), ev, payload),
  };
  const chat = {
    lastId: () => run(fn('getLastMessageId')),
    messages: (range, opts) => run(fn('getChatMessages'), ...(opts === undefined ? [range] : [range, opts])),   // 只给区间就按一个参数传（与拆分前的裸调用同形参个数）
    floors,
    floorCount: () => { const c = floors(); return Array.isArray(c) && c.length ? c.length : -1; },
    floorAt: i => { const c = floors(); return c && typeof c === 'object' ? c[i] ?? null : null; },
    context: () => { try { return glob('SillyTavern')?.getContext?.() ?? null; } catch (e) { return null; } },
    parentContext: () => { try { return top()?.SillyTavern?.getContext?.() ?? null; } catch (e) { return null; } },
  };
  const mvu = {
    present: () => mvuOf() !== null,
    usable: () => typeof mvuOf()?.getMvuData === 'function',   // 装了 MVU 但没这个接口 = 一样读不到快照
    data: query => { try { return mvuOf()?.getMvuData?.(query) ?? null; } catch (e) { return null; } },
    events: () => { try { return mvuOf()?.events ?? null; } catch (e) { return null; } },
    wait: name => { const f = fn('waitGlobalInitialized'); return f ? Promise.resolve(f(name)) : Promise.resolve(); },
  };
  const vars = {   // kind = 'chat' | 'script' | 'global'
    read: kind => run(fn('getVariables'), { type: kind }),
    assign: (obj, kind) => run(fn('insertOrAssignVariables'), obj, { type: kind }),
    replace: (obj, kind) => run(fn('replaceVariables'), obj, { type: kind }),
    update: (mut, kind) => run(fn('updateVariablesWith'), mut, { type: kind }),
    canWrite: () => ok('getVariables') && ['updateVariablesWith', 'replaceVariables', 'insertOrAssignVariables'].some(k => ok(k)),
  };
  const inject = {
    present: () => ok('injectPrompts'),
    apply: prompts => run(fn('injectPrompts'), prompts),
    remove: uninject,
    swap: (ids, prompts) => { const inj = fn('injectPrompts'); if (!inj) return false;   // 固定 id：先撤再注（空内容 = 只撤）
      try { uninject(ids); if (prompts?.length) inj(prompts); return true; } catch (e) { return false; } },
  };
  const wb = {   // 只动我们自己的那本书
    names: () => run(fn('getWorldbookNames')),
    book: name => run(fn('getWorldbook'), name),
    create: (name, entries) => run(fn('createWorldbook'), name, entries),
    createOrReplace: (name, entries) => run(fn('createOrReplaceWorldbook'), name, entries),
    update: (name, updater) => run(fn('updateWorldbookWith'), name, updater),
    replace: (name, entries) => run(fn('replaceWorldbook'), name, entries),
    remove: name => run(fn('deleteWorldbook'), name),
    globalNames: () => run(hfn('getGlobalWorldbookNames')),
    charNames: which => run(hfn('getCharWorldbookNames'), which),
    chatName: which => run(hfn('getChatWorldbookName'), which),
    bindGlobal: list => run(fn('rebindGlobalWorldbooks'), list),
    bindChar: (which, books) => run(fn('rebindCharWorldbooks'), which, books),
    bindChat: (which, name) => run(fn('rebindChatWorldbook'), which, name),
    canCreate: () => ok('createOrReplaceWorldbook') || ok('createWorldbook'),
  };
  const macro = {
    present: () => ok('registerMacroLike'),
    register: (re, get) => run(fn('registerMacroLike'), re, get),
    unregister: re => run(fn('unregisterMacroLike'), re),
  };
  const ui = {
    scriptId: () => run(fn('getScriptId')),
    scriptInfo: info => run(fn('replaceScriptInfo'), info),
    globalApi: (name, value) => run(fn('initializeGlobal'), name, value),   // 正式入口：别的脚本 waitGlobalInitialized('<name>') 拿到的对象
    displayedMessage: id => run(fn('retrieveDisplayedMessage'), id),
    charData: which => run(fn('getCharData'), which),
    regexes: q => run(fn('getTavernRegexes'), q),
    preset: which => run(fn('getPreset'), which),
    /** 查看器自己的兜底探测（版权申明页）：给定窗口读它的酒馆上下文；碰全局的只有这里 */
    probeContext: w => { try { return (w ?? glob('window'))?.SillyTavern?.getContext?.() ?? null; } catch (e) { return null; } },
    probeCharName: w => { try { const th = (w ?? glob('window'))?.TavernHelper; return typeof th?.getCharacterName === 'function' ? th.getCharacterName() : null; } catch (e) { return null; } },
  };
  return { fn, ok, okRaw, raw, hfn, top, fnsFor, events, chat, mvu, vars, inject, wb, macro, ui };
}

/** 引擎用的那一个实例（宿主全局在调用时才读，脚本注入前启动也不报错）；各业务模块的依赖包参数都叫 host，所以这里导出名必须是 hostAdapter */
export const hostAdapter = createHostAdapter();
