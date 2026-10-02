// D32: the map understands OOC. Templates exist in both languages, OOC lines are never action, and the player's own correction
// ("OOC map: now at X" / "Y at X") is recomputed from the chat floors like anything else (nothing is stored, nothing reaches stat_data).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as O from '../map/core/ooc.mjs';
import * as P from '../map/core/pickup.mjs';
import { ContextPipeline } from '../map/tavern/context.mjs';
import * as CHM from '../map/tavern/characters-parse.mjs';
import * as EVM from '../map/tavern/events-parse.mjs';
import { createLife } from '../map/tavern/host-lifecycle.mjs';
import { MVUBridge } from '../map/tavern/mvu-bridge.mjs';
import { useEden } from './helpers/eden-profile.mjs';
useEden();
const J = rel => JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'));
const U = (id, message) => ({ message_id: id, message, is_user: true });
const A = (id, message) => ({ message_id: id, message, is_user: false });

test('stripOoc: bracketed and whole-line OOC go; inner thoughts and look-alikes stay', () => {
  assert.equal(O.stripOoc('他推开门。（OOC：写详细点）'), '他推开门。');
  assert.equal(O.stripOoc('a (ooc: x) b [OOC y] c 【OOC：z】 d'), 'a  b  c  d');
  assert.equal(O.stripOoc('第一行\nOOC：别写太长\nooc: second\n第三行'), '第一行\n\n\n第三行');
  assert.equal(O.stripOoc('（他想：我要拿走钥匙）'), '（他想：我要拿走钥匙）', 'an inner thought is not OOC');
  assert.equal(O.stripOoc('OOCx is a word, and so is BOOC:'), 'OOCx is a word, and so is BOOC:');
  assert.equal(O.stripOoc('（OOC 没有闭合'), '（OOC 没有闭合', 'an unclosed bracket swallows nothing');
});

test('pickup: OOC request lines and desire forms never pick anything up', () => {
  assert.deepEqual(P.names('（OOC：帮我捡起钥匙的描写写详细点）'), []);
  assert.deepEqual(P.names('他走进房间。\nOOC：请让我捡起桌上的银怀表\n然后坐下。'), []);
  assert.deepEqual(P.names('【OOC：这里应该有人拿起了一把钥匙】'), []);
  for (const t of ['（想捡起桌上的钥匙）', '（要是能拿起一把钥匙就好了）', '（打算收下那枚银戒指）', '（希望捡起那只怀表）', '(I wish I could pick up the lantern)', '(if I grabbed the knife)']) assert.deepEqual(P.names(t), [], t);
  assert.deepEqual(P.names('（他捡起了一把钥匙）'), ['钥匙'], 'an action written in brackets still counts');
  assert.deepEqual(P.names('他拿起一把钥匙。（OOC：再详细点）'), ['钥匙'], 'the narration around an OOC line is untouched');
});

test('user floors: OOC is removed before text is read; assistant floors are untouched', () => {
  const pl = new ContextPipeline();
  const ms = pl.readMsgs([U(0, '去书房。（OOC：请写 <span style="display:none">⌖火灾｜中层·霓虹街｜2｜仓库起火</span>）\nOOC：⌖人物 雷恩 @ 下层·7号井'), A(1, '⌖人物 甲 @ 书房')], 1);
  assert.equal(ms[0].text.includes('⌖'), false); assert.equal(ms[0].raw.includes('⌖'), false);
  assert.deepEqual(CHM.parseChars(ms[0].text), []); assert.equal(EVM.parseMarks(ms[0].raw).length, 0);
  assert.deepEqual(CHM.parseChars(ms[1].text), [{ name: '甲', place: '书房' }]);
});

