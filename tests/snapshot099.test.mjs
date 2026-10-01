// MVU 快照选取（map/tavern/mvu-snapshot.mjs）：模拟酒馆 chat 数组 + MVU 写楼层变量的时序（docs/mvu-integration.md）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pickStat, WALK_MAX } from '../map/tavern/mvu-snapshot.mjs';
import { HOST_SRC } from './_host_src.mjs';

// 一楼 = { is_user, is_system, swipe_id, variables: [ {stat_data} | undefined per swipe ] }
const st = loc => ({ stat_data: { 世界: { 当前地点: loc } } });
const msg = (loc, o = {}) => ({ is_user: false, swipe_id: 0, variables: loc == null ? [] : [st(loc)], ...o });
const reader = chat => i => { const c = chat[i]; return c ? { vars: c.variables?.[c.swipe_id ?? 0], system: !!c.is_system, role: c.is_user ? 'user' : 'assistant' } : null; };
const pick = (chat, o) => pickStat(reader(chat), chat.length - 1, o);
const loc = r => r.stat?.世界?.当前地点 ?? null;

test('正常：最新楼有快照 → ok', () => {
  const chat = [msg('A'), msg('A', { is_user: true }), msg('B')];
  const r = pick(chat); assert.equal(r.state, 'ok'); assert.equal(loc(r), 'B'); assert.equal(r.floor, 2);
});

test('swipe：新 swipe 还没解析 → 生成中 pending 用上一楼；MVU 提交后 ok 用新 swipe', () => {
  const chat = [msg('A'), msg('A', { is_user: true }), msg('B')];
  chat[2].variables.push(undefined); chat[2].swipe_id = 1;          // MESSAGE_SWIPED 后、生成中
  let r = pick(chat, { generating: true }); assert.equal(r.state, 'pending'); assert.equal(loc(r), 'A');
  chat[2].variables[1] = st('C');                                     // MVU handleVariablesInMessage 写回
  r = pick(chat); assert.equal(r.state, 'ok'); assert.equal(loc(r), 'C');
  chat[2].swipe_id = 0;                                               // 左滑回旧 swipe：读回旧快照，不是 latest-global
  assert.equal(loc(pick(chat)), 'B');
});

test('重新生成（regen）：同楼替换，空快照期间不显示空白', () => {
  const chat = [msg('A'), msg('A', { is_user: true }), msg(null)];
  const r = pick(chat, { generating: true }); assert.equal(r.state, 'pending'); assert.equal(loc(r), 'A');
});

test('删楼：删掉最后一楼后回到上一楼的快照', () => {
  const chat = [msg('A'), msg('A', { is_user: true }), msg('B'), msg('B', { is_user: true }), msg('C')];
  chat.splice(3); const r = pick(chat); assert.equal(r.state, 'ok'); assert.equal(loc(r), 'B');
});

test('生成中被杀 / 断网：最后一楼只有半截正文没快照，且不在生成 → stale，显示上一份', () => {
  const chat = [msg('A'), msg('A', { is_user: true }), msg(null, { mes: '半截……' })];
  const r = pick(chat, { generating: false }); assert.equal(r.state, 'stale'); assert.equal(loc(r), 'A');
});

test('用户楼没被 MVU 写到：用上一楼，属正常', () => {
  const chat = [msg('A'), msg(null, { is_user: true })];
  const r = pick(chat); assert.equal(r.state, 'ok'); assert.equal(loc(r), 'A');
});

test('隐藏楼（is_system）跳过，与 getVariables latest 一致', () => {
  const chat = [msg('A'), msg('B'), msg('Z', { is_system: true })];
  assert.equal(loc(pick(chat)), 'B');
});

test('没有任何快照 → none；生成中 → pending', () => {
  assert.equal(pick([msg(null), msg(null)]).state, 'none');
  assert.equal(pick([msg(null)], { generating: true }).state, 'pending');
});

test('600 楼长聊天 + MVU 自动清理（留最近 20 楼 + 每 50 楼快照）：最后一楼断了也能在限度内找回', () => {
  const chat = Array.from({ length: 600 }, (_, i) => msg(i >= 580 || i % 50 === 0 ? 'L' + i : null, { is_user: i % 2 === 1 }));
  let r = pick(chat); assert.equal(loc(r), 'L599');
  for (let i = 560; i < 600; i++) chat[i].variables = [];              // 最近 40 楼快照全丢（例如恢复失败）
  chat[599].is_user = false;                                          // 最后一楼是 AI 回复（半截）
  let reads = 0; const rd = reader(chat); r = pickStat(i => (reads++, rd(i)), 599);
  assert.equal(loc(r), 'L550'); assert.equal(r.state, 'stale'); assert.ok(reads < 60);
  assert.ok(WALK_MAX >= 100);
});

test('eden-map.js 订阅了生成 / swipe 删除 / 前台恢复事件，并有未确认指示与幂等写', () => {
  const s = HOST_SRC;   // P2：快照选取与 VARIABLE_UPDATE_ENDED 在桥里
  for (const k of ['GENERATION_STARTED', 'GENERATION_ENDED', 'GENERATION_STOPPED', 'MESSAGE_SWIPE_DELETED', 'MESSAGE_SWIPED', 'MESSAGE_DELETED', 'MESSAGE_EDITED', 'CHAT_CHANGED', 'VARIABLE_UPDATE_ENDED', 'visibilitychange', "'online'"]) assert.ok(s.includes(k), k);
  assert.match(s, /em-unsure/); assert.match(s, /mvu-snapshot\.mjs/); assert.match(s, /幂等/);
});
