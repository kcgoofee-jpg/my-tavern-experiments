// v0.9.6 地图 → 聊天：模板、填入酒馆输入框（只填不发）
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../map/tavern/compose-templates.mjs';

const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m }; };

test('默认模板与填充', () => {
  const t = C.read(mem(), 'zh');
  assert.equal(C.fill(t.go, '7 号井黑市'), '前往7 号井黑市。');
  assert.equal(C.fill(t.ask, '货运站火灾'), '关于货运站火灾，');
  assert.equal(C.fill(C.read(mem(), 'en').go, 'Well 7'), 'Go to Well 7. ');
  assert.equal(C.fill('去看看 ', '书房'), '去看看 书房');   // 没有 {name}：接在后面
  assert.equal(C.fill(t.go, ''), '');
  assert.equal(C.fill(t.go, 'a\nb'), '前往a b。');
  assert.equal(C.fill(t.go, '{{user}} 的公寓'), '前往的公寓。');
  assert.ok([...C.fill('{name}'.repeat(10), 'x'.repeat(80))].length <= C.MAX_TEMPLATE_CHARS);
});

test('本机模板：改过的覆盖默认，清空删键', () => {
  const st = mem();
  assert.ok(C.write(st, { go: '我们去{name}吧。', ask: '' }));
  assert.deepEqual(C.read(st, 'zh'), { go: '我们去{name}吧。', ask: '关于{name}，', custom: true });
  C.write(st, { go: ' ', ask: '' }); assert.equal(st.m.has(C.COMPOSE_TEMPLATES_STORAGE_KEY), false);
  assert.equal(C.read(mem({ [C.COMPOSE_TEMPLATES_STORAGE_KEY]: 'bad json' })).go, '前往{name}。');
});

test('insert：有 #send_textarea 时接在草稿后面并派发 input，不发送', () => {
  const evs = []; const ta = { value: '', dispatchEvent: e => evs.push(e.type), focus() {}, setSelectionRange() {} };
  class Ev { constructor(t) { this.type = t; } }
  const win = { document: { getElementById: id => (id === 'send_textarea' ? ta : null) }, Event: Ev };
  let slashed = null;
  assert.equal(C.insert(win, '前往书房。', s => { slashed = s; }), 'textarea');
  assert.equal(ta.value, '前往书房。'); assert.deepEqual(evs, ['input']); assert.equal(slashed, null);
  ta.value = '我想想'; C.insert(win, '关于火灾，');
  assert.equal(ta.value, '我想想 关于火灾，');
});

test('insert：没有输入框时退回 /setinput（转义 |），都没有返回空', () => {
  let s = null;
  assert.equal(C.insert({ document: { getElementById: () => null } }, 'a|b', x => { s = x; }), 'slash');
  assert.equal(s, '/setinput a\\|b');
  assert.equal(C.insert({}, 'x', null), '');
  assert.equal(C.insert({}, '   ', x => { s = x; }), '');
});
