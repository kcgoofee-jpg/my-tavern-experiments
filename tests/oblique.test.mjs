// 斜视接线（OBLIQUE-CODE）：视图解析（views 与顶层简写）、借图档的调色判定、maps.json 数据与相机文件的一致性。
// 投影 / 反算 / 仿射 / 公式 F 的数学对拍在 tests/project.test.mjs（golden），这里只测数据驱动的规则。
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REG = JSON.parse(fs.readFileSync(new URL('../map/data/maps.json', import.meta.url), 'utf8'));
const PERIODS = [{ id: 'dawn' }, { id: 'day' }, { id: 'dusk', dark: true }, { id: 'night', dark: true }];

const { viewOf, modeOf, metres, normOf } = await import('../map/app/oblique.mjs');
const { tintBand, pickPeriod } = await import('../map/core/period-pick.mjs');

test('视图解析：没有 views 的地图 = 顶层简写，行为不变', () => {
  const v = viewOf(REG.maps.world);
  assert.equal(v.base, REG.maps.world.base);
  assert.deepEqual(v.periods, REG.maps.world.periods);
  assert.equal(modeOf(REG.maps.world), 'top');   // 世界图是地形图，仍俯视
});
test('视图解析：有 views 的图按开关取视图，俯视图迁进了 views.top', () => {
  const m = REG.maps.tc_upper;
  assert.equal(m.base, undefined);   // 顶层字段已迁走
  assert.equal(viewOf(m).cam, m.views.oblique.cam);   // 默认 = 斜视
  assert.equal(viewOf(m, 'top').base, 'art/tc_upper.dzi');   // 俯视 = 原来的底图与时段
  assert.deepEqual(viewOf(m, 'top').periods, m.views.top.periods);
});
test('下层俯视四档都指向夜图（台账 RETIRED 决定），斜视两班各服务两档', () => {
  const top = REG.maps.tc_low.views.top.periods;
  assert.deepEqual(Object.values(top), ['art/tc_low_night.dzi', 'art/tc_low_night.dzi', 'art/tc_low_night.dzi', 'art/tc_low_night.dzi']);
  const ob = REG.maps.tc_low.views.oblique.periods;
  assert.equal(ob.dawn, ob.day); assert.equal(ob.dusk, ob.night); assert.notEqual(ob.day, ob.night);
});
test('借图档调色（tintBand）：共用一张图时排序靠前的档是借用方', () => {
  const mid = REG.maps.tc_mid.views.oblique.periods;
  assert.equal(tintBand(mid, pickPeriod(mid, 'dawn', PERIODS), PERIODS), 'dawn');   // 晨用昏图 → 晨调色
  assert.equal(tintBand(mid, pickPeriod(mid, 'dusk', PERIODS), PERIODS), '');   // 昏图本来就是昏的
  const low = REG.maps.tc_low.views.oblique.periods;
  assert.equal(tintBand(low, pickPeriod(low, 'day', PERIODS), PERIODS), '');   // 白班图归昼
  assert.equal(tintBand(low, pickPeriod(low, 'night', PERIODS), PERIODS), '');
  const one = { night: 'art/world_night.dzi' };
  assert.equal(tintBand(one, pickPeriod(one, 'night', PERIODS), PERIODS), '');   // 只有一档 = 没有借用
});
test('地图米换算往返（米 ← 顶视归一化 → 米）', () => {
  const m = REG.maps.tc_upper;
  assert.deepEqual(metres(0.5, 0.5, m), [0, 0]);
  assert.deepEqual(metres(0, 0, m), [-1500, 937.5]);
  for (const [nx, ny] of [[0.25, 0.4], [0.8, 0.9]]) { const [X, Y] = metres(nx, ny, m); assert.deepEqual(normOf(X, Y, m), [nx, ny]); }
});
test('三层天城地图都登记了斜视主视图与俯视图，相机文件都在', () => {
  for (const id of ['tc_upper', 'tc_mid', 'tc_low']) {
    const v = REG.maps[id].views;
    assert.equal(v.default, 'oblique', id);
    for (const key of ['top', 'oblique']) assert.ok(v[key], `${id}.${key}`);
    for (const cam of [v.oblique.cam, v.oblique.outskirts.cam]) assert.ok(fs.existsSync(new URL('../map/' + cam, import.meta.url)), cam);
  }
});
test('同组各层斜视相机同朝向、同米每像素（合成前提）', () => {
  const cam = id => JSON.parse(fs.readFileSync(new URL('../map/' + REG.maps[id].views.oblique.cam, import.meta.url), 'utf8'));
  const sig = ['tc_upper', 'tc_mid', 'tc_low'].map(id => { const c = cam(id); return [c.az_deg, c.pitch_deg, c.m_per_px]; });
  assert.deepEqual(sig[0], sig[1]); assert.deepEqual(sig[1], sig[2]);
});
test('斜视时段 DZI 的像素尺寸与相机画框一致（同层各时段同框）', () => {
  for (const id of ['tc_upper', 'tc_mid', 'tc_low']) {
    const ob = REG.maps[id].views.oblique;
    const cam = JSON.parse(fs.readFileSync(new URL('../map/' + ob.cam, import.meta.url), 'utf8'));
    const px = cam.frame.px.join('x');
    for (const s of new Set(Object.values(ob.periods))) {
      const x = fs.readFileSync(new URL('../map/' + s, import.meta.url), 'utf8');
      const w = /Width="(\d+)"/.exec(x)[1], h = /Height="(\d+)"/.exec(x)[1];
      assert.equal(`${w}x${h}`, px, `${id} ${s}`);
    }
  }
});
test('上层合成：below 是中层，斜视图不使用俯视掩模（岛图自带 alpha）', () => {
  const ob = REG.maps.tc_upper.views.oblique;
  assert.equal(ob.composite.below, 'tc_mid');
  assert.equal(ob.composite.haze, 'period');
  assert.equal(ob.mask, undefined);
  assert.ok(fs.existsSync(new URL('../map/data/' + 'tc_upper_islands_mask.png', import.meta.url)));   // 俯视合成（alt.composite）仍用掩模
  assert.equal(REG.maps.tc_upper.alt.composite.under, 'tc_mid');
});
