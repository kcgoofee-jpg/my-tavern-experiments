// FIX-3 4 (COPY-1): the 3D estate page's own string table (map/estate/main.js) follows docs/copy-style.md.
// One table, zh first with an en mirror on the same keys; no text glyphs; no inline user copy outside it;
// no dead keys; the core dictionary's word for the same thing is not contradicted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('..', import.meta.url);
const src = readFileSync(new URL('map/estate/main.js', ROOT), 'utf8');
const rd = p => JSON.parse(readFileSync(new URL(p, ROOT), 'utf8'));
const LINES = src.split('\n');
const row = lang => {
  const i = LINES.findIndex(l => l.trimStart().startsWith(`${lang}: {`));
  assert.ok(i >= 0, `TXT.${lang} row`);
  return Object.fromEntries([...LINES[i].matchAll(/(\w+):\s*'((?:[^'\\]|\\.)*)'/g)].map(x => [x[1], x[2]]));
};
const zh = row('zh'), en = row('en');
const ROWS = LINES.map((l, i) => [l, i]).filter(([l]) => /^\s*(zh|en): \{/.test(l)).map(([, i]) => i);
// the hint card is markup (<b>…</b>), so it stays out of the plain table on purpose
const CARD = /makeHintCard\(\{[\s\S]*?lines: LANG === 'en' \? \[([\s\S]*?)\] : \[([\s\S]*?)\] \}\);/;
const card = CARD.exec(src) || ['', '', ''];
const cardLines = s => { const a = src.indexOf(s); return a < 0 ? [] : Array.from({ length: s.split('\n').length }, (_, k) => src.slice(0, a).split('\n').length + k); };
const inCard = new Set([...cardLines(card[1]), ...cardLines(card[2])]);
const CJK = /(?<![\w])'[^'\n]*[一-鿿][^'\n]*'/;

test('the table is one zh row with an en mirror: same keys, same order, same placeholders', () => {
  assert.ok(Object.keys(zh).length >= 25, `${Object.keys(zh).length} keys`);
  assert.deepEqual(Object.keys(zh), Object.keys(en));
  const ph = s => (String(s).match(/\{\w+\}/g) || []).sort();
  for (const [k, v] of Object.entries(zh)) {
    assert.deepEqual(ph(v), ph(en[k]), `${k}: placeholders differ`);
    assert.ok(v.length > 0 && en[k].length > 0, `${k}: empty`);
  }
});

test('no text glyphs, arrows and AI tone in anything the page says (copy-style §3 rules 3 and 4)', () => {
  const said = [...Object.values(zh), ...Object.values(en),
    ...[...card[1].matchAll(/'([^']*)'/g), ...card[2].matchAll(/'([^']*)'/g)].map(m => m[1])];
  assert.ok(said.length >= Object.keys(zh).length * 2, `${said.length} strings checked`);
  for (const s of said) {
    assert.doesNotMatch(s, /[⚠✓✗◆★◷✅]|⌃|⌥|＝|−|[←-⇿⌀-⏿■-◿☀-⛿]/, `glyph or arrow in: ${s}`);
    assert.doesNotMatch(s, /我们为您|已为你|一键|轻松|！/, `AI tone in: ${s}`);
  }
});

test('the same thing is called the same way here as in the core dictionary (rule 7)', () => {
  const core = rd('map/i18n/zh.json');
  assert.equal(zh.alias, core['pr.aliases'], 'the alias row label follows the core wording');
  assert.equal(zh.labels, core['labels_tog_t'], 'the labels toggle matches the core string, brackets included');
  assert.equal(zh.zreset, core['k.home']);
  assert.equal(zh.size, core['v3.area']); assert.equal(zh.use, core['v3.use']); assert.equal(zh.access, core['v3.access']);
});

test('no user copy is hardcoded outside the table and the hint card', () => {
  // 三条例外，都是「读进来的中文」而不是「说出去的中文」：三维外壳建好之前那一次首帧标签（buildNav 立刻用 tx() 覆盖）、
  // 解析器认写法用的别名表（includes）、拿包数据做的比较（===）。它们不是文案，所以不进这张表，也不该被门控扫。
  const isInput = l => /\.includes\(|\.startsWith\(|\.endsWith\(|\.match\(|===|!==/.test(l) || /window\.UI3D\.create\(/.test(l);
  const stray = LINES.map((l, i) => [i + 1, l]).filter(([i, l]) =>
    !ROWS.includes(i) && !inCard.has(i) && !l.trim().startsWith('//') && CJK.test(l) && !isInput(l));
  assert.deepEqual(stray.map(([i]) => i), [], 'a Chinese literal outside the table: ' + stray.map(([i, l]) => `${i}: ${l.trim()}`).join(' | '));
});

test('no dead keys: every key in the table is read somewhere', () => {
  const body = LINES.filter((_, i) => !ROWS.includes(i)).join('\n');
  for (const k of Object.keys(zh)) {
    const read = new RegExp(`tx\\(\\s*'${k}'`).test(body)   // 直接取
      || new RegExp(`'${k}'`).test(body)                    // 或经一个键名循环 / 事件 id 取（缩放按钮那三个）
      || ['top', 'iso', 'front', 'free'].includes(k);      // 视角预设：id 数组过 tx()
    assert.ok(read, `TXT.${k} is never read`);
  }
});
