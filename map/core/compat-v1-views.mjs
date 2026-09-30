// Schema 1 maps -> schema 2 views (docs/kernel-schema.md Appendix A.2): a tiles view per world / points map, a model3d view per
// 3D landmark page, one for the estate page. View ids are the v1 map ids. Pure; carries no card terms.
import { put } from './compat-v1-geo.mjs';

const str = v => (typeof v === 'string' && v !== '' ? v : undefined);
const size = v => (Array.isArray(v) && v.length === 2 && v.every(n => typeof n === 'number' && n > 0) ? v : undefined);
const i18nOf = (zh, en) => {
  const out = {}, z = {}, e = {};
  for (const [o, src] of [[z, zh], [e, en]]) for (const [k, v] of Object.entries(src)) if (str(v)) o[k] = v;
  if (Object.keys(z).length) out.zh = z; if (Object.keys(e).length) out.en = e;
  return Object.keys(out).length ? out : undefined;
};
const tiles = (m, node, has) => {
  if (!str(m.base)) return null;
  const v = { kind: 'tiles', src: m.base }, w = m.view || {};
  put(v, 'extent', size(w.extent_m)); put(v, 'regions', str(m.data));
  const focus = str(w.focus) && (node[w.focus] || w.focus), home = {};
  if (focus && has(focus)) home.focus = focus;
  if (w.width_m > 0) home.width = w.width_m; if (w.min_width_m > 0) home.min_width = w.min_width_m;
  if (Array.isArray(w.phone) && w.phone.length === 4) home.phone = w.phone;
  put(v, 'home', Object.keys(home).length ? home : undefined);
  if (m.periods && typeof m.periods === 'object') put(v, 'variants', Object.fromEntries(Object.entries(m.periods).filter(([, s]) => str(s))));
  put(v, 'credit', str(m.credit)); put(v, 'i18n', i18nOf({ title: m.title }, { title: m.title_en, credit: m.credit_en }));
  if (m.alt && str(m.alt.base)) put(v, 'alt', put({ src: m.alt.base, ...(str(m.alt.label) ? { label: m.alt.label } : {}) }, 'i18n', i18nOf({}, { label: m.alt.label_en })));
  const o = m.overlay;
  if (o && str(o.src) && ['dzi', 'barriers'].includes(o.type)) { const ov = put(put({ kind: o.type, src: o.src }, 'label', str(o.label)), 'i18n', i18nOf({}, { label: o.label_en })); put(ov, 'from', str(o.from)); v.overlays = [ov]; }
  if (Array.isArray(m.insets)) put(v, 'insets', m.insets.filter(i => i && str(i.id) && str(i.base) && Array.isArray(i.bounds) && size(i.res_px)).map(i => put({ id: i.id, src: i.base, bounds: i.bounds, px: i.res_px }, 'node', str(i.marker) && (node[i.marker] || i.marker))));
  put(v, 'x-depth', m.depth);
  put(v, 'x-clouds', m.clouds === true ? true : undefined); put(v, 'x-tint', m.tint === 'period' ? 'period' : undefined);   // K-R70: pack data says which maps get drifting clouds and the period night tint
  return v;
};

/** { M, ctx } from buildGeo -> views (an object keyed by view id). `hasNode(id)` tells whether a node exists. */
export function buildViews({ M, ctx }, hasNode) {
  const views = {};
  for (const [k, m] of Object.entries(M)) {
    if (m.status === 'planned') continue;
    if (m.kind === 'world' || m.kind === 'points') { const v = tiles(m, ctx.idmap, hasNode); if (v) views[k] = v; }
    else if (m.kind === 'estate' && m.viewer3d) {
      const v = { kind: 'model3d', open: 'enter', manifest: `props/${m.viewer3d}/manifest.json` };
      put(v, 'credit', str(m.credit)); put(v, 'i18n', i18nOf({ title: m.title }, { title: m.title_en, credit: m.credit_en })); views[k] = v;
    } else if (ctx.estate && k === ctx.estate.id) {
      const v = { kind: 'model3d', open: 'locate' };
      put(v, 'x-page', str(m.src)); put(v, '_note', str(m.src_note)); put(v, 'credit', str(m.credit));
      put(v, 'i18n', i18nOf({ title: m.title }, { title: m.title_en, credit: m.credit_en })); views[k] = v;
    }
  }
  for (const v of Object.values(views)) if (v.overlays) v.overlays = v.overlays.filter(o => !o.from || views[o.from]);
  return views;
}
