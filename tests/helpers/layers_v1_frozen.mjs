// Frozen copy (S8-1): the non-function fields of the 17 layer descriptors exactly as the modules registered them before the kernel list existed
// (initialVisible is computed by the modules and left out). tests/layer_defaults.test.mjs compares core/layer-defaults.mjs against it.
// The `routes` title is the one text that changed on purpose: S8-1 T9 moved the card place out of the engine (the pack's strings carry the old words).
export const LAYERS_V1 = [
  { id: 'base-overlay', slot: 'base', kind: 'osd', menu: { order: 10, id: 'tgOverlay', boxId: 'tgBorders', label: '国界' } },
  { id: 'alt-base', slot: 'base', kind: 'osd', order: 1, menu: { order: 20, id: 'tgAlt', boxId: 'tgAltBox', label: '显示下方城市', titleKey: 'alt_title', title: '高级：换成带下方城市的底图（图更大）', hidden: true } },
  { id: 'routes', slot: 'routes', kind: 'osd', menu: { order: 30, id: 'tgRoutes', boxId: 'tgRoutesBox', labelKey: 'routes', label: '航线', titleKey: 'routes_title', title: '上层航线（金色虚线）与银冠堡巡逻环（淡蓝点划线）', hidden: true } },
  { id: 'labels', slot: 'labels', kind: 'osd', menu: { order: 60, boxId: 'tgLabels', labelKey: 'labels', label: '地名' } },
  { id: 'markers', slot: 'markers', kind: 'osd', menu: { order: 70, boxId: 'tgMarkers', labelKey: 'markers', label: '标记' } },
  { id: 'events', slot: 'events', kind: 'osd', menu: { order: 80, id: 'tgEvents', labelKey: 'ev.toggle', label: '事态' } },
  { id: 'security', slot: 'markers', order: 2, kind: 'osd', menu: { order: 40, id: 'tgSec', boxId: 'tgSecBox', labelKey: 'sec.title', label: '安保', titleKey: 'sec.hint', title: '结界、监控、门禁规则（只列卡里写明的）' } },
  { id: 'trips', slot: 'trips', kind: 'osd', menu: { order: 50, id: 'tgTrips', boxId: 'tgTripsBox', labelKey: 'trips', label: '行程' } },
  { id: 'depth-haze', slot: 'depth-haze', kind: 'dom', order: 0 },
  { id: 'wander', slot: 'interaction', kind: 'dom', order: 20, menu: { order: 50, boxId: 'tgWander', labelKey: 'wander.layer', label: '漫游', titleKey: 'wander.layer_title', title: '人物标记换地方时滑过去，不瞬移（日程表按世界时刻挪人）' } },
  { id: 'loot', slot: 'interaction', kind: 'dom', order: 10, menu: { order: 48, boxId: 'tgLoot', labelKey: 'loot.layer', label: '藏物', titleKey: 'loot.layer_title', title: '设定包里登记在世界上的东西（走到近处才看得到暗格里的）' } },
  { id: 'traffic', slot: 'fx', kind: 'canvas', order: 20, menu: { order: 46, boxId: 'tgTraffic', labelKey: 'traffic', label: '车流', titleKey: 'traffic_title', title: '航线与巡逻环上的悬浮车流光点' } },
  { id: 'quests', slot: 'fx', kind: 'canvas', order: 30, menu: { order: 47, boxId: 'tgQuests', labelKey: 'quests', label: '线索', titleKey: 'quests_title', title: '事态冒头的地点上给一枚会呼吸的线索节点（不编剧情，只跟着事态走）' } },
  { id: 'clouds', slot: 'depth-haze', kind: 'dom' },
  { id: 'fog', slot: 'fog', kind: 'canvas' },
  { id: 'weather', slot: 'fx', kind: 'canvas', order: 10, menu: { order: 45, boxId: 'tgWeather', labelKey: 'weather', label: '天气', titleKey: 'weather_title', title: '按剧情与时段渲染雨 / 沙尘 / 雪与闪电' } },
  { id: 'vision', slot: 'fx', kind: 'canvas', order: 25, menu: { order: 49, boxId: 'tgVision', labelKey: 'vision.layer', label: '视野锥', titleKey: 'vision.layer_title', title: '巡逻岗哨 / 机兵的警戒视野（沿地图自己的巡逻环在动）' } },
];
