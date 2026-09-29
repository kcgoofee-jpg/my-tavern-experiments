// P3-C 任务（docs/reviews/architecture_and_stream_perf.md §6）：LayerRegistry 纯核心契约——
// 槽位数据契约与层级排序、order 微调序、重复注册拦截、可见性调度、滤镜链存储、标准摘要与纯度机检。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SLOTS, Z_STEP, slotZ, cssFilter, canvasFilter, LayerRegistry } from '../map/core/layers.mjs';

test('槽位数据契约：由底至顶与诊断报告 §6 逐字一致；外层固定 UI 不进槽位', () => {
  assert.deepEqual(SLOTS, ['base', 'depth-haze', 'fog', 'routes', 'trips', 'events', 'markers', 'labels', 'fx', 'interaction']);
  for (const ui of ['header', 'pop', 'setpop', 'dock', 'foot', 'loading']) assert.ok(!SLOTS.includes(ui), `外层 UI「${ui}」不得纳入视口槽位`);
});

test('槽位 z 阶梯：(序号 + 1) × 间距，单调由底至顶', () => {
  assert.equal(Z_STEP, 10);
  assert.deepEqual(SLOTS.map(slotZ), SLOTS.map((_, i) => (i + 1) * Z_STEP));
  for (let i = 1; i < SLOTS.length; i++) assert.ok(slotZ(SLOTS[i]) > slotZ(SLOTS[i - 1]));
  assert.throws(() => slotZ('nope'));
});

const D = (id, over = {}) => ({ id, slot: 'fog', kind: 'dom', ...over });

test('register：缺 id / 重复注册 / 未知槽位 / 未知 kind 全部拦截', () => {
  const r = new LayerRegistry();
  assert.throws(() => r.register({ slot: 'fog', kind: 'dom' }), TypeError);
  assert.throws(() => r.register(D('')), TypeError);
  assert.throws(() => r.register(D('x', { slot: 'header' })), /槽位/);
  assert.throws(() => r.register(D('x', { kind: 'svg' })), /kind/);
  assert.throws(() => r.register(D('x', { order: 'top' })), /order/);
  r.register(D('x'));
  assert.throws(() => r.register(D('x')), /重复注册/);
  assert.throws(() => r.register({}), TypeError);
  assert.ok(r.has('x')); assert.equal(r.get('x').id, 'x'); assert.equal(r.get('nope'), null);
});

test('排序：槽位序优先，同槽 order 微调，再同按注册先后；乱序注册不影响结果', () => {
  const r = new LayerRegistry();
  r.register(D('m-late', { slot: 'markers', order: 0 }));
  r.register(D('fog-a', { slot: 'fog', order: 5 }));
  r.register(D('fog-b', { slot: 'fog', order: 1 }));
  r.register(D('base', { slot: 'base' }));
  r.register(D('fog-c', { slot: 'fog' }));                       // 无 order = 0，排最前
  assert.deepEqual(r.ordered().map(x => x.id), ['base', 'fog-c', 'fog-b', 'fog-a', 'm-late']);
  assert.deepEqual(r.layersInSlot('fog').map(x => x.id), ['fog-c', 'fog-b', 'fog-a']);
  assert.throws(() => r.layersInSlot('nope'));
});

test('unregister：先卸载再注销，允许重新注册；onRegister 通知', () => {
  const r = new LayerRegistry(); const calls = [];
  r.onRegister(id => calls.push(id));
  r.register(D('a', { unmount: () => calls.push('unmount:a') }));
  assert.deepEqual(calls, ['a']);
  assert.equal(r.unregister('a'), true);
  assert.deepEqual(calls, ['a', 'unmount:a']);
  assert.equal(r.unregister('a'), false);
  r.register(D('a', { order: 9 }));
  assert.equal(r.get('a').order, 9);
  assert.throws(() => r.unregister(42), TypeError);
});

test('mountAll：按注册顺序挂载，单层 mount 抛错只废自己；unmountAll 成对', () => {
  const r = new LayerRegistry(); const log = [];
  r.register(D('a', { mount: () => log.push('a') }));
  r.register(D('bad', { mount: () => { throw new Error('boom'); } }));
  r.register(D('b', { mount: () => log.push('b'), unmount: () => log.push('~b') }));
  assert.equal(r.mountAll({}), 2);
  assert.deepEqual(log, ['a', 'b']);
  r.unmountAll();
  assert.deepEqual(log, ['a', 'b', '~b']);
});

test('setVisible：状态记录 + 转发 setVisible；未注册抛错', () => {
  const r = new LayerRegistry(); const seen = [];
  r.register(D('a', { setVisible: v => seen.push(v), initialVisible: false }));
  assert.equal(r.isVisible('a'), false);
  r.setVisible('a', true);
  assert.deepEqual(seen, [true]);
  assert.equal(r.isVisible('a'), true);
  r.setVisible('a', 'yes');                                       // 真值归一为布尔
  assert.equal(r.isVisible('a'), true);
  assert.throws(() => r.setVisible('nope', true), /未注册/);
  assert.throws(() => r.isVisible('nope'), /未注册/);
});

