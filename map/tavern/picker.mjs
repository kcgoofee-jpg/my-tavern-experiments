// v0.9.5「自定义」面板的纯函数：可自定义对象的分组清单（选择器）、搜索、飞行目标。查看器 custom.js 与 node 单测共用。
// 数据来源：maps.json（各层地标 markers、庄园 rooms / areas）、estate/plan.js（房间所在楼层，只用来分组）、人物栏的名字。
// 飞行目标 target = { map, marker | room | area | character }：
//   地标 { map: 'tc_mid', marker: 'enforcement_hq' }；庄园房间 { map: 'eden_estate', room: '书房' }；室外 { map: 'eden_estate', area: '前庭' }；人物 { character: '米拉' }。
//   新庄园接入时只要换掉查看器里 room / area 的处理，目标的形状不变。
// 不过滤任何文字；这里只做字符串比较。

const low = s => String(s ?? '').toLowerCase();
const TIER = { tc_upper: ['天城上层', 'Upper tier'], tc_mid: ['天城中层', 'Middle tier'], tc_low: ['天城下层', 'Lower tier'] };

/** 分组清单：[{ id, label, items: [{ key, kind, target, sub, en, alias: [] }] }]
 *  reg = maps.json；plan = estate/plan.js 的导出（可缺，缺了房间按一组列出）；chars = 人物名数组 */
export function buildGroups({ reg, plan = null, chars = [], lang = 'zh' } = {}) {
  const en = lang === 'en', out = [], seen = new Set();
  const macro = s => String(s || '').replace(/\{\{user\}\}\s*(的)?\s*/g, en ? 'your ' : '你的');   // 酒馆宏不直接露出来
  const add = (g, it) => { if (!it.key || seen.has(it.key)) return; seen.add(it.key); g.items.push(it); };
  const maps = Object.entries(reg?.maps || {});
  // 1 天城各层地标（上 → 中 → 下，其余 points 图排在后面）
  const pts = maps.filter(([, m]) => m.kind === 'points' && m.status !== 'planned')
    .sort(([a], [b]) => (TIER[a] ? Object.keys(TIER).indexOf(a) : 9) - (TIER[b] ? Object.keys(TIER).indexOf(b) : 9));
  for (const [id, m] of pts) {
    const t = TIER[id] || [typeof m.title === 'string' ? m.title : m.title?.name || id, typeof m.title_en === 'string' ? m.title_en : m.title_en?.name || m.title?.name_en || id];   // v0.9.6 开局地点地图的 title 是字符串
    const g = { id: 'lm:' + id, label: en ? `${t[1]} · landmarks` : `${t[0]} · 地标`, short: en ? t[1] : t[0], items: [] };
    for (const [mk, v] of Object.entries(m.markers || {})) add(g, { key: v.name, kind: 'landmark', target: { map: id, marker: mk }, sub: macro(en ? (v.sub_en || v.sub || '') : (v.sub || '')), en: v.name_en || '', alias: v.alias || [] });
    if (g.items.length) out.push(g);
  }
  // 2 伊甸庄园：房间按楼层（plan.js 的 FLOORS / ROOMS；同一间房的多个叫法只列第一个，其余当搜索别名）、室外
  for (const [eid, m] of maps.filter(([, m]) => m.kind === 'estate')) {
    const title = en ? (m.title?.name_en || 'Eden Manor') : (m.title?.name || '伊甸庄园');
    const floors = plan?.FLOORS || [], rooms = plan?.ROOMS || [], byFloor = new Map(), other = [], taken = new Set();
    if (plan?.CARD?.rooms?.length) {   // 卡设定分层（map/data/eden_estate_rooms.json）：B2 / B1 / F1 / F2 / F3，只列卡房间（按卡房间编号）；按原卡的房间不描述
      // 名字不入库的卡房间：绑到用户卡里的原名就用原名（applyBinding 之后的 plan），否则显示占位「（按原卡）」+ 编号，落点用编号
      const PH = '（按原卡）', seen = new Set();
      for (const f of plan.CARD.floors || []) {
        const g = { id: `room:${f.id}`, label: `${title} · ${f.id}${en ? '' : ' ' + f.name}`, short: f.id, items: [] };
        for (const r of plan.CARD.rooms.filter(r => r.floor === f.id && (r.kind === 'card' || r.kind === 'restricted'))) {
          const ph = r.name === PH, k = ph ? `${PH} ${r.card_id}` : r.name; if (seen.has(f.id + k)) continue; seen.add(f.id + k);
          add(g, { key: k, kind: 'room', target: { map: eid, room: ph ? r.card_id : r.name, floor: f.id }, sub: r.kind === 'restricted' ? (en ? 'not described' : '不描述') : (r.note || '').split('；')[0], en: '', alias: [...(r.words || []), ...(r.synonyms || [])] });
        }
        if (g.items.length) out.push(g);
      }
    }
    else {
    for (const name of m.rooms || []) {
      const r = rooms.find(x => x.name === name || (x.alias || []).includes(name));
      if (r && taken.has(r.id)) { const it = byFloor.get(r.floor)?.find(i => i.pid === r.id); if (it && !it.alias.includes(name)) it.alias.push(name); continue; }
      const it = { key: name, kind: 'room', target: { map: eid, room: name }, sub: '', en: '', alias: [] };
      if (r) { taken.add(r.id); it.pid = r.id; it.en = (r.alias_en || [])[0] || ''; it.alias = (r.alias || []).filter(a => a !== name); if (!byFloor.has(r.floor)) byFloor.set(r.floor, []); byFloor.get(r.floor).push(it); }
      else other.push(it);
    }
    for (const [fi, list] of [...byFloor].sort((a, b) => a[0] - b[0])) {
      const f = floors[fi] || { label: `F${fi + 1}`, name: '' }, fen = plan?.FLOOR_EN?.[fi] || '';
      const g = { id: `room:${f.id || fi}`, label: en ? `${title} · ${f.label}${fen ? ' ' + fen : ''}` : `${title} · ${f.label}${f.name ? ' ' + f.name : ''}`, short: f.label, items: [] };
      for (const it of list) { delete it.pid; add(g, it); }
      if (g.items.length) out.push(g);
    }
    if (other.length) { const g = { id: 'room:other', label: en ? `${title} · B1–B2 / other rooms` : `${title} · B1–B2 / 其他房间`, short: en ? 'B1–B2 / other' : 'B1–B2 / 其他', items: [] }; other.forEach(it => add(g, it)); if (g.items.length) out.push(g); }
    }
    const areas = plan?.AREAS || [], atk = new Set(), ga = { id: 'area:' + eid, label: en ? `${title} · outdoors` : `${title} · 室外`, short: en ? 'Outdoors' : '室外', items: [] };
    for (const name of m.areas || []) {
      const a = areas.find(x => x.name === name || (x.alias || []).includes(name));
      if (a && atk.has(a.name)) { const it = ga.items.find(i => i.pa === a.name); if (it && !it.alias.includes(name)) it.alias.push(name); continue; }
      if (a) atk.add(a.name);
      add(ga, { key: name, kind: 'area', target: { map: eid, area: name }, sub: '', en: (a?.alias_en || [])[0] || '', alias: [], pa: a?.name });
    }
    ga.items.forEach(i => delete i.pa);
    if (ga.items.length) out.push(ga);
  }
  // 3 人物栏
  const gc = { id: 'char', label: en ? 'People' : '人物', short: en ? 'People' : '人物', items: [] };
  for (const n of chars) add(gc, { key: String(n), kind: 'character', target: { character: String(n) }, sub: '', en: '', alias: [] });
  if (gc.items.length) out.push(gc);
  return out;
}

