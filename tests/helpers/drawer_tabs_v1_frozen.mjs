// Frozen copy of the drawer's show / hide logic as it was before S6-1 (origin/preview 11a98c35). Do not edit: tests/drawer_tabs.test.mjs compares
// core/drawer-tabs.mjs against it. The code is copied verbatim from map/events-view.mjs renderBar (the visibility lines), map/app/drawer-glue.mjs
// sheetVis and cardSheet, with their inputs (`hasEv`, `chN`, `estate`, `card`, `layChip`, `um`, `depthData && legendItems().length > 0`) passed in
// and the DOM reads replaced by the sheet-like object `S` (the same interface as ui/sheet.js: showTab, setTab, hide, button(id).hidden, tab).
export function sheetVisFrozen(S, { estate, card, layChip, um, legend }) {
  const ev = !S.button('ev').hidden, ch = !S.button('ch').hidden;
  S.hide(estate || !(ev || ch || card || layChip || um));
  S.showTab('pl', ev || ch || card || !!um);
  S.showTab('lg', !estate && legend);
}

export function renderBarFrozen(S, { hasEv, chN }, sheetInputs) {
  S.showTab('ev', hasEv); S.showTab('ch', !!chN);
  sheetVisFrozen(S, sheetInputs);
  if (!S.tab || S.button(S.tab)?.hidden) { const nx = hasEv ? 'ev' : chN ? 'ch' : null; if (nx) S.setTab(nx); }
}

export function cardSheetFrozen(S, open, sheetInputs) {
  sheetVisFrozen(S, sheetInputs);
  if (open) { S.setTab('pl', S.state === 'full' ? 'full' : 'half'); return; }
  if (S.tab === 'pl') { const nx = !S.button('ev').hidden ? 'ev' : !S.button('ch').hidden ? 'ch' : null; if (nx) S.setTab(nx); S.set('peek'); }
}

// A fake drawer: ui/sheet.js showTab (L105) and setTab (L141-144), with the state the calls read; it records every call.
export function fakeSheet(ids, { tab = null, state = 'peek', hidden = [] } = {}) {
  const tabs = new Map(ids.map(id => [id, { b: { hidden: hidden.includes(id) } }])), log = [];
  const S = {
    drawerHidden: false, log,
    get tab() { return tab; }, get state() { return state; },
    button: id => tabs.get(id)?.b || null,
    hide(on) { log.push(['hide', !!on]); S.drawerHidden = !!on; },
    showTab(id, on) {
      log.push(['showTab', id, !!on]); const x = tabs.get(id); if (!x) return;
      x.b.hidden = !on;
      if (!on && tab === id) { const nx = [...tabs.keys()].find(k => !tabs.get(k).b.hidden); if (nx) S.setTab(nx, state === 'peek' ? null : state); else tab = null; }
    },
    setTab(id, s) { log.push(['setTab', id, s ?? null]); if (!tabs.has(id)) return; const x = tabs.get(id); if (x.b.hidden) x.b.hidden = false; tab = id; if (s) S.set(s); },
    set(s) { log.push(['set', s]); if (['peek', 'half', 'full'].includes(s)) state = s; },
    snapshot: () => ({ hidden: Object.fromEntries([...tabs].map(([k, x]) => [k, x.b.hidden])), drawerHidden: S.drawerHidden, tab, state }),
  };
  return S;
}
