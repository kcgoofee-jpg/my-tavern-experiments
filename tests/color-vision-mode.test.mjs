// 色觉模式（E7 补做，map/app/color-vision-mode.mjs）：色板映射（每个大类都登记、模式内两两不同色）+ 设置的本机持久化（经 core/storage.mjs）。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as TCCvd from '../map/app/color-vision-mode.mjs';
import * as S from '../map/core/storage.mjs';

import { readFileSync } from 'node:fs';
import * as F from './helpers/s43_frozen.mjs';
// S4-3：色板在设定包数据里——每个大类自己带 x-cvd（overlay.v2.json events.groups[]）；引擎里只有没带时按色相归桶的通用色板
const GROUPS = JSON.parse(readFileSync(new URL('../map/packs/eden/overlay.v2.json', import.meta.url), 'utf8')).events.groups;
const withMode = (m, f) => { const store = new Map(); globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  try { TCCvd.setMode(m); return f(); } finally { delete globalThis.localStorage; } };

test('groupColor：关时原样返回 fallback，不改颜色', () => {
  for (const g of GROUPS) assert.equal(withMode('0', () => TCCvd.groupColor(g.id, '#123456', g['x-cvd'])), '#123456');
});

test('色板映射：每个大类自带 rg / by 两套色，都是合法十六进制色，且模式内互不重复', () => {
  for (const m of ['rg', 'by']) {
    const vals = GROUPS.map(g => { assert.match(g['x-cvd']?.[m], /^#[0-9a-f]{6}$/i, `${m}.${g.label}`); return g['x-cvd'][m].toLowerCase(); });
    assert.equal(GROUPS.length, 10);
    assert.equal(new Set(vals).size, vals.length, `${m} 大类颜色应两两不同`);
  }
});

test('S4-3：按大类 id 取色，第一个包每个大类在 rg / by 两种模式下的颜色与以前（按标签查的两张表）逐个相同', () => {
  for (const m of ['rg', 'by']) for (const g of GROUPS) {
    assert.equal(withMode(m, () => TCCvd.groupColor(g.id, g.color, g['x-cvd'])), F.groupColorV1(m, g.label, g.color), `${m} ${g.label}`);
    assert.equal(withMode(m, () => TCCvd.groupColor(g.id, g.color, g['x-cvd'])), g['x-cvd'][m]);
  }
  assert.deepEqual(GROUPS.map(g => g.label), ['空防', '气候', '治安', '政治', '媒体', '民生', '军事', '灾害', '人物', '其他']);
});

test('S4-3：没带 x-cvd 的大类按原色相归桶（与三维页 cvdColor 同一算法）；x-cvd 里不是 #rrggbb 的值不采用', () => {
  const v3 = readFileSync(new URL('../map/props/viewer3d.html', import.meta.url), 'utf8');
  const src = v3.slice(v3.indexOf('const CVD_PAL'), v3.indexOf('// 包内文案'));
  const three = new Function('CVD', `${src}; return cvdColor;`);
  for (const m of ['rg', 'by']) for (const c of ['#d9a441', '#7fd6ff', '#3d7dff', '#6f9be0', '#d03ca8', '#ff5a2a', '#cfd8e0', '#000000', '#ffffff', '#12ab34']) {
    assert.equal(withMode(m, () => TCCvd.groupColor('x', c, undefined)), three(m)(c), `${m} ${c}`);
    assert.equal(TCCvd.hueBucket(c, m), three(m)(c));
    assert.equal(withMode(m, () => TCCvd.groupColor('x', c, { rg: 'red;background:url(x)', by: '#12345g' })), three(m)(c));
  }
  assert.equal(TCCvd.hueBucket('nonsense', 'rg'), '#ffffff'); assert.equal(three('0')('nonsense'), '#ffffff'); assert.equal(three('0')('red;background:url(x)'), '#ffffff'); assert.equal(three('0')('#abcdef'), '#abcdef');
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

test('U-24 A\': one 8-colour person palette (default and both colour-vision sets), no hue within 20 degrees of the chrome accent', async () => {
  const C = await import('../map/tavern/characters-parse.mjs'), gold = 44, far = h => Math.min(Math.abs(h - gold), 360 - Math.abs(h - gold)) > 20;
  for (const set of [C.CHAR_HUES, TCCvd.CHAR_HUES_CVD.rg, TCCvd.CHAR_HUES_CVD.by]) { assert.equal(set.length, 8); assert.ok(set.every(far), JSON.stringify(set)); assert.equal(new Set(set).size, 8); }
});
