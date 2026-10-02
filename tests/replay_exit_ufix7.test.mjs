// U-FIX-7 (TT sweep-2): after leaving the replay bar the viewer kept the replayed place (「当前位置」 gone, the here highlight on the old floor's place):
// the host's push() only sends the place when it changed, and from the host's side it never did. tlExit sends the current place back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimelineFlow } from '../map/tavern/timeline-flow.mjs';

const el = () => ({ dataset: {}, setAttribute() {}, removeAttribute() {}, hidden: true, value: '', max: '', textContent: '', classList: { add() {}, remove() {} }, addEventListener(t, f) { (this.on ??= {})[t] = f; }, querySelector() { return el(); } });

test('leaving the replay bar re-sends the current place to the viewer', async () => {
  const parts = { '.em-tl-btn': el(), '.em-tl': el(), '.em-tl-r': el(), '.em-tl-v': el() };
  const posts = [];
  const host = { mvuBridge: { here: () => '伊甸庄园·主卧', groupsView: () => [], perFloorStat: () => null, mvuGet: () => undefined, varMap: {}, stageOrder: [], portraits: {} },
    scriptBase: new URL('../map/', import.meta.url).href, life: { dead: false }, post: m => posts.push(m), push: () => {}, root: { querySelector: s => parts[s] ?? el(), classList: { toggle() {} }, addEventListener() {} }, uiLang: 'zh',
    sendEvents: () => {}, sendTrips: () => {}, CHM: null, tripsParseModule: null, alive: true, chars: [], floorNow: 3, rep: null, roster: null };
  const TL = createTimelineFlow(host);
  for (let i = 0; i < 20 && !TL.timelineModule; i++) await new Promise(r => setTimeout(r, 10));
  parts['.em-tl-btn'].on.click();          // enter
  assert.equal(TL.tlOn, true);
  posts.length = 0;
  TL.tlExit();
  const here = posts.filter(p => p.type === 'eden-map:here');
  assert.equal(here.length, 1); assert.equal(here[0].value, '伊甸庄园·主卧'); assert.ok(!here[0].replay);
});
