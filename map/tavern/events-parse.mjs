// 地图事态：从聊天原文解析事件标签（纯函数，卡内脚本与 node 单测共用；不碰 DOM、不碰酒馆接口）
// 两种写法都认（世界书「地图联动规范」教的是第一种）：
//   <span style="display:none" data-tcmap="类型=火灾;地点=7号井黑市;标题=仓库起火;等级=3;状态=发生中;编号=LEB-88-0317"></span>
//     可选：层、来源、时间、编号（同一事件后续沿用）、范围 / 持续（屏幕特效的覆盖范围与楼数）、坐标（0–1 归一化 x,y）；状态写关闭词（设定包的 closed）= 关闭该事件
//   <span style="display:none">⌖类别｜层·地点｜等级｜一句话｜发布方</span>（紧凑写法；等级 0 = 平息）
//   一楼最多 life.per_msg 条；全角 / 半角分隔都认。
// 聊天记录是唯一真相：每次都从最近 N 楼重算，所以 swipe、删楼、编辑后自然一致。
//
// 事件体系（类型、大类、图标、颜色、稀有度、特效、寿命、示范原文、关闭词、注入句标签）是设定包的数据（docs/kernel-schema.md §8，K-R49–K-R55）：
// setGeo(geo) 时从 geo.taxonomy() 取（包的 events 块，来源见 K-R67 / K-R68）；没有 events 块的包用内核的中性分类（core/events-default.mjs，K-R53）。
// 类型判定走 core/pack-v2-rows.mjs 的 typeOf（K-R50）。本文件不带任何设定包的词。
import { timeKey } from './mvu-readers.mjs';
import { normalise } from '../core/lexicon.mjs';
import { typeOf } from '../core/pack-v2-rows.mjs';
import { withDefaults } from '../core/pack-v2.mjs';
import { DEFAULT_EVENTS, DEFAULT_CLOSED, DEFAULT_TAG } from '../core/events-default.mjs';

const KERNEL_EXAMPLES = ['⌖类别｜地点｜等级｜一句话｜发布方'];   // 语法示意行（K-R48）：模型原样复述时不上图
const reEsc = x => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let TAX = null, SRC, SRC_TAG, CLOSED = null, TAG = DEFAULT_TAG, EXAMPLES = new Set(KERNEL_EXAMPLES);
export const AGE = { live: 7, after: 20, fade: 40 };        // 楼层差：≤live 活跃、≤after 余波、>after 淡出（只在列表）；已解除 / 被新事件接替的 >fade 丢弃（事件块的 life，K-R54）
let LIFE = { merge: 15, per_msg: 3 };                         // merge：同一类型 + 同一节点在这么多楼内再次出现 = 同一事件的更新；per_msg：一楼最多几条
export const hash = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };

/** 装入事件分类（包的 events 块 + 注入句标签）；不合格或没有 = 内核的中性分类。同一个块重复装入不重做。 */
export function configure(events, tag) {
  if (TAX && events === SRC && tag === SRC_TAG) return;
  SRC = events; SRC_TAG = tag;
  const ok = !!events && typeof events === 'object' && !Array.isArray(events) && Array.isArray(events.groups) && !!events.types && Object.keys(events.types).length > 0;
  TAX = withDefaults({ events: ok ? events : DEFAULT_EVENTS }).events;
  TAX.groups = TAX.groups.map(g => ({ ...g, label: g.label ?? (g.id === 'other' ? '其他' : g.id), color: g.color ?? '#cfd8e0', shape: g.shape ?? 'square' }));
  TAX.types.other = { label: '其他', icon: '!', ...TAX.types.other };
  const words = TAX.closed.length ? TAX.closed : DEFAULT_CLOSED;
  CLOSED = new RegExp(words.map(reEsc).join('|'));
  TAG = typeof tag === 'string' && tag ? tag : DEFAULT_TAG;
  EXAMPLES = new Set([...TAX.examples, ...KERNEL_EXAMPLES]);
  Object.assign(AGE, { live: TAX.life.live, after: TAX.life.after, fade: TAX.life.fade }); LIFE = { merge: TAX.life.merge, per_msg: TAX.life.per_msg };
}
export const taxonomy = () => TAX;                                                        // 装好的事件块（withDefaults 之后，只读）
export const legend = () => TAX.groups.filter(g => g.id !== 'other');                     // 图例里的大类，按块里的顺序（「其他」只在有事件时才出现）
export const defaultOff = () => Object.values(TAX.types).filter(t => t['x-default-off'] === true).map(t => t.label);   // 默认隐藏的类型（用户没动过筛选时）
export const isExample = line => EXAMPLES.has(line);
export const examples = () => [...EXAMPLES];
/** 类型文字 → { …typeOf, cat: 类型名, grp: 大类名, own: 这个类型有自己的寿命 }。group = false：只认类型，不把大类名当作「只写了大类」（字段 类型 缺省、用标题时）。 */
export function classify(word, { group = true } = {}) {
  let r = typeOf(word, TAX);
  if (!group && r.type === 'other') r = typeOf('', TAX);
  const g = TAX.groups.find(x => x.id === r.group);
  return { ...r, cat: r.label, grp: g ? g.label : r.group, own: !!TAX.types[r.type]?.life };
}
/** 类型文字 → 类型名（classify 的 cat）；认不出的是「其他」类型的名字。 */
export const catOf = word => classify(word).cat;

