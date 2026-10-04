// PLACE-1b（D44 docs/place-record.md 附录 B）：键跟着记录走（migrateKeys 接上 loadCustom 与各处读者）、一个编辑器、记录卡与档案卡、3D 标注唯一。
// 纯函数在这里对拍；界面部分钉住「哪个模块负责什么」（源码级断言），行为由 tools/browser/{place_tab,place_archive,place_edit,estate_labels_unique}.mjs 验。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadPack } from '../tools/place_records.mjs';
import * as P from '../map/core/place-record.mjs';
import * as CR from '../map/core/custom-record.mjs';
import * as CB from '../map/core/custom-book.mjs';
import * as MV from '../map/tavern/mvu-readers.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const rd = f => readFileSync(ROOT + f, 'utf8');
const PACK = loadPack('eden');
const NAMES = ['主人书房', '惩罚室', '储藏室', '主调教室'];

test('idFinder: a place name (or one of its other names) resolves to the record id; an unknown word does not', () => {
  const idOf = P.idFinder(PACK);
  for (const n of NAMES) { const id = idOf(n); assert.ok(id, n); assert.equal(P.placeRecord(PACK, id).name, n, n); }
  assert.equal(idOf('不在地图上的地方'), null);
  const warm = idOf('温室');   // 一个地标的名字落在它所属的室外区域那条记录上
  assert.ok(warm && (P.placeRecord(PACK, warm).alias || []).includes('温室'), '温室 resolves through the record it belongs to');
});

test('migrateKeys: standard-name keys become record ids, the name travels in 标, undo keys follow, nothing is lost', () => {
  const idOf = P.idFinder(PACK);
  const before = { items: { 主人书房: { 类: 'room', 名: '星图室', 用途: '看星图', 别名: ['书房'] }, 不认识的地方: { 类: 'landmark', 说明: '还在' } },
    同步世界书: true, 撤销: [{ key: '主人书房', prev: { 类: 'room', 名: '书房' }, at: 3 }] };
  const { custom, moved } = CR.migrateKeys(before, idOf);
  assert.equal(moved, 1);
  const id = idOf('主人书房');
  assert.deepEqual(custom.items[id].名, '星图室');
  assert.equal(custom.items[id].标, '主人书房', 'the pack name is kept so every reader can still show the place');
  assert.deepEqual(custom.items[id].别名, ['书房']);
  assert.ok(custom.items['不认识的地方'], 'a key that cannot be resolved keeps its own key');
  assert.equal(custom.撤销[0].key, id);
  assert.equal(custom.撤销[0].prev.标, '主人书房');
  assert.equal(CR.migrateKeys(before, idOf).custom.items[id].说明, undefined);
  // 幂等：再来一次不动
  assert.equal(CR.migrateKeys(custom, idOf).moved, 0);
  // 两项合并到同一个 id 时，已在 id 下的那项逐字段优先
  const two = { items: { 惩罚室: { 类: 'room', 用途: 'A' }, room_b2_03: { 类: 'room', 用途: 'B' } } };
  const m2 = CR.migrateKeys(two, idOf).custom;
  assert.equal(Object.keys(m2.items).length, 1); assert.equal(m2.items.room_b2_03.用途, 'B');
});

test('normCustom keeps 标, and setCustom writes it when the caller passes the pack name (the key is a node id)', () => {
  const c = MV.normCustom({ items: { room_f1_30: { 类: 'room', 标: '主楼梯（塔楼）', 名: '塔楼楼梯' } } });
  assert.equal(c.items.room_f1_30.标, '主楼梯（塔楼）');
  const r = MV.setCustom({}, 'room_f1_30', { std: '主楼梯（塔楼）', name: '塔楼楼梯', source: 'manual' });
  assert.equal(r.items.room_f1_30.标, '主楼梯（塔楼）');
  assert.equal(r.items.room_f1_30.名, '塔楼楼梯');
  // idOf：写入时把标准名换成节点 id
  const viaName = MV.setCustom({}, '主楼梯（塔楼）', { note: '夜里不走' }, P.idFinder(PACK));
  assert.ok(viaName.items.room_f1_30, 'the name is resolved to the node id'); assert.equal(viaName.items.room_f1_30.用途, '夜里不走');
});

test('readers of the custom data show the place by its pack name, whatever the key is', () => {
  const c = { items: { room_f1_30: { 类: 'room', 标: '主楼梯（塔楼）', 名: '塔楼楼梯', 别名: ['大楼梯'] } } };
  assert.equal(MV.displayName(c, 'room_f1_30'), '塔楼楼梯');
  assert.equal(MV.stdOf(c, 'room_f1_30'), '主楼梯（塔楼）');
  assert.deepEqual(MV.aliasMap(c, ['room']), { 塔楼楼梯: '主楼梯（塔楼）', 大楼梯: '主楼梯（塔楼）' }, 'the resolver gets names, not ids');
  assert.equal(MV.findKey(c, '塔楼楼梯'), 'room_f1_30');
  assert.equal(MV.findKey(c, '主楼梯（塔楼）'), 'room_f1_30', 'the pack name finds the item too');
  assert.ok(!JSON.stringify(MV.summarizeCustom(c)).includes('room_f1_30'), 'the injected text never shows an id');
  assert.ok(MV.summarizeCustom(c).includes('主楼梯（塔楼）'));
});

