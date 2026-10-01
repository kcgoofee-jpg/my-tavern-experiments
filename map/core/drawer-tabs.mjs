// Drawer tab rules (docs/kernel-schema.md K-R72; design docs/entity-protocol.md §3). Pure: no DOM, no globals, no storage.
// The tab set is fixed by the kernel; a pack names a subset and an order through `ui.tabs` (K-R57). The viewer (app/tabs.mjs) reads the DOM
// and the drawer and calls these. A "sheet" below is the drawer's API (ui/sheet.js): showTab, setTab, hide, button(id).hidden, tab.
//   KERNEL_TABS     the kernel tabs of the drawer: { name (K-R57), id (drawer id), btnClass, icon, keepsDrawer, fallback }; the Items tab (S6-3) sits between characters and places
//   tabOrder(uiTabs)    the rows in display order: the pack's list (each once, unknown names ignored), then `places` when it was left out, then the legend last
//   applyTo(sheet, inputs, order)   the one sequence that shows / hides the buttons and the drawer and picks a tab when the selected one is gone
//   firstFallback(sheet, order)     the tab the place card gives way to when it closes: the first visible tab that counts for the drawer, by fallback order
const row = (name, id, btnClass, icon, keepsDrawer, fallback) => Object.freeze({ name, id, btnClass, icon, keepsDrawer, fallback });
export const KERNEL_TABS = Object.freeze([
  row('events', 'ev', 'evtab', 'bell', true, 1), row('characters', 'ch', 'chtab', 'users', true, 2), row('items', 'it', 'ittab', 'parts', true, 3),
  row('places', 'pl', 'pltab', 'pin', false, 0), row('legend', 'lg', 'lgtab', 'info', false, 0),
]);

const NAMES = ['events', 'characters', 'items', 'places'];   // the names K-R57 knows; `legend` is not orderable

export function tabOrder(uiTabs) {
  const by = name => KERNEL_TABS.find(t => t.name === name);
  if (!Array.isArray(uiTabs) || !uiTabs.some(n => NAMES.includes(n))) return KERNEL_TABS.slice();
  const named = [];
  for (const n of uiTabs) { const t = by(n); if (t && t.name !== 'legend' && !named.includes(t)) named.push(t); }
  if (!named.includes(by('places'))) named.push(by('places'));
  return [...named, by('legend')];
}

const byFallback = order => order.filter(t => t.keepsDrawer).sort((a, b) => a.fallback - b.fallback);

/**
 * inputs = { vis: { <drawer id>: boolean } (the tabs that count for the drawer), scene, card, layChip, um (the unmapped place name | null), legendOk }.
 * The order of the calls is the one v1 had (renderBar, then sheetVis): the drawer hides before the place tab is shown.
 */
export function applyTo(sheet, inputs, order = KERNEL_TABS) {
  const keeps = order.filter(t => t.keepsDrawer);
  for (const t of keeps) sheet.showTab(t.id, !!inputs.vis?.[t.id]);
  const any = keeps.some(t => !sheet.button(t.id).hidden);
  sheet.hide(inputs.scene || !(any || inputs.card || inputs.layChip || inputs.um));
  sheet.showTab('pl', any || inputs.card || !!inputs.um);
  sheet.showTab('lg', !!inputs.legendOk);
  if (!sheet.tab || sheet.button(sheet.tab)?.hidden) {
    const nx = firstFallback(sheet, order);
    if (nx) sheet.setTab(nx);
  }
}

export function firstFallback(sheet, order = KERNEL_TABS) {
  return byFallback(order).find(t => !sheet.button(t.id).hidden)?.id ?? null;
}
