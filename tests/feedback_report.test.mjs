// 「反馈」报告文本组装的单测：白名单字段之外的内容（尤其聊天文本/消息内容）不能进报告。
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReportText, REPORT_ALLOWED_KEYS } from '../map/app/feedback-report.mjs';
import * as logbuf from '../map/core/logbuf.mjs';

test('report includes the expected map-state fields', () => {
  const text = buildReportText({
    time: '2026-09-28T00:00:00.000Z', version: '0.9.7', build: 43, channel: 'follow',
    selfCheckItems: [{ id: 'a', status: 'ok', zh: '正常', en: 'ok' }, { id: 'b', status: 'warn', zh: '有点问题', en: 'warn' }],
    mapId: 'tc_upper', layer: 'upper', location: '书房', mvuSnapshotStatus: 'ok',
    thVersion: '2.3.0', stVersion: '1.12.0', viewport: '1280x800',
    logLines: [{ t: 1700000000000, level: 'warn', text: 'something happened' }],
  });
  for (const s of ['0.9.7', '43', 'follow', '书房', 'tc_upper', 'upper', '2.3.0', '1.12.0', '1280x800', 'something happened', '⚠', '✓']) assert.ok(text.includes(s), `missing: ${s}`);
});

test('report never includes chat text / message content even if smuggled in via extra fields', () => {
  const secret = 'THIS-IS-PRIVATE-CHAT-MESSAGE-CONTENT-12345';
  const text = buildReportText({
    version: '0.9.7', mapId: 'x',
    chatText: secret, messages: [{ role: 'user', content: secret }], lastMessage: secret, chatHistory: [secret],
  });
  assert.ok(!text.includes(secret), 'chat content leaked into report');
  for (const k of ['chatText', 'messages', 'lastMessage', 'chatHistory']) assert.ok(!REPORT_ALLOWED_KEYS.includes(k));
});

test('report handles missing/empty info gracefully', () => {
  const text = buildReportText();
  assert.match(text, /反馈报告/);
  assert.match(text, /\(none\)/);
});

test('logbuf ring buffer keeps only the most recent 50 lines and never grows unbounded', () => {
  logbuf.clear();
  for (let i = 0; i < 80; i++) logbuf.push('log', [`line ${i}`]);
  const L = logbuf.lines();
  assert.equal(L.length, 50);
  assert.equal(L[0].text, 'line 30');
  assert.equal(L[L.length - 1].text, 'line 79');
  logbuf.clear();
});
