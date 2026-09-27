// map/section.js：剖面数据校验；缺 SECTION 条目不能让绘制抛错（接手 review A-测试缺口）
import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../map/data/world.js';
import { drawSection, validateSection, normSection, SECTION_ITEM_KEYS } from '../map/section.js';

const node = () => ({ setAttribute() {}, appendChild() {}, append() {}, style: {}, dataset: {}, innerHTML: '', textContent: '' });
const draw = sec => {
  const tips = [], warn = console.warn; console.warn = () => {};
  try { drawSection(node(), () => node(), (e, it) => { assert.ok(it && typeof it.src === 'string', 'tip 收到 src'); tips.push(it); }, { ...D, SECTION: sec }); }
  finally { console.warn = warn; }
  return tips;
};

test('committed data validates clean and draws without placeholders', () => {
  assert.deepEqual(validateSection(D.SECTION), []);
  assert.ok(!draw(D.SECTION).some(t => t.missing));
});

test('each missing item: reported, drawn as placeholder, no throw', () => {
  for (const k of SECTION_ITEM_KEYS) {
    const sec = { ...D.SECTION, items: D.SECTION.items.filter(i => !i.name.includes(k)) };
    assert.ok(validateSection(sec).some(p => p.includes(k)), k);
    const tips = draw(sec);   // 伊甸的悬停文字是写死的全文，不挂数据条目，缺了只需不抛错
    if (k !== '伊甸') assert.ok(tips.some(t => t.missing && t.name === k), k);
  }
});

test('empty / broken SECTION does not throw', () => {
  for (const sec of [undefined, null, {}, { items: null, bands: 'x', lines: [null, { at: 'x' }] }, { ...D.SECTION, items: [null, { at: 1 }], bands: [] }]) {
    assert.ok(validateSection(sec).length > 0);
    assert.doesNotThrow(() => draw(sec));
  }
  assert.equal(normSection({}).bands.length, 3);
});
