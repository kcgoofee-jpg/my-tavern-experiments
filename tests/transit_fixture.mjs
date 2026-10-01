// The town network of docs/transit-schema.md §10 as an inline fixture for the transit tests (not a test file).
import { buildTree } from '../map/core/nodes.mjs';
import { normTransit } from '../map/core/transit-spec.mjs';
import { buildGraph } from '../map/core/router.mjs';

export const NODES = [
  { id: 'town', name: 'Town' }, { id: 'town_hill', parent: 'town', name: 'Hill' }, { id: 'town_harbour', parent: 'town', name: 'Harbour' },
  { id: 'keep', parent: 'town_hill', name: 'Old Keep' }, { id: 'market', parent: 'town_hill', name: 'Market' }, { id: 'clock', parent: 'town_hill', name: 'Clock Tower' },
  { id: 'fish', parent: 'town_harbour', name: 'Fish Hall' }, { id: 'light', parent: 'town_harbour', name: 'Lighthouse' }, { id: 'market_room', parent: 'market', name: 'Stall Row' },
];
export const tree = buildTree(NODES, { title: 'Town' });
export const AT = { keep: ['town_hill', 0.2, 0.3], market: ['town_hill', 0.5, 0.5], clock: ['town_hill', 0.8, 0.3], fish: ['town_harbour', 0.3, 0.6], light: ['town_harbour', 0.85, 0.4] };
const st = id => ({ id, node: id, view: AT[id][0], at: [AT[id][1], AT[id][2]] });
export const RAW = {
  modes: { tram: { label: '山道电车', i18n: { en: { label: 'Hill tram' } }, trip: 'rail' }, cable: { label: '缆车', i18n: { en: { label: 'Funicular' } }, trip: 'rail' } },
  stations: [...Object.keys(AT).map(st), { id: 'pier', view: 'town_harbour', at: [0.55, 0.7], name: '栈桥', i18n: { en: { name: 'Pier' } } }],
  lines: [
    { id: 'c1', number: '1', name: '缆车线', i18n: { en: { name: 'Funicular' } }, mode: 'cable', color: '#3fa7d6', stops: ['market', 'fish'], min: 4 },
    { id: 't2', number: '2', name: '山道电车线', i18n: { en: { name: 'Hill tram' } }, mode: 'tram', color: '#e8b33a', stops: ['keep', 'market', 'clock'], min: [3, 2] },
  ],
  links: [{ from: 'fish', to: 'pier', mode: 'walk', min: 2 }, { from: 'pier', to: 'light', mode: 'walk', min: 3 }, { from: 'clock', to: 'keep', mode: 'walk', min: 4 }],
  districts: [
    { id: 'old', name: '旧城', view: 'town_hill', pts: [[0.1, 0.2], [0.9, 0.2], [0.9, 0.7], [0.1, 0.7]], function: 'civic', danger: 0 },
    { id: 'stores', name: '鱼市仓库', view: 'town_harbour', pts: [[0.1, 0.5], [0.45, 0.5], [0.45, 0.8], [0.1, 0.8]], function: 'commerce', danger: 2 },
    { id: 'cape', name: '灯塔岬', view: 'town_harbour', node: 'light', r: 0.08, function: 'nature', danger: 1 },
  ],
};
const ids = new Set(NODES.map(n => n.id)), views = new Set(['town_hill', 'town_harbour']);
export const norm = (raw = RAW) => normTransit(raw, { nodes: id => ids.has(id), views: id => views.has(id) });
export const TOWN = norm().transit;
export const graph = buildGraph(TOWN);
export const EXTENT = { town_hill: [1000, 625], town_harbour: [1000, 625] };
/** env for the router: tree, the position of a station or of an end, the metric extent of a view. */
export const env = { tree, pos: t => (t.view ? { view: t.view, x: t.at[0], y: t.at[1] } : null), extent: v => EXTENT[v] };
export const posOn = view => id => { const s = TOWN.stations.find(x => x.id === id); return s && s.view === view ? s.at : null; };