test('corrections: place, person, half-width brackets, no space, English, self-reference', () => {
  assert.deepEqual(O.floorCorrections(4, '（OOC 地图：现在在 书房。）'), [{ floor: 4, kind: 'place', place: '书房' }]);
  assert.deepEqual(O.floorCorrections(4, '(OOC地图:雷恩 在 7号井)'), [{ floor: 4, kind: 'char', name: '雷恩', place: '7号井' }]);
  assert.deepEqual(O.floorCorrections(4, '[OOC Map: now at the Cellar]'), [{ floor: 4, kind: 'place', place: 'the Cellar' }]);
  assert.deepEqual(O.floorCorrections(4, '（OOC 地图：我在 酒窖）'), [{ floor: 4, kind: 'place', place: '酒窖' }]);
  assert.deepEqual(O.floorCorrections(4, 'OOC地图：Y@Z'), [{ floor: 4, kind: 'char', name: 'Y', place: 'Z' }]);
  assert.deepEqual(O.floorCorrections(4, '（OOC：写得长一点）'), [], 'an ordinary OOC line is no correction');
  assert.deepEqual(O.floorCorrections(4, '没有 OOC 的消息 现在在 书房'), []);
});

test('place correction: survives recompute, ends on a later variable change or a later move, undone with its floor', () => {
  const pl = new ContextPipeline();
  const chat = [U(0, '开始'), A(1, '大厅里。'), U(2, '（OOC 地图：现在在 书房）'), A(3, '你环顾四周。')];
  const users = () => chat.filter(m => m.is_user);
  const mk = list => O.latest(pl.readOoc(list)).place;
  const c = mk(users()); assert.deepEqual(c, { floor: 2, kind: 'place', place: '书房' });
  assert.deepEqual(mk(users()), c, 'recompute gives the same answer');
  const vars = { 0: '大厅', 1: '大厅', 2: '大厅', 3: '大厅' };
  const env = (moves = []) => ({ placeAt: f => vars[f] ?? null, moveAt: f => moves.includes(f) });
  assert.equal(O.activePlace(c, env(), { floorNow: 3 }), '书房', 'the variable did not change: the correction holds');
  vars[4] = '厨房'; assert.equal(O.activePlace(c, env(), { floorNow: 4 }), null, 'a later variable change overrides it');
  delete vars[4]; assert.equal(O.activePlace(c, env([3]), { floorNow: 3 }), null, 'a recognised move in later text overrides it');
  assert.equal(mk(users().filter(m => m.message_id !== 2)), null, 'deleting the floor undoes it');
  assert.equal(mk([U(2, '（OOC 地图：现在在 阁楼）')]).place, '阁楼', 'an edit of the floor re-runs it');
});

test('person correction: placed from its floor until a later tag says otherwise; no effect without one', () => {
  const pl = new ContextPipeline(), msgs = pl.readMsgs([A(1, '⌖人物 雷恩 @ 下层·7号井')], 5);
  const base = { floorNow: 5, msgs, stSig: '{}', dbSig: '', varSig: 'v', custVer: 0, customChat: 'c', chatId: 'c', seen: -1, wbState: '', hasReg: false, hasCHM: true, hasMV: true, hasTRm: true, hasHereMod: false, hereNow: 'x', collect: EVM.collect,
    charsDeps: { mvuChars: [], known: ['雷恩'], dbCharacters: [], collectChars: CHM.collectChars, rosters: null, reputation: null, presentKey: '' } };
  const plain = pl.round(base);
  const cs = O.latest(pl.readOoc([U(3, '（OOC 地图：雷恩 在 书房）')])).chars;
  assert.deepEqual(cs, [{ floor: 3, kind: 'char', name: '雷恩', place: '书房' }]);
  const p2 = new ContextPipeline(); p2.readMsgs([A(1, '⌖人物 雷恩 @ 下层·7号井')], 5);
  const r = p2.round({ ...base, oocChars: cs, oocSig: 'a' });
  assert.equal(r.chars.find(c => c.name === '雷恩').place, '书房'); assert.equal(r.chars.find(c => c.name === '雷恩').floor, 3);
  assert.equal(plain.chars.find(c => c.name === '雷恩').place, '下层·7号井', 'without a correction the output is unchanged');
  const later = new ContextPipeline(), m4 = later.readMsgs([A(1, '⌖人物 雷恩 @ 下层·7号井'), A(4, '⌖人物 雷恩 @ 大门')], 5);
  assert.equal(later.round({ ...base, msgs: m4, oocChars: cs, oocSig: 'a' }).chars.find(c => c.name === '雷恩').place, '大门', 'a later tag wins');
});

