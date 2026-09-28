// 通用化：设定包配置接口（map/core/pack.mjs）、eden 兼容（键 / 聊天变量不变）、示例包 town、事件分类可换、同步副本一致
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as PK from '../map/core/pack.mjs';
import * as EV from '../map/tavern/events.mjs';
import * as MV from '../map/tavern/mvu.mjs';
import * as ST from '../map/core/storage.mjs';
import * as AD from '../map/tavern/adapter.mjs';
import { HOST_SRC } from './_host_src.mjs';

const rd = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const js = p => JSON.parse(rd(p));

test('eden 清单是唯一定义（没有内置 EDEN 常量）；eden 的键与聊天变量原样（老用户数据不迁移也能读）', async () => {
  const m = js('map/packs/eden/manifest.json');
  assert.equal(PK.EDEN, undefined); assert.equal(PK.EDEN_RESOLVED, undefined);
  let asked = null; const R = await PK.load('eden', { fetchJSON: async u => { asked = u; return m; } });
  assert.equal(asked, 'packs/eden/manifest.json'); assert.equal(R.base, ''); assert.equal(R.chatVar, 'eden_map'); assert.equal(R.prefix, 'edenMap');
  assert.deepEqual(R.data, { maps: 'data/maps.json', world: 'data/world_markers.json', derived: 'data/derived.json', rooms: 'data/eden_estate_rooms.json', events: 'builtin' });
  assert.match(rd('map/viewer.html'), /<link rel="preload" as="fetch" crossorigin="anonymous" href="packs\/eden\/manifest\.json">/);
  assert.equal(PK.nsKey('edenMapFog', 'eden'), 'edenMapFog');
  assert.equal(PK.nsKey('edenMap:chat:1:fog', undefined), 'edenMap:chat:1:fog');
  assert.equal(PK.chatVarOf('eden'), 'eden_map');
  assert.deepEqual(PK.validate(m), []);
});

test('其它包：键换到 tcp.<id>.*，聊天变量默认 tc_<id>，路径补包目录', () => {
  assert.equal(PK.nsKey('edenMapFog', 'town'), 'tcp.town.Fog');
  assert.equal(PK.nsKey('edenMap:chat:x', 'town'), 'tcp.town.:chat:x');
  assert.equal(PK.nsKey('eden_custom_portraits', 'town'), 'eden_custom_portraits');   // 不是我们的键：不动
  assert.equal(PK.chatVarOf('my-town'), 'tc_my_town');
  const r = PK.resolve(js('map/packs/town/manifest.json'));
  assert.equal(r.data.maps, 'packs/town/maps.json'); assert.equal(r.chatVar, 'tc_town'); assert.equal(r.features.world, false);
  const reg = PK.rebaseRegistry(js('map/packs/town/maps.json'), r.base);
  assert.equal(reg.maps.town_hill.base, 'packs/town/art/town_hill.dzi'); assert.equal(reg.maps.town_hill.data, 'packs/town/town_hill.json');
  const mem = new Map(), ls = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k), key: i => [...mem.keys()][i], get length() { return mem.size; } };
  PK.nsStore(ls, 'town').setItem('edenMapLine', 'cn'); assert.deepEqual([...mem.keys()], ['tcp.town.Line']);
  assert.equal(PK.nsStore(ls, 'eden'), ls);
  mem.set('edenMap:chat:a:fog', '{}'); mem.set('other', '1');
  const ns = PK.nsStore(ls, 'town'), seen = []; for (let i = 0; i < ns.length; i++) seen.push(ns.key(i));
  assert.deepEqual(seen, ['edenMapLine', null, 'other'], '预算遍历：本包键还原、eden 键藏起来');
});

test('清单校验：拒收外链、上跳路径、坏 id；load 检查 id 与目录一致', async () => {
  assert.ok(PK.validate({ id: 'X', schema: 1, title: 't', data: { maps: 'm.json' } }).length);
  assert.ok(PK.validate({ id: 'ok', schema: 1, title: 't', data: { maps: 'https://evil/m.json' } }).length);
  assert.ok(PK.validate({ id: 'ok', schema: 1, title: 't', data: { maps: '../m.json' } }).length);
  await assert.rejects(PK.load('town', { fetchJSON: async () => ({ ...js('map/packs/town/manifest.json'), id: 'other' }) }));
  const p = await PK.load('town', { fetchJSON: async () => js('map/packs/town/manifest.json') });
  assert.equal(p.id, 'town');
  assert.equal(PK.currentId({ location: { search: '?pack=town' } }), 'town');
  assert.equal(PK.currentId({ location: { search: '?pack=../x' } }), 'eden');
  assert.equal(PK.currentId({ __tcPack: { id: 'town' }, location: { search: '' } }), 'town');
});

