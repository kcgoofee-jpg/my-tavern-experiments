// S6-2 对拍：迁移之后的统一背包，注入给模型的两行（摘要 + 槽位）与冻结的 v1 函数逐字相同；wireRows 与 v1 的行逐条相同；
// 30 份生成的 v1 根 + 两个会话夹具（加上一份 v1 仓库，逐轮跑 v1 一轮与新折叠）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as S from '../map/tavern/stash-store.mjs';
import * as R from '../map/tavern/stash-recompute.mjs';
import { slotLine, slotProbe } from '../map/core/ledger.mjs';
import { itemId } from '../map/core/pickup.mjs';
import { rng } from '../map/core/rng.mjs';
import * as V1 from './helpers/stash_store_v1_frozen.mjs';
import * as SL from './helpers/ledger_slot_v1_frozen.mjs';
import { newState, v1Round, v1Lines } from './helpers/loot_round_v1_frozen.mjs';

const NAMES = ['黄铜钥匙', '银怀表', '机密账本', '现金', '旧地图', '手电筒', '药膏', '半截蜡烛', '扳手', '怀表链', 'Brass Key', '旧卷·残页'];
const PLACES = ['', '书房', '客厅', '车库', '地下室', '中层·霓虹街'];
const NOTES = ['', '', '塞在书架第三层', '正文拾取 · 第 4 楼', '备用'];

/** 一份 v1 聊天变量根（用 v1 自己的函数造，所以形状就是真的 v1 写过的样子） */
function genRoot(seed) {
  const r = rng(seed), pick = a => a[Math.floor(r() * a.length)];
  const n = Math.floor(r() * 9);
  let inv = V1.norm(null);
  const used = new Set(), facts = [];
  for (let i = 0; i < n; i++) {
    const name = pick(NAMES); if (used.has(name)) continue; used.add(name);
    const kind = Math.floor(r() * 3);
    const id = kind === 0 ? undefined : kind === 1 ? itemId(name) : 's' + Math.floor(r() * 1e8).toString(36).slice(0, 7);
    const row = { id, name, place: pick(PLACES), hidden: r() < 0.3, qty: 1 + Math.floor(r() * 5), note: pick(NOTES) };
    if (r() < 0.3) row.map = 'estate';
    const put = V1.put(inv, row); inv = put.inv;
    if (r() < 0.6) facts.push({ id: id || Object.keys(inv.items).at(-1), name, place: row.place, floor: Math.floor(r() * 20) });
  }
  const root = { 自定义: { items: {} } };
  if (n || r() < 0.5) root.仓库 = inv;
  if (facts.length && r() < 0.8) {
    let slot = SL.slotDeclare(null, SL.slotProbe(r() < 0.7 ? {} : { 背包: {} }), 3);
    slot = SL.slotPut(slot, [...facts, { id: 'xextra', name: '账外的一件', floor: 9 }], 9);
    root.槽位 = SL.slotSave(slot);
  }
  return root;
}

test('30 份 v1 根：摘要、行、槽位文案逐字相同；id 与顺序保留；旧键不动', () => {
  let roots = 0, rowsTotal = 0, migratedN = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const root = genRoot(seed), before = JSON.stringify(root);
    const m = S.migrate(root, { msgIndex: 12 });
    const inv1 = V1.norm(root.仓库);
    assert.equal(JSON.stringify(root), before, `根 ${seed} 没被改`);
    assert.equal(m.migrated, !!(root.仓库 || root.槽位), `根 ${seed} 的 migrated`);
    assert.equal(S.digestLine(m.stash), V1.digestLine(inv1), `根 ${seed} 摘要`);
    assert.equal(S.digestLine(m.stash, 40), V1.digestLine(inv1, 40), `根 ${seed} 摘要（截断）`);
    assert.deepEqual(S.wireRows(m.stash), V1.rows(inv1), `根 ${seed} 的行`);
    assert.deepEqual(Object.keys(m.stash.items), Object.keys(inv1.items), `根 ${seed} 的 id`);
    assert.equal(m.stash.seq, inv1.seq, `根 ${seed} 的 seq`);
    assert.equal(slotLine(m.stash.slot), SL.slotLine(root.槽位), `根 ${seed} 槽位行`);
    for (const k of ['place', 'map', 'name']) for (const v of ['书房', 'estate', '钥匙']) assert.deepEqual(S.rows(m.stash, { [k]: v }).map(x => x.id), V1.rows(inv1, { [k === 'place' ? 'place' : k]: v }).map(x => x.id), `根 ${seed} 过滤 ${k}`);
    roots++; rowsTotal += Object.keys(inv1.items).length; migratedN += m.migrated ? 1 : 0;
  }
  assert.ok(roots === 30 && rowsTotal > 40 && migratedN > 20, `生成的根要有分量：${roots} 份、${rowsTotal} 行、${migratedN} 份迁移`);
});

const fixture = f => JSON.parse(readFileSync(new URL('./fixtures/sessions/' + f, import.meta.url), 'utf8'));

for (const f of ['session_a.json', 'session_b.json']) {
  test(`会话夹具 ${f}（加一份 v1 仓库与槽位）：逐轮的注入行与冻结的 v1 一轮相同`, () => {
    const fx = fixture(f), probe = slotProbe(fx.mvu.stat);
    const msgs = fx.messages.filter(m => m.role === 'assistant').map(m => ({ msgIndex: m.floor, text: m.text, place: fx.mvu.floors?.[m.floor]?.世界?.当前地点 || '' }));
    // 一份 v1 根：已有两件东西与一格槽位
    let inv = V1.put(V1.norm(null), { name: '旧账本', place: '书房', hidden: true }).inv;
    inv = V1.put(inv, { id: itemId('银怀表'), name: '银怀表', place: '客厅', note: '正文拾取 · 第 1 楼' }).inv;
    let slot = SL.slotPut(SL.slotDeclare(null, SL.slotProbe({}), 1), [{ id: itemId('银怀表'), name: '银怀表', place: '客厅', floor: 1 }], 1);
    const root = { 仓库: inv, 槽位: SL.slotSave(slot) };
    const v1 = newState(); v1.inv = V1.norm(root.仓库); v1.slot = root.槽位;
    let st = S.migrate(root, { msgIndex: msgs[0].msgIndex }).stash;
    assert.deepEqual(S.wireRows(st), V1.rows(v1.inv));
    const seen = [];
    for (const m of msgs) {
      seen.push(m);
      v1Round(v1, { text: m.text, msgIndex: m.msgIndex, place: m.place, worldRows: [], probe });
      st = R.step(st, seen, { worldNames: [], probe }).stash;
      const want = v1Lines(v1);
      assert.deepEqual({ digest: S.digestLine(st, 150), slot: slotLine(st.slot) }, want, `${f} 第 ${m.msgIndex} 楼之后`);
    }
    assert.ok(S.digestLine(st).includes('旧账本'), '迁移来的东西还在');
  });
}
