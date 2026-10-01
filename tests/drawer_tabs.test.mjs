// S6-1: the drawer's show / hide rules moved to core/drawer-tabs.mjs; they must behave exactly as before. The frozen copy of the v1 logic
// (tests/helpers/drawer_tabs_v1_frozen.mjs) and the new sequence run on two fresh fake drawers for every combination of the inputs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { KERNEL_TABS, tabOrder, applyTo, firstFallback } from '../map/core/drawer-tabs.mjs';
import { renderBarFrozen, cardSheetFrozen, fakeSheet } from './helpers/drawer_tabs_v1_frozen.mjs';

const IDS = ['ev', 'ch', 'it', 'pl', 'lg'], B = [false, true];
const SEL = [null, 'ev', 'ch', 'pl', 'lg'], STATES = ['peek', 'half'], STARTS = ['visible', 'boot'];
const fresh = (start, state, sel, hidden) => {
  const S = fakeSheet(IDS, { state, hidden: hidden ?? (start === 'boot' ? ['ev', 'ch', 'it', 'lg'] : ['it']) });
  if (sel) S.setTab(sel);
  S.log.length = 0; return S;
};
const grid = [];
for (const hasEv of B) for (const chPos of B) for (const card of B) for (const layChip of B) for (const um of B) for (const scene of B) for (const legendOk of B) grid.push({ hasEv, chPos, card, layChip, um, scene, legendOk });
const oldIn = g => ({ estate: g.scene, card: g.card, layChip: g.layChip, um: g.um ? 'x' : null, legend: g.legendOk });
const newIn = g => ({ vis: { ev: g.hasEv, ch: g.chPos }, scene: g.scene, card: g.card, layChip: g.layChip, um: g.um ? 'x' : null, legendOk: !g.scene && g.legendOk });   // drawer-glue's legendOk() = not a scene and there is something to say

// S6-3: the Items tab `it` joins the drawer; with `it` never visible every result is the frozen v1 one (the extra showTab('it', false) call is the only new log line)
const noIt = l => l.filter(c => !(c[0] === 'showTab' && c[1] === 'it'));
test('the grid is 2^7 = 128 input combinations', () => assert.equal(grid.length, 128));

test('renderBar + sheetVis: the same buttons, drawer, selected tab, state and call order as the frozen v1 logic (128 x 5 x 2 x 2 runs)', () => {
  let n = 0;
  for (const g of grid) for (const sel of SEL) for (const state of STATES) for (const start of STARTS) {
    const a = fresh(start, state, sel), b = fresh(start, state, sel);
    renderBarFrozen(a, { hasEv: g.hasEv, chN: g.chPos ? 1 : 0 }, oldIn(g));
    applyTo(b, newIn(g), KERNEL_TABS);
    const where = JSON.stringify({ g, sel, state, start });
    assert.deepEqual(b.snapshot(), a.snapshot(), where);
    assert.deepEqual(noIt(b.log), a.log, where);
    n++;
  }
  assert.equal(n, 2560);
});

// cardSheet: sheetVis alone (the buttons of ev / ch are in step with their data), then the place tab opens, or gives way. Only reachable states:
// a visible ev / ch tab has data, and no selected tab means nothing is shown yet.
function cardSheetNew(S, open, g) {
  applyTo(S, { vis: { ev: !S.button('ev').hidden, ch: !S.button('ch').hidden, it: false }, scene: g.scene, card: g.card, layChip: g.layChip, um: g.um ? 'x' : null, legendOk: !g.scene && g.legendOk }, KERNEL_TABS);
  if (open) { S.setTab('pl', S.state === 'full' ? 'full' : 'half'); return; }
  if (S.tab === 'pl') { const nx = firstFallback(S, KERNEL_TABS); if (nx) S.setTab(nx); S.set('peek'); }
}
test('cardSheet(true / false): the same result as the frozen v1 logic', () => {
  let n = 0;
  for (const g of grid) for (const sel of SEL) for (const state of STATES) for (const open of B) {
    const hidden = ['it', ...['ev', 'ch']].filter(id => !(id === 'it' ? false : id === 'ev' ? g.hasEv : g.chPos));
    if ((sel === 'ev' && !g.hasEv) || (sel === 'ch' && !g.chPos) || (sel === null && (g.hasEv || g.chPos))) continue;
    const a = fresh('visible', state, sel, hidden), b = fresh('visible', state, sel, hidden);
    cardSheetFrozen(a, open, oldIn(g)); cardSheetNew(b, open, g);
    const where = JSON.stringify({ g, sel, state, open });
    assert.deepEqual(b.snapshot(), a.snapshot(), where);
    const noEvCh = l => l.filter(c => !(c[0] === 'showTab' && (c[1] === 'ev' || c[1] === 'ch' || c[1] === 'it')));   // the new sequence repeats the (unchanged) ev / ch state first; v1's sheetVis never touched them
    assert.deepEqual(noEvCh(b.log), noEvCh(a.log), where);
    n++;
  }
  assert.ok(n > 1000, 'the reachable subset is large: ' + n);
});

