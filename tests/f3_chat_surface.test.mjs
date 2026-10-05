// F3 TT 聊天界面（IN-1）：原生适配层的 ui.displayedMessage = 直查酒馆聊天列（docs/extension-study.md §4），
// 泄露防御网经它取「渲染后的那一楼」——脚本形态照旧走 TH 接口，两种形态喂给 fence 的 retrieve 形状一致。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeAdapter } from '../map/tavern/host-native.mjs';
import { createLeakFence } from '../map/tavern/tavernhelper-api.mjs';

const adapter = createNativeAdapter({});

/** 假聊天列：按选择器存节点；记录被查询的选择器串 */
function fakeChat(o = {}) {
  const seen = [];
  const doc = { querySelector: sel => { seen.push(sel); return o.nodes?.[sel] ?? null; } };
  return { doc, seen };
}
const leakChild = () => ({ removed: false, remove() { this.removed = true; } });
const fakeMsg = leaks => ({
  leakEls: leaks,
  querySelectorAll: () => leaks,
  ownerDocument: null,   // 没有 createTreeWalker：文本净化段自动跳过，只测节点删除
});

test('F3 displayedMessage: 楼层号 → #chat 里对应 mesid 的节点', () => {
  const msg = fakeMsg([]);
  const f = fakeChat({ nodes: { '#chat .mes[mesid="2"]': msg } });
  globalThis.document = f.doc;
  try {
    assert.equal(adapter.ui.displayedMessage(2), msg);
    assert.deepEqual(f.seen, ['#chat .mes[mesid="2"]']);
  } finally { delete globalThis.document; }
});

test('F3 displayedMessage: 小数楼层取整；非法或负数 → 空', () => {
  const msg = fakeMsg([]);
  const f = fakeChat({ nodes: { '#chat .mes[mesid="7"]': msg } });
  globalThis.document = f.doc;
  try {
    assert.equal(adapter.ui.displayedMessage('7.4'), msg);
    assert.equal(adapter.ui.displayedMessage('abc'), undefined);
    assert.equal(adapter.ui.displayedMessage(-3), undefined);
    assert.equal(adapter.ui.displayedMessage(99), undefined, '聊天列没有这一楼');
  } finally { delete globalThis.document; }
});

test('F3 displayedMessage: 没有 document（node / 沙箱）不抛', () => {
  assert.equal(adapter.ui.displayedMessage(1), null);
});

test('F3 泄露防御网经 displayedMessage 清楼层', () => {
  const a = leakChild(), b = leakChild();
  const msg = fakeMsg([a, b]);
  const f = fakeChat({ nodes: { '#chat .mes[mesid="2"]': msg } });
  globalThis.document = f.doc;
  try {
    const logs = [];
    const fence = createLeakFence({ retrieve: id => adapter.ui.displayedMessage(id), log: s => logs.push(s) });
    assert.equal(fence.sweep(2), 2);
    assert.equal(a.removed, true); assert.equal(b.removed, true);
    assert.equal(fence.describe().swept, 1);
    assert.equal(logs.length, 1);
    assert.equal(fence.sweep('x'), 0, '非法楼层：跳过不报错');
    assert.equal(fence.describe().errors, 0);
  } finally { delete globalThis.document; }
});
