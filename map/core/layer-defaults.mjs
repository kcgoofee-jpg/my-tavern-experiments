// The kernel's own layers as declarations (docs/layers-schema.md §8.1, K-R79; S8-3 adds nav-ops and local-props): the facts of every viewport layer the engine registers
// (slot, kind, order, menu row, drawing block) in one frozen list. The modules still own the code (mount, unmount, setVisible,
// initialVisible); each registers `declared(id, impl)` (app/layer-host.mjs), so the registry holds exactly these facts plus the functions.
// `type` is the building block the layer draws through (null = drawn by kernel code); `source: 'kernel'` marks the closed list.
// Pure: no DOM, no storage, no host globals.
const L = (id, slot, kind, type, rest = {}) => ({ id, slot, kind, ...rest, type, source: 'kernel' });
const tgt = (order, boxId, labelKey, label, titleKey, title, more = {}) => ({ order, boxId, labelKey, label, ...(titleKey ? { titleKey, title } : {}), ...more });

export const KERNEL_LAYERS = Object.freeze([
  L('base-overlay', 'base', 'osd', null, { menu: { order: 10, id: 'tgOverlay', boxId: 'tgBorders', label: '国界' } }),
  L('alt-base', 'base', 'osd', null, { order: 1, menu: { order: 20, id: 'tgAlt', boxId: 'tgAltBox', label: '显示下方城市', titleKey: 'alt_title', title: '高级：换成带下方城市的底图（图更大）', hidden: true } }),
  L('routes', 'routes', 'osd', 'line', { menu: { order: 30, id: 'tgRoutes', boxId: 'tgRoutesBox', labelKey: 'routes', label: '航线', titleKey: 'routes_title', title: '上层航线（金色虚线）与巡逻环（淡蓝点划线）', hidden: true } }),
  L('security', 'markers', 'osd', null, { order: 2, menu: { order: 40, id: 'tgSec', boxId: 'tgSecBox', labelKey: 'sec.title', label: '安保', titleKey: 'sec.hint', title: '结界、监控、门禁规则（只列卡里写明的）' } }),
  L('weather', 'fx', 'canvas', 'particles', { order: 10, menu: tgt(45, 'tgWeather', 'weather', '天气', 'weather_title', '按剧情与时段渲染雨 / 沙尘 / 雪与闪电') }),
  L('traffic', 'fx', 'canvas', 'flow', { order: 20, menu: tgt(46, 'tgTraffic', 'traffic', '车流', 'traffic_title', '航线与巡逻环上的悬浮车流光点') }),
  L('quests', 'fx', 'canvas', null, { order: 30, menu: tgt(47, 'tgQuests', 'quests', '线索', 'quests_title', '事态冒头的地点上给一枚会呼吸的线索节点（不编剧情，只跟着事态走）') }),
  L('loot', 'interaction', 'dom', null, { order: 10, menu: tgt(48, 'tgLoot', 'loot.layer', '藏物', 'loot.layer_title', '设定包里登记在世界上的东西（走到近处才看得到暗格里的）') }),
  L('vision', 'fx', 'canvas', null, { order: 25, menu: tgt(49, 'tgVision', 'vision.layer', '视野锥', 'vision.layer_title', '巡逻岗哨 / 机兵的警戒视野（沿地图自己的巡逻环在动）') }),
  L('wander', 'interaction', 'dom', null, { order: 20, menu: tgt(50, 'tgWander', 'wander.layer', '漫游', 'wander.layer_title', '人物标记换地方时滑过去，不瞬移（日程表按世界时刻挪人）') }),
  L('trips', 'trips', 'osd', null, { menu: { order: 50, id: 'tgTrips', boxId: 'tgTripsBox', labelKey: 'trips', label: '行程' } }),
  L('labels', 'labels', 'osd', null, { menu: { order: 60, boxId: 'tgLabels', labelKey: 'labels', label: '地名' } }),
  L('markers', 'markers', 'osd', null, { menu: { order: 70, boxId: 'tgMarkers', labelKey: 'markers', label: '标记' } }),
  L('events', 'events', 'osd', null, { menu: { order: 80, id: 'tgEvents', labelKey: 'ev.toggle', label: '事态' } }),
  L('nav-ops', 'markers', 'osd', 'point', { order: 3, applies: { data: true }, menu: tgt(85, 'tgNavOps', 'nav.layer', '领航员标注', 'nav.layer_title', '后台领航员给出的线索与标注（只在本次会话里显示）', { id: 'lyr-nav-ops' }) }),   // S8-3, K-R86: the navigator's clues and marks (session only); the row shows while it holds something
  L('local-props', 'markers', 'osd', 'point', { order: 4, applies: { data: true }, menu: tgt(86, 'tgProps', 'props.layer', '本机道具', 'props.layer_title', '你放在地图上的本机道具（只存在这台设备）', { id: 'lyr-local-props' }) }),   // S8-3, K-R88: the user's own props placed on flat maps (local to this device)
  L('fog', 'fog', 'canvas', null),
  L('clouds', 'depth-haze', 'dom', null),
  L('depth-haze', 'depth-haze', 'dom', null, { order: 0 }),
]);

export const KERNEL_IDS = Object.freeze(KERNEL_LAYERS.map(l => l.id));
const clone = o => JSON.parse(JSON.stringify(o));
/** kernelDecl(id) -> a fresh copy of the kernel declaration of `id`, or null. */
export const kernelDecl = id => { const d = KERNEL_LAYERS.find(l => l.id === id); return d ? clone(d) : null; };
