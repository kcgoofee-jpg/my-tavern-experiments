// F3 TT 专项：transfer.mjs 的三级复制 / 存文件 / 外链 / 手动面板，全部喂假窗口假文档（不依赖浏览器）。
// 顺序与形状按 docs/extension-study.md §7 的真机结论：TT 桥 → 网页剪贴板（800 ms 超时）→ execCommand。
import test from 'node:test';
import assert from 'node:assert/strict';
import { tauriInvoke, copyText, openExternal, saveTextFile, execCopy, revealManual, CLIP_TIMEOUT } from '../map/app/transfer.mjs';

// uiTextOr 读 window.I18N：node 里给一个空壳即可（I18N 缺席时它走中文兜底）
globalThis.window ??= {};

// ---- 假 DOM ----
function el(tag) {
  const e = {
    tagName: tag, children: [], attrs: {}, id: '', className: '', value: '', textContent: '',
    append(...k) { for (const c of k) { c.parentElement = e; e.children.push(c); } return e; },
    addEventListener(t, fn) { (e.handlers ??= {})[t] = fn; },
    remove() { e.removed = true; const p = e.parentElement; if (p) { const i = p.children.indexOf(e); if (i >= 0) p.children.splice(i, 1); } },
    click() { e.clicked = true; },
    focus() { e.focused = (e.focused || 0) + 1; },
    select() { e.selected = (e.selected || 0) + 1; },
    setAttribute(k, v) { e.attrs[k] = v; },
    setSelectionRange(a, b) { e.sel = [a, b]; },
    querySelector(sel) {
      for (const c of e.children) {
        if ((sel.startsWith('#') && c.id === sel.slice(1)) || (sel.startsWith('.') && (c.className || '').split(' ').includes(sel.slice(1)))) return c;
        const r = c.querySelector ? c.querySelector(sel) : null; if (r) return r;
      }
      return null;
    },
  };
  return e;
}
function fakeDoc(o = {}) {
  const d = { head: el('head'), body: el('body'), cmds: [], created: [], _copyOk: o.copyOk !== false };
  d.createElement = t => { const e = el(t); d.created.push(e); return e; };
  d.getElementById = id => { const stack = [d.head, d.body]; while (stack.length) { const n = stack.pop(); if (n.id === id) return n; stack.push(...(n.children || [])); } return null; };
  d.execCommand = c => { d.cmds.push(c); return d._copyOk; };
  return d;
}

// ---- tauriInvoke ----
test('F3 tauriInvoke: 本窗口 → parent 链找桥；跨 4 层找不到就算没有', () => {
  const invoke = (c, a) => `${c}`;
  assert.equal(tauriInvoke({ __TAURI__: { core: { invoke } } })('x'), 'x');
  assert.equal(tauriInvoke({ parent: { __TAURI__: { core: { invoke } } } })('y'), 'y');
  assert.equal(tauriInvoke({}), null);
  let deep = { __TAURI__: { core: { invoke } } };
  for (let i = 0; i < 5; i++) deep = { parent: deep };
  assert.equal(tauriInvoke(deep), null, '第 5 层以外不追');
  const blocked = {}; Object.defineProperty(blocked, 'parent', { get() { throw new Error('sandbox'); } });
  assert.equal(tauriInvoke(blocked), null, '沙箱拒绝读 parent：当没有');
});

// ---- copyText 链路顺序 ----
test('F3 copyText: 桥成功就不碰网页剪贴板', async () => {
  const calls = [];
  const clip = { writeText: () => { calls.push('clipboard'); return Promise.resolve(); } };
  const ok = await copyText('hi', { win: { navigator: { clipboard: clip } }, doc: fakeDoc(),
    invoke: (c, a) => { calls.push(c); assert.deepEqual(a, { text: 'hi' }); return Promise.resolve(); } });
  assert.equal(ok, true);
  assert.deepEqual(calls, ['plugin:clipboard-manager|write_text'], '只走桥');
});

test('F3 copyText: 桥失败 → 网页剪贴板', async () => {
  let clipGot = null;
  const ok = await copyText('t', { win: { navigator: { clipboard: { writeText: s => { clipGot = s; return Promise.resolve(); } } } }, doc: fakeDoc(),
    invoke: () => Promise.reject(new Error('no bridge')) });
  assert.equal(ok, true); assert.equal(clipGot, 't');
});

