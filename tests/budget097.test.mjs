// node tests/budget097.test.mjs —— A-13 本机存储预算（map/tavern/budget.mjs）、头像上限（characters.mjs setAvatarEx）、自动检查更新的判定（selfcheck.mjs）
import assert from 'node:assert/strict';
import * as BG from '../map/tavern/budget.mjs';
import * as C from '../map/tavern/characters.mjs';
import { autoCheckPlan, shouldPrompt, updatePromptText, updateVerdict, AUTO_EVERY } from '../map/tavern/selfcheck.mjs';

let n = 0; const t = (name, f) => { f(); n++; console.log('ok', name); };
// 有额度的假 localStorage（按 UTF-16 字节算），超了抛 QuotaExceededError
function mem(cap = Infinity) {
  const m = new Map(), used = () => [...m].reduce((a, [k, v]) => a + (k.length + v.length) * 2, 0);
  return { get length() { return m.size; }, key: i => [...m.keys()][i] ?? null, getItem: k => (m.has(k) ? m.get(k) : null), removeItem: k => { m.delete(k); },
    setItem(k, v) { v = String(v); const old = m.get(k); m.set(k, v); if (used() > cap) { if (old === undefined) m.delete(k); else m.set(k, old); const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } }, _m: m };
}
const img = (n = 1000) => 'data:image/webp;base64,' + 'A'.repeat(n);

t('chatOf：只认地图的按聊天键；卡自己的键不算', () => {
  assert.equal(BG.chatOf('edenMap:chat:abc:avatars'), 'abc');
  assert.equal(BG.chatOf('edenMap:chat:a:b:custom2'), 'a:b');
  assert.equal(BG.chatOf('edenMapSeen:xyz'), 'xyz');
  assert.equal(BG.chatOf('edenMapLang'), null);
  assert.equal(BG.chatOf('statusbar:chat:abc:avatars'), null);
});
t('sweep：聊天数超了按 LRU 清最久的；当前聊天和卡自己的键不动', () => {
  const st = mem(); st.setItem('card_own_state', 'x'.repeat(100)); st.setItem('edenMapLang', 'zh');
  for (let i = 0; i < 5; i++) { st.setItem(`edenMap:chat:c${i}:avatars`, '{}'); st.setItem(`edenMapSeen:c${i}`, '1'); BG.touch(st, 'c' + i, 1000 + i); }
  const r = BG.sweep(st, 'c0', 3);
  assert.deepEqual(r.dropped, ['c1', 'c2']);   // c0 最久但是当前聊天
  assert.equal(st.getItem('edenMap:chat:c1:avatars'), null); assert.equal(st.getItem('edenMapSeen:c2'), null);
  assert.ok(st.getItem('edenMap:chat:c0:avatars') && st.getItem('edenMap:chat:c4:avatars'));
  assert.equal(st.getItem('card_own_state').length, 100); assert.equal(st.getItem('edenMapLang'), 'zh');
});
t('safeSet：撞额度先腾别的聊天再写；腾不出来返回 quota，不抛', () => {
  const st = mem(20000); st.setItem('card_own', 'k'.repeat(3000));
  st.setItem('edenMap:chat:old:avatars', 'o'.repeat(5000)); BG.touch(st, 'old', 1);
  const r = BG.safeSet(st, 'edenMap:chat:now:custom2', 'n'.repeat(3000), 'now');
  assert.equal(r.ok, true); assert.ok(r.freed > 0); assert.equal(st.getItem('edenMap:chat:old:avatars'), null); assert.equal(st.getItem('card_own').length, 3000);
  const r2 = BG.safeSet(st, 'edenMap:chat:now:big', 'b'.repeat(20000), 'now');
  assert.deepEqual([r2.ok, r2.reason], [false, 'quota']); assert.equal(st.getItem('card_own').length, 3000);
});
t('measure：总量 / 地图 / 每聊天 / 头像字节', () => {
  const st = mem(); st.setItem('a', 'bb'); st.setItem('edenMap:chat:c:avatars', 'xx');
  const m = BG.measure(st); assert.equal(m.total, (1 + 2 + 22 + 2) * 2); assert.equal(m.ours, 48); assert.equal(m.avatars, 48); assert.equal(m.chats.c, 48);
});
t('头像：每聊天上限 → cap；已有的名字可以覆盖', () => {
  const st = mem();
  for (let i = 0; i < BG.AVATARS_PER_CHAT; i++) assert.equal(C.setAvatarEx(st, 'c', 'n' + i, img()).ok, true);
  assert.deepEqual(C.setAvatarEx(st, 'c', 'extra', img()), { ok: false, reason: 'cap' });
  assert.equal(C.setAvatarEx(st, 'c', 'n0', img(10)).ok, true);
  assert.equal(C.setAvatar(st, 'c', 'bad', 'javascript:1'), false);
});
t('头像：合计超了先清最久没用的聊天的头像（只清头像），还不够就 quota', () => {
  const st = mem(), big = img(140000);   // 每张约 280 KB（UTF-16）
  for (let i = 0; i < 5; i++) { C.setAvatarEx(st, 'old' + i, 'a', big); BG.touch(st, 'old' + i, 10 + i); st.setItem(`edenMap:chat:old${i}:custom2`, '{}'); }
  const r = C.setAvatarEx(st, 'now', 'a', big);
  assert.equal(r.ok, true); assert.equal(st.getItem('edenMap:chat:old0:avatars'), null);
  assert.equal(st.getItem('edenMap:chat:old0:custom2'), '{}');   // 别的键不因为头像预算被清
  assert.ok(BG.measure(st).avatars <= BG.AVATAR_TOTAL);
});
t('头像：写入撞浏览器额度 → quota（不抛，调用方提示）', () => {
  const st = mem(3000); assert.deepEqual([C.setAvatarEx(st, 'c', 'a', img(4000)).ok, C.setAvatarEx(st, 'c', 'a', img(4000)).reason], [false, 'quota']);
});
t('warnText：中 / EN 都有', () => { for (const r of ['quota', 'cap', 'vars', 'x']) { assert.ok(BG.warnText(r)); assert.ok(BG.warnText(r, true)); } });

