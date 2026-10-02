// PLACE-1b（docs/place-record.md §3）：一个地点一条记录，界面只画记录。
// 这里有三件东西：记录卡（正文 + 事实 + 出入 + 包的其余行 + 「编辑」「世界书档案」两个动作）、「地点」页（当前地点的记录卡 +
// 上级链一行 + 附近一行 + 全部房间）。房间卡、区域卡、建筑卡、二维地点卡都走 recordCard()，所以同一个地点在哪儿打开都一样。
// 文字全部经 textContent（包里的话原样上页，brief 规则 2.8）；这里不写任何卡片专有词。
import { uiTextOr } from './text-lookup.mjs';
import { LANG } from './i18n.mjs';
import { h, recordOf, chainOfPlace, nearbyOf, allRecords, onSources } from './place-sources.mjs';
import { showCard } from './markers.mjs';
import { placeCardBridge } from './place-card-bridge.mjs';
import { openPlaceEditor } from './place-editor.mjs';
import { placeArchive, bindArchive } from '../worldbook-peek-view.mjs';

const T = (k, zh, v) => uiTextOr(k, zh, v);
const zhOnly = t => LANG === 'zh' || !/[一-鿿]/.test(String(t || ''));   // 只有中文写成的句子在英文界面下不显示
const dl = rows => { const d = h('dl', 'fields'); for (const [k, v] of rows) if (v) d.append(h('dt', null, k), h('dd', null, v)); return d; };
const LAB = () => ({ facts: T('pr.facts', '事实'), story: T('pr.story', '剧情里的事实'), access: T('pr.access', '出入'), kind: T('pr.kind', '类别'), near: T('pr.nearby', '附近'), chain: T('pr.chain', '所在'), all: T('pr.all_rooms', '全部房间'), stale: T('pr.stale', '包里的原文有更新') });

const CSS = `
.pr-title{margin:var(--sp-3) 0 0;font:700 var(--fs-title)/1.35 var(--font-ui);color:var(--ink)}
.pr-sub{margin:var(--sp-2) 0 0;color:var(--muted);font-size:var(--fs-small)}
.pr-body p{margin:var(--sp-3) 0 0;color:var(--ink-2);font-size:var(--fs-small);line-height:1.6}
.pr-body dl{margin:var(--sp-3) 0 0}
.pr-stale{color:var(--accent)}
.pr-acts{display:flex;flex-wrap:wrap;gap:var(--sp-3);margin-top:var(--sp-5)}
.pr-chain{display:flex;flex-wrap:wrap;align-items:baseline;gap:var(--sp-2);margin:var(--sp-5) 0 0;padding:var(--sp-3) 0 0;border-top:1px solid var(--line);font-size:var(--fs-small)}
.pr-crumb{border:0;background:none;padding:0;font:inherit;font-size:var(--fs-small);color:var(--ink-2);cursor:pointer;text-decoration:underline}
.pr-crumb:hover{color:var(--ink)}
.pr-sep{color:var(--muted)}
.pr-near{margin:var(--sp-4) 0 0}
.pr-nearline{display:flex;flex-wrap:wrap;align-items:baseline;gap:var(--sp-2) var(--sp-3)}
.pr-lab{color:var(--muted);font-size:var(--fs-micro)}
.pr-chip{min-height:32px;padding:0 var(--sp-4);border:1px solid var(--line);border-radius:var(--r-pill);background:none;color:var(--ink-2);font:inherit;font-size:var(--fs-small);cursor:pointer}
.pr-chip:hover{border-color:var(--line-strong);color:var(--ink)}
.pr-all{margin:var(--sp-3) 0 0}
.pr-all summary{min-height:32px;cursor:pointer;color:var(--ink-2);font-size:var(--fs-small)}
.pr-all .pr-chip{margin:var(--sp-2) var(--sp-2) 0 0}
.pr-empty{margin:var(--sp-5) 0 0;color:var(--ink-2);font-size:var(--fs-small);line-height:1.6}`;
// 一次注入（抽屉的「地点」页、3D 房间卡与二维地点卡共用）
let styled = false;
const styleOnce = () => { if (styled || typeof document === 'undefined') return; styled = true; const s = document.createElement('style'); s.id = 'placeCardCss'; s.textContent = CSS; document.head.append(s); };
styleOnce();
Object.assign(placeCardBridge, { recordOf, prependRecord });
onSources(() => refreshCard());   // 包里那份地点散文到了：打开着的记录卡补上说明   // 地图标记开卡时由 markers.mjs 取用（见 app/markers.mjs）

/** The record's own text: description, then the field rows (pack rows, use, access, facts — the pack's own and the story's apart). */
export function recordBody(rec, o = {}) {
  const box = h('div', 'pr-body'), L = LAB();
  if (rec.desc) box.append(h('p', 'pr-desc', rec.desc));
  const rows = (rec.rows || []).map(r => [r.label || r.key, r.text]);
  if (o.kindLabel) rows.unshift([L.kind, o.kindLabel]);
  if (rec.use && zhOnly(rec.use)) rows.push([T('pr.use', '用途'), rec.use]);
  if (rec.access && zhOnly(rec.access)) rows.push([L.access, rec.access]);
  if (rows.length) box.append(dl(rows));
  const facts = (rec.facts || []).filter(Boolean), story = (rec.storyFacts || []).filter(Boolean);
  if (facts.length) box.append(dl([[L.facts, facts.join('；')]]));
  if (story.length) box.append(dl([[L.story, story.join('；')]]));
  if (rec.stale?.length) box.append(h('p', 'pr-stale', L.stale));
  return box;
}

