// S6-2：卡自己的物品表（只读，K-R76）：mvu-readers.cardInventory 的读法、背包词表（core/vocab.mjs EXACT.inventory）带来的探路、
// 路径来源（vars.inventory 优先，否则探路找到的真字段，都没有 = null）、profile 带 paths.inventory。不往 stat_data 写任何东西。
import test from 'node:test';
import assert from 'node:assert/strict';
import { cardInventory, inventoryPath } from '../map/tavern/mvu-readers.mjs';
import { setProfile } from '../map/tavern/pack-profile.mjs';
import { slotProbe, SLOT_KEYS } from '../map/core/ledger.mjs';
import { exactWords } from '../map/core/vocab.mjs';
import { profileOf, profileFromV1, PATH_KEYS, KERNEL } from '../map/core/profile.mjs';

const frozen = o => { const f = v => { if (v && typeof v === 'object') { Object.values(v).forEach(f); Object.freeze(v); } return v; }; return f(o); };

test('以名字为键的对象：数字 = 数量，字符串 = 说明，对象 = 第一个数字与第一个字符串；MVU [值, 说明] 拆包', () => {
  const stat = frozen({ 背包: { 钥匙: 1, 药膏: [3, '治伤用'], 地图: '一张旧地图', 剑: { 耐久: '良好', 数量: 2, 备注: '锋利' }, 空手: null } });
  assert.deepEqual(cardInventory(stat, '背包'), { path: '背包', rows: [
    { name: '钥匙', qty: 1 }, { name: '药膏', qty: 3 }, { name: '地图', text: '一张旧地图' }, { name: '剑', qty: 2, text: '良好' }, { name: '空手' },
  ] });
});

test('列表：字符串 = 名字；对象按内核的名字词找名字字段，否则第一个字符串字段；第一个数字 = 数量', () => {
  const stat = { 资产: { 物品栏: ['钥匙', ' 药  膏 ', 5, ''] }, b: { items: [{ id: 'x', name: 'Brass Key', count: 2 }, { 名字: '怀表', 数量: 1 }, { desc: '无名字段', n: 4 }, { n: 1 }] } };
  assert.deepEqual(cardInventory(stat, '资产.物品栏').rows, [{ name: '钥匙' }, { name: '药 膏' }]);
  assert.deepEqual(cardInventory(stat, 'b.items').rows, [{ name: 'Brass Key', qty: 2 }, { name: '怀表', qty: 1 }, { name: '无名字段', qty: 4 }]);
  assert.deepEqual(cardInventory({ t: [['a', '说明'], 'b'] }, 't').rows, [{ name: 'a' }, { name: 'b' }], '列表里的 [值, 说明] 对拆成值');
});

test('上限：101 行 → 100；名字 ≤ 60 个码点、说明 ≤ 80；_ 与 $ 开头的键跳过', () => {
  const big = Object.fromEntries(Array.from({ length: 101 }, (_, i) => ['物' + i, i]));
  const r = cardInventory({ inv: big }, 'inv');
  assert.equal(r.rows.length, 100); assert.equal(r.rows[0].name, '物0'); assert.equal(r.rows.at(-1).name, '物99');
  const long = cardInventory({ inv: { ['😀'.repeat(70)]: '字'.repeat(120), _hidden: 1, $meta: { a: 1 }, 正常: 2 } }, 'inv');
  assert.equal([...long.rows[0].name].length, 60); assert.equal([...long.rows[0].text].length, 80);
  assert.deepEqual(long.rows.map(x => x.name).slice(1), ['正常']);
});

test('没有表 → null：路径空 / 不存在 / 不是表；空表 = 有表无行', () => {
  assert.equal(cardInventory({ a: 1 }, ''), null); assert.equal(cardInventory({ a: 1 }, 'b'), null); assert.equal(cardInventory({ a: 1 }, 'a'), null);
  assert.equal(cardInventory({ a: '文字' }, 'a'), null); assert.equal(cardInventory(null, 'a'), null); assert.equal(cardInventory({ a: {} }, 'a').rows.length, 0);
});

test('背包词表在内核词表里（core/vocab.mjs EXACT.inventory）：同样的词、同样的顺序；探路由它决定', () => {
  assert.deepEqual([...SLOT_KEYS], ['物品栏', '背包', '道具栏', '道具', '物品', '储物', '行囊', '仓库', 'inventory', 'backpack', 'items', 'bag', 'storage']);
  assert.deepEqual(exactWords('inventory', 'en'), ['inventory', 'backpack', 'items', 'bag', 'storage']);
  assert.deepEqual(exactWords('inventory', 'zh').slice(0, 2), ['物品栏', '背包']);
  const stat = { 世界: { 当前地点: 'x' }, 资产: { 背包: { 钥匙: 1 } } };
  const probe = slotProbe(stat);
  assert.deepEqual(probe, { key: '背包', path: '资产.背包', virtual: false });
  assert.deepEqual(cardInventory(stat, probe.path).rows, [{ name: '钥匙', qty: 1 }]);
});

test('路径：vars.inventory 优先；否则探路找到的真字段；虚拟 / 没有 = 空（卡没有物品表）', () => {
  try {
    setProfile(KERNEL);
    assert.equal(inventoryPath({ key: '背包', path: '资产.背包', virtual: false }), '资产.背包');
    assert.equal(inventoryPath({ key: '物品栏', path: '', virtual: true }), '');
    assert.equal(inventoryPath(null), '');
    setProfile(profileOf({ vars: { inventory: '主角.携带' } }));
    assert.equal(inventoryPath({ key: '背包', path: '资产.背包', virtual: false }), '主角.携带', '包写了就用包的');
    assert.equal(inventoryPath({ key: '物品栏', path: '', virtual: true }), '主角.携带', '没有真字段也用包的');
  } finally { setProfile(KERNEL); }
});

test('profile 带 paths.inventory（schema 2 与 schema 1 的清单 + 覆盖层）', () => {
  assert.equal(PATH_KEYS.at(-1), 'inventory');
  assert.equal(profileOf({}).paths.inventory, '');
  assert.equal(profileOf({ vars: { inventory: 'a.b' } }).paths.inventory, 'a.b');
  assert.equal(profileFromV1({ manifest: { vars: { inventory: 'm.n' } } }).paths.inventory, 'm.n');
  assert.equal(profileFromV1({ manifest: { vars: {} }, overlay: { vars: { inventory: 'o.p' } } }).paths.inventory, 'o.p', '覆盖层改得了');
  assert.equal(KERNEL.paths.inventory, '');
});
