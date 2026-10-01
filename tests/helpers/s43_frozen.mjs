// FROZEN COPY of the first-pack constants that lived in the engine before S4-3 (head #184): the per-view theme CSS (map/ui/tokens.css), the legend (app/shell.mjs),
// the CVD palettes (app/color-vision-mode.mjs), the world-map word table (app/locate.mjs), the worldbook names (tavern/worldbook-sync.mjs), the tag examples and place prefix (tavern/interaction-modes.mjs),
// the picker's tier table (tavern/picker.mjs) and the old predicates. Kept only so the S4-3 shadow tests can prove the pack data reproduces them, and so
// tools/gen_eden_s43_data.mjs can derive that data. Do not edit; do not import from the engine.
export const THEME_CSS_V1 = [
  "[data-map=\"tc_mid\"] { --bg: #120a1f; --surface: #1a1029; --line: rgba(255, 61, 154, .24);\n  --ink: #f3e6ff; --ink-2: #dccbf0; --muted: #ac9ec3; --accent: #ff3d9a; --on-accent: #1a0610; --accent-2: #3de0ff;\n  --glow: 0 0 10px rgba(255, 61, 154, .7); --glow-text: -1px 0 #3de0ff, 1px 0 #ff3d9a, 0 0 10px rgba(255, 61, 154, .7); }",
  "[data-map=\"tc_low\"] { --bg: #0b0b0b; --surface: #111411; --line: rgba(159, 232, 112, .2);\n  --ink: #d8e8cc; --ink-2: #bcd0ae; --muted: #7aa35c; --accent: #9fe870; --on-accent: #0b1406; --accent-2: #f4f1e8;\n  --ok: var(--muted); }",
  ".light [data-map=\"tc_mid\"], .light[data-map=\"tc_mid\"] { --bg: #f1ecf7; --surface: #f9f6fc;\n  --line: rgba(29, 18, 48, .16); --ink: #1d1230; --ink-2: #3a2b52; --muted: #66537f; --accent: #b3155f; --on-accent: #fff; --accent-2: #0f8fa8;\n  --glow: none; --glow-text: none; }",
  ".light [data-map=\"tc_low\"], .light[data-map=\"tc_low\"] { --bg: #f4f1e8; --surface: #f8f6ef;\n  --line: rgba(27, 36, 20, .16); --ink: #1b2414; --ink-2: #34402b; --muted: #55664a; --accent: #336619; --on-accent: #fff; --accent-2: #8a7a52; }"
];
export const LEGEND = [
  ['lg.ward', '结界', 'lg.ward_d', '近景是淡青格边，中景是细线，远景不画'],
  ['lg.conduit', '以太导能管', 'lg.conduit_d', '暗色细管，只在节点有点状微光'],
  ['lg.platform', '访客停靠平台', 'lg.platform_d', '带信标环、进场光带和密封悬浮车'],
  ['lg.tower', '以太气候调节塔', 'lg.tower_d', '深色塔身，外加同心场环'],
  ['lg.clouds', '云层', 'lg.clouds_d', '云纱越厚，海拔越低'],
  ['lg.omit', '刻意不画', 'lg.omit_d', '航线、轨道、车站'],
  ['lg.sight', '层间视线', 'lg.sight_d', '上层各岛彼此可见，俯瞰中层像铺在脚下的电路板；下层抬头可见中层底面；清晨有云海'],
];
export const OI = { 空防: '#e69f00', 气候: '#56b4e9', 治安: '#0072b2', 政治: '#994455', 媒体: '#cc79a7', 民生: '#f0e442', 军事: '#009e73', 灾害: '#d55e00', 人物: '#f2f2f2', 其他: '#bbbbbb' };
// 蓝黄色弱（tritan）：Okabe-Ito 里蓝 / 黄仍会混，换成红 / 青的对立，其余沿用
export const TR = { ...OI, 气候: '#9ad0f5', 民生: '#e2903a', 治安: '#d7263d', 军事: '#029e73', 空防: '#7a5195' };

export const groupColorV1 = (mode, g, fallback) => { if (mode === '0') return fallback; const t = { rg: OI, by: TR }[mode]; return t[g] || t.其他 || fallback; };
export const ALIAS = { '天城': ['天城', '伊甸', '庄园', '书房', '主卧', '大厅', '餐厅', '会客厅', '客房', '寝', '浴室', '后庭', '前庭', '上层', '中层', '下层', '钢铁霓虹', '地基', '公寓', '银冠堡'] };
export const PREFIX = '伊甸地图·';
export const BOOK = PREFIX + '世界书附加条目';
export const LEGACY_RE = /^伊甸地图·世界书附加条目\s*v\d[\w.+-]*$/;
export const EX = new Set(['层·地点', '天城·层·地标', '伊甸庄园·房间名']);   // 世界书里的写法模板
export const clean = s => String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
export const norm = s => clean(s).replace(/[\s·・.\-—_/／|｜]/g, '').replace(/^天城/, '');
export const TIER = { tc_upper: ['天城上层', 'Upper tier'], tc_mid: ['天城中层', 'Middle tier'], tc_low: ['天城下层', 'Lower tier'] };
/** The glitch scope predicate of events.mjs applyGlitch before S4-3: a city-wide word, the map of the event, or the map the scope text resolves to. */
export const glitchScopeV1 = (e, cur, mapOf, placeMap) => /全城|天城/.test(e.scope) || mapOf(e) === cur || (e.scope && placeMap(e.scope) === cur);
/** The crumb label of the overview ring before S4-3 (scale-handoff.mjs crumb): the first group had its own key. */
export const ringLabelV1 = (gid, group, tx, nm) => (gid === 'tiancheng' ? tx('ring', '天城周边') : tx('ring_of', group.title + '周边', { name: nm(group, 'title') }));
