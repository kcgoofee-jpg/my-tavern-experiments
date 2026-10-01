// I-21 (K-R105): the scene header and the place of one floor. Synthetic fixture: the model's patches only update the clock, the
// card variable keeps the opening place (a study), every floor's text starts with a header naming the landing platform.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLife } from '../map/tavern/host-lifecycle.mjs';
import { MVUBridge } from '../map/tavern/mvu-bridge.mjs';
import { headerSpec, parseHeader, patchWrites, pickPlace } from '../map/core/scene-header.mjs';
import { profileOf } from '../map/core/profile.mjs';
import { useEden } from './helpers/eden-profile.mjs';
import { edenInputs } from './helpers/eden-inputs.mjs';
useEden();

const SPEC = { tag: 'time', sep: '·', fields: ['place', 'date', 'time'] };
const STUDY = '伊甸庄园·书房', PLATFORM = '降落平台', PATH = '世界.当前地点';
const known = new Set([STUDY, PLATFORM, '大厅']);
const resolves = p => known.has(p);
const hdr = (place, t) => `<time>${place}·1月2日·${t}</time>\n`;
const patchTime = t => `<UpdateVariable>[{"op":"replace","path":"/世界/当前时刻","value":"${t}"}]</UpdateVariable>`;
const patchPlace = p => `<UpdateVariable>[{"op":"replace","path":"/世界/当前地点","value":"${p}"}]</UpdateVariable>`;

test('headerSpec / parseHeader: field order, the place may contain the separator, the last block wins, no regex needed', () => {
  assert.deepEqual(headerSpec(SPEC), SPEC);
  assert.equal(headerSpec({ tag: 'time' }), null); assert.equal(headerSpec({ tag: '1x', fields: ['place'] }), null);
  assert.equal(headerSpec({ tag: 'time', fields: ['date', 'time'] }), null, 'place is required');
  assert.deepEqual(headerSpec({ tag: 'time', fields: ['place'] }), { tag: 'time', sep: '·', fields: ['place'] });
  assert.deepEqual(parseHeader(hdr(PLATFORM, '03:18') + 'text', SPEC), { place: PLATFORM, date: '1月2日', time: '03:18' });
  assert.equal(parseHeader(hdr(STUDY, '03:18'), SPEC).place, STUDY, 'surplus parts belong to the place');
  assert.equal(parseHeader('<time>A·d·t</time> mid <time>B·d·t</time>', SPEC).place, 'B', 'the last block');
  assert.equal(parseHeader('<timeline>A·d·t</timeline>', SPEC), null, 'another tag with the same prefix');
  assert.equal(parseHeader('<time class="x">A·d·t</time>', SPEC).place, 'A', 'attributes');
  assert.equal(parseHeader('no header', SPEC), null); assert.equal(parseHeader('<time>never closed', SPEC), null);
  assert.deepEqual(parseHeader('<h>1月2日|03:18|某处</h>', { tag: 'h', sep: '|', fields: ['date', 'time', 'place'] }), { date: '1月2日', time: '03:18', place: '某处' });
});

test('patchWrites: only a variable patch block naming the path counts', () => {
  assert.equal(patchWrites(patchPlace('x'), PATH), true);
  assert.equal(patchWrites(patchTime('03:00'), PATH), false);
  assert.equal(patchWrites('prose mentions "/世界/当前地点" outside a block', PATH), false);
  assert.equal(patchWrites(null, PATH), false);
});

test('pickPlace precedence: patch > header (resolves) > carried variable; no header spec = the variable as before', () => {
  const o = { spec: SPEC, path: PATH, resolves };
  assert.deepEqual(pickPlace({ ...o, mvu: STUDY, raw: patchTime('1') + hdr(PLATFORM, '1') }), { place: PLATFORM, source: 'header' });
  assert.deepEqual(pickPlace({ ...o, mvu: '大厅', raw: patchPlace('大厅') + hdr(PLATFORM, '1') }), { place: '大厅', source: 'patch' });
  assert.deepEqual(pickPlace({ ...o, mvu: STUDY, raw: hdr('某个不存在的地方', '1') }), { place: STUDY, source: 'mvu' }, 'a header place that names no node is ignored');
  assert.deepEqual(pickPlace({ ...o, mvu: STUDY, raw: 'no header' }), { place: STUDY, source: 'mvu' });
  assert.deepEqual(pickPlace({ ...o, mvu: '', raw: 'no header' }), { place: '', source: 'none' });
  assert.deepEqual(pickPlace({ ...o, resolves: undefined, mvu: STUDY, raw: hdr(PLATFORM, '1') }), { place: STUDY, source: 'mvu' }, 'resolver not ready yet');
  assert.deepEqual(pickPlace({ spec: null, path: PATH, resolves, mvu: STUDY, raw: hdr(PLATFORM, '1') }), { place: STUDY, source: 'mvu' }, 'parity without a header');
});

test('the first pack declares its header as vars data; schema 2 reads it into the profile', () => {
  const v = edenInputs().overlay.vars;
  assert.deepEqual(v.header, SPEC);
  assert.deepEqual(profileOf({ vars: { header: SPEC } }).header, SPEC);
  assert.equal(profileOf({ vars: { header: { tag: 'bad tag!' } } }).header, null);
  assert.equal(profileOf({}).header, null);
});