/** The two actions every place card carries (PLACE-1b: one 「编辑」, one shared editor; the archive is the synced entry). */
export function recordActions(rec, o = {}) {
  const box = h('div', 'pr-acts');
  const ed = h('button', 'btn'); ed.type = 'button'; ed.textContent = T('pr.edit', '编辑');
  ed.addEventListener('click', () => openPlaceEditor(rec.id, { record: rec, ...o }));
  box.append(ed, bindArchive(placeArchive(rec)));
  return box;
}

/** Draw the open card from a record: title, sub line, body, actions. `o` = { el, kindLabel, cover, compose, back }. */
let lastCard = null;
export function recordCard(rec, o = {}) {
  lastCard = { id: rec.id, o };
  showCard(o.el || null, rec.name, '', o.acts || null, rec.sub || rec.where || '', o.cover, o.compose !== false);
  const c = document.getElementById('card'), ex = c.querySelector('.extra');
  c.querySelector('.src').replaceChildren(recordBody(rec, o));
  ex.replaceChildren(recordActions(rec, o));
  if (o.back) { const b = h('button', 'btn', T('v3.back', '回到建筑')); b.type = 'button'; b.dataset.v3back = '1'; ex.append(b); }
  return c;
}
/** 重画当前这张记录卡（编辑器保存 / 撤销之后：卡片、档案与本聊天的书一起跟上） */
export function refreshCard() {
  if (!lastCard) return null;
  const rec = recordOf(lastCard.id);
  return rec ? recordCard(rec, lastCard.o) : null;
}

/** Open the card of a place by id (the places tab's crumbs and chips). Finds the map marker when there is one. */
export function openRecord(id, o = {}) {
  const rec = recordOf(id); if (!rec) return null;
  const el = o.el || [...document.querySelectorAll('.mk')].find(e => e.dataset.mid === rec.id) || null;
  return recordCard(rec, { ...o, el, compose: o.compose ?? !!el });
}

/** 二维地点卡：卡面已经有包自己的正文与链接了，这里把记录的文字补上、动作接在后面（不拆掉原有的链接） */
export function prependRecord(rec, o = {}) {
  const c = document.getElementById('card'); if (!c || !rec) return null;
  c.querySelectorAll('.src .pr-body').forEach(n => n.remove());
  c.querySelectorAll('.extra .pr-acts').forEach(n => n.remove());
  const body = recordBody(rec, o);
  if (body.textContent.trim()) c.querySelector('.src').prepend(body);   // 记录没写说明时，卡面保留包自己的那段文字（一处都不丢）
  c.querySelector('.extra').append(recordActions(rec, o));
  return c;
}

/** 上级链：一行，每一级可点（点了打开那一级的记录；楼层一级给的是楼层，不是房间） */
export function chainRow(rec, pick) {
  const chain = chainOfPlace(rec.id).filter(x => x.id !== rec.id);
  if (!chain.length) return null;
  const row = h('nav', 'pr-chain'); row.setAttribute('aria-label', LAB().chain);
  chain.forEach((x, i) => {
    if (i) row.append(h('span', 'pr-sep', '·'));
    const b = h('button', 'pr-crumb', x.name); b.type = 'button'; b.dataset.pid = x.id; if (x.floor) b.dataset.floor = x.floor;
    b.addEventListener('click', () => pick(x.id, !!x.floor)); row.append(b);
  });
  return row;
}

/** 附近：一行紧凑的名字（最多 8 个），末尾「全部房间」展开整栋楼里有房间的楼层 */
export function nearbyRow(rec, pick, all) {
  const L = LAB(), box = h('div', 'pr-near');
  const near = nearbyOf(rec.id, 8).filter(x => x.id !== rec.id);
  if (near.length) {
    const line = h('div', 'pr-nearline'); line.append(h('span', 'pr-lab', L.near));
    for (const x of near) { const b = h('button', 'pr-chip', x.name); b.type = 'button'; b.dataset.pid = x.id; b.addEventListener('click', () => pick(x.id, false)); line.append(b); }
    box.append(line);
  }
  const rooms = (all || allRecords()).filter(r => r.kind === 'room' && r.parent === rec.parent);   // 「全部房间」只列同一栋楼里的（地点页在一栋楼里时才出现）
  if (rooms.length > near.length) {
    const d = h('details', 'pr-all'); d.append(h('summary', null, `${L.all}（${rooms.length}）`));
    const seen = new Set();
    for (const r of rooms) { if (seen.has(r.name)) continue; seen.add(r.name); const b = h('button', 'pr-chip', r.name); b.type = 'button'; b.dataset.pid = r.id; b.addEventListener('click', () => pick(r.id, false)); d.append(b); }
    box.append(d);
  }
  return box.children.length ? box : null;
}

/** 「地点」页：当前地点的记录卡 + 上级链 + 附近（没有当前地点时给一句空态；不画建筑标题、署名和空楼层行） */
export function placeTab(o = {}) {
  const box = h('div', 'pr-tab'), rec = o.record || recordOf(o.id || '');
  if (!rec) { box.append(h('p', 'pr-empty', T('s.place_empty', '点地图上的地点，这里显示它的介绍'))); return box; }
  const head = h('section', 'pr-head');
  head.append(h('h3', 'pr-title', rec.name));
  if (rec.sub || rec.where) head.append(h('p', 'pr-sub', rec.sub || rec.where));
  head.append(recordBody(rec, o), recordActions(rec, o));
  box.append(head);
  const pick = (id, floor) => o.pick?.(id, floor);
  const chain = chainRow(rec, pick); if (chain) box.append(chain);
  const near = nearbyRow(rec, pick, o.allRecords); if (near) box.append(near);
  return box;
}
