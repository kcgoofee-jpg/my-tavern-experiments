// C-8：make_dzi 原子切片 + 校验（层数 / 瓦片数 / extent_m 宽高比）；已提交的底图金字塔都完整
import test from 'node:test';
import { fileURLToPath } from 'node:url';   // .pathname 会把中文路径百分号编码（主 checkout 在「性能/」下）
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, unlinkSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const py = (...a) => spawnSync('python3', a, { cwd: ROOT, encoding: 'utf8' });
const hasPIL = py('-c', 'import PIL').status === 0;

test('committed base pyramids verify', { skip: !hasPIL && 'no Pillow' }, () => {
  for (const m of ['world', 'tc_upper', 'tc_mid', 'tc_low']) { const r = py('tools/make_dzi.py', '--verify', `map/art/${m}`); assert.equal(r.status, 0, r.stdout); }
});

test('cut, re-cut in place, detect missing tile and bad extent', { skip: !hasPIL && 'no Pillow' }, () => {
  const d = mkdtempSync(join(tmpdir(), 'dzi-')), src = join(d, 's.png'), out = join(d, 'o');
  try {
    assert.equal(py('-c', `from PIL import Image; Image.new('RGB',(1300,700)).save(${JSON.stringify(src)})`).status, 0);
    for (let i = 0; i < 2; i++) assert.equal(py('tools/make_dzi.py', src, out, '--tile', '256').status, 0);
    assert.deepEqual(readdirSync(d).sort(), ['o.dzi', 'o_files', 's.png'], 'no tmp / old leftovers');
    assert.equal(py('tools/make_dzi.py', '--verify', out, '--extent-m', '13', '7').status, 0);
    assert.equal(py('tools/make_dzi.py', '--verify', out, '--extent-m', '1.6', '1').status, 1);
    assert.equal(py('tools/make_dzi.py', src, join(d, 'x'), '--extent-m', '1.6', '1').status, 1);
    assert.ok(!existsSync(join(d, 'x.dzi')), 'refused cut writes nothing');
    unlinkSync(join(out + '_files', '11', '0_0.jpg'));
    assert.equal(py('tools/make_dzi.py', '--verify', out).status, 1);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
