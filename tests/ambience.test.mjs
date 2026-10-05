// 环境音效（Part 4-4）node 单测：配方规范化（含 file 循环配方的路径校验）、场景匹配（首条全键命中）、天气自动附加、混音计划 diff 稳定性。
import test from 'node:test';
import assert from 'node:assert/strict';
import { RECIPES, normAmbience, pickScenes, planFor } from '../map/core/ambience.mjs';

test('normAmbience：内置配方保留、自定义覆盖、坏规则 / 坏场景丢弃', () => {
  const ab = normAmbience({
    master: 0.8,
    recipes: { meow: { kind: 'osc', freq: 440, harmonics: [1], gain: 0.2 }, bad: { kind: 'saw', gain: 1 } },
    rules: [
      { match: { map: 'estate_b2' }, scenes: [{ id: 'humDeep', gain: 0.7 }, { id: '不存在的' }, '垃圾'] },
      { scenes: [{ id: 'wind' }] },                                  // match 缺 → 丢
      { match: { map: 'x' }, scenes: [] },                           // 空场景 → 丢
    ],
  });
  assert.equal(ab.recipes.wind, RECIPES.wind);
  assert.equal(ab.recipes.meow.freq, 440);
  assert.equal(ab.recipes.bad, undefined);
  assert.deepEqual(ab.rules, [{ match: { map: 'estate_b2' }, scenes: [{ id: 'humDeep', gain: 0.7 }] }]);
  assert.equal(ab.master, 0.8);
  assert.deepEqual(normAmbience(null), { recipes: RECIPES, rules: [], master: 1 });
});

test('file 配方：src 只收相对包根的 .ogg / .mp3 路径（alt 同规），../、绝对路径、外链、其它扩展名、零增益都丢弃；坏 file 场景不进计划', () => {
  const ab = normAmbience({ recipes: {
    loop: { kind: 'file', src: 'ambient/wind.ogg', gain: 0.2 },
    withAlt: { kind: 'file', src: 'a/crowd.ogg', alt: 'a/crowd.mp3', gain: 0.3 },
    up: { kind: 'file', src: '../secret.ogg', gain: 0.3 },
    abs: { kind: 'file', src: '/etc/passwd.ogg', gain: 0.3 },
    url: { kind: 'file', src: 'https://x.example/wind.ogg', gain: 0.3 },
    wav: { kind: 'file', src: 'ambient/wind.wav', gain: 0.3 },
    badAlt: { kind: 'file', src: 'ok.ogg', alt: '../x.mp3', gain: 0.3 },
    zero: { kind: 'file', src: 'ok.ogg', gain: 0 },
  }, rules: [{ match: { map: 'm' }, scenes: [{ id: 'loop' }, { id: 'withAlt' }, { id: 'up' }, { id: 'abs' }, { id: 'url' }, { id: 'wav' }, { id: 'badAlt' }, { id: 'zero' }] }] });
  assert.ok(ab.recipes.loop && ab.recipes.withAlt, '两条合法 file 配方留下');
  for (const bad of ['up', 'abs', 'url', 'wav', 'badAlt', 'zero']) assert.equal(ab.recipes[bad], undefined, `${bad} 被丢弃`);
  const plan = planFor(ab, { map: 'm' });
  assert.deepEqual(plan.map(p => p.id), ['loop', 'withAlt'], '只有合法 file 场景进计划');
  assert.equal(plan[0].recipe.src, 'ambient/wind.ogg');
});

test('pickScenes：首个命中规则生效、night 布尔匹配、weather 自动附加 rain 并去重', () => {
  const ab = normAmbience({ rules: [
    { match: { map: 'a', night: true }, scenes: [{ id: 'crackle', gain: 0.5 }] },
    { match: { map: 'a' }, scenes: [{ id: 'hum', gain: 0.4 }] },
  ] });
  assert.deepEqual(pickScenes(ab, { map: 'a' }), [{ id: 'hum', gain: 0.4 }], '第二条命中');
  assert.deepEqual(pickScenes(ab, { map: 'a', night: true })[0].id, 'crackle', '夜里的第一条优先');
  assert.deepEqual(pickScenes(ab, { map: 'b' }), []);
  const rainy = pickScenes(ab, { map: 'b', weather: 'rain' });
  assert.deepEqual(rainy, [{ id: 'rain', gain: 0.3 }]);
  const stormy = pickScenes(ab, { map: 'b', weather: 'storm', night: false });
  assert.deepEqual(stormy[0], { id: 'rain', gain: 0.45 });
  const both = pickScenes(normAmbience({ rules: [{ match: {}, scenes: [{ id: 'rain', gain: 0.2 }] }] }), { map: 'x', weather: 'rain' });
  assert.equal(both.length, 1, '已配 rain：不重复附加');
});

test('planFor：master 缩放且封顶 1；同 ctx 两次调用形状一致（diff 依据）', () => {
  const ab = normAmbience({ master: 0.5, rules: [{ match: { map: 'm' }, scenes: [{ id: 'hum', gain: 0.9 }, { id: 'rain', gain: 2 }] }] });
  const plan = planFor(ab, { map: 'm', weather: 'storm' });
  assert.deepEqual(plan.map(p => [p.id, +p.gain.toFixed(2)]), [['hum', 0.45], ['rain', 0.5]], 'master 缩放、gain 封顶、storm 的 rain 已在规则里不重复');
  assert.deepEqual(planFor(ab, { map: 'm', weather: 'storm' }).map(p => p.id), plan.map(p => p.id));
  assert.ok(plan.every(p => p.recipe && p.recipe.kind));
});