// 地点 → 层与落点：由节点树决定（setGeo，core/event-geo.mjs；层词、城区词、城郊词都是设定包的数据，见 packs/<id>/overlay.v2.json）。
// 节点树定位（S3-2，docs/kernel-schema.md K-R24 / K-R51）：setGeo(core/event-geo.mjs 的 geo) 之后，事件的层与落点由 nodes.locate 决定；geo.taxonomy() 带来包的事件分类。
// 没设节点树时，所有事件都列出、不上图（node = null，K-01 B），分类是内核的中性分类。
let GEO = null;
export const setGeo = g => { GEO = g || null; const t = GEO && typeof GEO.taxonomy === 'function' ? GEO.taxonomy() : null; configure(t?.events, t?.tag); };
export const getGeo = () => GEO;
// 未解除的事件不因楼层旧而丢（E6）：只要还在扫描窗口里（卡内脚本的 SCAN = 80 楼），就以「淡出」留在列表里，直到出现关闭词或滑出窗口
// 不做任何关键词过滤：标签原样解析、原样落点（用户 2026-09-27：「我们做的是技术兼容」）。内容是用户自己聊天里的，地图只管位置与显示。

const decode = s => s.replace(/&(amp|lt|gt|quot|#39|#x27|nbsp);/g, (m, k) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'", nbsp: ' ' })[k]);
const norm = s => s.replace(/\s+/g, '').replace(/[·•・.]/g, '·');
/** the place text without the word the locate algorithm matched (first occurrence) and without separators; '' when the word is all of it */
const restOf = (place, word) => { const t = normalise(place), w = normalise(word), i = w ? t.indexOf(w) : -1; return (i < 0 ? t : t.slice(0, i) + t.slice(i + w.length)).replace(/[·•・.\-\s]+/g, ''); };

/** 一楼原文 → 按出现顺序的原始标签 [{cat, cls, loc, lvl, text, src, ...}]（还没定位；代码块里的、示范原文跳过） */
export function marksOf(raw) {
  if (!raw || (raw.indexOf('⌖') < 0 && raw.indexOf('data-tcmap') < 0)) return [];
  const text = decode(String(raw)).replace(/```[\s\S]*?```/g, '').replace(/<code>[\s\S]*?<\/code>/gi, '');
  const found = [];   // [位置, 字段]
  for (const m of text.matchAll(/data-tcmap\s*=\s*(["'])(.*?)\1/g)) {
    if (EXAMPLES.has(m[2].trim())) continue;
    const o = {}; for (const kv of m[2].split(/[;；]/)) { const k = kv.search(/[=＝]/); if (k > 0) o[kv.slice(0, k).trim()] = kv.slice(k + 1).trim(); }
    if (!o.类型 && !o.标题) continue;
    const lvl = CLOSED.test(o.状态 || '') ? 0 : Math.max(1, Math.min(3, parseInt(o.等级, 10) || 2)), cls = classify(o.类型 || o.标题, { group: !!(o.类型 || '').trim() });
    found.push([m.index, { cat: cls.cat, cls, loc: (o.层 && !(o.地点 || '').includes(o.层) ? o.层 + '·' : '') + (o.地点 || ''), lvl, text: o.标题 || '', src: o.来源 || '',
      code: o.编号 || '', time: o.时间 || '', scope: o.范围 || '', dur: parseInt(o.持续, 10) || 0, xy: o.坐标 || '', status: o.状态 || '', line: m[2] }]);
  }
  for (const m of text.matchAll(/⌖([^<\n⌖]{3,200})/g)) {
    const line = '⌖' + m[1].trim();
    if (EXAMPLES.has(line.replace(/\|/g, '｜'))) continue;
    const f = m[1].split(/[｜|]/).map(x => x.trim());
    if (f.length < 4) continue;
    const n = parseInt(String(f[2]).replace(/[^\d]/g, ''), 10);
    if (!(n >= 0 && n <= 3)) continue;
    const cls = classify(f[0]);
    found.push([m.index, { cat: cls.cat, cls, loc: f[1], lvl: n, text: f[3] || '', src: f[4] || '', line }]);
  }
  return found.sort((a, b) => a[0] - b[0]).map(f => f[1]);
}

/** 一楼原文 → 标签列表 [{cat, type, grp, layer, place, node?, lvl, text, src, code?, time?, scope?, dur?, xy?, fx?, inject?, life?}]；代码块里的、示范原文跳过；认不出层（或节点）的：设了节点树就照样列出（node = null，K-01 B），没设就跳过 */
export function parseMarks(raw) {
  const out = [];
  for (const e of marksOf(raw)) {
    const loc = norm(e.loc);
    const pl = GEO ? GEO.place(String(e.loc).trim()) : null;   // 先别名、再提示词；认不出的事件照样列出、不上图（K-01 B）
    const layer = pl ? pl.layer : '', place = pl ? GEO.strip(loc, pl.owner) : loc, node = pl ? pl.node : null;
    const rem = pl ? restOf(place, pl.word) : '';   // the part of the place text the matched word does not cover ("霓虹街后巷" -> "后巷"): two places under one node stay two events (Q-13)
    const { line, loc: _, cls: c, ...rest } = e;
    out.push({ ...rest, layer, place, node, ...(rem ? { rem } : {}), type: c.type, grp: c.grp, ch: c.icon, color: c.color, rare: c.rare, text: e.text.slice(0, 60), src: (e.src || c.source || '').slice(0, 20),
      ...(c.fx ? { fx: c.fx } : {}), ...(c.inject === false ? { inject: false } : {}), ...(c.own ? { life: c.life } : {}) });
    if (out.length >= LIFE.per_msg) break;
  }
  return out;
}

/** 最近若干楼 [{floor, text}]（按楼层升序）→ 合并后的事件列表（新的在前）。now = 最新楼层号。合并键 = 类型 + 节点 + 地点文字里匹配词没盖住的那部分（K-R54；节点为 null 的按类型 + 地点文字）；有编号的按编号 */
export function collect(msgs, now) {
  const open = new Map(), done = [];
  for (const { floor, text } of msgs) {
    for (const e of parseMarks(text)) {
      const key = e.code ? '#' + e.code : e.cat + '|' + e.layer + '|' + e.place, mk = e.code ? key : e.type + '|' + (e.node ?? '~' + e.place) + (e.rem ? '|' + e.rem : '');   // key：事件的稳定标识（id、落点抖动）；mk：合并键
      const cur = open.get(mk), win = e.life?.merge ?? LIFE.merge;
      if (cur && floor - cur.last <= win) {
        cur.last = floor; cur.count++; cur.text = e.text || cur.text; cur.src = e.src || cur.src;
        for (const k of ['status', 'time', 'scope', 'dur', 'xy']) if (e[k]) cur[k] = e[k];
        if (e.lvl === 0) { cur.closed = true; cur.lvl = 0; done.push(cur); open.delete(mk); } else { cur.lvl = e.lvl; }
      } else if (e.lvl > 0) {
        if (cur) { cur.stale = true; done.push(cur); }   // 隔了合并窗口又出现：旧的那条让位给新的，按已结束处理（不再常驻）
        open.set(mk, { id: hash(key + '#' + floor), key, ...e, first: floor, last: floor, count: 1, closed: false });
      } else {
        // 第一次出现就是已解除（「快讯：XX 已被控制」这种一次写完的通报）：记为已解除，不丢
        if (cur) { cur.stale = true; done.push(cur); open.delete(mk); }
        done.push({ id: hash(key + '#' + floor), key, ...e, first: floor, last: floor, count: 1, closed: true });
      }
    }
  }
  const all = [...done, ...open.values()].map(e => ({ ...e, tier: tierOf(now - e.last, e.closed || !!e.stale, e.life) })).filter(e => e.tier);
  // v0.9.3：两条都写了剧情内时间（字段「时间」）时按剧情时间新的在前，否则按楼层新的在前
  return all.sort((a, b) => { const ta = timeKey(a.time), tb = timeKey(b.time); return (ta != null && tb != null && ta !== tb ? tb - ta : 0) || b.last - a.last || b.lvl - a.lvl; });
}
// ended = 已解除，或被同类同地点的新事件接替。未结束的事件永远不返回 ''（窗口由调用方给的楼层决定）。life = 这个类型自己的寿命（没有 = 事件块的）
export function tierOf(age, ended, life) {
  const A = life ? { ...AGE, ...life } : AGE;
  if (ended) return age > A.fade ? '' : age <= A.after ? 'after' : 'fade';
  return age <= A.live ? 'live' : age <= A.after ? 'after' : 'fade';
}

/** 当前地点（MVU 的当前地点变量）→ 所在层；认不出返回 '' */
export function layerOf(here) {
  if (!here) return '';
  const s = String(here);
  return GEO ? GEO.layerOf(s) : '';
}

/** 注入给模型的一句话：只说角色所在层的活跃事件（类型写了 inject: false 的不说）；没有就返回 '' */
export function summarize(items, hereLayer, maxLen = 80) {
  if (!hereLayer) return '';
  const live = items.filter(e => e.layer === hereLayer && e.tier === 'live' && !e.closed && e.inject !== false).slice(0, 2);
  if (!live.length) return '';
  let s = live.map(e => `${e.layer}${e.place ? '·' + e.place : ''}：${e.src ? e.src + '通报' : ''}${e.cat}${e.lvl >= 3 ? '（严重）' : ''}${e.text ? '，' + e.text : ''}`).join('；');
  if (s.length > maxLen) s = s.slice(0, maxLen - 1) + '…';
  return `[${TAG}·仅背景，不要求提及，已标记的事件勿重复标记] ${s}。`;
}

configure();   // 没装包之前：中性分类