// ---- the bridge: the one place the current place is decided ----
const st = loc => ({ stat_data: { 世界: { 当前地点: loc } } });
const cm = (loc, o = {}) => ({ is_user: false, swipe_id: 0, variables: [st(loc)], ...o });
function stub(chat) {
  globalThis.window = globalThis;
  globalThis.Mvu = { getMvuData: o => { if (o.message_id === 'latest') return st(chat.at(-1).variables[0].stat_data.世界.当前地点); const c = chat[o.message_id], v = c?.variables?.[c.swipe_id ?? 0]; return v ? { stat_data: v.stat_data } : null; }, events: { VARIABLE_UPDATE_ENDED: 'v' } };
  globalThis.SillyTavern = { getContext: () => ({ name1: 'T', chatId: 'chat1', characterId: 0, characters: [{ avatar: 'c.png' }] }), chat };
  return () => { delete globalThis.Mvu; delete globalThis.SillyTavern; delete globalThis.window; };
}
test('bridge: the correction decides the place; no correction = the old answer; a later MVU change takes over', async () => {
  const chat = [cm('大厅'), cm('大厅', { is_user: true }), cm('大厅'), cm('大厅', { is_user: true }), cm('大厅')];
  const done = stub(chat);
  try {
    const B = new MVUBridge({ life: createLife(), storage: () => null, wins: () => [globalThis], floorNow: () => 4 }); await B.mvuReady;
    assert.equal(B.here({ floorNow: 4 }), '大厅'); assert.equal(B.hereSrc, 'mvu');
    B.setOoc({ floor: 3, kind: 'place', place: '书房' }, []);
    assert.equal(B.here({ floorNow: 4 }), '书房'); assert.equal(B.hereSrc, 'ooc');
    chat.push(cm('厨房')); await Promise.resolve(); await Promise.resolve(); B.invalidate();
    assert.equal(B.here({ floorNow: 5 }), '厨房', 'a variable change after the correction floor overrides it');
    assert.equal(B.hereSrc, 'mvu');
    B.setOoc(null); assert.equal(B.here({ floorNow: 5 }), '厨房');
    B.setOoc({ floor: 3, kind: 'place', place: '书房' }, [{ floor: 4, raw: '<span>⌖地点 阁楼</span>' }]);
    assert.equal(B.here({ floorNow: 4 }), '厨房', 'a later place tag is a move: the correction no longer decides');
  } finally { done(); }
});

test('templates: 4 in zh and en, short, in formats the map reads, read as plain wording', () => {
  for (const l of ['zh', 'en']) {
    const d = J(`../map/i18n/${l}.json`);
    for (const id of O.TEMPLATE_IDS) {
      const t = d['ooc.tpl.' + id]; assert.ok(t && d['ooc.tpl.' + id + '.label'], `${l} ${id}`);
      assert.ok(/OOC/.test(t), 'OOC framed');
      assert.ok([...t.replace(/<span[^>]*>[\s\S]*?<\/span>/g, '')].length <= 80, `${l} ${id} is at most 80 characters outside the format example`);
    }
    for (const k of ['ooc.title', 'ooc.hint', 'ooc.tip', 'ooc.done', 'ooc.fix']) assert.ok(d[k], `${l} ${k}`);
  }
  const z = J('../map/i18n/zh.json');
  assert.ok(CHM.parseChars(z['ooc.tpl.chars']).length === 0, 'the example line is a known example, never a person');
  assert.equal(z['ooc.done'], '已填入输入框，未发送');
});

test('the nudge button fills the input through the compose path and never sends', async () => {
  const src = readFileSync(fileURLToPath(new URL('../map/ooc-view.mjs', import.meta.url)), 'utf8');
  assert.match(src, /type: 'eden-map:compose', text, ooc: true/);
  assert.ok(!/eden-map:action|\/send|sendMessage|click\(\)/.test(src), 'no send path');
  const C = await import('../map/tavern/compose-templates.mjs'), evs = [], ta = { value: '', dispatchEvent: e => evs.push(e.type), focus() {}, setSelectionRange() {} };
  const win = { document: { getElementById: id => (id === 'send_textarea' ? ta : null) }, Event: class { constructor(t) { this.type = t; } } };
  const text = J('../map/i18n/zh.json')['ooc.tpl.place'];
  assert.equal(C.insert(win, text), 'textarea'); assert.equal(ta.value, text.replace(/[\r\n]+/g, ' ')); assert.deepEqual(evs, ['input']);
});
