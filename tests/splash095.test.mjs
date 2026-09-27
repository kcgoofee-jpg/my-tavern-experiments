// node tests/splash095.test.mjs —— v0.9.5 开场自检：每版显示一次、进度上限（不到全部完成不到 100）
import assert from 'node:assert/strict';
import * as S from '../map/tavern/splash.mjs';
let n = 0; const t = (name, f) => { f(); n++; console.log('ok', name); };
const mem = () => ({ d: {}, getItem(k) { return this.d[k] ?? null; }, setItem(k, v) { this.d[k] = String(v); } });
t('每个版本显示一次', () => {
  const st = mem(); assert.ok(S.shouldShow(st, '0.9.5')); S.markSeen(st, '0.9.5'); assert.ok(!S.shouldShow(st, '0.9.5')); assert.ok(S.shouldShow(st, '0.9.6'));
  assert.ok(S.shouldShow(st, null)); S.markSeen(st, null); assert.ok(!S.shouldShow(st, null));
});
t('进度上限：自检 35%，加载任务 65%；没全完到不了 100', () => {
  assert.equal(S.progressCap(0, 6, 0, 3), 0); assert.ok(S.progressCap(6, 6, 0, 3) < 50); assert.ok(S.progressCap(6, 6, 2, 3) < 97.1);
  assert.equal(S.progressCap(6, 6, 3, 3), 100); assert.equal(S.progressCap(6, 6, 0, 0), 100); assert.ok(S.progressCap(6, 6, 2.99, 3) <= 97);
});
console.log(`${n} passed`);