test('the story tags write through the same resolver: ⌖改名 / ⌖用途 land on the record id, the toast still names the place', () => {
  const idOf = P.idFinder(PACK), r = MV.applyTags({}, [{ floor: 3, text: '⌖改名 主人书房 → 星图室' }], -1, () => 'room', idOf);
  assert.deepEqual(r.applied.map(a => a.key), [idOf('主人书房')]);
  assert.equal(r.applied[0].name, '主人书房');
  assert.equal(r.custom.items[idOf('主人书房')].名, '星图室');
  assert.equal(MV.tagToast(r.applied[0]), '主人书房 改名为「星图室」');
  // 更晚楼层的手动改动不被旧标签覆盖（PLACE-1a 的规则没变）：这里再补一手动的 9 楼，再重放 3 楼的标签
  const manual = MV.setCustom(r.custom, idOf('主人书房'), { name: '观星室', source: 'manual', floor: 9 });
  const late = MV.applyTags(manual, [{ floor: 3, text: '⌖改名 主人书房 → 星图室' }], -1, () => 'room', idOf).custom;
  assert.equal(late.items[idOf('主人书房')].名, '观星室');
});

test('the chat\'s own book: one index + one entry per place, named and keyed by the pack name, body = entryText of the record', () => {
  const id = P.idFinder(PACK)('主人书房');
  const c = MV.normCustom({ items: { [id]: { 类: 'room', 标: '主人书房', 名: '星图室', 说明: '夜里在这里看星图。' } } });
  const es = CB.bookEntries(c, { pack: PACK, lang: 'zh', entryName: '地图自定义' });
  assert.equal(es[0].name, '地图自定义');
  assert.ok(es[0].content.includes('主人书房'), 'the index shows names, not ids'); assert.ok(!es[0].content.includes(id));
  const e = es[1];
  assert.equal(e.name, '地点-星图室', '条目名跟着玩家起的名字');
  assert.ok(e.strategy.keys.includes('主人书房') && !e.strategy.keys.includes(id), 'the trigger words are names');
  assert.equal(e.extra.eden_place, id, 'the entry still points at the record');
  assert.ok(e.content.includes('本聊天里以此为准。') && e.content.includes('夜里在这里看星图。'));
  assert.equal(e.content, P.entryText(P.placeRecord(PACK, id, c), { lang: 'zh', lead: '本聊天里以此为准。' }), 'the body is the one entryText of the record');
  assert.ok(CB.hasContent(c));
});

