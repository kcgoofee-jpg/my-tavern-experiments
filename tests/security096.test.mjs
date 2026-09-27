// v0.9.6 安保叠加层数据：每条指向存在的层级图标记、类别已知、中英都有、没有内容边界外的词
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const J = f => JSON.parse(fs.readFileSync(fileURLToPath(new URL('../map/' + f, import.meta.url)), 'utf8'));
test('security.json 指向存在的标记，字段齐全，措辞中性', () => {
  const S = J('data/security.json'), R = J('data/maps.json');
  assert.ok(S.items.length >= 2);
  for (const it of S.items) {
    assert.ok(R.maps[it.map]?.markers?.[it.marker], `${it.map}/${it.marker}`);
    for (const f of it.facts) { assert.ok(S.kinds[f.kind], f.kind); assert.ok(f.text && f.text_en && f.src);
      assert.doesNotMatch(f.text, /母畜|调教|束缚|惩罚/); }
  }
  const kinds = new Set(S.items.flatMap(i => i.facts.map(f => f.kind)));
  for (const k of ['barrier', 'monitor', 'access', 'alarm']) assert.ok(kinds.has(k), k);
});
