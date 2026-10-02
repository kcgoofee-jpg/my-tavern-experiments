// PLACE-1b（docs/place-record.md §2.3）：查看器这一侧的「地点来源」——core/place-record.mjs 读的那份 pack。
// 这里只做一件事：把查看器手里已有的东西摆成那个形状（节点树 → nodes，卡设定的分层房间表 → plan，当前层的点位 → points），
// 再在后台把包自己声明的附加书地点表、三维清单里的建筑词与室外区域补上；补上了就 notify 一次，界面重画。
// 没有网络、没有卡片专有词：路径都读包清单（data.addon_places / 三维页自己的 model/manifest.json）。纯取数，不画界面。
import { RT } from './nodes-runtime.mjs';
import { estPlan } from './locate.mjs';
import { currentMapData, currentMapId, mapRegistry } from './state.mjs';
import { packData } from './current-pack.mjs';
import { getJSON } from './json-cache.mjs';
import { LANG } from './i18n.mjs';
import { plugins } from './plugins.mjs';
import { placeRecord, records, chainOf, nearby, hasText } from '../core/place-record.mjs';

const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
export { h };

/** 节点树 → 记录要的节点字段（parent 以树为准：compat 修过的挂接只有树知道） */
function nodeList() {
  const t = RT?.tree; if (!t) return [];
  return t.ids().filter(id => id !== t.synth).map(id => { const n = t.get(id) || {}; return { id, name: n.name, type: n.type, parent: t.parent(id), anchor: n.anchor, sub: n.sub, desc: n.desc, facts: n.facts, access: n.access, media: n.media, alias: n.alias }; });
}
/** 当前层的点位（附近：平面图上的最近地标）。别的层没载到就不给，附近那一步自然是空的。 */
const pointList = () => { const m = currentMapData?.markers; return Array.isArray(m) && m.length ? { [currentMapId]: { markers: m.map(({ id, nx, ny, ax, ay }) => ({ id, nx, ny, ax, ay })) } } : {}; };
/** 三维页自己的模型清单（建筑词、室外区域、房间别名、子区域）：路径与三维页读的是同一份（scene3d 的契约） */
function sceneManifestUrl() {
  const m = Object.values(mapRegistry?.maps || {}).find(x => x?.kind === 'estate' && !x.viewer3d && typeof x.src === 'string' && x.src.endsWith('.html'));
  return m ? new URL('model/manifest.json', new URL(m.src, document.baseURI)).href : '';
}
const i18n = (o, k) => (LANG === 'en' ? o?.i18n?.en?.[k] : null) || o?.[k] || '';

let extra = { addon: null, building: null, zones: null, extras: null }, extraP = null, subs = [];
const notify = fn => { if (!subs.includes(fn)) subs.push(fn); };
/** 补齐一次（幂等）：包声明的附加书地点表 + 三维清单。取不到就安静地少一份来源，界面照常用别的来源。 */
export function ensure() {
  if (extraP) return extraP;
  const ap = packData('addon_places');
  if (!ap) return null;   // 包清单还没到（启动早期）：不算一次失败，下一次画界面时再补
  extraP = (async () => {
    const got = { addon: null, building: null, zones: null, extras: null };
    if (ap) { const j = await getJSON(ap).catch(e => console.warn('[place] 附加书地点表读不到', e)); if (Array.isArray(j?.places)) got.addon = j.places; }
    const url = sceneManifestUrl();
    if (url) {
      const man = await getJSON(url).catch(e => console.warn('[place] 三维清单读不到，地点少一份来源', e));
      if (man) {
        got.building = { title: i18n(man.building, 'title'), subtitle: i18n(man.building, 'subtitle'), summary: i18n(man.building, 'summary') };
        const rel = p => (typeof p === 'string' ? new URL(p, url).href : null);
        const [z, x] = await Promise.all([rel(man.data?.zones) ? getJSON(rel(man.data.zones)).catch(e => console.warn('[place] 室外区域表读不到', e)) : null, rel(man.data?.extras) ? getJSON(rel(man.data.extras)).catch(e => console.warn('[place] 房间别名表读不到', e)) : null]);
        if (Array.isArray(z?.zones)) got.zones = z.zones;
        if (x && typeof x === 'object') got.extras = x;
      }
    }
    extra = got;
    for (const fn of subs) { try { fn(got); } catch (e) { console.warn('[place-sources]', e); } }   // 补齐了：界面重画一次
    return got;
  })();
  return extraP;
}
export const onSources = fn => { notify(fn); const p = ensure(); if (p) p.then(fn).catch(e => console.warn('[place-sources] 补齐来源后通知失败', e)); };


/** 这一份来源。形状变了才换新对象（记录按对象缓存，所以同一个来源不重复建）：节点的个数、房间表有没有来、当前层、
 *  补齐的那几份、玩家这一聊天的改动，任何一样变了就是一个新对象。第一次调用时顺带把包自己声明的那几份补上，取到了通知一次重画。 */
let packObj = null, packSig = '';
export const placePack = () => {
  ensure();
  const items = plugins.CustomNamesView?.data?.items || {}, sig = [RT?.tree?.ids?.().length || 0, estPlan ? 1 : 0, currentMapId, extra.addon ? extra.addon.length : 0, Object.keys(items).length, Object.values(items).map(e => e.说明 || e.名 || '').join(0)].join('|');
  if (packObj && sig === packSig) return packObj;
  packSig = sig; packObj = { nodes: nodeList(), plan: estPlan || null, points: pointList(), ...extra };
  return packObj;
};
const custom = () => { const d = plugins.CustomNamesView?.data; return d && Object.keys(d.items || {}).length ? d : null; };
/** 一个地点的记录（玩家在本聊天的改动铺在上面）；给的是节点 id 就按 id，给的是名字 / 叫法就按名字回找 */
export function recordOf(id, o = {}) {
  const pack = placePack(), c = custom(), byId = placeRecord(pack, id, c, o);
  if (byId) return byId;
  const w = String(id || '').trim(); if (!w) return null;
  for (const r of records(pack)) if (r.name === w || (r.alias || []).includes(w)) return placeRecord(pack, r.id, c, o);
  for (const [k, e] of Object.entries(c?.items || {})) if ((e.标 || k) === w || e.名 === w) return placeRecord(pack, k, c, o) || placeRecord(pack, e.标 || k, c, o);
  return null;
}
export const allRecords = () => records(placePack());
export const chainOfPlace = id => chainOf(placePack(), id);
export const nearbyOf = (id, n = 8) => nearby(placePack(), id, n);
export const hasOwnText = rec => hasText(rec);
/** 一张三维页（地图 id）本身那条记录：玩家不在这栋楼的任何一间房里时，地点页第 1 项就是它 */
export const buildingOf = mapId => { const host = RT?.host?.(mapId); return host ? placeRecord(placePack(), host, custom()) : null; };