test('滤镜链：css / canvas 分型存储与取值；坏结构拦截；filters 返回副本', () => {
  const r = new LayerRegistry(); r.register(D('a'));
  const chain = [{ type: 'css', value: 'blur(2px)' }, { type: 'canvas', value: 'saturate(1.2)' }];
  assert.deepEqual(r.setFilters('a', chain), chain);
  assert.deepEqual(r.filters('a'), chain);
  assert.equal(cssFilter(chain), 'blur(2px)');
  assert.equal(canvasFilter(chain), 'saturate(1.2)');
  assert.equal(cssFilter([]), '');
  assert.throws(() => r.setFilters('a', 'blur(2px)'), TypeError);
  assert.throws(() => r.setFilters('a', [{ type: 'svg', value: 'x' }]), TypeError);
  assert.throws(() => r.setFilters('a', [{ type: 'css' }]), TypeError);
  assert.throws(() => r.setFilters('nope', []), /未注册/);
  const got = r.filters('a'); got.pop();
  assert.equal(r.filters('a').length, 2, 'filters() 返回副本，外部改不到存储');
});

test('menuRows：只收带 menu 的层，按 menu.order → 注册先后排（#layList 数据驱动）', () => {
  const r = new LayerRegistry();
  r.register(D('plain'));
  r.register(D('b', { slot: 'routes', menu: { order: 2, label: '乙' } }));
  r.register(D('a', { menu: { order: 1, label: '甲' } }));
  r.register(D('c', { menu: { label: '丙' } }));                  // 无 order = 0，排最前
  assert.deepEqual(r.menuRows().map(x => x.id), ['c', 'a', 'b']);
});

test('describe：{ slots, activeLayers, filterSummary } 标准摘要', () => {
  const r = new LayerRegistry();
  r.register(D('fog', { slot: 'fog', kind: 'canvas', initialVisible: true }));
  r.register(D('mk', { slot: 'markers', initialVisible: false }));
  r.register(D('fx', { slot: 'fx', filters: [{ type: 'css', value: 'blur(1px)' }] }));
  const s = r.describe();
  assert.deepEqual(Object.keys(s).sort(), ['activeLayers', 'filterSummary', 'slots']);
  assert.deepEqual(s.slots.map(x => x.id), SLOTS);
  assert.deepEqual(s.slots.find(x => x.id === 'fog').layers, ['fog']);
  assert.deepEqual(s.slots.find(x => x.id === 'markers').layers, ['mk']);
  assert.ok(s.slots.find(x => x.id === 'base').layers.length === 0, '空槽位也列出');
  assert.deepEqual(s.activeLayers, ['fog', 'fx'], '隐藏图层不进 activeLayers，槽位序不变');
  assert.deepEqual(s.filterSummary, [{ id: 'fx', slot: 'fx', filters: [{ type: 'css', value: 'blur(1px)' }] }]);
  const s2 = new LayerRegistry().describe();
  assert.deepEqual(s2.filterSummary, []); assert.deepEqual(s2.activeLayers, []);
});

