// I-17: replay acceptance of the follow fix, built from the values of the user's live chat (location 「光辉联邦废弃据点」,
// time 03:18 on 2088-01-02). Three checks over a three-floor stream: the location resolves through the realm alias (kept as
// written, not unmapped), the top-bar clock equals each floor's world time, and the status line carries both.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLife } from '../map/tavern/host-lifecycle.mjs';
import { MVUBridge } from '../map/tavern/mvu-bridge.mjs';
import { buildIndex, resolveHere } from './helpers/here-engine.mjs';
import { edenNames } from './helpers/eden-names.mjs';
import { useEden } from './helpers/eden-profile.mjs';
useEden();

const J = p => JSON.parse(readFileSync(new URL('../map/' + p, import.meta.url), 'utf8'));
const PLACE = '光辉联邦废弃据点', DATE = '新历2088年01月02日';
const FLOORS = [{ t: '02:41', p: '凌晨' }, { t: '03:05', p: '凌晨' }, { t: '03:18', p: '凌晨' }];
const stat = f => ({ 世界: { 当前地点: PLACE, 当前日期: DATE, 当前时刻: f.t, 当日时段: f.p }, 在场人物: {} });
const msg = f => ({ is_user: false, swipe_id: 0, variables: [{ stat_data: stat(f) }] });

function stubEnv(chat) {
  globalThis.window = globalThis;
  globalThis.Mvu = { getMvuData: o => { const c = chat[o.message_id === 'latest' ? chat.length - 1 : o.message_id], v = c?.variables?.[0]; return v ? { stat_data: v.stat_data } : null; }, events: { VARIABLE_UPDATE_ENDED: 'v' } };
  globalThis.SillyTavern = { getContext: () => ({ name1: 'Tester', chatId: 'i17', characterId: 0, characters: [{ avatar: 'card.png' }] }), chat };
  globalThis.getLastMessageId = () => chat.length - 1;
  return () => { for (const k of ['Mvu', 'SillyTavern', 'getLastMessageId', 'injectPrompts', 'uninjectPrompts', 'window']) delete globalThis[k]; };
}
const LS = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };

test('locate: the realm alias places 光辉联邦废弃据点 on the realm, remainder kept as written, not unmapped', () => {
  const idx = buildIndex(J('data/maps.json'), J('data/world_markers.json'), edenNames());
  const r = resolveHere(PLACE, idx);
  assert.ok(r, 'placed');
  assert.equal(r.map, 'world'); assert.equal(r.node, 'fed'); assert.equal(r.place, '光辉联邦'); assert.equal(r.via, 'alias');
  assert.ok(PLACE.includes('光辉联邦') && PLACE.includes('废弃据点'), 'the label the viewer shows is the text as written');
  assert.equal(idx.unmapped(PLACE), null, 'no 「未上图」 offer');
});

test('clock and status line follow each floor (line for the last floor: [地图状态] 地点：光辉联邦废弃据点；时间：新历2088年01月02日 03:18 凌晨)', async () => {
  const chat = [];
  const done = stubEnv(chat);
  const calls = [];
  globalThis.injectPrompts = a => calls.push(...a); globalThis.uninjectPrompts = () => {};
  try {
    const B = new MVUBridge({ life: createLife(), storage: LS, wins: () => [globalThis], fallbackMembers: [], floorNow: () => chat.length - 1, lastRaw: () => null });
    await B.mvuReady; B.refreshVarMap();
    const { createModesFlow } = await import('../map/tavern/modes-flow.mjs');
    const MO = createModesFlow({ mvuBridge: B, contextPipeline: { trips: [] }, scriptBase: '', chatId: () => 'i17', life: createLife(), lsGet: () => null,
      pushSoon() {}, recomputeSoon() {}, saveRoot() {}, userName: s => s, BASE: '', clock: {}, custom: null, customChat: null, here: PLACE, regNow: null, statSig: '' });
    chat.push({ is_user: true, swipe_id: 0, variables: [] });
    for (const f of FLOORS) {
      chat.push(msg(f)); B.invalidate(); B.refreshVarMap();
      const c = B.clock();
      assert.equal(c.time, f.t, `top-bar time at floor ${chat.length - 1}`);
      assert.equal(c.short, `1月2日 ${f.t}`);
      assert.equal(c.full, `${DATE} ${f.t} ${f.p}`);
      MO.stateInject();
      const last = calls[calls.length - 1];
      assert.equal(last.content, `[地图状态] 地点：${PLACE}；时间：${DATE} ${f.t} ${f.p}`, `status line at floor ${chat.length - 1}`);
    }
  } finally { done(); }
});
