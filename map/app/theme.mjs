// Pack-driven theme (docs/kernel-schema.md K-R70): the pack's `ui.theme.views` -> one <style id="packTheme"> with a dark block and a light block per view.
// Nothing here names a view: ids and tokens come from the pack and are re-checked at run time (K-R64, core/pack-v2-spec.mjs recheck); text goes in through textContent.
// Selector order and specificity equal the CSS this replaced ([data-map="<id>"] and .light [data-map="<id>"], .light[data-map="<id>"]), so the cascade is unchanged.
// `body[data-glow="1"]` marks a view whose tokens define --glow-text ("glow only on the view that defines it"); nav.mjs calls syncGlow when the map changes.
import { recheck } from '../core/pack-v2-spec.mjs';

let views = {};
const rules = (sel, tokens) => {
  const d = Object.entries(tokens && typeof tokens === 'object' ? tokens : {}).filter(([k, v]) => recheck.token(k, v) !== null).map(([k, v]) => `${k}: ${v};`);
  return d.length ? `${sel} { ${d.join(' ')} }` : '';
};
/** ui (the runtime tree's ui block or undefined) -> the CSS text; bad ids and tokens are dropped. */
export function themeCss(ui) {
  const out = [];
  for (const [id, v] of Object.entries(ui?.theme?.views && typeof ui.theme.views === 'object' ? ui.theme.views : {})) {
    if (recheck.id(id) === null || !v || typeof v !== 'object') continue;
    out.push(rules(`[data-map="${id}"]`, v.tokens), rules(`.light [data-map="${id}"], .light[data-map="${id}"]`, v.light));
  }
  return out.filter(Boolean).join('\n');
}
/** body[data-glow]: "1" while the map `id` has a --glow-text token of its own. */
export function syncGlow(id, doc = document) {
  const on = recheck.id(id) !== null && Object.hasOwn(views[id]?.tokens || {}, '--glow-text') && recheck.token('--glow-text', views[id].tokens['--glow-text']) !== null;
  if (on) doc.body.dataset.glow = '1'; else delete doc.body.dataset.glow;
}
/** Called once the runtime tree is loaded (app/boot.mjs); a later call replaces the style. */
export function applyTheme(ui, doc = document) {
  views = ui?.theme?.views && typeof ui.theme.views === 'object' ? ui.theme.views : {};
  let el = doc.getElementById('packTheme');
  const css = themeCss(ui);
  if (!css) { el?.remove(); syncGlow(doc.body?.dataset.map, doc); return; }
  if (!el) { el = doc.createElement('style'); el.id = 'packTheme'; doc.head.appendChild(el); }
  el.textContent = css;
  syncGlow(doc.body?.dataset.map, doc);
}
