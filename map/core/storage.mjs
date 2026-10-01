// 本机存储服务（大版本 2，docs/design/arch-v2.md §4）：查看器、宿主、主场景 / 三维子页同源，共用一份 localStorage。
// KEYS = 全部键的唯一登记处（所有者、作用域、默认值）；tests/storage.test.mjs 静态清点仓库里出现的每个 edenMap* 键都必须在这里登记。
// get / set / json / remove：带 try/catch（隐私模式、额度满、被禁用都不抛）。新代码用这里；旧的经典脚本逐步迁（arch-v2 §6 第 5 步）。
// 以 edenMap 开头的键参与存储预算（tavern/storage-budget.mjs）；edenEstateLabels 是历史遗留名，预算里也按我们的算。
import { nsKey } from './pack.mjs';
// 设定包命名空间（core/pack.mjs）：非 eden 包时 edenMap* 键实际读写 tcp.<id>.*；登记处仍按 edenMap* 写
const N = k => nsKey(k, globalThis.__packId);
// 迷雾探索（app/fog.mjs 消费，P3-A 收口）：开关键 + 单独打开查看器时的本机探索记录（挂在 perChat 前缀下的「local」伪聊天 id）。
// 这里是全仓唯一定义点——其他文件一律 import 这两个常量，不许再写死键名（tests/depth_system.test.mjs 机检）。
export const FOG_KEY = 'edenMapFog', FOG_LOCAL_KEY = 'edenMap:chat:local:fog';
export const KEYS = {
  // 查看器（viewer.html）
  edenMapTheme: { owner: 'viewer', def: 'auto' }, edenMapLang: { owner: 'viewer', def: 'zh' }, edenMapHand: { owner: 'viewer', def: 'auto' },
  edenMapTierV2: { owner: 'viewer' }, 'edenMapAlt:': { owner: 'viewer', prefix: true }, edenMapBarriers: { owner: 'viewer' }, edenMapRoutes: { owner: 'viewer' },
  edenMapKeys: { owner: 'viewer', def: '0' } /* 单字母快捷键 + 事态操作字母角标，默认关（用户 2026-09-28 反馈） */, edenMapRM: { owner: 'viewer', def: 'auto' }, edenMap3dQ: { owner: 'viewer', def: 'auto' }, edenMap3dAuto: { owner: 'viewer', def: '0' },
  edenMapFps: { owner: 'viewer', def: '0' }, edenMapNoFx: { owner: 'viewer' }, edenMapCharStats: { owner: 'viewer' }, edenMapCharMore: { owner: 'viewer' },
  edenMapAutoCheck: { owner: 'viewer' }, edenMapAutoUpdate: { owner: 'viewer', def: '0' }, edenMapLockTag: { owner: 'viewer' }, edenMapRailW: { owner: 'viewer' }, edenMapHint: { owner: 'viewer' }, edenMapHintN: { owner: 'viewer' }, edenMapFog: { owner: 'app/fog.mjs', def: '1' },
  edenMapMinimap: { owner: 'viewer', def: '0' },   // U14（2026-09-28）：左下角小地图，默认关，设置「显示」可开
  edenMapCvd: { owner: 'app/color-vision-mode.mjs', def: '0' },   // 色觉模式：0 关 / rg 红绿 / by 蓝黄（E7）
  edenMapEstateFail: { owner: 'viewer', scope: 'session' },
  // 查看器外挂脚本
  edenMapEvOff: { owner: 'events-view.mjs' }, edenMapLegHint: { owner: 'events-view.mjs' }, edenMapPortraits: { owner: 'characters-view.mjs' }, edenMapChGroups: { owner: 'characters-view.mjs' },
  edenMapCharMoreOpen: { owner: 'characters-view.mjs' }, edenMapNight: { owner: 'custom-names-view.mjs' }, edenMapTrips: { owner: 'trips-view.mjs' }, edenMapSecurity: { owner: 'security.mjs', def: '0' },
  edenMapCompose: { owner: 'tavern/compose-templates.mjs' },
  edenMapInject: { owner: 'tavern/place-action-injection.mjs', def: 'off' }, edenMapActionTpl: { owner: 'tavern/place-action-injection.mjs' },   // Part 6-4 动作注入：模式（默认关）与模板
  edenMapTick: { owner: 'tavern/background-scan-scheduler.mjs', def: '1' },   // Part 6-2 后台静默推演：开 / 关（毫秒数也可，夹在 15 s–5 min）
  // 按聊天分（参与 LRU 清理）
  'edenMap:chat:': { owner: 'shared', prefix: true, perChat: true }, 'edenMapSeen:': { owner: 'host', prefix: true, perChat: true },
  'edenMap:varmap:': { owner: 'tavern/stat-path-mapping.mjs', prefix: true }, 'edenMap:lru': { owner: 'tavern/storage-budget.mjs' }, 'edenMap:custom': { owner: 'core/legacy-custom.mjs' },
  'edenMap:chars': { owner: 'tavern/characters-parse.mjs' }, 'edenMap:avatars': { owner: 'tavern/characters-parse.mjs' },
  // 宿主（tavern/eden-map.js）
  edenMapLine: { owner: 'host', prefix: true }, edenMapFabPos: { owner: 'host' }, edenMapEvTip: { owner: 'host' }, edenMapUpdSkip: { owner: 'host' },
  edenMapCheckToast: { owner: 'host' }, edenMapUpdate: { owner: 'host' }, edenMapSplashSeen: { owner: 'tavern/splash.mjs' },
  // 社区预设文本净化（Part 7，tavern/sanitize.mjs）：edenMapSanitize=0 全关；edenMapSanitizeTags = JSON 数组自定义块标签表
  edenMapSanitize: { owner: 'host', def: '1' }, edenMapSanitizeTags: { owner: 'host' },
  // 空间化背包注入开关（Part 5-1）：eden_map.仓库 摘要随事态注入给模型（默认开）
  edenMapInvInj: { owner: 'host', def: '1' },
  // 检定掷骰（W2，docs/plans/llm-campaign.md）：开着才真掷骰（stash.search / stealth DC），失手不入包、出失败报告；默认关 = 行为与今天完全一致
  edenMapDice: { owner: 'host', def: '0' },
  // 领航员网关（W5）：开关 / 节奏（'' 缺省=关）+ 端点配置 JSON {provider,key,base,model}（日志只出 llm.redact 脱敏）+ 首跑同意水位
  edenMapNav: { owner: 'host', def: '0' }, edenMapNavCfg: { owner: 'host' }, edenMapNavConsent: { owner: 'host', def: '0' },
  // 见闻录（Part 5-5）：钉在地标上的图与手记的索引（字节在图集 IndexedDB 里）；按聊天分，键 = edenMap:chat:<聊天 id>:scrap
  'edenMapScrap': { owner: 'map/scrapbook-view.mjs', prefix: true, perChat: true },
  // 酒馆助手采纳（docs/tavernhelper-audit.md，docs/interaction-modes.md）：状态注入 (a)、类宏 B9、世界书附加条目同步 B1
  edenMapStateInj: { owner: 'host', def: '1' }, edenMapStateDepth: { owner: 'host', def: '2' }, edenMapStateBudget: { owner: 'host', def: '150' }, edenMapMacros: { owner: 'host', def: '0' },
  // 空间坐标契约注入（W1，docs/plans/llm-campaign.md）：edenMapSpatial 默认关；上限 token 数（裁决 5，默认 120）
  edenMapSpatial: { owner: 'host', def: '0' }, edenMapSpatialBudget: { owner: 'host', def: '120' },
  edenMapWbAuto: { owner: 'host', def: '0' }, edenMapWbOn: { owner: 'host', def: '1' }, edenMapWbTomb: { owner: 'host', def: '0' }, edenMapWbChars: { owner: 'host' }, edenMapWbNoticeVer: { owner: 'host' }, edenMapWbSync: { owner: 'host' }, edenMapWbWhere: { owner: 'host' },
  edenMapWbJit: { owner: 'host', def: '0' },   // W6 世界书 JIT 水合：人在哪只挂哪（默认关；只动附加书 extra.eden_id 条目）
  edenMapWbXtal: { owner: 'host', def: '0' }, edenMapWbXtalCfg: { owner: 'host' },   // W7 事实结晶：开关 + 水位/墓表 {tombstones, written}（默认关）
  // 三维
  edenEstateLabels: { owner: 'estate', legacy: true }, edenMap3dRailW: { owner: 'ui/chrome3d.js' },
  // 相机控制（U，2026-09-28）：视角预设/指北针/首次提示卡/空闲自动旋转，主场景页与通用三维查看器共用（ui/camera-controls.js）
  edenEstateHintSeen: { owner: 'estate', legacy: true }, edenMapV3dHintSeen: { owner: 'props/viewer3d.html' }, edenMap3dAutoRotate: { owner: 'ui/camera-controls.js', def: '0' },
  // 反馈日志环形缓冲（core/logbuf.mjs）：当前会话滚动日志 + 上次会话归档（最多 4 份），0.9.7
  edenMapLogCur: { owner: 'core/logbuf.mjs' }, edenMapLogPast: { owner: 'core/logbuf.mjs' },
};
// 地基 A4：这些偏好的真相在酒馆助手脚本变量（type:'script'，变量名 eden_prefs）：读脚本变量优先、本机回退，本版两边都写（下一版再去掉本机这份）。
// 宿主 tavern/eden-map.js PREF_KEYS 是同一份（tests/storage.test.mjs 对照）；查看器仍读写本机，宿主在启动时把脚本变量写回本机、本机一变就同步回脚本变量。
export const SCRIPT_KEYS = ['edenMapLine', 'edenMapHand', 'edenMapLang', 'edenMapTheme', 'edenMapFabPos', 'edenMapStateInj', 'edenMapStateDepth', 'edenMapStateBudget', 'edenMapMacros', 'edenMapWbOn', 'edenMapWbSync', 'edenMapWbWhere'];
export const SCRIPT_VAR = 'eden_prefs';
/** 键是否登记（前缀键按前缀匹配；edenMapLine 覆盖 edenMapLineManual / edenMapLineAt） */
export function known(k) {
  if (Object.hasOwn(KEYS, k)) return true;
  return Object.entries(KEYS).some(([p, o]) => o.prefix && k.startsWith(p));
}
const area = (scope, S = globalThis) => { try { return scope === 'session' ? S.sessionStorage : S.localStorage; } catch (e) { return null; } };
const spec = k => KEYS[k] || Object.entries(KEYS).find(([p, o]) => o.prefix && k.startsWith(p))?.[1] || {};
// 读：包命名空间键空着时降级读 edenMap* 历史档（通用化之前的旧数据，比如清单到达前写过、或早期版本共享命名空间时期）。
// 只读不写回：历史档原样保留，一写就落进本包命名空间并从此优先；eden（__packId 空 / 'eden'）键本来就是原名，不多读一次。
export function get(k, def, S) {
  const s = spec(k);
  try {
    const a = area(s.scope, S), id = globalThis.__packId;
    const v = a?.getItem(N(k)) ?? (id && id !== 'eden' ? a?.getItem(k) : null);
    return v ?? (def !== undefined ? def : s.def ?? null);
  } catch (e) { return def ?? s.def ?? null; }
}
export function set(k, v, S) { const a = area(spec(k).scope, S); if (!a) return false; try { a.setItem(N(k), String(v)); return true; } catch (e) { return false; } }
export function remove(k, S) { try { area(spec(k).scope, S)?.removeItem(N(k)); } catch (e) {} }
export function json(k, def = null, S) { try { const v = get(k, null, S); return v == null ? def : JSON.parse(v); } catch (e) { return def; } }
export const flag = (k, S) => get(k, undefined, S) === '1';
