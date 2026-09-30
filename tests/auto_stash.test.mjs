// 任务一（第二步）：客观动作强制反思探测 + 空 MVU 结构下的强制入账。
// 断言四件事：
//   ① 正文里的物理获取动作（动词 + 具体物品名）认得出；抽象名词 / 泛指位置词 / 没有动词的句子一律不收；
//   ② 空 stat_data（卡里一个背包字段都没有）下：槽位探测 → 自建虚拟槽位 → 增量入账，事实不丢；
//   ③ 同一件东西只入账一次（水位 + 槽位幂等），玩家用掉之后不会被审计器复活；
//   ④ 前端可见性：落盘的那一行就是查看器抽屉与注入摘要读的同一份数据（inventory.rows / digestLine）。
// 全程 node 裸环境：没有酒馆、没有浏览器、没有 MVU。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scan, names, itemId, isItemName, VERBS, NOT_ITEMS, MAX_FACTS } from '../map/core/pickup.mjs';
import { slotProbe, slotDeclare, slotPut, slotSave, audit, claim } from '../map/core/ledger.mjs';
import { createSlotSink } from '../map/tavern/varsync.mjs';
import { norm as invNorm, put as invPut, rows as invRows, findRow, digestLine } from '../map/tavern/inventory.mjs';

// ---------------- ① 探测本身 ----------------
test('正文拾取：动词 + 具体物品名 → 事实；引号 / 量词 / 把字句 / 已知物品表四条路都通', () => {
  assert.deepEqual(names('他把黄铜钥匙拿到手。'), ['黄铜钥匙']);
  assert.deepEqual(names('把账本揣进怀里，转身就走。'), ['账本']);
  assert.deepEqual(names('她捡到一枚银怀表，擦了擦。'), ['银怀表']);
  assert.deepEqual(names('拾起地上的半截蜡烛。'), ['半截蜡烛']);
  assert.deepEqual(names('拿到「锈迹斑斑的黄铜钥匙」，推门而入。'), ['锈迹斑斑的黄铜钥匙']);
  assert.deepEqual(names('She picks up a silver pocket watch, and smiles.'), ['silver pocket watch']);
  assert.deepEqual(names('翻找一阵，终于拿到黄铜钥匙。', { known: ['黄铜钥匙'] }), ['黄铜钥匙'], '已知物品名不必带引号');
});

test('不误收：抽象名词 / 泛指位置词 / 没有获取动词的句子一律不记', () => {
  const noop = ['拿到了机会，也拿到了主动权。', '拿到了手。', '拿到了这里。', '他看了看那块石头。'];
  for (const t of noop) assert.deepEqual(names(t), [], t);
  assert.ok(NOT_ITEMS.includes('机会') && NOT_ITEMS.includes('主动权'));
  assert.deepEqual(names('他们讨论接下来的计划。'), [], '没有获取动词');
  assert.deepEqual(names(''), []); assert.deepEqual(names(null), []);
  assert.equal(isItemName('机会'), false); assert.equal(isItemName('扳手'), true);
});

test('事实形状：id 稳定 ASCII、authority 恒为 verified（地图侧客观判定，不是自称）、上限有界、同一件只出一条', () => {
  const f = scan('他把黄铜钥匙拿到手。', { floor: 12, place: '书房', map: 'tc_upper' });
  assert.equal(f.length, 1);
  assert.deepEqual(Object.keys(f[0]), ['kind', 'id', 'name', 'place', 'map', 'floor', 'authority', 'why']);
  assert.equal(f[0].kind, 'loot'); assert.equal(f[0].authority, 'verified');
  assert.match(f[0].id, /^x[a-z0-9]+$/, 'id 纯 ASCII（check_ascii / 变量键都用它）');
  assert.equal(f[0].id, itemId('黄铜钥匙'), '同名同物：id 由名字混出来');
  assert.deepEqual(names('拿到黄铜钥匙，又拿到黄铜钥匙。'), ['黄铜钥匙'], '同一句里重复提到 = 一件');
  const many = scan('拿到甲物，拿到乙物，拿到丙物，拿到丁物，拿到戊物，拿到己物，拿到庚物，拿到辛物。');
  assert.equal(many.length, MAX_FACTS, '一条正文最多认 MAX_FACTS 件（不把描写吸成清单）');
  assert.ok(VERBS.includes('拿到') && VERBS.includes('揣进'));
});

// ---------------- ② 空 MVU 结构下的强制入账（端到端：扫描 → 审计 → 槽位 → 仓库） ----------------
/** 宿主在 eden-map.js 里的同一条流水（抽出来按同一顺序跑，纯数据）：ledger.audit → claim → 落盘 */
function hostRound({ stat, inv, facts, settled, floor }) {
  const probe = slotProbe(stat);                       // ① 探路：宿主 stat_data 里有没有背包字段
  const declared = slotDeclare(null, probe, floor);
  const aud = audit(facts, { assets: Object.fromEntries(Object.entries(inv.items).map(([k, e]) => [k, e.名])) });
  const cl = claim(settled, aud.patches.filter(p => p.domain === 'assets'), { floor, branch: `${floor}:0` });
  let next = inv, wrote = 0;
  const landed = [];
  for (const p of cl.fresh) {                          // 补的是**单项**：正文事实没有藏物表条目也照写（动作已经发生）
    const r = invPut(next, { id: p.id, name: p.name, place: p.place || '', note: `正文拾取 · 第 ${floor} 楼`, qty: 1 });
    if (!r.changed) continue;
    next = r.inv; wrote++; landed.push(r.inv.items[p.id]);
  }
  const stored = {};
  const sink = createSlotSink({ declare: k => { stored[k] = {}; return true; }, put: (k, list) => { for (const x of list) stored[k][x.id] = { 名: x.名, 地点: x.地点 || '' }; return true; } });
  sink.bind(probe); sink.ensure(probe);
  for (const f of facts) sink.capture({ id: f.id, 名: f.name, 地点: f.place });
  const fl = sink.flush();
  return { probe, declared, aud, cl, inv: next, wrote, landed, slot: slotSave(slotPut(declared, facts.map(f => ({ id: f.id, name: f.name, place: f.place })), floor)), stored, fl, sink };
}

