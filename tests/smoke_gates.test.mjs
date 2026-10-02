// D17：文档类关口只警告。grep 级：smoke.sh 里这些关口必须走 warn_step，其余硬关口必须仍走 step。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const smoke = readFileSync(fileURLToPath(new URL('../tools/smoke.sh', import.meta.url)), 'utf8').split('\n');
const lineOf = needle => smoke.filter(l => l.includes(needle) && /^(warn_)?step /.test(l));

const WARN = ['check_doc_language.py', 'test_doc_language.py', 'check_zh_mirror.py', 'check_zh_mirror.py --self-test',
  'check_readme.py', 'test_readme.py', 'check_arch_doc.py', 'check_arch_doc.py --self-test'];
const HARD = ['check_maps.py', 'check_pack.py', 'check_architecture.py', 'test_architecture_gate.py', 'check_stage_a_grep.py',
  'check_no_labels.py', 'check_ascii.py', 'check_version.py', 'check_tree_hygiene.py', 'node --test tests/', 'render_preflight.py lint'];

test('smoke.sh defines warn_step, which never sets the failure flag', () => {
  const i = smoke.findIndex(l => l.startsWith('warn_step()'));
  assert.ok(i > 0, 'warn_step helper missing');
  const body = smoke.slice(i, i + 3).join('\n');
  assert.ok(!/FAIL=1/.test(body), 'warn_step must not set FAIL');
  assert.ok(body.includes('⚠'), 'warn_step must print a warning marker');
});

for (const g of WARN) {
  test(`doc gate ${g} runs under warn_step`, () => {
    const hits = lineOf(g).filter(l => l.includes(g + '"') || l.endsWith(g) || l.includes(' ' + g));
    assert.ok(hits.length >= 1, `${g} not found in smoke.sh`);
    assert.ok(hits.every(l => l.startsWith('warn_step ')), `${g} must be warn_step: ${hits.join(' | ')}`);
  });
}

for (const g of HARD) {
  test(`product gate ${g} stays a hard step`, () => {
    const hits = lineOf(g);
    assert.ok(hits.length >= 1, `${g} not found in smoke.sh`);
    assert.ok(hits.every(l => l.startsWith('step ')), `${g} must stay hard: ${hits.join(' | ')}`);
  });
}