// ---------- 自动检查更新 ----------
t('autoCheckPlan：关了 / 本地 / 本会话查过 → skip；6 小时内 → cached；否则 fetch', () => {
  const now = 1e12;
  assert.equal(autoCheckPlan({ enabled: false, channel: 'tag', now }), 'skip');
  assert.equal(autoCheckPlan({ channel: 'local', now }), 'skip');
  assert.equal(autoCheckPlan({ channel: 'follow', sessionDone: true, now }), 'skip');
  assert.equal(autoCheckPlan({ channel: 'follow', now }), 'fetch');
  assert.equal(autoCheckPlan({ channel: 'tag', cache: { at: now - AUTO_EVERY + 1000 }, now }), 'cached');
  assert.equal(autoCheckPlan({ channel: 'tag', cache: { at: now - AUTO_EVERY }, now }), 'fetch');
  assert.equal(autoCheckPlan({ channel: 'tag', cache: { at: now + 5000 }, now }), 'fetch');   // 时钟回拨
});
t('shouldPrompt：有新版且不是「此版本不再提示」的版本', () => {
  const v = updateVerdict('0.9.6', '0.9.7', 'tag');
  assert.equal(shouldPrompt(v, null), true); assert.equal(shouldPrompt(v, '0.9.7'), false); assert.equal(shouldPrompt(v, '0.9.6'), true);
  assert.equal(shouldPrompt(updateVerdict('0.9.7', '0.9.7', 'tag'), null), false); assert.equal(shouldPrompt({ status: 'fail' }, null), false);
});
t('updatePromptText：跟随分支 = 刷新；钉了版本 = 重新导入', () => {
  assert.match(updatePromptText('0.9.7', 'follow').how, /刷新/); assert.match(updatePromptText('0.9.7', 'tag').how, /重新导入.*v0\.9\.7/);
  assert.match(updatePromptText('0.9.7', 'tag', true).title, /v0\.9\.7/); assert.equal(updatePromptText('1.0.0', 'ref').skip, '此版本不再提示');
});
console.log(`${n} 项通过`);