test('空 stat_data：探到虚拟槽位 → 自建「物品栏」→ 正文拾取强制落盘（仓库 + 槽位两处都有）', () => {
  const stat = {};                                     // 老旧 / 非标卡片：没有 物品栏 / 背包 / 道具
  const facts = scan('他把黄铜钥匙拿到手，又把账本揣进怀里。', { floor: 12, place: '书房' });
  assert.deepEqual(facts.map(f => f.name), ['黄铜钥匙', '账本']);
  const r = hostRound({ stat, inv: invNorm(null), facts, settled: { claimed: [], floor: null, branch: null }, floor: 12 });

  assert.deepEqual(r.probe, { key: '物品栏', path: '', virtual: true });
  assert.equal(r.declared.名, '物品栏'); assert.equal(r.declared.虚拟, true);
  assert.equal(r.aud.pending.length, 0, '认得出来 + 有视图 = 不进退而求其次的待结算');
  assert.equal(r.wrote, 2);
  // 抽屉与注入摘要读的是同一份仓库：两件都在，来源与楼号写进说明
  const rows = invRows(r.inv);
  assert.deepEqual(rows.map(x => x.名).sort(), ['账本', '黄铜钥匙']);
  assert.match(findRow(r.inv, '黄铜钥匙')[1].说明, /正文拾取 · 第 12 楼/);
  assert.equal(findRow(r.inv, '账本')[1].地点, '书房');
  assert.match(digestLine(r.inv), /黄铜钥匙/);
  // 虚拟槽位也真的落了盘（宿主 stat_data 一个字节都没写）
  assert.equal(r.fl.wrote, 2);
  assert.deepEqual(Object.keys(r.stored.物品栏).sort(), facts.map(f => f.id).sort());
  assert.deepEqual(stat, {}, '绝不往宿主 stat_data 里新开字段');
  assert.equal(r.slot.件, 2);
});

test('幂等与水位：同一件只补一次；再用一轮同一件不会重新长出来（用掉道具不被审计器复活）', () => {
  const stat = {};
  const facts = scan('他把黄铜钥匙拿到手。', { floor: 12, place: '书房' });
  const settled = { claimed: [], floor: null, branch: null };
  const a = hostRound({ stat, inv: invNorm(null), facts, settled, floor: 12 });
  assert.equal(a.wrote, 1);
  const b = hostRound({ stat, inv: a.inv, facts, settled, floor: 13 });   // 下一轮：同一件已在账上
  assert.equal(b.wrote, 0); assert.equal(b.aud.ok, 1);
  assert.equal(invRows(b.inv).length, 1);
  // 玩家用掉 / 丢掉：仓库里删掉，水位仍在 → 审计器不会把它复活
  const gone = { items: {}, seq: 1 };
  const c = hostRound({ stat, inv: gone, facts, settled, floor: 14 });
  assert.equal(c.wrote, 0, '水位记住补过了：删掉的东西不会被重新补回来');
  assert.equal(c.cl.repeated, 1, '同一件第二次出现 = 被水位判为重复（不再入账）');
  assert.equal(c.aud.patches.length, 1, '审计器当然还是看见缺口——挡住它的是水位，不是审计器');
  assert.equal(slotPut(slotDeclare(null, slotProbe(stat), 1), [{ id: facts[0].id, name: facts[0].name }], 2).added, 1);
  assert.equal(slotPut(slotPut(slotDeclare(null, slotProbe(stat), 1), [{ id: facts[0].id, name: facts[0].name }]), [{ id: facts[0].id, name: facts[0].name }]).added, 0);
});

// ---------------- ③ 宿主接线（源码级守卫：接线断了这条测试先红） ----------------
test('宿主接线：正文扫描接在本轮结算之前，且有界、按 id 去重、失败静默', () => {
  const src = readFileSync(new URL('../map/tavern/eden-map.js', import.meta.url), 'utf8');
  assert.match(src, /import\(SELF \+ 'core\/pickup\.mjs'\)/, '探测模块随宿主一起加载');
  assert.match(src, /scanPickups\(msgs, hereNow\);\s*\/\/[^\n]*\n\s*gate\(\)\?\.request\('sync', ledgerSync\)/, '先入账再放行结算闸门（读取期间不写变量）');
  assert.match(src, /lootFacts\.some\(x => x\?\.id === f\.id\)/, '同一件不重复入账');
  assert.match(src, /lootFacts\.length > 40/, '会话事实有界（长会话不涨内存）');
  assert.match(src, /p\?\.name \? \{ id: p\.id, name: p\.name/, '藏物表里没有这一件时用正文事实补一行（不凭空造东西）');
});