test('纯度机检：核心模块不碰 DOM / 全局 / 存储 / 网络', () => {
  const src = readFileSync(new URL('../map/core/layers.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\b(document|window|localStorage|sessionStorage|fetch|TCStore|HTMLElement|navigator)\b/);
});

// ---------- 阶段 2（查看器）：CSS 镜像与字面量清零 ----------
const viewerSrc = () => readFileSync(new URL('../map/viewer.html', import.meta.url), 'utf8');

test('viewer.html 的 --zv-* 与 core 槽位阶梯一一对应（CSS 镜像对拍）', () => {
  const html = viewerSrc(), root = html.slice(html.indexOf('--zv-osd'), html.indexOf('--zv-interaction') + 40);
  for (const slot of SLOTS) {
    const m = root.match(new RegExp(`--zv-${slot.replace('-', '-')}:\\s*(\\d+)`));
    assert.ok(m, `viewer.html 缺 --zv-${slot}`);
    assert.equal(+m[1], slotZ(slot), `--zv-${slot} 必须等于 slotZ('${slot}')`);
  }
  assert.ok(+root.match(/--zv-markers-hover:\s*(\d+)/)[1] > slotZ('markers'), '悬停图钉要高于 markers 槽位');
});

test('外层固定 UI 阶梯有名义常量；viewer.html 不再出现裸 z-index 字面量', () => {
  const html = viewerSrc();
  for (const v of ['--zu-header', '--zu-pop', '--zu-setpop', '--zu-dock', '--zu-loading', '--zu-estate', '--zu-snap', '--zu-cover', '--zu-foot', '--zu-hint', '--zu-prog', '--zu-sheet-sticky', '--zu-layers'])
    assert.ok(html.includes(v + ':'), `缺外层阶梯常量 ${v}`);
  const decls = [...html.matchAll(/z-index:\s*([^;}]+)/g)].map(m => m[1].trim());
  assert.ok(decls.length >= 17, '阶梯声明应全部保留');
  for (const d of decls) assert.match(d, /^var\(--z[uv]-/, `裸 z-index 字面量：${d}`);
});

test('模块里不许再内联赋值 z-index（转场快照等一律引用阶梯常量）', () => {
  for (const f of ['map/app/clouds.mjs', 'map/app/markers.mjs', 'map/app/fog.mjs', 'map/events.mjs', 'map/trips.mjs', 'map/chars.mjs', 'map/app/layerhost.mjs']) {
    const s = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    assert.doesNotMatch(s, /\.style\.zIndex\s*=/, `${f} 有内联 z-index 赋值`);
  }
});

// ---------- 阶段 3（迁移）：#layList 数据驱动与图层接入 ----------
test('#layList 静态行清零，行由 Registry 菜单描述符渲染（元素 id 与旧行一致）', () => {
  const html = viewerSrc();
  const list = html.slice(html.indexOf('id="layList"'));
  assert.doesNotMatch(list.slice(0, list.indexOf('</div>')), /<label|tgBorders|tgMarkers/, '#layList 里不许再写静态行');
  const lh = readFileSync(new URL('../map/app/layerhost.mjs', import.meta.url), 'utf8');
  for (const id of ['tgOverlay', 'tgBorders', 'tgAlt', 'tgAltBox', 'tgRoutes', 'tgRoutesBox', 'tgLabels', 'tgMarkers'])
    assert.ok(lh.includes(`'${id}'`), `layerhost 缺菜单行 id ${id}`);
  assert.match(readFileSync(new URL('../map/trips.mjs', import.meta.url), 'utf8'), /id: 'tgTrips'/, '行程行的元素 id 不变');
  assert.match(readFileSync(new URL('../map/events.mjs', import.meta.url), 'utf8'), /id: 'tgEvents'/);
  assert.match(readFileSync(new URL('../map/security.mjs', import.meta.url), 'utf8'), /id: 'tgSec'/);
});

test('图层存储键完全兼容：键名与所属模块不变', () => {
  const read = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  assert.match(read('map/app/layerhost.mjs'), /edenMapBarriers/, '结界开关仍存 edenMapBarriers');
  assert.match(read('map/app/layerhost.mjs'), /edenMapRoutes/, '航线开关仍存 edenMapRoutes');
  assert.match(read('map/trips.mjs'), /edenMapTrips/, '行程开关仍存 edenMapTrips');
  assert.match(read('map/security.mjs'), /edenMapSecurity/, '安保开关仍存 edenMapSecurity');
  assert.match(read('map/app/fog.mjs'), /FOG_KEY/, '迷雾仍走 core/storage.mjs 的 FOG_KEY');
});

test('现有图层挂到契约槽位：核心六层 + fog / clouds / events / trips / security', () => {
  const lh = readFileSync(new URL('../map/app/layerhost.mjs', import.meta.url), 'utf8');
  for (const id of ['base-overlay', 'alt-base', 'routes', 'labels', 'markers'])
    assert.ok(lh.includes(`id: '${id}'`), `layerhost 未登记 ${id}`);
  const slotsOf = { 'map/app/fog.mjs': ['fog', "slot: 'fog'"], 'map/app/clouds.mjs': ['clouds', "slot: 'depth-haze'"], 'map/events.mjs': ['events', "slot: 'events'"], 'map/trips.mjs': ['trips', "slot: 'trips'"], 'map/security.mjs': ['security', "slot: 'markers'"] };
  for (const [f, [id, slot]] of Object.entries(slotsOf)) {
    const s = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    assert.ok(s.includes(`id: '${id}'`) && s.includes(slot), `${f} 未按 ${slot} 登记 ${id}`);
    assert.match(s, /layerhost\.mjs/, `${f} 应经 app/layerhost.mjs 注册`);
  }
});

test('叠加物栈序归阶梯常量：雾不再 prepend，路线 / 雾 / 事态 / 行程 / 人物徽标引用 --zv-*', () => {
  const fog = readFileSync(new URL('../map/app/fog.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(fog, /prepend\(cv\)/, '迷雾画布不许再 prepend 抢 DOM 顺序');
  const html = viewerSrc();
  assert.match(html, /#fogCv \{ z-index: var\(--zv-fog\); \}/);
  assert.match(html, /\.routes \{[^}]*z-index: var\(--zv-routes\)/);
  assert.match(html, /\.barriers, \.tc-ring \{ z-index: var\(--zv-base\); \}/);
  assert.match(readFileSync(new URL('../map/events.mjs', import.meta.url), 'utf8'), /\.ev\{z-index:var\(--zv-events,60\)\}/);
  const trips = readFileSync(new URL('../map/trips.mjs', import.meta.url), 'utf8');
  assert.equal((trips.match(/var\(--zv-trips,50\)/g) || []).length, 2, 'trip SVG 与落点都归 trips 槽');
  assert.match(readFileSync(new URL('../map/chars.mjs', import.meta.url), 'utf8'), /z-index:calc\(var\(--zv-markers,70\) \+ 1\)/);
});


