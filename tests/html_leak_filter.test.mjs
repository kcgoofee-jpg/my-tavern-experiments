// 任务三：泄露防御网（map/tavern/sanitize.mjs stripLeaks / hasLeak + map/tavern/th.mjs createLeakFence）。
// 断言四件事：① 大段内联 HTML 状态栏源码与占位符 100% 被抹掉；② 正文的 Markdown / 换行 / 代码块一字不动；
// ③ 变量块只清残片（闭合的机器块原样留着，那是卡自己的正则负责隐藏的）；④ 只动显示层，**不改写聊天记录**。
import test from 'node:test';
import assert from 'node:assert/strict';
import { stripLeaks, hasLeak } from '../map/tavern/sanitize.mjs';
import { createLeakFence } from '../map/tavern/th.mjs';

const STATUS_HTML = '<div class="statusbar-container"><style>.sb{color:#c33}</style>'
  + '<script>window.__sb=1;</script><div class="sb"><div>日期 3/5</div><div>地点 中层·霓虹街</div></div></div>';
const BODY = '# 霓虹街\n\n她把扳手塞进背包。\n\n- 一件\n- 两件\n\n```js\nconst a = 1;\n```\n';

test('占位标识符：自闭合 / 带属性 / 成对三种写法都抹掉，前后正文接上', () => {
  assert.equal(stripLeaks('前文<StatusPlaceHolderImpl/>后文'), '前文后文');
  assert.equal(stripLeaks('前文<StatusPlaceHolderImpl class="x" />后文'), '前文后文');
  assert.equal(stripLeaks('前文<StatusPlaceHolderImpl>整段内容</StatusPlaceHolderImpl>后文'), '前文后文');
  assert.equal(hasLeak('<StatusPlaceHolderImpl/>'), true);
});

test('整段状态栏 HTML 源码：从容器起配平，块内嵌的 style / script / 子 div 一起走，正文完好', () => {
  const t = BODY + '\n' + STATUS_HTML + '\n\n收尾一句。\n';
  const out = stripLeaks(t);
  assert.doesNotMatch(out, /statusbar-container|<style|<script|<div|日期 3\/5/);
  assert.ok(out.includes('她把扳手塞进背包。'));
  assert.ok(out.includes('```js\nconst a = 1;\n```'));
  assert.ok(out.includes('收尾一句。'));
  assert.equal(hasLeak(out), false);
});

test('没收尾的流式半截：doctype / 容器起手的那一段到末尾都算源码', () => {
  assert.equal(stripLeaks('正文\n<!DOCTYPE html>\n<html><body><p>x</p>'), '正文\n');
  assert.equal(stripLeaks('正文\n<div class="statusbar-container">还没闭合'), '正文\n');
  assert.equal(hasLeak('正文\n<!DOCTYPE html>'), true);
});

test('变量块残片：没闭合的从开标签起到末尾切掉；闭合的机器块与正文原样保留', () => {
  assert.equal(stripLeaks('正文\n<UpdateVariable>\n_.set("a",1);\n'), '正文\n');
  const kept = '正文\n<UpdateVariable>\n_.set("a",1);\n</UpdateVariable>\n后文';
  assert.equal(stripLeaks(kept), kept);                        // 闭合块不动（卡的正则负责隐藏它，地图不碰）
  assert.equal(stripLeaks('前文</UpdateVariable>后文'), '前文后文');   // 整段里没有开标签 = 孤儿闭标签
});

test('正常 Markdown 完全不受影响；过滤是幂等的（流式反复调用不会越擦越短）', () => {
  assert.equal(stripLeaks(BODY), BODY);
  assert.equal(hasLeak(BODY), false);
  for (const t of [BODY + STATUS_HTML, '前文<StatusPlaceHolderImpl/>后文', '正文\n<UpdateVariable>\n_.set("a",1);\n']) {
    const a = stripLeaks(t);
    assert.equal(stripLeaks(a), a, t.slice(0, 20));
  }
  assert.equal(stripLeaks(''), '');
  assert.equal(stripLeaks(null), '');
});

test('渲染层：只删泄露节点、洗净泄露文本节点，干净节点与聊天记录都不动', () => {
  const removed = [];
  const texts = [{ data: '正文一段' }, { data: '还有 <StatusPlaceHolderImpl/> 一点' }];
  const doc = { createTreeWalker: () => { let i = -1; return { nextNode: () => texts[++i] || null }; } };
  const leaks = [{ remove: () => removed.push('statusbar-container') }];
  const el = { ownerDocument: doc, querySelectorAll: sel => (sel.includes('statusbar-container') ? leaks : []) };
  const fence = createLeakFence({ retrieve: id => (id === 3 ? el : null), log: () => {} });

  assert.equal(fence.sweep(3), 2);                     // 1 个容器节点 + 1 个文本节点
  assert.deepEqual(removed, ['statusbar-container']);
  assert.equal(texts[0].data, '正文一段');               // 干净文本一个字节不动
  assert.equal(texts[1].data, '还有  一点');             // 只抹掉占位符
  assert.deepEqual(fence.describe().last.floor, 3);
  assert.equal(fence.sweep(-1), 0);                     // 非法楼层：跳过，不抛
  assert.equal(fence.sweep('x'), 0);
  assert.equal(fence.sweep(9), 0);                      // 取不到元素（还没渲染 / 面板关着）
  const d = fence.describe();
  assert.equal(d.swept, 1); assert.equal(d.nodes, 2); assert.equal(d.errors, 0);
});
