// 本机存储服务（大版本 2，docs/design/arch-v2.md §4）：查看器、宿主、主场景 / 三维子页同源，共用一份 localStorage。
// KEYS = 全部键的唯一登记处（所有者、作用域、默认值）；tests/storage.test.mjs 静态清点仓库里出现的每个 edenMap* 键都必须在这里登记。
// pref: true / false 是每个键必须有的一条决定（tests/profiles.test.mjs 机检）：true = 用户偏好（可存进设置方案）；false = 按聊天的数据、会话键、提示已看标记、日志缓存、变量映射、所选包、密钥与端点配置。
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
  edenMapTheme: { pref: true, owner: 'viewer', def: 'auto' }, edenMapGlassClock: { pref: true, owner: 'app/theme.mjs', def: '0' }, edenMapLang: { pref: true, owner: 'viewer', def: 'zh' }, edenMapHand: { pref: true, owner: 'viewer', def: 'auto' },
  edenMapTierV2: { pref: true, owner: 'viewer' }, 'edenMapAlt:': { pref: false, owner: 'viewer', prefix: true }, edenMapBarriers: { pref: true, owner: 'viewer' }, edenMapRoutes: { pref: true, owner: 'viewer' },
  edenMapTopView: { pref: true, owner: 'app/layer-host.mjs', def: '0' } /* OBLIQUE-CODE E: 俯视开关（斜视是主视图）；全局记忆，默认关 */,
  edenMapKeys: { pref: true, owner: 'viewer', def: '0' } /* 单字母快捷键 + 事态操作字母角标，默认关（用户 2026-09-28 反馈） */, edenMapRM: { pref: true, owner: 'viewer', def: 'auto' }, edenMap3dQ: { pref: true, owner: 'viewer', def: 'auto' }, edenMap3dAuto: { pref: true, owner: 'viewer', def: '0' },
  edenMapDebugFps: { pref: true, owner: 'viewer', def: '0' } /* U-FIX-5 S-05: was edenMapFps; a stale '1' from older builds no longer turns the debug HUD on */, edenMapNoFx: { pref: true, owner: 'viewer' }, edenMapCharStats: { pref: true, owner: 'viewer' }, edenMapCharMore: { pref: true, owner: 'viewer' },
  edenMapAutoCheck: { pref: true, owner: 'viewer' }, edenMapAutoUpdate: { pref: true, owner: 'viewer', def: '0' }, edenMapLockTag: { pref: false, owner: 'viewer' }, edenMapRailW: { pref: false, owner: 'viewer' }, edenMapHint: { pref: false, owner: 'viewer' }, edenMapHintN: { pref: false, owner: 'viewer' }, edenMapFog: { pref: true, owner: 'app/fog.mjs', def: '0' } /* LOOK-1 A2（D42）：迷雾探索默认关；开着的遮罩也只是轻微去饱和压暗，不再是黑幕 */,
  edenMapMinimap: { pref: true, owner: 'viewer', def: '0' },   // U14（2026-09-28）：左下角小地图，默认关，设置「显示」可开
  edenMapCvd: { pref: true, owner: 'app/color-vision-mode.mjs', def: '0' },   // 色觉模式：0 关 / rg 红绿 / by 蓝黄（E7）
  edenMapEstateFail: { pref: false, owner: 'viewer', scope: 'session' },
  // 查看器外挂脚本
  edenMapEvOff: { pref: false, owner: 'events-view.mjs' }, edenMapLegHint: { pref: false, owner: 'events-view.mjs' }, edenMapPortraits: { pref: true, owner: 'characters-view.mjs' }, edenMapChGroups: { pref: false, owner: 'characters-view.mjs' },
  edenMapCharMoreOpen: { pref: false, owner: 'characters-view.mjs' }, edenMapNight: { pref: true, owner: 'custom-names-view.mjs' }, edenMapTrips: { pref: true, owner: 'trips-view.mjs' }, edenMapLayers: { pref: true, owner: 'app/layer-host.mjs' }, edenMapSecurity: { pref: true, owner: 'security.mjs', def: '0' },
  edenMapGallery: { pref: true, owner: 'map/gallery-view.mjs', def: '1' },   // K-R106: the pack's media source (a card's own picture gallery, read only); on by default, '0' = nothing is read or shown
  edenMapCompose: { pref: false, owner: 'tavern/compose-templates.mjs' },
  edenMapInject: { pref: true, owner: 'tavern/place-action-injection.mjs', def: 'off' }, edenMapActionTpl: { pref: false, owner: 'tavern/place-action-injection.mjs' },   // Part 6-4 动作注入：模式（默认关）与模板
  edenMapTick: { pref: true, owner: 'tavern/background-scan-scheduler.mjs', def: '1' },   // Part 6-2 后台静默推演：开 / 关（毫秒数也可，夹在 15 s–5 min）
  // 按聊天分（参与 LRU 清理）
  'edenMap:chat:': { pref: false, owner: 'shared', prefix: true, perChat: true }, 'edenMapSeen:': { pref: false, owner: 'host', prefix: true, perChat: true },
  'edenMap:varmap:': { pref: false, owner: 'tavern/stat-path-mapping.mjs', prefix: true }, 'edenMap:lru': { pref: false, owner: 'tavern/storage-budget.mjs' }, 'edenMap:custom': { pref: false, owner: 'core/legacy-custom.mjs' },
  'edenMap:chars': { pref: false, owner: 'tavern/characters-parse.mjs' }, 'edenMap:avatars': { pref: false, owner: 'tavern/characters-parse.mjs' },
  // 宿主（tavern/eden-map.js）
  edenMapLine: { pref: false, owner: 'host', prefix: true }, edenMapFabPos: { pref: false, owner: 'host' }, edenMapEvTip: { pref: false, owner: 'host' }, edenMapUpdSkip: { pref: false, owner: 'host' },
  edenMapCheckToast: { pref: false, owner: 'host' }, edenMapUpdate: { pref: false, owner: 'host' }, edenMapSplashSeen: { pref: false, owner: 'tavern/splash.mjs' },
  // 社区预设文本净化（Part 7，tavern/sanitize.mjs）：edenMapSanitize=0 全关；edenMapSanitizeTags = JSON 数组自定义块标签表
  edenMapSanitize: { pref: true, owner: 'host', def: '1' }, edenMapSanitizeTags: { pref: false, owner: 'host' },
  // 空间化背包注入开关（Part 5-1）：eden_map.仓库 摘要随事态注入给模型（默认开）
  edenMapInvInj: { pref: true, owner: 'host', def: '1' },
  // 检定掷骰（W2，docs/plans/llm-campaign.md）：开着才真掷骰（stash.search / stealth DC），失手不入包、出失败报告；默认关 = 行为与今天完全一致
  edenMapDice: { pref: true, owner: 'host', def: '0' },
  // 结算记录（K-R78）：开着才把日程里的人物位置和聊天里的事件记进地图自己的聊天变量（ledger，只补空缺，不写卡的变量）；默认关 = 行为与今天完全一致
  edenMapLedgerWrite: { pref: true, owner: 'host', def: '0' },
  // 领航员网关（W5）：开关 / 节奏（'' 缺省=关）+ 端点配置 JSON {provider,key,base,model}（日志只出 llm.redact 脱敏）+ 首跑同意水位
  edenMapNav: { pref: false, owner: 'host', def: '0' }, edenMapNavCfg: { pref: false, owner: 'host' }, edenMapNavConsent: { pref: false, owner: 'host', def: '0' }, edenMapNavCadence: { pref: true, owner: 'host', def: '120000' },
  // 见闻录（Part 5-5）：钉在地标上的图与手记的索引（字节在图集 IndexedDB 里）；按聊天分，键 = edenMap:chat:<聊天 id>:scrap
  'edenMapScrap': { pref: false, owner: 'map/scrapbook-view.mjs', prefix: true, perChat: true },
  // 酒馆助手采纳（docs/tavernhelper-audit.md，docs/interaction-modes.md）：状态注入 (a)、类宏 B9、世界书附加条目同步 B1
  edenMapStateInj: { pref: true, owner: 'host', def: '1' }, edenMapStateDepth: { pref: true, owner: 'host', def: '2' }, edenMapStateBudget: { pref: true, owner: 'host', def: '150' }, edenMapStateOmit: { pref: true, owner: 'host', def: '[]' }, edenMapMacros: { pref: true, owner: 'host', def: '0' },
  // 空间坐标契约注入（W1，docs/plans/llm-campaign.md）：edenMapSpatial 默认关；上限 token 数（裁决 5，默认 120）
  edenMapSpatial: { pref: true, owner: 'host', def: '0' }, edenMapSpatialBudget: { pref: true, owner: 'host', def: '120' }, edenMapSpatialDepth: { pref: true, owner: 'host', def: '2' },
  edenMapWbAuto: { pref: true, owner: 'host', def: '0' }, edenMapWbOn: { pref: true, owner: 'host', def: '1' }, edenMapWbTomb: { pref: false, owner: 'host', def: '0' }, edenMapWbChars: { pref: false, owner: 'host' }, edenMapWbNoticeVer: { pref: false, owner: 'host' }, edenMapWbSync: { pref: false, owner: 'host' }, edenMapWbWhere: { pref: false, owner: 'host' }, edenMapWbSyncAt: { pref: false, owner: 'host' } /* PLACE-1a: ms timestamp of this device's last successful automatic sync (the record card's sync line); not a switch */,
  edenMapWbJit: { pref: true, owner: 'host', def: '0' },   // W6 世界书 JIT 水合：人在哪只挂哪（默认关；只动附加书 extra.eden_id 条目）
  edenMapTurnIds: { pref: true, owner: 'host', def: '0' },   // TURN-IDS（docs/turn-ids.md）：每轮注入「本轮标签词表」+ 地点 / 人物 / 事件标签校验与诊断环（默认关；关 = 行为与今天完全一致）
  edenMapWbXtal: { pref: true, owner: 'host', def: '0' }, edenMapWbXtalCfg: { pref: false, owner: 'host' },   // W7 事实结晶：开关 + 水位/墓表 {tombstones, written}（默认关）
  // 通用脚本的包选择（S9-2，docs/zero-config.md §11）：都在没有任何包之前就要读，所以是宿主的原始键、从不加包命名空间（K-R90 / K-R103）
  edenMapPackPick: { pref: false, owner: 'tavern/pack-gate.mjs' },   // JSON { <卡键>: 'index:<id>' | 'url:<https 地址>' | 'file' }；没有 = 自动
  edenMapPackLlm: { pref: false, owner: 'tavern/pack-gate.mjs', def: '{}' },
  edenMapPacks: { pref: false, owner: 'core/pack-store-db.mjs', idb: true },   // 不是 localStorage 键：IndexedDB 库名（store packs，键 = 卡键）；登记在这是为了静态清点认得它   // JSON { <包 id>: <模型文字 llm 块规范 JSON 的 fnv36> }（K-R103，默认关）
  // 编辑模式与包图片（S9b，K-R100 / K-R101）：开关默认关；草稿按包 id 存（图片字节在图集 IndexedDB 的 edit:<包 id> 作用域，不在这里）
  edenMapEdit: { pref: false, owner: 'viewer', def: '0' }, edenMapPackRemote: { pref: false, owner: 'viewer', def: '0' }, 'edenMap:edit:': { pref: false, owner: 'app/pack-edit.mjs', prefix: true },
  // 三维
  edenEstateLabels: { pref: false, owner: 'estate', legacy: true }, edenMap3dRailW: { pref: false, owner: 'ui/chrome3d.js' },
  // 相机控制（U，2026-09-28）：视角预设/指北针/首次提示卡/空闲自动旋转，主场景页与通用三维查看器共用（ui/camera-controls.js）
  edenEstateHintSeen: { pref: false, owner: 'estate', legacy: true }, edenMapV3dHintSeen: { pref: false, owner: 'props/viewer3d.html' }, edenMap3dAutoRotate: { pref: true, owner: 'ui/camera-controls.js', def: '0' }, edenMap3dWheelZoom: { pref: true, owner: 'ui/camera-controls.js', def: '1' }   /* D33: wheel zoom on by default in 3D; an explicit '0' = wheel pans */,
  // 暂停的功能（INV-2，core/parked.mjs）：edenMapOn:<id> = '1' 才开；缺省 = 暂停（默认关、设置与图层菜单里不显示）
  'edenMapOn:': { pref: true, owner: 'core/parked.mjs', prefix: true },
  // 设置方案（PROFILE-1，core/profiles.mjs）：JSON { active, list: [{ id, name, values }] }；方案本身不是偏好（不会被存进方案里）
  edenMapProfiles: { pref: false, owner: 'core/profiles.mjs' },
  edenMapProfOpen: { pref: false, owner: 'app/profile-section.mjs', def: '0' },   // HEADER-1: the settings-profile row is collapsed unless the user opened it on this device
  // 反馈日志环形缓冲（core/logbuf.mjs）：当前会话滚动日志 + 上次会话归档（最多 4 份），0.9.7
  edenMapLogCur: { pref: false, owner: 'core/logbuf.mjs' }, edenMapLogPast: { pref: false, owner: 'core/logbuf.mjs' },
};
// 地基 A4：这些偏好的真相在酒馆助手脚本变量（type:'script'，变量名 eden_prefs）：读脚本变量优先、本机回退，本版两边都写（下一版再去掉本机这份）。
// 宿主 tavern/eden-map.js PREF_KEYS 是同一份（tests/storage.test.mjs 对照）；查看器仍读写本机，宿主在启动时把脚本变量写回本机、本机一变就同步回脚本变量。
export const SCRIPT_KEYS = ['edenMapLine', 'edenMapHand', 'edenMapLang', 'edenMapTheme', 'edenMapFabPos', 'edenMapStateInj', 'edenMapStateDepth', 'edenMapStateBudget', 'edenMapStateOmit', 'edenMapMacros', 'edenMapWbOn', 'edenMapWbSync', 'edenMapWbWhere'];
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
