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
import { profileFromV1 } from '../map/core/profile.mjs';
import { setProfile } from '../map/tavern/pack-profile.mjs';
import { HOST_SRC } from './_host_src.mjs';
import { edenGeo, townGeo } from './helpers/eden-geo.mjs';

const rd = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const js = p => JSON.parse(rd(p));

test('eden 清单是唯一定义（没有内置 EDEN 常量）；eden 的键与聊天变量原样（老用户数据不迁移也能读）', async () => {
  const m = js('map/packs/eden/manifest.json');
  assert.equal(PK.EDEN, undefined); assert.equal(PK.EDEN_RESOLVED, undefined);
  let asked = null; const R = await PK.load('eden', { fetchJSON: async u => { asked = u; return m; } });
  assert.equal(asked, 'packs/eden/manifest.json'); assert.equal(R.base, ''); assert.equal(R.chatVar, 'eden_map'); assert.equal(R.prefix, 'edenMap');
  assert.deepEqual(R.data, { maps: 'data/maps.json', world: 'data/world_markers.json', derived: 'data/derived.json', rooms: 'data/eden_estate_rooms.json', security: 'data/security.json', roster: 'data/fallback_roster.json', events: 'builtin', stash: 'data/stash.json', routine: 'data/routine.json', overlay: 'packs/eden/overlay.v2.json', names: { en: 'packs/eden/names.en.json' }, galleries: 'data/room_galleries.json', worldbook_addon: 'data/worldbook_addon.json', gallery: 'data/gallery.json' });
  assert.deepEqual(R.preload, ['data/maps.json', 'data/world_markers.json', 'data/derived.json']);
  // 启动预取数据驱动（通用化 v1）：viewer.html 不再写死 eden 的数据预取，按包 id 注入清单链接 + 清单 preload 列
  const v = rd('map/viewer.html');
  assert.doesNotMatch(v, /<link rel="preload" as="fetch" crossorigin="anonymous" href="data\//, '三份 eden 数据预取清零');
  assert.match(v, /u = 'packs\/' \+ id \+ '\/manifest\.json'/, '清单预取按包 id 动态注入');
  assert.match(v, /for \(const p of m\?\.preload \|\| \[\]\) add\(B \+ p\)/, '数据预取由清单 preload 列驱动');
  assert.equal(PK.nsKey('edenMapFog', 'eden'), 'edenMapFog');
  assert.equal(PK.nsKey('edenMap:chat:1:fog', undefined), 'edenMap:chat:1:fog');
  assert.equal(PK.chatVarOf('eden'), 'eden_map');
  assert.deepEqual(PK.validate(m), []);
});

test('preload / security / roster：路径校验、按包补目录、包不声明就为空', () => {
  const town = PK.resolve(js('map/packs/town/manifest.json'));
  assert.deepEqual(town.preload, [], 'town 没声明 preload');
  assert.ok(PK.validate({ ...js('map/packs/town/manifest.json'), preload: 'data/maps.json' }).length, 'preload 要是数组');
  assert.ok(PK.validate({ ...js('map/packs/town/manifest.json'), preload: ['https://evil/x.json'] }).length, '拒外链');
  assert.ok(PK.validate({ ...js('map/packs/town/manifest.json'), preload: ['../x.json'] }).length, '拒上跳');
  const harbor = PK.resolve({ id: 'harbor', schema: 1, title: '港', data: { maps: 'maps.json', security: 'sec.json' }, preload: ['maps.json', 'sec.json'] });
  assert.deepEqual(harbor.preload, ['packs/harbor/maps.json', 'packs/harbor/sec.json'], '非 eden 包按包目录补前缀');
  assert.equal(harbor.data.security, 'packs/harbor/sec.json', '安保数据挂载点同样按包目录');
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
  assert.match(v, /a\?\.getItem\(N\(k\)\) \?\? \(window\.__packId === 'eden' \? null : a\?\.getItem\(k\)\)/, '首帧镜像的别名回退与 core/storage.mjs get 同一规则');
  assert.match(h, /PACK_IN \? localStorage\.getItem\(k\) : null/, '宿主 lsGet 的别名回退');
  assert.equal(PK.ID_RE.source, '^[a-z][a-z0-9_-]{1,31}$');
  assert.match(h, /loadEventGeo\(\{[^}]*events: PACK_IN\?\.events/); assert.doesNotMatch(h, /m\.configure\(/, '事件分类随节点树（geo.taxonomy）进来，宿主不再单独装'); assert.match(h, /m\.setVarRoot\(/);
});

test('core/storage.mjs 按 globalThis.__packId 换前缀', () => {
  const mem = new Map(), S = { localStorage: { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: k => mem.delete(k) } };
  ST.set('edenMapFog', '1', S); assert.ok(mem.has('edenMapFog'));
  globalThis.__packId = 'town';
  try { ST.set('edenMapFog', '1', S); assert.ok(mem.has('tcp.town.Fog')); assert.equal(ST.get('edenMapFog', null, S), '1'); }
  finally { delete globalThis.__packId; }
});

test('存储键别名回退：包命名空间空着就读 edenMap* 历史档（只读不写回），写过后本包优先', () => {
  const mem = new Map(), S = { localStorage: { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) } };
  mem.set('edenMapTheme', 'dark');   // 通用化之前写下的历史档
  globalThis.__packId = 'town';
  try {
    assert.equal(ST.get('edenMapTheme', null, S), 'dark', '命名空间没写过 → 读历史档');
    ST.set('edenMapTheme', 'light', S);
    assert.equal(ST.get('edenMapTheme', null, S), 'light', '写过后命名空间优先');
    assert.equal(mem.get('edenMapTheme'), 'dark', '历史档原样保留（不写回、不迁移）');
    assert.equal(mem.get('tcp.town.Theme'), 'light');
    assert.equal(ST.get('edenMapFog', undefined, S), ST.KEYS.edenMapFog.def, '两边都空 → 登记处默认值');
  } finally { delete globalThis.__packId; }
  assert.equal(ST.get('edenMapTheme', null, S), 'dark', 'eden 键原样，行为不变');
});

test('多包隔离：同名键互不串；预算 LRU 经 nsStore 只见、只清本包的数据', async () => {
  const mem = new Map(), raw = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k), key: i => [...mem.keys()][i] ?? null, get length() { return mem.size; } };
  const town = PK.nsStore(raw, 'town'), harbor = PK.nsStore(raw, 'harbor');
  town.setItem('edenMap:chat:c1:fog', '{"w":"town"}'); harbor.setItem('edenMap:chat:c1:fog', '{"w":"harbor"}'); town.setItem('edenMapSeen:c1', '1');
  assert.deepEqual([...mem.keys()].sort(), ['tcp.harbor.:chat:c1:fog', 'tcp.town.:chat:c1:fog', 'tcp.town.Seen:c1'], '两包的键物理上分开');
  assert.equal(town.getItem('edenMap:chat:c1:fog'), '{"w":"town"}'); assert.equal(harbor.getItem('edenMap:chat:c1:fog'), '{"w":"harbor"}');
  mem.set('edenMap:chat:c9:fog', '{}'); mem.set('edenMapSeen:c9', '1');   // eden 原生的按聊天数据
  const BG = await import('../map/tavern/budget.mjs');
  BG.touch(town, 'c1', 1000);
  assert.deepEqual(BG.sweep(town, 'c1', 1).dropped, [], '当前聊天不清');
  const r = BG.sweep(town, '', 0);
  assert.deepEqual(r.dropped, ['c1'], '超出上限的本包聊天被清');
  assert.ok(!mem.has('tcp.town.:chat:c1:fog')); assert.ok(!mem.has('tcp.town.Seen:c1'), '本包超限聊天被清掉');
  assert.equal(mem.get('tcp.harbor.:chat:c1:fog'), '{"w":"harbor"}', '别的包不动');
  assert.equal(mem.get('edenMap:chat:c9:fog'), '{}'); assert.equal(mem.get('edenMapSeen:c9'), '1', 'eden 的数据不碰');
});

test('事件分类可换：town 的 3 类解析、落层（层由 town 自己的节点树定）；换回首个包后分类原样', () => {
  EV.setGeo(edenGeo());
  const before = { g: EV.legend().map(g => g.label), c: Object.keys(EV.taxonomy().types).length };
  EV.setGeo(townGeo());   // the geo carries the pack's taxonomy (its events.json through compat-v1)
  try {
    assert.deepEqual(EV.legend().map(g => g.label), ['市政', '灾害', '天气']);
    assert.equal(EV.catOf('起火了'), '火灾'); assert.equal(EV.catOf('巡空令'), '其他');
    const r = EV.parseMarks('<span style="display:none">⌖风暴｜雾港镇·码头·灯塔｜3｜大风封港｜港务所</span>');
    assert.equal(r.length, 1); assert.equal(r[0].layer, '码头'); assert.equal(r[0].place, '灯塔'); assert.equal(r[0].grp, '天气'); assert.equal(r[0].node, 'light');
    assert.equal(EV.parseMarks('⌖火灾｜鱼市｜2｜仓库起火')[0]?.layer, '码头', '地名落层');
    const other = EV.parseMarks('⌖火灾｜天城·下层·7号井｜2｜x');
    assert.deepEqual([other.length, other[0].layer, other[0].node], [1, '', null], '别的卡的地名：照样列出、不上图（K-01 B）');
    assert.match(EV.summarize([{ layer: '码头', tier: 'live', closed: false, place: '鱼市', cat: '火灾', lvl: 2, text: 'x', src: '' }], '码头'), /^\[雾港镇事态/);
  } finally { EV.setGeo(edenGeo()); }
  assert.deepEqual({ g: EV.legend().map(g => g.label), c: Object.keys(EV.taxonomy().types).length }, before);
  assert.equal(EV.parseMarks('⌖火灾｜天城·下层·7号井｜2｜仓库起火')[0].layer, '下层');
});

test('没有事件块 / 坏的事件块 = 内核的中性分类（K-R53），不拖垮启动', () => {
  try {
    EV.setGeo(null);
    assert.deepEqual(EV.legend().map(g => g.id), ['safety', 'weather', 'politics', 'society', 'conflict', 'disaster', 'people']);
    assert.equal(EV.catOf('巡空令'), '其他'); assert.equal(EV.catOf('火灾'), '火灾');
    EV.configure({ groups: [], types: {}, layers: [] }, 'bad');
    assert.equal(EV.legend().length, 7); assert.ok(EV.taxonomy().types.fire);
    EV.configure({ groups: 'x', types: null });
    assert.equal(EV.legend().length, 7);
  } finally { EV.setGeo(edenGeo()); }
  assert.ok(EV.taxonomy().groups.length > 8);
});

test('聊天变量顶层键 / 世界书名可换（默认聊天变量 eden 原名；书名前缀来自清单，引擎里没有默认名）', () => {
  assert.equal(MV.VAR_ROOT, 'eden_map'); assert.equal(MV.wbName('chat1'), '');   // 宿主没读到清单之前：没有这本书
  const eden = js('map/packs/eden/manifest.json');
  try { assert.equal(MV.setVarRoot('tc_town'), 'tc_town'); assert.equal(MV.setVarRoot('bad key'), 'tc_town'); assert.equal(MV.setWbName('雾港镇'), '雾港镇·自定义'); }
  finally { MV.setVarRoot('eden_map'); MV.setWbName(PK.worldbookPrefix(eden, 'eden')); }
  assert.equal(MV.WB_NAME, '伊甸地图·自定义');   // 第一个包：清单 worldbook.prefix，与以前的常量同名
  assert.match(MV.wbName('chat1'), /^伊甸地图·自定义·[0-9a-f]{6}$/);
});

test('tools/check_pack.py：全部包通过', () => {
  const out = execFileSync('python3', ['tools/check_pack.py'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  assert.match(out, /town：通过/); assert.match(out, /eden：通过/);
});

test('清单 vars：换 MVU 默认路径（其余为空、按字段名自动发现）', () => {
  try {
    setProfile(profileFromV1({ manifest: { vars: { location: '状态.地点', nope: 'x' } } }));
    const d = AD.defaults(); assert.equal(d.location, '状态.地点'); assert.equal(d.outfit, ''); assert.ok(!('nope' in d));
    assert.equal(AD.detect({ 状态: { 地点: 'A' }, 别处: { 位置: 'B' } }).location, '状态.地点', '默认路径在卡里就用它');
  } finally { setProfile(null); }
});