test('F3 copyText: 网页剪贴板挂住 → 超时后走 execCommand，不永挂', async () => {
  const d = fakeDoc();
  const t0 = Date.now();
  const ok = await copyText('long text', { win: { navigator: { clipboard: { writeText: () => new Promise(() => {}) } } }, doc: d, invoke: null });
  const dt = Date.now() - t0;
  assert.equal(ok, true);
  assert.ok(dt >= 700 && dt < 3000, `超时落在 ${CLIP_TIMEOUT} ms 附近：${dt}`);
  assert.deepEqual(d.cmds, ['copy']);
});

test('F3 copyText: 三级全挂 → false（不抛）', async () => {
  const d = fakeDoc({ copyOk: false });
  const ok = await copyText('x', { win: {}, doc: d, invoke: () => Promise.reject(new Error('x')) });
  assert.equal(ok, false);
});

test('F3 copyText: 没有剪贴板也没有桥 → execCommand 兜底', async () => {
  const d = fakeDoc();
  assert.equal(await copyText('abc', { win: {}, doc: d, invoke: null }), true);
  assert.deepEqual(d.cmds, ['copy']);
});

// ---- execCopy ----
test('F3 execCopy: 隐藏文本框复制后删掉，execCommand 缺席返回 false', () => {
  const d = fakeDoc();
  assert.equal(execCopy('zz', d), true);
  assert.equal(d.body.children.length, 0, '复制完就移除');
  const noCmd = fakeDoc(); delete noCmd.execCommand;
  assert.equal(execCopy('zz', noCmd), false);
});

// ---- saveTextFile ----
test('F3 saveTextFile: 普通浏览器走 <a download>，文件名正确', async () => {
  const d = fakeDoc();
  const r = await saveTextFile('a.txt', 'body', { doc: d, win: {}, invoke: null, type: 'text/plain;charset=utf-8' });
  assert.equal(r, 'downloaded');
  const a = d.created.find(c => c.tagName === 'a');
  assert.ok(a, '建了下载锚点'); assert.equal(a.download, 'a.txt'); assert.equal(a.clicked, true);
});

test('F3 saveTextFile: TT（有桥）不下载，改复制', async () => {
  const d = fakeDoc();
  let clipped = null;
  const r = await saveTextFile('a.json', '{}', { doc: d, win: {}, invoke: (c, x) => { clipped = [c, x]; return Promise.resolve(); } });
  assert.equal(r, 'copied');
  assert.deepEqual(clipped, ['plugin:clipboard-manager|write_text', { text: '{}' }]);
  assert.equal(d.body.children.length, 0, '不挂下载锚点');
});

test('F3 saveTextFile: TT 且复制全挂 → manual', async () => {
  const d = fakeDoc({ copyOk: false });
  const r = await saveTextFile('a.txt', 't', { doc: d, win: {}, invoke: () => Promise.reject(new Error('x')) });
  assert.equal(r, 'manual');
});

// ---- openExternal ----
test('F3 openExternal: TT 走 opener 桥；普通浏览器 window.open；全败 false', async () => {
  const cmds = [];
  assert.equal(await openExternal('https://x.test', { win: {}, invoke: (c, a) => { cmds.push([c, a]); return Promise.resolve(); } }), true);
  assert.deepEqual(cmds, [['plugin:opener|open_url', { url: 'https://x.test' }]]);
  let opened = null;
  assert.equal(await openExternal('https://y.test', { win: { open: (u, t, f) => { opened = [u, t, f]; return {}; } }, invoke: null }), true);
  assert.deepEqual(opened, ['https://y.test', '_blank', 'noopener,noreferrer']);
  assert.equal(await openExternal('https://z.test', { win: { open: () => null }, invoke: null }), false);
});

// ---- revealManual ----
test('F3 revealManual: 建面板、全选内容、{name} 代入；二次调用只换内容', () => {
  const d = fakeDoc();
  const box = revealManual('my.json', 'CONTENT', { doc: d });
  assert.equal(box.id, 'emManual'); assert.equal(box.attrs.role, 'dialog');
  assert.equal(box.querySelector('#emManualText').value, 'CONTENT');
  assert.match(box.querySelector('#emManualHint').textContent, /my\.json/);
  assert.ok(box.querySelector('#emManualHint').textContent.includes('手动复制'));
  assert.equal(box.querySelector('#emManualText').selected, 1);
  const again = revealManual('other.json', 'SECOND', { doc: d });
  assert.equal(again, box, '同一个面板');
  assert.equal(d.body.children.filter(c => c.id === 'emManual').length, 1);
  assert.equal(box.querySelector('#emManualText').value, 'SECOND');
  box.querySelector('.emx-close').handlers.click();
  assert.equal(box.removed, true);
});

test('F3 revealManual: 没有 document 也不抛', () => {
  assert.equal(revealManual('a', 'b', { doc: null }), null);
});