test('PLACE-1b wiring: loadCustom migrates the keys, kindOf and the extension API resolve names, the tag replay gets the resolver', () => {
  const rs = rd('map/tavern/root-store.mjs');
  assert.match(rs, /CR\.migrateKeys\(custom, km\.idOf\)/, 'loadCustom 换键');
  assert.match(rs, /async function placeKeyOf\(/, '一个词 → 键（宿主那一侧）');
  assert.match(rs, /kindOf\(key\)[\s\S]{0,120}keyName\(key\)/, 'kindOf 按包里的原名判类别');
  assert.match(rs, /placeKeyOf,/, '接口在返回的接口名单里（tests/host_split 对拍）');
  const ha = rd('map/tavern/host-api.mjs');
  assert.match(ha, /const \{ key: k, std \} = await placeKeyOf\(key\)/, '扩展接口 setCustom 走同一个解析');
  const ctx = rd('map/tavern/context.mjs');
  assert.match(ctx, /customTags\(custom, msgs, floorNow, kindOf, idOf\)/);
  assert.match(ctx, /mvuReaders\.applyTags\(custom, \[m\], m\.floor - 1, kindOf, idOf\)/);
  const cv = rd('map/custom-names-view.mjs');
  assert.match(cv, /const keyOf = key => \(MV\?\.findKey\(data, key\)/, '查看器每一处读都先找回键');
  assert.match(cv, /key = M\.findKey\(data, key\) \|\| key;/, '查看器每一处写也先找回键');
});

test('the places tab: the record card, the ancestor chain and what is next door; no credits, no empty floor rows', () => {
  const pc = rd('map/app/place-card.mjs');
  assert.match(pc, /export function placeTab\(/);
  assert.match(pc, /chainRow\(rec, pick\)/, '上级链');
  assert.match(pc, /nearbyRow\(rec, pick/, '附近');
  assert.match(pc, /recordActions\(rec, o\)/, '记录卡带两个动作');
  assert.match(pc, /openPlaceEditor\(rec\.id/, '一个「编辑」');
  const es = rd('map/app/estate-shell.mjs');
  assert.match(es, /e\.replaceChildren\(placeTab\(\{ record: hereRecord\(\), pick: pickPlace \}\),\s*\n?\s*roomList\(S\.rooms, S\.floors/, '3D 的 refreshList = 地点页 + 楼里的房间（U-FIX-9）');
  assert.doesNotMatch(es, /aboutSection|PACK\?\.credits/, '建筑标题 + 署名不再画；楼层列表回来了（探针 estate_generic 要求）');
  const dg = rd('map/app/drawer-glue.mjs');
  assert.match(dg, /e\.replaceChildren\(placeTab\(\{ record: hereRecord\(\), pick: id => openRecord\(id\) \}\)\)/, '二维的地点页也是同一块');
  assert.doesNotMatch(es, /PACK\?\.credits/, '署名不在地点页');
});

test('one editor: place, room, zone, building and person cards open the same module; the old scattered inputs are gone', () => {
  const ed = rd('map/app/place-editor.mjs');
  for (const k of ['pr.name', 'pr.use', 'pr.desc', 'pr.facts', 'pr.aliases']) assert.ok(ed.includes(k), k);
  assert.match(ed, /eden-map:place-edit/, '保存走 place-edit');
  assert.match(ed, /eden-map:place-undo/, '撤销走 place-undo');
  assert.match(ed, /baseOf\(/, '保存时记下包原文的指纹');
  assert.match(ed, /getCustomName\?\.\(key\)/, '旧的本机叫法只读预填');
  for (const f of ['map/characters-view.mjs', 'map/app/place-card.mjs', 'map/custom-names-view.mjs'])
    assert.match(rd(f), /place-editor\.mjs|placeEditorOpen|openPlaceEditor/, f + ' 用同一个编辑器');
  const cards = rd('map/app/estate-cards.mjs');
  assert.doesNotMatch(cards, /roomCustomBlockHTML|bindRoomCustomEvents|customBlock/, '房间卡里的本机名称 / 简介输入框去掉了');
  assert.doesNotMatch(rd('map/estate/main.js'), /roomCustomBlockHTML/, '三维页自己的房间卡 likewise');
  assert.doesNotMatch(rd('map/custom-names-view.mjs'), /function editHtml|#cuName|cuNoteCnt|function check\(show\)/, '设置页不再有自己的编辑表单');
  assert.doesNotMatch(rd('map/custom-dialog-view.mjs'), /editHtml/, '旧的表单构件也删了');
});

test('the archive card: by record id, one status line with the human-readable version, three states, merged, no emoji', () => {
  const wb = rd('map/worldbook-peek-view.mjs');
  assert.match(wb, /op: 'wb-peek', id: rec\?\.id \|\| ''/, '按记录 id 查');
  assert.match(wb, /\$\{esc\(uiTextOr\('wb\.capsule'/, '按钮文字经 esc（I-09）');
  assert.doesNotMatch(wb, /[📚📖]/u, '按钮没有表情符号');
  for (const k of ['wb.s_synced', 'wb.s_pending', 'wb.s_edited', 'wb.s_custom', 'wb.synced_at', 'wb.upstream', 'wb.mine']) assert.ok(wb.includes(k), k);
  assert.match(wb, /unwrap\(e\.content\)/, '正文去掉包裹标签行');
  assert.match(wb, /state === 'custom'/, '本聊天的改动与包里的原文合并显示');
  const pr = rd('map/core/protocol.mjs');
  assert.match(pr, /'eden-map:wb-peek': \[HOST_TO_VIEWER/, '回话形状已登记');
  assert.match(rd('map/tavern/host-tavernhelper.mjs'), /ship\?\.index\?\.\[id\]/, '宿主按发布物的 index 取条目');
});

test('the 3D page draws one label per node and per name on a floor (P3: 医疗与改造室 was labelled twice)', () => {
  const m = rd('map/estate/main.js');
  assert.match(m, /LBL_SEEN = new Set\(\)/, '台账');
  assert.match(m, /it\.label = LBL_SEEN\.has\(lk\) \? null :/, '同一层同一节点 / 名字只画一个标注');
  assert.match(m, /if \(!it\.label\) continue;/, 'relabel / updateLabelSet 跳过没有标注的那一项');
  const plan = rd('map/data/eden_estate_rooms.json');
  const rows = JSON.parse(plan).rooms;
  const med2 = rows.filter(r => r.name === '医疗与改造室');
  assert.equal(med2.length, 1, '数据侧已收口：这一间在表里只有一行（用户 2026-10-02 截图里是两行）');
  // 同一层里共用一个节点的几间房（14 间寝室）仍然都能点，只是共用一个标注
  const shared = new Map();
  for (const r of rows) { const k = `${r.floor}|${r.node}`; shared.set(k, (shared.get(k) || 0) + 1); }
  assert.ok([...shared.values()].some(n => n > 1), '表里确实有共用节点的几间房 —— 标注去重不影响它们各自可点');
});