/** 搜索：标准名、显示名、旧叫法、别名、英文名、副标题、用途都认（不分大小写）；空串原样返回。
 *  名字（标准名 / 显示名 / 别名）正好等于或以搜索词开头的项提到最前面一组「最匹配」（best 为组名），其余按原分组 */
export function filterGroups(groups, q, custom = null, best = '最匹配') {
  q = low(q).trim(); if (!q) return groups;
  const top = [], names = it => { const e = custom?.items?.[it.key]; return [it.key, it.en, ...(it.alias || []), e?.名, ...(e?.别名 || [])].filter(Boolean).map(low); };
  const rest = groups.map(g => ({ ...g, items: g.items.filter(it => {
    const e = custom?.items?.[it.key], ns = names(it);
    if (ns.some(n => n === q || n.startsWith(q))) { top.push({ ...it, rank: low(it.key) === q || low(e?.名) === q ? 0 : ns.some(n => n === q) ? 1 : 2 }); return false; }
    return [it.sub, e?.用途, ...ns].some(s => s && low(s).includes(q));
  }) })).filter(g => g.items.length);
  if (!top.length) return rest;
  top.sort((a, b) => a.rank - b.rank);
  return [{ id: 'best', label: best, short: best, items: top.map(({ rank, ...it }) => it) }, ...rest];
}

/** 标准名 → 清单里的项（没有返回 null） */
export function findItem(groups, key) { for (const g of groups) for (const it of g.items) if (it.key === key) return { ...it, group: g.label }; return null; }

/** 飞行目标规范化：只留认识的字段，都是非空字符串；无效返回 null */
export function normTarget(t) {
  if (!t || typeof t !== 'object') return null;
  const s = v => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 80) : null), o = {};
  if (s(t.map)) o.map = s(t.map);
  for (const k of ['character', 'room', 'area', 'marker']) if (s(t[k])) { o[k] = s(t[k]); if (k === 'room' && /^(B[12]|F[123])$/.test(t.floor || '')) o.floor = t.floor; return k === 'character' || o.map || k === 'room' || k === 'area' ? o : null; }
  return null;
}

/** 编辑表单的校验：返回 { ok, name: 错误键|null, note: 错误键|null }
 *  重名：显示名和别的对象的标准名或显示名相同（地点匹配会分不清）；都空：不能保存（等于重置，用「重置」） */
export function validate({ key, name = '', note = '', custom = null, keys = [], maxName = 40, maxNote = 200 }) {
  const n = String(name).trim(), u = String(note).trim(), r = { ok: true, name: null, note: null };
  if ([...n].length > maxName) r.name = 'too_long';
  else if (n && n !== key) {
    if (keys.includes(n)) r.name = 'dup_std';
    else if (Object.entries(custom?.items || {}).some(([k, e]) => k !== key && (e.名 === n || (e.别名 || []).includes(n)))) r.name = 'dup_name';
  }
  if ([...u].length > maxNote) r.note = 'too_long';
  if (!r.name && !r.note && !(n && n !== key) && !u) r.name = 'empty';
  r.ok = !r.name && !r.note; return r;
}
