// 本机存储服务（大版本 2，docs/design/arch-v2.md §4）：查看器、宿主、庄园 / 三维子页同源，共用一份 localStorage。
// KEYS = 全部键的唯一登记处（所有者、作用域、默认值）；tests/storage.test.mjs 静态清点仓库里出现的每个 edenMap* 键都必须在这里登记。
// get / set / json / remove：带 try/catch（隐私模式、额度满、被禁用都不抛）。新代码用这里；旧的经典脚本逐步迁（arch-v2 §6 第 5 步）。
// 以 edenMap 开头的键参与存储预算（tavern/budget.mjs）；edenEstateLabels 是历史遗留名，预算里也按我们的算。
export const KEYS = {
  // 查看器（viewer.html）
  edenMapTheme: { owner: 'viewer', def: 'auto' }, edenMapLang: { owner: 'viewer', def: 'zh' }, edenMapHand: { owner: 'viewer', def: 'auto' },
  edenMapTierV2: { owner: 'viewer' }, 'edenMapAlt:': { owner: 'viewer', prefix: true }, edenMapBarriers: { owner: 'viewer' }, edenMapRoutes: { owner: 'viewer' },
  edenMapKeys: { owner: 'viewer', def: '1' }, edenMapRM: { owner: 'viewer', def: 'auto' }, edenMap3dQ: { owner: 'viewer', def: 'auto' }, edenMap3dAuto: { owner: 'viewer', def: '0' },
  edenMapFps: { owner: 'viewer', def: '0' }, edenMapNoFx: { owner: 'viewer' }, edenMapCharStats: { owner: 'viewer' }, edenMapCharMore: { owner: 'viewer' },
  edenMapAutoCheck: { owner: 'viewer' }, edenMapAutoUpdate: { owner: 'viewer', def: '0' }, edenMapLockTag: { owner: 'viewer' }, edenMapRailW: { owner: 'viewer' }, edenMapHint: { owner: 'viewer' }, edenMapHintN: { owner: 'viewer' }, edenMapFog: { owner: 'app/fog.mjs', def: '0' },
  edenMapEstateFail: { owner: 'viewer', scope: 'session' },
  // 查看器外挂脚本
  edenMapEvOff: { owner: 'events.js' }, edenMapLegHint: { owner: 'events.js' }, edenMapPortraits: { owner: 'chars.js' }, edenMapChGroups: { owner: 'chars.js' },
  edenMapCharMoreOpen: { owner: 'chars.js' }, edenMapNight: { owner: 'custom.js' }, edenMapTrips: { owner: 'trips.js' }, edenMapSecurity: { owner: 'security.js', def: '0' },
  edenMapCompose: { owner: 'tavern/compose.mjs' },
  // 按聊天分（参与 LRU 清理）
  'edenMap:chat:': { owner: 'shared', prefix: true, perChat: true }, 'edenMapSeen:': { owner: 'host', prefix: true, perChat: true },
  'edenMap:varmap:': { owner: 'tavern/adapter.mjs', prefix: true }, 'edenMap:lru': { owner: 'tavern/budget.mjs' }, 'edenMap:custom': { owner: 'here.mjs' },
  'edenMap:chars': { owner: 'tavern/characters.mjs' }, 'edenMap:avatars': { owner: 'tavern/characters.mjs' },
  // 宿主（tavern/eden-map.js）
  edenMapLine: { owner: 'host', prefix: true }, edenMapFabPos: { owner: 'host' }, edenMapEvTip: { owner: 'host' }, edenMapUpdSkip: { owner: 'host' },
  edenMapCheckToast: { owner: 'host' }, edenMapUpdate: { owner: 'host' }, edenMapSplashSeen: { owner: 'tavern/splash.mjs' },
  // 三维
  edenEstateLabels: { owner: 'estate', legacy: true }, edenMap3dRailW: { owner: 'ui/chrome3d.js' },
};
/** 键是否登记（前缀键按前缀匹配；edenMapLine 覆盖 edenMapLineManual / edenMapLineAt） */
export function known(k) {
  if (Object.hasOwn(KEYS, k)) return true;
  return Object.entries(KEYS).some(([p, o]) => o.prefix && k.startsWith(p));
}
const area = (scope, S = globalThis) => { try { return scope === 'session' ? S.sessionStorage : S.localStorage; } catch (e) { return null; } };
const spec = k => KEYS[k] || Object.entries(KEYS).find(([p, o]) => o.prefix && k.startsWith(p))?.[1] || {};
export function get(k, def, S) { const s = spec(k); try { const v = area(s.scope, S)?.getItem(k); return v ?? (def !== undefined ? def : s.def ?? null); } catch (e) { return def ?? s.def ?? null; } }
export function set(k, v, S) { const a = area(spec(k).scope, S); if (!a) return false; try { a.setItem(k, String(v)); return true; } catch (e) { return false; } }
export function remove(k, S) { try { area(spec(k).scope, S)?.removeItem(k); } catch (e) {} }
export function json(k, def = null, S) { try { const v = get(k, null, S); return v == null ? def : JSON.parse(v); } catch (e) { return def; } }
export const flag = (k, S) => get(k, undefined, S) === '1';