test('同步副本一致：viewer.html 首帧前置、宿主 eden-map.js 的 NS 与 core/pack.mjs 同一规则', () => {
  const v = rd('map/viewer.html'), h = HOST_SRC;
  for (const src of [v, h]) {
    assert.match(src, /\/\^\[a-z\]\[a-z0-9_-\]\{1,31\}\$\//, 'id 规则');
    assert.match(src, /'tcp\.' \+ (window\.__packId|PACK_ID) \+ '\.' \+ k\.slice\(7\)/, '前缀规则');
  }
  assert.equal(PK.ID_RE.source, '^[a-z][a-z0-9_-]{1,31}$');
  assert.match(h, /PACK_IN\?\.events\) m\.configure/); assert.match(h, /m\.setVarRoot\(/);
});

test('core/storage.mjs 按 globalThis.__packId 换前缀', () => {
  const mem = new Map(), S = { localStorage: { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: k => mem.delete(k) } };
  ST.set('edenMapFog', '1', S); assert.ok(mem.has('edenMapFog'));
  globalThis.__packId = 'town';
  try { ST.set('edenMapFog', '1', S); assert.ok(mem.has('tcp.town.Fog')); assert.equal(ST.get('edenMapFog', null, S), '1'); }
  finally { delete globalThis.__packId; }
});

test('事件分类可换：town 的 3 类解析、落层；恢复后天城分类原样', () => {
  const before = { g: Object.keys(EV.GROUPS).length, c: Object.keys(EV.CATS).length, l: [...EV.LAYERS] };
  EV.configure(js('map/packs/town/events.json'), 'town');
  try {
    assert.deepEqual(EV.GROUP_ORDER, ['市政', '灾害', '天气']);
    assert.equal(EV.catOf('起火了'), '火灾'); assert.equal(EV.catOf('巡空令'), '其他');
    const r = EV.parseMarks('<span style="display:none">⌖风暴｜雾港镇·码头·灯塔｜3｜大风封港｜港务所</span>');
    assert.equal(r.length, 1); assert.equal(r[0].layer, '码头'); assert.equal(r[0].place, '灯塔'); assert.equal(r[0].grp, '天气');
    assert.equal(EV.parseMarks('⌖火灾｜鱼市｜2｜仓库起火')[0]?.layer, '码头', '地名推断层');
    assert.equal(EV.parseMarks('⌖火灾｜天城·下层·7号井｜2｜x').length, 0, '别的卡的地名不上图');
    assert.equal(EV.LAYER_MAP.码头, 'town_harbour');
    assert.match(EV.summarize([{ layer: '码头', tier: 'live', closed: false, place: '鱼市', cat: '火灾', lvl: 2, text: 'x', src: '' }], '码头'), /^\[雾港镇事态/);
  } finally { EV.configure(null); }
  assert.deepEqual({ g: Object.keys(EV.GROUPS).length, c: Object.keys(EV.CATS).length, l: [...EV.LAYERS] }, before);
  assert.equal(EV.parseMarks('⌖火灾｜天城·下层·7号井｜2｜仓库起火')[0].layer, '下层');
});

test('坏的事件分类退回内置（不拖垮启动）', () => {
  EV.configure({ groups: {}, types: {}, layers: [] }, 'bad');
  assert.equal(EV.packId, 'eden'); assert.equal(EV.LAYER_MAP.下层, 'tc_low');
});

test('聊天变量顶层键 / 世界书名可换（默认 eden 原名）', () => {
  assert.equal(MV.VAR_ROOT, 'eden_map'); assert.equal(MV.WB_NAME, '伊甸地图·自定义');
  try { assert.equal(MV.setVarRoot('tc_town'), 'tc_town'); assert.equal(MV.setVarRoot('bad key'), 'tc_town'); assert.equal(MV.setWbName('雾港镇'), '雾港镇·自定义'); }
  finally { MV.setVarRoot('eden_map'); MV.setWbName('伊甸地图'); }
  assert.equal(MV.WB_NAME, '伊甸地图·自定义');
});

test('tools/check_pack.py：全部包通过', () => {
  const out = execFileSync('python3', ['tools/check_pack.py'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  assert.match(out, /town：通过/); assert.match(out, /eden：通过/);
});

test('清单 vars：换 MVU 默认路径（其余清空、按字段名自动发现）', () => {
  const keep = { ...AD.DEFAULT_MAP };
  try { AD.useDefaults({ location: '状态.地点', nope: 'x' }); assert.equal(AD.DEFAULT_MAP.location, '状态.地点'); assert.equal(AD.DEFAULT_MAP.outfit, ''); assert.ok(!('nope' in AD.DEFAULT_MAP)); }
  finally { Object.assign(AD.DEFAULT_MAP, keep); }
});
