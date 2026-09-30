// FROZEN COPY of how events were placed before S3-2 (tavern/events.mjs layerGuess + the viewer's mapOf / pos with RE_UP, RE_MID, RE_LOW,
// RE_OUT, RE_RING, ZONES), kept only as the oracle of tests/events_geo_shadow.test.mjs. Nothing else imports it; the engine no longer has it.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const J = p => JSON.parse(fs.readFileSync(ROOT + p, 'utf8'));
export const MAPS = J('map/data/maps.json'), WORLD = J('map/data/world_markers.json');
export const RE = { up: null, mid: null, low: null, out: null, ring: null };
const RE_UP = /悬浮庄园|伊甸庄园|罗斯柴尔德庄园|悬浮岛|浮岛|伊甸|银冠|气候调节塔|首相府|财团|罗斯柴尔德|R-02|联盟会所|精英学院|凯莉的宅邸|凯莉宅邸|露易丝宅邸|维克多庄园|「Y」的庄园|Y的庄园/;
const RE_LOW = /井|地基|血肉磨坊|施粥|废弃教堂|哨所|货运|下层分局|委员会下层|公共收容设施|量产|灰票|下城|贫民窟|贫民区|廉价酒馆|地下格斗|非法赌场|二手市场|二手衣物|工厂|铁皮屋|旧货市场|孤儿收容所|老K杂货|井下-07|下层区酒吧|监狱/;
const RE_MID = /霓虹|C区|检查点|执法局总局|大教堂|主教座堂|大主教|圣铁摇篮|战斗修女院|军营|星渊|天城议会|商业区|旧公寓|最高法院|佣兵公会|中城|天城大学|法学院|骑士团营区|维多利亚的公寓|公立医院|养老院|中层修道院|法师塔|施奈德|新生工坊|管家学院|执政厅|政务院|储备署|文化署|军事学院|风暴殿|枢机院/;
const RE_OUT = /光辉联邦|大骑士领|圣都|第三帝国|灵枢秘派|虚灵古派|原域|诸神殿|临光家族|圆桌骑士封地|伦敦|英国|海外|旷野|猎季营地|魔导军工|大陆|异兽|野兽潮|兽潮|外围|城外/;
const RE_RING = /外围|城外|郊|异兽|兽潮|野兽|清剿|荒野|边境|防线/;
export const LAYERS = ['上层', '中层', '下层', '天城外'];
export const MAP_OF = { 上层: 'tc_upper', 中层: 'tc_mid', 下层: 'tc_low', 天城外: 'world' };
const ZONES = {
  tc_mid: [[/核心|高区/, 3.5, 3.8], [/霓虹街|商业/, -5, -2.5], [/C区|检查点/, 4.6, -6.9], [/外围|居住/, -12, 6.5], [/军营|环城/, -13, 0], [/大学|星渊/, -8.2, 6.4], [/议会/, .6, -2.3]],
  tc_low: [[/7号井|七号井|井口/, 4.6, -6.9], [/工业|工厂|货运|铁路|厂/, 7, -7.5], [/贫民|棚户|城寨|城中村/, -6, 1], [/哨所|前沿/, -12.3, -6.6], [/施粥|旧教堂/, 8.4, .5], [/拳场|磨坊/, -5.8, -3.3], [/地基/, 0, 0]],
  tc_upper: [],
};
const toImg = (x, y) => [(x / 1600 - .0075) / .985, (y / 1000 - .015) / .97];
const norm = s => s.replace(/\s+/g, '').replace(/[·•・.]/g, '·');
const reEsc = x => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const guessByName = s => (RE_UP.test(s) ? '上层' : RE_LOW.test(s) ? '下层' : RE_MID.test(s) ? '中层' : RE_OUT.test(s) ? '天城外' : '');
export const legacyLayerGuess = loc => LAYERS.find(l => loc.startsWith(l)) || LAYERS.find(l => l !== '天城外' && loc.includes(l)) || guessByName(loc);
/** the event text (as written, with the optional layer field already in front) -> { layer, place } | null (the event was dropped) */
export function legacyPlace(raw) {
  const loc = norm(String(raw)), layer = legacyLayerGuess(loc);
  if (!layer) return null;
  const place = loc.slice(loc.startsWith(layer) ? layer.length : 0).replace(/^·+/, '').replace(new RegExp('^(天城)?·?' + reEsc(layer) + '·?'), '').replace(new RegExp('^天城·'), '').replace(/^·+/, '');
  return { layer, place };
}
/** what the viewer did with it: the map, and where on it. `markers` = { <map id>: [{ id, nx, ny }] } (the points files); cat = the event type (RE_RING looked at it too) */
const hash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.codePointAt(0), 16777619); return (h >>> 0) / 4294967296; };
function worldPos(place) {
  if (!place) return null;
  let best = null;
  const see = (name, x, y) => { if (name && (place.includes(name) || (name.length >= 2 && name.includes(place))) && (!best || name.length > best.len)) best = { len: name.length, x, y }; };
  for (const p of [...WORLD.places, ...WORLD.fiefs]) see(p.name, p.x, p.y);
  for (const r of WORLD.realms || []) see(r.name, r.c?.[0], r.c?.[1]);
  if (!best || best.x == null) return null;
  const [nx, ny] = toImg(best.x, best.y); return { nx, ny, marker: true };
}
export function legacyPos({ layer, place }, { key = 'k', cat = '', markers = {}, xy = '' } = {}) {
  const ring = layer === '天城外' && RE_RING.test((place || '') + cat) && !worldPos(place);
  const mid = ring ? 'ring' : MAP_OF[layer];
  if (mid === 'world') return { map: mid, ...(worldPos(place) || { nx: .5, ny: .5, approx: true, none: true }) };
  if (ring) { const a = hash(key) * Math.PI * 2, r = .62 + .5 * hash(key + '#'); return { map: 'ring', nx: .5 + Math.cos(a) * r, ny: .5 + Math.sin(a) * r * .8, approx: true, ring: true }; }
  const m = MAPS.maps[mid], p = String(xy).split(/[,，]/).map(Number);
  if (p.length === 2 && p.every(v => v >= 0 && v <= 1)) return { map: mid, nx: p[0], ny: p[1] };
  let best = null;
  for (const k of markers[mid] || []) { const meta = m?.markers?.[k.id]; if (!meta) continue;
    for (const w of [meta.name, ...(meta.alias || [])]) if (w && place && (place.includes(w) || w.includes(place)) && (!best || w.length > best.len)) best = { k, len: w.length }; }
  if (best) return { map: mid, nx: best.k.nx, ny: best.k.ny, marker: true, id: best.k.id, name: m.markers[best.k.id].name };
  const j = hash(key), j2 = hash(key + '~');
  for (const [re, x, y] of ZONES[mid] || []) if (re.test(place)) return { map: mid, nx: (x + 15) / 30 + (j - .5) * .04, ny: (9.375 - y) / 18.75 + (j2 - .5) * .06 };
  return { map: mid, nx: .2 + .6 * j, ny: .2 + .6 * j2, approx: true };
}
/** the old layer of a current-location text (tavern/events.mjs layerOf) */
export function legacyLayerOf(here) {
  if (!here) return '';
  const s = String(here);
  for (const l of LAYERS) if (s.includes(l)) return l;
  if (/上城/.test(s)) return '上层';
  return guessByName(s);
}
Object.assign(RE, { up: RE_UP, mid: RE_MID, low: RE_LOW, out: RE_OUT, ring: RE_RING });
export const reWords = k => RE[k].source.split('|');
