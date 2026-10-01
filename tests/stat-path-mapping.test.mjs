// node tests/adapter095.test.mjs —— v0.9.5 变量映射（换卡兼容，map/tavern/stat-path-mapping.mjs）。中性的占位数据
import assert from 'node:assert/strict';
import * as A from '../map/tavern/stat-path-mapping.mjs';
import * as V from '../map/tavern/mvu-readers.mjs';
import { useEden } from './helpers/eden-profile.mjs';
useEden();   // the first pack's variable and roster declarations (its overlay blocks); the engine itself names no card
let n = 0; const t = (name, f) => { f(); n++; console.log('ok', name); };
const CARD = { 世界: { 当前地点: '甲地', 当前时刻: '08:00', 当日时段: '日间', 当前日期: 'x' }, 主角: { 着装: { 衣服: 'a' } } };
const OTHER = { world: { location: 'Town', time: '09:30', date: 'd1' }, hero: { outfit: 'coat', reputation: 40 }, present: { Ann: { role: 'guide' } } };
t('默认路径存在：照用', () => { const m = A.detect(CARD); assert.equal(m.location, '世界.当前地点'); assert.equal(m.outfit, '主角.着装'); });
t('别的卡：按字段名自动找', () => {
  const m = A.detect(OTHER); assert.equal(m.location, 'world.location'); assert.equal(m.time, 'world.time'); assert.equal(m.date, 'world.date');
  assert.equal(m.present, 'present'); assert.equal(m.reputation, 'hero.reputation'); assert.equal(m.outfit, 'hero.outfit');
});
t('用户指定覆盖自动；只收已知字段', () => {
  const m = A.effective({ location: 'hero.outfit', junk: 'x' }, OTHER); assert.equal(m.location, 'hero.outfit'); assert.ok(!('junk' in m));
});
t('路径清单：表只列本身', () => {
  const ps = A.paths(OTHER).map(p => p.path + ':' + p.kind); assert.ok(ps.includes('present:table')); assert.ok(!ps.some(p => p.startsWith('present.Ann')));
});
t('读法', () => {
  assert.equal(A.mode(false, CARD, A.detect(CARD)), 'tags'); assert.equal(A.mode(true, CARD, A.detect(CARD)), 'mvu');
  assert.equal(A.mode(true, { a: 1 }, A.detect({ a: 1 })), 'mvu-partial');
});
t('映射接到读法上：时间、着装、在场表', () => {
  const m = A.detect(OTHER); assert.equal(V.worldTime(OTHER, m).time, '09:30');
  assert.deepEqual(V.presentList(OTHER, m.present), [{ name: 'Ann', place: '' }]);
});
t('按卡存本机', () => {
  const st = { d: {}, getItem(k) { return this.d[k] ?? null; }, setItem(k, v) { this.d[k] = v; }, removeItem(k) { delete this.d[k]; } };
  A.writeUser(st, 'card.png', { location: 'a.b' }); assert.deepEqual(A.readUser(st, 'card.png'), { location: 'a.b' }); assert.deepEqual(A.readUser(st, 'other'), {});
  A.writeUser(st, 'card.png', {}); assert.equal(st.getItem(A.storeKey('card.png')), null);
});
console.log(`${n} passed`);