test('cardSheet(false) falls back to ev when it is visible, else ch, else nothing (v1: L62)', () => {
  for (const [hidden, want] of [[['it'], 'ev'], [['ev', 'it'], 'ch'], [['ch', 'it'], 'ev'], [['ev', 'ch', 'it'], null], [['ev', 'ch'], 'it'], [['ch'], 'ev']]) {
    const S = fakeSheet(IDS, { hidden });
    assert.equal(firstFallback(S, KERNEL_TABS), want, hidden.join());
  }
});

test('KERNEL_TABS: the five rows of the design, frozen', () => {
  assert.deepEqual(KERNEL_TABS.map(t => [t.name, t.id, t.btnClass, t.icon, t.keepsDrawer, t.fallback]),
    [['events', 'ev', 'evtab', 'bell', true, 1], ['characters', 'ch', 'chtab', 'users', true, 2], ['items', 'it', 'ittab', 'parts', true, 3], ['places', 'pl', 'pltab', 'pin', false, 0], ['legend', 'lg', 'lgtab', 'info', false, 0]]);
  assert.ok(Object.isFrozen(KERNEL_TABS) && KERNEL_TABS.every(Object.isFrozen));
});

test('tabOrder: the pack names a subset and an order; places always stays, the legend is always last, unknown names are ignored', () => {
  const ids = u => tabOrder(u).map(t => t.id).join(',');
  assert.equal(ids(undefined), 'ev,ch,it,pl,lg');
  assert.equal(ids(null), 'ev,ch,it,pl,lg');
  assert.equal(ids([]), 'ev,ch,it,pl,lg');
  assert.equal(ids(['bogus']), 'ev,ch,it,pl,lg');
  assert.equal(ids(['legend']), 'ev,ch,it,pl,lg');
  assert.equal(ids(['characters', 'events']), 'ch,ev,pl,lg');
  assert.equal(ids(['items', 'legend', 'bogus']), 'it,pl,lg');   // items has its row since S6-3
  assert.equal(ids(['events', 'items', 'characters']), 'ev,it,ch,pl,lg');
  assert.equal(ids(['places', 'events']), 'pl,ev,lg');
  assert.equal(ids(['events', 'events', 'characters', 'events']), 'ev,ch,pl,lg');
  assert.equal(ids(['legend', 'characters']), 'ch,pl,lg');
  assert.equal(ids(['characters']), 'ch,pl,lg');
  assert.equal(ids('events'), 'ev,ch,it,pl,lg');   // not an array: the default
});

test('applyTo with a pack order: the drawer counts the tabs that keep it, the fallback follows the fallback order, not the display order', () => {
  const order = tabOrder(['characters', 'events']);
  const S = fakeSheet(['ch', 'ev', 'pl', 'lg'], { hidden: ['ev', 'ch', 'lg'] });
  applyTo(S, { vis: { ev: true, ch: true }, scene: false, card: false, layChip: false, um: null, legendOk: false }, order);
  assert.equal(S.drawerHidden, false);
  assert.equal(S.tab, 'ev', 'ev has fallback order 1 although ch is displayed first');
  applyTo(S, { vis: { ev: false, ch: false }, scene: false, card: false, layChip: false, um: null, legendOk: false }, order);
  assert.equal(S.drawerHidden, true);
});

test('S6-3: a visible Items tab keeps the drawer open and is the last fallback (ev, then ch, then it)', () => {
  const S = fakeSheet(IDS, { hidden: ['ev', 'ch', 'it', 'lg'] });
  applyTo(S, { vis: { ev: false, ch: false, it: true }, scene: false, card: false, layChip: false, um: null, legendOk: false }, KERNEL_TABS);
  assert.equal(S.drawerHidden, false);
  assert.equal(S.button('it').hidden, false);
  assert.equal(S.tab, 'it', 'nothing else is visible: the items tab is selected');
  applyTo(S, { vis: { ev: false, ch: true, it: true }, scene: false, card: false, layChip: false, um: null, legendOk: false }, KERNEL_TABS);
  assert.equal(S.tab, 'it', 'a selected visible tab stays selected');
  applyTo(S, { vis: { ev: false, ch: false, it: false }, scene: false, card: false, layChip: false, um: null, legendOk: false }, KERNEL_TABS);
  assert.equal(S.drawerHidden, true);
  const T = fakeSheet(IDS, { hidden: ['ev', 'ch', 'lg'] });
  assert.equal(firstFallback(T, KERNEL_TABS), 'it');
});
