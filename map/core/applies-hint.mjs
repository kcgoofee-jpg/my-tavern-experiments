// appliesHint(applies, ctx, names) -> a short plain-words reason why a layer does not apply here, or null (docs/ui-refactor.md 3.3, 4). Pure: no DOM, no i18n lookups of its own.
// Which keys of `applies` fail for `ctx` (the same keys as core/layer-spec.mjs appliesTo) -> one phrase per failing key, at most two joined by " · ". `data` alone -> null (the caller hides
// the row: nothing to explain). Names come from the caller (names.view / node / period / kind(id) -> display text, names.t(key, vars) -> a template); an id with no name becomes a generic
// word, so an id, a path or a "/" never reaches the screen. A pack's own `menu.when` wins over this and is applied by the caller.
export const HINT_ZH = {
  'lyr.only_view': '只在 {x} 视图', 'lyr.only_in': '只在 {x} 及其下级', 'lyr.only_type': '只在特定类型的地点', 'lyr.only_period': '只在 {x}', 'lyr.only_night': '只在夜间', 'lyr.only_day': '只在白天',
  'lyr.only_state': '仅在特定状态下', 'lyr.generic_view': '特定', 'lyr.generic_place': '特定地点', 'lyr.generic_period': '特定时段',
};
const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => v?.[k] ?? '');
const MAX_PARTS = 2;
export function appliesHint(applies, ctx, names = {}) {
  if (!applies || typeof applies !== 'object') return null;
  const a = applies, c = ctx || {}, has = (l, v) => l.includes(v);
  const t = (k, v) => (typeof names.t === 'function' ? names.t(k, v) : null) || fill(HINT_ZH[k], v);
  const word = (fn, id, generic) => { let r = null; try { r = typeof fn === 'function' ? fn(id) : null; } catch (e) {} return typeof r === 'string' && r.trim() && !/[\/\\]/.test(r) ? r.trim() : t(generic); };
  const list = (ids, fn, generic) => [...new Set(ids.map(i => word(fn, i, generic)))].join('、');
  const parts = [];
  if (a.views?.length && !has(a.views, c.view)) parts.push(t('lyr.only_view', { x: list(a.views, names.view, 'lyr.generic_view') }));
  if (a.kinds?.length && !has(a.kinds, c.kind)) parts.push(t('lyr.only_view', { x: list(a.kinds, names.kind, 'lyr.generic_view') }));
  if (a.nodes?.length && !(has(a.nodes, c.owner) || (c.ancestors || []).some(n => has(a.nodes, n)))) parts.push(t('lyr.only_in', { x: list(a.nodes, names.node, 'lyr.generic_place') }));
  if (a.node_types?.length && !has(a.node_types, c.nodeType)) parts.push(t('lyr.only_type'));
  if (a.periods?.length && !has(a.periods, c.period)) parts.push(t('lyr.only_period', { x: list(a.periods, names.period, 'lyr.generic_period') }));
  if (a.dark !== undefined && !!c.dark !== a.dark) parts.push(t(a.dark ? 'lyr.only_night' : 'lyr.only_day'));
  if (a.mvu) {
    const m = a.mvu, v = c.mvu?.[m.path];
    const bad = v === undefined || v === null || (m.equals !== undefined && v !== m.equals) || (m.min !== undefined && !(Number(v) >= m.min)) || (m.max !== undefined && !(Number(v) <= m.max)) || (m.truthy !== undefined && !!v !== m.truthy);
    if (bad) parts.push(t('lyr.only_state'));
  }
  return parts.length ? parts.slice(0, MAX_PARTS).join(' · ') : null;
}
