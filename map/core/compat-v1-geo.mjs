// Schema 1 map registry -> schema 2 nodes (docs/kernel-schema.md Appendix A.2 - A.4). Pure; carries no card terms.
// buildGeo returns the node list in declaration order plus a context (id map, word tables) the other compat files read.

const has = v => typeof v === 'string' && v.trim() !== '';
export const uniq = list => [...new Set(list.filter(has))];
export const put = (o, k, v) => { if (v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)) o[k] = v; return o; };
/** v1 world frame (1600 x 1000 canvas with margins) -> 0..1 of the world picture. */
export const toImg = (x, y) => [(x / 1600 - .0075) / .985, (y / 1000 - .015) / .97];
const atOf = (x, y) => { if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined; const [nx, ny] = toImg(x, y); return { x: +nx.toFixed(6), y: +ny.toFixed(6) }; };
const tr = (name, sub, desc) => { const e = put(put(put({}, 'name', name), 'sub', sub), 'desc', desc); return Object.keys(e).length ? { en: e } : undefined; };
const roomId = id => `room_${String(id).toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;

/** Card room name -> wordings: the name, the name without brackets / a trailing count, each side of a slash (two characters or more). Copy of v1 planWords. */
export function planWords(name) {
  const n = String(name || '').trim(); if (!n) return [];
  const base = n.replace(/[（(][^）)]*[）)]/g, '').replace(/\s*[×x]\s*\d+\s*$/, '').trim();
  const out = [n, base, ...base.split(/\s*[\/／]\s*/)].map(s => s.trim()).filter(s => [...s].length >= 2);
  return [...new Set(out)];
}

/** Words of a v1 layer: name, subtitle, English subtitle, English name + " Tier" (a v1 rule), districts. */
export function layerBits(m) {
  const L = m.layer || {};
  return { name: L.name, sub: L.sub, subEn: L.sub_en, nameEn: L.name_en, words: uniq([L.name, L.sub, L.sub_en, L.name_en && `${L.name_en} Tier`, ...(m.districts || [])]) };
}

/** { reg: maps.json, world: world places | null, names: English dictionary | null, plan: room plan | null } -> { nodes, ctx }. */
export function buildGeo({ reg, world, names, plan }) {
  const M = reg && typeof reg.maps === 'object' && reg.maps ? reg.maps : {}, G = reg && typeof reg.groups === 'object' && reg.groups ? reg.groups : {};
  const en = z => (names && names[z]) || null, live = id => !!M[id] && M[id].status !== 'planned';
  const nodes = [], seen = new Set(), idmap = {};
  const add = n => { if (seen.has(n.id)) return false; seen.add(n.id); nodes.push(n); return true; };
  const ctx = { idmap, groupNode: {}, entities: [], layerWords: {}, landmarks: [], viewer3d: new Set(), levels: {}, estate: null, rootId: null, worldId: null };
  const ents = [['place', world?.places], ['fief', world?.fiefs], ['realm', world?.realms]]
    .flatMap(([kind, l]) => (Array.isArray(l) ? l : []).filter(p => p && p.id).map(p => ({ kind, p })));
  for (const [id, m] of Object.entries(M)) if (live(id) && m.kind === 'estate' && m.viewer3d) ctx.viewer3d.add(id);
  const estateId = Object.keys(M).find(k => live(k) && M[k].kind === 'estate' && !M[k].viewer3d) || null;
  let estateMark = null;
  if (estateId) for (const [mid, m] of Object.entries(M)) { if (!live(mid) || m.kind !== 'points') continue; for (const [k, mk] of Object.entries(m.markers || {})) if (!estateMark && mk.link?.map === estateId) estateMark = { map: mid, key: k, mk }; }
  if (estateMark) idmap[estateMark.key] = estateId;

  // ---- root and the groups ----
  const worldId = Object.keys(M).find(k => live(k) && M[k].kind === 'world') || null, W = worldId && M[worldId];
  ctx.worldId = ctx.rootId = worldId;
  if (worldId) add({ id: worldId, name: W.title || worldId, type: 'world', alias: [], hints: uniq([W.title, ...(reg.ambiguous?.words || [])]), ...(tr(W.title_en) ? { i18n: tr(W.title_en) } : {}) });
  const info = {};
  for (const [gid, g] of Object.entries(G)) {
    const pts = (g.layers || []).filter(k => live(k) && M[k].kind === 'points'), ent = g.place ? ents.find(e => e.p.id === g.place) : null;
    const merged = !!g.place && pts.length === 1, nodeId = merged ? pts[0] : gid;
    info[gid] = { g, pts, ent, merged, nodeId }; ctx.groupNode[gid] = nodeId;
    if (nodeId !== gid) idmap[gid] = nodeId;
    if (g.place && g.place !== nodeId) idmap[g.place] = nodeId;
  }
  const xAlt = L => (L && (L.alt || L.alt_en) ? put(put({}, 'alt', L.alt), 'alt_en', L.alt_en) : undefined);
  const placeAt = p => (p.c ? atOf(p.c[0], p.c[1]) : atOf(p.x, p.y));
  const mkGroup = gid => {
    const { g, pts, ent, merged, nodeId } = info[gid], p = ent?.p, m = merged ? M[pts[0]] : null, lb = m ? layerBits(m) : null, name = p?.name || g.title;
    const n = put({ id: nodeId, name, type: merged ? 'site' : 'group' }, 'parent', worldId);
    n.alias = uniq([name, g.title, g.title_en, en(g.title), p?.name_en, en(p?.name), ...(Array.isArray(p?.alias) ? p.alias : []), ...(lb ? lb.words : [])]);
    put(n, 'sub', p?.sub || lb?.sub); put(n, 'cite', p?.src); put(n, 'desc', m?.econ);
    put(n, 'i18n', tr(en(name) || p?.name_en || g.title_en, lb?.subEn, m?.econ_en));
    if (p) put(n, 'at', placeAt(p));
    if (!merged) { const up = (g.upper || []).find(k => pts.includes(k)); put(n, 'enter', up || pts[0]); }
    if (p) { put(n, 'x-openings', p.openings); put(n, 'x-auto-highest', p.autoHighest); }
    if (m) { put(n, 'x-alt', xAlt(m.layer)); put(n, 'x-cover', m.cover); ctx.layerWords[nodeId] = lb.words; }
    if (ent) ctx.entities.push({ name: ent.p.name, node: nodeId });
    return n;
  };
  const mkEntity = ({ kind, p }) => {
    const n = put({ id: p.id, name: p.name, type: kind === 'place' ? (['capital', 'start', 'site'].includes(p.type) ? p.type : 'place') : kind }, 'parent', worldId);
    n.alias = uniq([p.name, p.name_en, en(p.name), ...(Array.isArray(p.alias) ? p.alias : [])]);
    put(n, 'sub', p.sub); put(n, 'cite', p.src); put(n, 'i18n', tr(en(p.name) || p.name_en)); put(n, 'at', placeAt(p));
    put(n, 'x-openings', p.openings); put(n, 'x-auto-highest', p.autoHighest);
    ctx.entities.push({ name: p.name, node: n.id }); return n;
  };
  const done = new Set();
  for (const e of ents) {
    const gid = Object.keys(info).find(k => info[k].g.place === e.p.id && !done.has(k));
    if (gid) { done.add(gid); add(mkGroup(gid)); } else if (!Object.values(info).some(i => i.g.place === e.p.id)) add(mkEntity(e));
  }
  for (const gid of Object.keys(info)) if (!done.has(gid)) { done.add(gid); add(mkGroup(gid)); }

  // ---- layers, landmarks, the estate ----
  const emitLandmarks = (k, m) => {
    for (const [key, mk] of Object.entries(m.markers || {})) {
      if (estateMark && estateMark.map === k && estateMark.key === key) continue;
      const n = { id: key, name: mk.name, type: 'landmark', parent: k, alias: uniq([mk.name, mk.name_en, ...(mk.alias || [])]) };
      put(n, 'sub', mk.sub); put(n, 'cite', mk.src); put(n, 'desc', mk.econ); put(n, 'i18n', tr(mk.name_en, mk.sub_en, mk.econ_en));
      put(n, 'x-cls', mk.cls); put(n, 'x-island', mk.island); put(n, 'x-openings', mk.openings); put(n, 'x-opening-dest', mk.opening_dest); put(n, 'x-gallery', mk.gallery); put(n, 'x-cover', mk.cover);
      const vs = [...new Set([mk.link?.map, mk.link3d?.map].filter(t => ctx.viewer3d.has(t)))];
      put(n, 'view', vs.length === 1 ? vs[0] : vs);
      if (mk.link && !ctx.viewer3d.has(mk.link.map) && mk.link.map !== estateId) {
        const l = { to: mk.link.marker || mk.link.map }; put(l, 'label', mk.link.label);
        if (mk.link.label_en) l.i18n = { en: { label: mk.link.label_en } };
        n.links = [l];
      }
      if (add(n)) ctx.landmarks.push({ node: key, map: k, words: n.alias });
    }
  };
  const emitEstate = () => {
    const m = M[estateId], mk = estateMark?.mk, L = m.layer || {}, hints = uniq([...(m.rooms || []), ...(m.rooms_en || []), ...(m.areas || []), ...(m.areas_en || [])]);
    const rooms = [...(m.rooms || []), ...(m.rooms_en || [])], areas = [...(m.areas || []), ...(m.areas_en || [])], skip = new Set([...rooms, ...areas]);
    const whole = uniq([m.title, m.title_en, L.name, L.name_en, ...(m.alias || []), mk?.name, mk?.name_en, ...(mk?.alias || [])]).filter(w => !skip.has(w));
    const n = { id: estateId, name: m.title || L.name || estateId, type: 'estate', parent: estateParent, alias: whole };
    put(n, 'anchor', estateMark && estateMark.key !== estateId ? estateMark.key : undefined);
    put(n, 'hints', hints); put(n, 'sub', mk?.sub); put(n, 'cite', mk?.src); put(n, 'i18n', tr(m.title_en || L.name_en, mk?.sub_en));
    put(n, 'x-cls', mk?.cls); put(n, 'x-island', mk?.island); put(n, 'x-openings', mk?.openings); put(n, 'x-cover', mk?.cover || m.cover);
    add(n);
    const std = [...rooms], planStd = {}, floor = {}, list = [...rooms], byName = new Map(), roomNode = {};
    for (const r of plan?.rooms || []) {
      if (!r?.name) continue;
      let e = byName.get(r.name);
      if (!e) { e = { id: roomId(r.id), name: r.name, words: [], kind: r.kind }; byName.set(r.name, e); }
      for (const w of [...planWords(r.name), ...(r.words || []), ...(r.synonyms || [])]) { e.words.push(w); if (!(w in planStd)) planStd[w] = r.name; if (!list.includes(w) && !areas.includes(w)) list.push(w); }
      floor[r.name] = r.name in floor && floor[r.name] !== r.floor ? null : r.floor;
    }
    for (const w of list) if (!std.includes(w)) std.push(w);
    for (const e of byName.values()) {
      const r = { id: e.id, name: e.name, type: 'room', parent: estateId, alias: [], hints: uniq(e.words) };
      r['x-storey'] = floor[e.name] ?? null; put(r, 'x-plan-kind', e.kind);
      if (add(r)) roomNode[e.name] = e.id;
    }
    const oldName = r => { const cid = plan?.card_id_alias?.[r] || plan?.retired_names?.[r], c = cid && (plan.card_rooms || []).find(x => x.cid === cid); return c?.name || null; };
    ctx.estate = { id: estateId, rooms: list, areas, std, planStd, roomNode, oldName };
  };
  const estateParentRaw = estateMark ? estateMark.map : estateId ? (M[estateId].group ? ctx.groupNode[M[estateId].group] : idmap[M[estateId].parent] || M[estateId].parent) : null;
  let estateParent = estateParentRaw && (live(estateParentRaw) || info[estateParentRaw]) ? estateParentRaw : worldId || undefined, estateDone = false;
  const emitLayer = (k, parentId, merged) => {
    const m = M[k], lb = layerBits(m);
    if (!merged) {
      const n = put({ id: k, name: lb.name || m.title || k, type: 'layer' }, 'parent', parentId);
      if (m.layer) n.alias = uniq([n.name, ...lb.words]);
      put(n, 'sub', lb.sub); put(n, 'desc', m.econ); put(n, 'i18n', tr(lb.nameEn || m.title_en, lb.subEn, m.econ_en));
      put(n, 'x-alt', xAlt(m.layer)); put(n, 'x-cover', m.cover);
      add(n); ctx.layerWords[k] = lb.words;
    }
    emitLandmarks(k, m);
    if (estateId && !estateDone && estateParent === k) { estateDone = true; emitEstate(); }
  };
  for (const gid of Object.keys(info)) {
    const { g, pts, merged, nodeId } = info[gid];
    for (const k of g.layers || []) if (pts.includes(k)) emitLayer(k, nodeId, merged);
    const members = (g.layers || []).map(k => (k === estateId ? k : pts.includes(k) ? k : null)).filter(Boolean);
    if (members.some(k => (k === estateId ? estateParent : nodeId) !== nodeId) && members.length >= 2) ctx.levels[nodeId] = members;
  }
  for (const [k, m] of Object.entries(M)) {   // points maps no group lists
    if (!live(k) || m.kind !== 'points' || seen.has(k)) continue;
    emitLayer(k, (m.group && ctx.groupNode[m.group]) || idmap[m.parent] || worldId || undefined, false);
  }
  if (estateId && !estateDone) { if (!seen.has(estateParent)) estateParent = worldId || undefined; emitEstate(); }
  for (const [k, m] of Object.entries(M)) {   // a 3D page that names a zone (`anchor.zone`) is a place of its own: a node under its parent, anchored to that region of the parent's view (K-R31, K-R32)
    if (!live(k) || !ctx.viewer3d.has(k) || !has(m.anchor?.zone) || seen.has(k)) continue;
    const up = idmap[m.parent] || m.parent, n = put({ id: k, name: m.title || k, type: 'zone' }, 'parent', seen.has(up) ? up : worldId || undefined);
    n.alias = uniq([n.name, m.title_en, ...(Array.isArray(m.alias) ? m.alias : [])]);
    put(n, 'anchor', m.anchor.zone); put(n, 'i18n', tr(m.title_en)); add(n);
  }
  if (!worldId && reg?.ambiguous?.words?.length) {   // the only parentless node is the root: the ambiguous words become its hints
    const tops = nodes.filter(n => !n.parent);
    if (tops.length === 1) tops[0].hints = uniq([...(tops[0].hints || []), ...reg.ambiguous.words]);
  }
  for (const n of nodes) {   // references to nodes that do not exist are dropped
    if (n.enter && !seen.has(n.enter)) delete n.enter;
    if (n.links) { n.links = n.links.filter(l => seen.has(idmap[l.to] || l.to)).map(l => ({ ...l, to: idmap[l.to] || l.to })); if (!n.links.length) delete n.links; }
  }
  return { nodes, ctx, M, G, info, estateMark, en };
}