// ---- the bridge over a stream of floors ----
const stat = (loc, t) => ({ 世界: { 当前地点: loc, 当前日期: '1月2日', 当前时刻: t, 当日时段: '凌晨' }, 在场人物: {} });
const mk = (raw, loc, t) => ({ is_user: false, swipe_id: 0, mes: raw, variables: [{ stat_data: stat(loc, t) }] });
function env(chat) {
  globalThis.window = globalThis;
  globalThis.Mvu = { getMvuData: o => { const c = chat[o.message_id === 'latest' ? chat.length - 1 : o.message_id], v = c?.variables?.[0]; return v ? { stat_data: v.stat_data } : null; }, events: { VARIABLE_UPDATE_ENDED: 'v' } };
  globalThis.SillyTavern = { getContext: () => ({ name1: 'Tester', chatId: 'i21', characterId: 0, characters: [{ avatar: 'card.png' }] }), chat };
  globalThis.getLastMessageId = () => chat.length - 1;
  return () => { for (const k of ['Mvu', 'SillyTavern', 'getLastMessageId', 'injectPrompts', 'uninjectPrompts', 'window']) delete globalThis[k]; };
}
const LS = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };

test('floors with a header and a stale variable resolve to the header place (source header); a floor whose patch writes the place wins', async () => {
  const chat = [{ is_user: true, swipe_id: 0, variables: [] }], raws = [''];
  const done = env(chat);
  try {
    let top = 0;
    const B = new MVUBridge({ life: createLife(), storage: LS, wins: () => [globalThis], fallbackMembers: [], floorNow: () => top, lastRaw: () => raws[top], resolves });
    await B.mvuReady; B.refreshVarMap();
    const floors = [['03:00', hdr(PLATFORM, '03:00') + patchTime('03:00'), STUDY], ['03:10', hdr(PLATFORM, '03:10') + patchTime('03:10'), STUDY], ['03:20', hdr(PLATFORM, '03:20') + patchTime('03:20'), STUDY]];
    const got = [];
    for (const [t, raw, loc] of floors) { chat.push(mk(raw, loc, t)); raws.push(raw); top = chat.length - 1; B.invalidate(); B.refreshVarMap(); got.push([B.here(), B.hereSrc, B.hereWhy]); }
    assert.deepEqual(got, floors.map(() => [PLATFORM, 'header', 'header']), 'the stale variable never reaches the map');
    // per-floor: the same decision for every older floor
    for (let i = 1; i <= 3; i++) assert.deepEqual(B.floorPlace(i, raws[i]), { place: PLATFORM, source: 'header' });
    // the model now writes the location in this floor's patch: it wins over the header
    const raw = hdr(PLATFORM, '03:30') + patchPlace('大厅'); chat.push(mk(raw, '大厅', '03:30')); raws.push(raw); top = chat.length - 1; B.invalidate(); B.refreshVarMap();
    assert.equal(B.here(), '大厅'); assert.equal(B.hereSrc, 'mvu'); assert.equal(B.hereWhy, 'patch');
    assert.deepEqual(B.floorPlace(4, raw), { place: '大厅', source: 'patch' });
    // a later floor patches only the clock: the header takes over again
    const raw2 = hdr(PLATFORM, '03:40') + patchTime('03:40'); chat.push(mk(raw2, '大厅', '03:40')); raws.push(raw2); top = chat.length - 1; B.invalidate(); B.refreshVarMap();
    assert.equal(B.here(), PLATFORM); assert.equal(B.hereSrc, 'header');
  } finally { done(); }
});

test('parity: a chat without a header behaves as before (variable value, source mvu, no why)', async () => {
  const chat = [{ is_user: true, swipe_id: 0, variables: [] }, mk('plain text', STUDY, '03:00')];
  const done = env(chat);
  try {
    const B = new MVUBridge({ life: createLife(), storage: LS, wins: () => [globalThis], fallbackMembers: [], floorNow: () => 1, lastRaw: () => 'plain text', resolves });
    await B.mvuReady; B.refreshVarMap();
    assert.equal(B.here(), STUDY); assert.equal(B.hereSrc, 'mvu'); assert.deepEqual(B.floorPlace(1, 'plain text'), { place: STUDY, source: 'mvu' });
    const B2 = new MVUBridge({ life: createLife(), storage: LS, wins: () => [globalThis], fallbackMembers: [], floorNow: () => 1, lastRaw: () => hdr(PLATFORM, '03:00') });   // no resolver: the old behaviour
    await B2.mvuReady; B2.refreshVarMap(); assert.equal(B2.here(), STUDY);
  } finally { done(); }
});

test('status line: a carried-over variable that conflicts with the header is replaced by the header place', async () => {
  const chat = [{ is_user: true, swipe_id: 0, variables: [] }], calls = [];
  const done = env(chat);
  globalThis.injectPrompts = a => calls.push(...a); globalThis.uninjectPrompts = () => {};
  try {
    const raw = hdr(PLATFORM, '03:18') + patchTime('03:18'); chat.push(mk(raw, STUDY, '03:18'));
    const B = new MVUBridge({ life: createLife(), storage: LS, wins: () => [globalThis], fallbackMembers: [], floorNow: () => 1, lastRaw: () => raw, resolves });
    await B.mvuReady; B.refreshVarMap();
    const { createModesFlow } = await import('../map/tavern/modes-flow.mjs'), { createFacts } = await import('../map/tavern/feature-health.mjs');
    const MO = createModesFlow({ facts: createFacts(), floorNow: 0, mvuBridge: B, contextPipeline: { trips: [] }, scriptBase: '', chatId: () => 'i21', life: createLife(), lsGet: () => null,
      pushSoon() {}, recomputeSoon() {}, saveRoot() {}, userName: s => s, BASE: '', clock: {}, custom: null, customChat: null, get here() { return B.here(); }, regNow: null, statSig: '' });
    B.invalidate(); B.refreshVarMap(); MO.stateInject();
    const line = calls[calls.length - 1].content;
    assert.ok(line.startsWith(`[地图状态] 地点：${PLATFORM}`), line);
    assert.ok(!line.includes(STUDY), 'the carried-over place is not stated as a fact');
  } finally { done(); }
});
