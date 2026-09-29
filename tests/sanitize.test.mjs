// 社区预设净化管线（Part 7）node 单测：stripBlocks（成块剥离 / 流式尾 / 属性 / 孤儿闭标签）、
// presetHereHint / presetPresentHint（状态栏吸收）、resolveTags（设置解析）、ContextPipeline 接线（缓存随标签表失效）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STRIP_TAGS, resolveTags, stripBlocks, sanitize, presetHereHint, presetPresentHint } from '../map/tavern/sanitize.mjs';
import { ContextPipeline } from '../map/tavern/context.mjs';

test('stripBlocks：成对块、带属性、未闭合流式尾、孤儿闭标签、多标签、非法标签名忽略', () => {
  assert.equal(stripBlocks('前<thinking>思考</thinking>后', ['thinking']), '前 后');
  assert.equal(stripBlocks('前<state class="x">状态</state>后', ['state']), '前 后');
  assert.equal(stripBlocks('正文<liwe>没闭合的流式尾', ['liwe']), '正文 ');
  assert.equal(stripBlocks('a</anchor>b', ['anchor']), 'a b');
  assert.equal(stripBlocks('<thinking>x</thinking>中<anchor>y</anchor>尾', ['thinking', 'anchor']), ' 中 尾');
  assert.equal(stripBlocks('<a b="c">x</a>', ['a']), ' ');
  assert.equal(stripBlocks('<script>alert(1)</script>ok', ['script)']), '<script>alert(1)</script>ok');
  assert.equal(stripBlocks('unchanged', []), 'unchanged');
  assert.equal(stripBlocks('unchanged', null), 'unchanged');
  assert.equal(stripBlocks(undefined, ['x']), '');
  assert.equal(stripBlocks(null, ['x']), '');
});

test('sanitize：剥社区块但保留 <UpdateVariable>（行程 JSONPatch 要用）与 <think>（msgtext 惯例处理）', () => {
  const raw = '<think>coT</think>正文<state>状态栏</state><UpdateVariable>{"op":"replace"}</UpdateVariable>';
  const out = sanitize(raw, DEFAULT_STRIP_TAGS);
  assert.equal(out, '<think>coT</think>正文 <UpdateVariable>{"op":"replace"}</UpdateVariable>');
  assert.ok(out.includes('coT'), '<think>（单数）归 msgtext.parseText 管，这里不动；<thinking> 才在剥离表里');
});

test('presetHereHint：中英文键、装饰包裹、取最后一个、忽略思考链与变量块、无值不算', () => {
  assert.equal(presetHereHint('地点：中层·霓虹街').here, '中层·霓虹街');
  assert.equal(presetHereHint('当前位置: 天城·上层').here, '天城·上层');
  assert.equal(presetHereHint('Location: Neon Street').here, 'Neon Street');
  assert.equal(presetHereHint('【地点】【伊甸庄园·书房】').here, '伊甸庄园·书房');
  assert.equal(presetHereHint('地点：A\n地点：B').here, 'B');
  assert.equal(presetHereHint('- 地点: 旧公寓楼').here, '旧公寓楼');
  assert.equal(presetHereHint('<thinking>地点：思考里不算</thinking>地点：真地点').here, '真地点');
  assert.equal(presetHereHint('<UpdateVariable>地点：变量块不算</UpdateVariable>地点：真地点').here, '真地点');
  assert.equal(presetHereHint('地点：无').here, null);
  assert.equal(presetHereHint('地点：unknown').here, null);
  assert.equal(presetHereHint('没有状态栏').here, null);
  assert.equal(presetHereHint('').here, null);
  assert.ok(presetHereHint('地点：' + 'x'.repeat(80)).here === null || presetHereHint('地点：' + 'x'.repeat(80)).here.length <= 60);
});

test('presetPresentHint：分隔符吸收、上限 12 人、无 → 空数组、最后一条生效', () => {
  assert.deepEqual(presetPresentHint('在场：玛丽、约翰、苏').present, ['玛丽', '约翰', '苏']);
  assert.deepEqual(presetPresentHint('Present: Alice, Bob / Carol').present, ['Alice', 'Bob', 'Carol']);
  assert.deepEqual(presetPresentHint('在场：无').present, []);
  assert.deepEqual(presetPresentHint('在场：A、B\n在场：C').present, ['C']);
  const many = presetPresentHint('在场：' + Array.from({ length: 15 }, (_, i) => '人' + i).join('、'));
  assert.equal(many.present.length, 0, '超过 12 人：整条不采信（防把段落当名册）');
});

test('resolveTags：默认表 / edenMapSanitize=0 全关 / 自定义 JSON 表 / 坏 JSON 回退', () => {
  const m = new Map();
  const get = k => m.get(k) ?? null;
  assert.deepEqual(resolveTags(get), DEFAULT_STRIP_TAGS);
  m.set('edenMapSanitize', '0');
  assert.deepEqual(resolveTags(get), []);
  m.delete('edenMapSanitize'); m.set('edenMapSanitizeTags', JSON.stringify(['ako', 'zzz']));
  assert.deepEqual(resolveTags(get), ['ako', 'zzz']);
  m.set('edenMapSanitizeTags', '{bad json');
  assert.deepEqual(resolveTags(get), DEFAULT_STRIP_TAGS);
});

test('ContextPipeline 接线：stripTags 剥块进 text 与指纹；换标签表缓存失效；默认不剥', () => {
  const raw = '正文<state>⌖地点 假地点</state>尾';
  const mk = () => [{ message_id: 0, message: raw }];
  const p1 = new ContextPipeline({ stripTags: ['state'] });
  const m1 = p1.readMsgs(mk(), 0);
  assert.equal(m1[0].text.includes('假地点'), false, 'state 块内容不参与解析');
  assert.ok(m1[0].raw.includes('状态') === false || !m1[0].raw.includes('<state>'), 'raw 也被净化');
  const m1b = p1.readMsgs(mk(), 0);
  assert.equal(m1b[0], m1[0], '同标签表同原文：命中缓存');
  p1.stripTags = ['state', 'liwe'];
  const m2 = p1.readMsgs(mk(), 0);
  assert.notEqual(m2[0], m1[0], '标签表变了：缓存失效重算');
  const p3 = new ContextPipeline();
  const m3 = p3.readMsgs(mk(), 0);
  assert.equal(m3[0].text.includes('假地点'), true, '默认不剥（向后兼容旧语料解析）');
});
