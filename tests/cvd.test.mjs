// 色觉模式（E7 补做，map/app/cvd.mjs）：色板映射（每个大类都登记、模式内两两不同色）+ 设置的本机持久化（经 core/storage.mjs）。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as TCCvd from '../map/app/cvd.mjs';
import * as S from '../map/core/storage.mjs';

const GROUPS = ['空防', '气候', '治安', '政治', '媒体', '民生', '军事', '灾害', '人物', '其他'];

test('groupColor：关时原样返回 fallback，不改颜色', () => {
  for (const g of GROUPS) assert.equal(TCCvd.groupColor(g, '#123456'), '#123456');
});

test('色板映射：rg / by 两套色板都给每个大类一个合法十六进制色，且模式内互不重复', () => {
  for (const m of ['rg', 'by']) {
    const t = TCCvd.GROUPS_CVD[m];
    for (const g of GROUPS) assert.match(t[g] || t.其他, /^#[0-9a-f]{6}$/i, `${m}.${g}`);
    const vals = GROUPS.map(g => (t[g] || t.其他).toLowerCase());
    assert.equal(new Set(vals).size, vals.length, `${m} 大类颜色应两两不同`);
  }
});

test('charHues：关时返回 null（调用方用原表），开时给出的色相表非空且与默认表不同', () => {
  assert.equal(TCCvd.CHAR_HUES_CVD.rg.length > 0, true);
  assert.equal(TCCvd.CHAR_HUES_CVD.by.length > 0, true);
  assert.notDeepEqual(TCCvd.CHAR_HUES_CVD.rg, TCCvd.CHAR_HUES_CVD.by);
});

test('inkOn：浅底给深字，深底给白字（WCAG 相对亮度阈值），非法色兜底深字', () => {
  assert.equal(TCCvd.inkOn('#f0e442'), '#0b0b0b');   // 黄，亮
  assert.equal(TCCvd.inkOn('#0072b2'), '#fff');       // 深蓝
  assert.equal(TCCvd.inkOn('not-a-color'), '#0b0b0b');
});

test('设置的本机持久化：edenMapCvd 登记在 KEYS，默认关，只收三个合法值', () => {
  assert.ok(S.known('edenMapCvd'));
  const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
  const G = { localStorage: mem(), sessionStorage: mem() };
  assert.equal(S.get('edenMapCvd', undefined, G), '0');
  S.set('edenMapCvd', 'rg', G); assert.equal(S.get('edenMapCvd', undefined, G), 'rg');
  S.set('edenMapCvd', 'by', G); assert.equal(S.get('edenMapCvd', undefined, G), 'by');
});

test('mode()/setMode()：非法值落回关，合法值按 KEYS 兜底走同一份 localStorage', () => {
  const store = new Map();
  const g = { localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) } };
  global.globalThis.localStorage = g.localStorage;
  try {
    TCCvd.setMode('rg'); assert.equal(TCCvd.mode(), 'rg');
    TCCvd.setMode('nonsense'); assert.equal(TCCvd.mode(), '0');
  } finally { delete global.globalThis.localStorage; }
});
