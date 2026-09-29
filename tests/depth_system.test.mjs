// P3-A 任务 1（docs/reviews/architecture_and_stream_perf.md §2）：DepthSystem 纯化摘要 ——
// describe() 标准化契约、无 DOM 环境纯计算稳定性、迷雾存储键收口（core/storage.mjs 单一登记）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as depth from '../map/core/depth.mjs';
import * as S from '../map/core/storage.mjs';

const cfg = JSON.parse(readFileSync(new URL('../map/data/upper_depth.json', import.meta.url), 'utf8'));

test('describe：标准化摘要结构 { maxDepth, currentHaze, exploredRatio, fogEnabled }', () => {
  const s = depth.describe(cfg, { depth: 0.4, explored: { upper: ['eden', 'isle4'] }, map: 'upper', markers: 10, fogEnabled: true });
  assert.deepEqual(Object.keys(s).sort(), ['currentHaze', 'exploredRatio', 'fogEnabled', 'maxDepth']);
  assert.equal(s.maxDepth, Object.keys(cfg.islands).length + cfg.cloud_sheets.length);
  assert.equal(s.currentHaze, depth.channel('haze', 0.4, cfg), '霾浓度 = channels.haze 在当前纵深 d 的插值');
  assert.equal(s.exploredRatio, 0.2);
  assert.equal(s.fogEnabled, true);
});
test('describe：不给 map 算全部、坏探索数据不抛、边界归零', () => {
  const all = depth.describe(cfg, { explored: { upper: ['a'], tc_low: ['b', 'c'] }, markers: 4 });
  assert.equal(all.exploredRatio, 0.75, '没给 map：三处到访 / 共 4 个标记');
  assert.equal(depth.describe(cfg, { explored: 'bad', map: 'upper', markers: 0 }).exploredRatio, 0, 'markers ≤ 0 或探索数据坏 → 0');
  assert.equal(depth.describe(cfg, { explored: { upper: ['a', 'b', 'c'] }, map: 'upper', markers: 2 }).exploredRatio, 1, '封顶 1');
});
test('describe：d 缺省 0（最近处）；fogEnabled 缺省按登记默认「开」', () => {
  assert.equal(depth.describe(cfg).currentHaze, depth.channel('haze', 0, cfg));
  assert.equal(depth.describe(cfg).fogEnabled, true);
  assert.equal(depth.describe(cfg, { fogEnabled: 0 }).fogEnabled, false);
  assert.equal(depth.describe(cfg, { fogEnabled: 'x' }).fogEnabled, true);
});
test('describe：纯计算——同入参同结果、不改入参、模块源码无 DOM / 存储 / 网络依赖', () => {
  const ex = { upper: ['eden'] };
  const a = depth.describe(cfg, { depth: 0.2, explored: ex, map: 'upper', markers: 4 });
  const b = depth.describe(cfg, { depth: 0.2, explored: ex, map: 'upper', markers: 4 });
  assert.deepEqual(a, b);
  assert.deepEqual(ex, { upper: ['eden'] }, '不清洗入参对象本身（norm 产出新对象）');
  const src = readFileSync(new URL('../map/core/depth.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\b(document|window|localStorage|sessionStorage|fetch|TCStore)\b/);
});
test('迷雾存储键收口：core/storage.mjs 唯一定义点，app/fog.mjs 不再写死键名', () => {
  assert.equal(S.FOG_KEY, 'edenMapFog');
  assert.equal(S.FOG_LOCAL_KEY, 'edenMap:chat:local:fog');
  assert.ok(S.known(S.FOG_KEY), '开关键在 KEYS 登记');
  assert.ok(S.known(S.FOG_LOCAL_KEY), '本机探索记录键在 KEYS 登记（perChat 前缀）');
  assert.ok(S.KEYS['edenMap:chat:'].perChat && S.FOG_LOCAL_KEY.startsWith('edenMap:chat:'));
  const fog = readFileSync(new URL('../map/app/fog.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(fog, /['"`](edenMapFog|edenMap:chat:local:fog)['"`]/, '键名不许散落在消费方');
  assert.match(fog, /FOG_KEY/); assert.match(fog, /FOG_LOCAL_KEY/);
  assert.match(fog, /from '\.\.\/core\/storage\.mjs'/, '迷雾读写经存储适配器（不再是经典全局镜像）');
});
