// skills/card-map 的辅助脚本：export_card（拆卡、不写进仓库）、coverage（行号并集找缺口）、check_here（示例包 town 每个写法落点正确）
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cwd = fileURLToPath(new URL('..', import.meta.url));
const run = (cmd, args) => spawnSync(cmd, args, { cwd, encoding: 'utf8' });
test('export_card + coverage：拆出文件与行数；缺口列出；拒绝写进仓库', () => {
  const d = mkdtempSync(join(tmpdir(), 'cm-')), card = join(d, 'c.json'), out = join(d, 'o');
  writeFileSync(card, JSON.stringify({ data: { name: 'T', first_mes: 'a\nb', character_book: { entries: [{ comment: '码头·鱼市', keys: ['鱼市'], content: 'l1\nl2' }] } } }));
  let r = run('python3', ['skills/card-map/export_card.py', card, '--out', out]); assert.equal(r.status, 0, r.stderr);
  const lines = JSON.parse(readFileSync(join(out, 'lines.json'), 'utf8')); assert.equal(lines['book.txt'], 3);
  writeFileSync(join(d, 'r.md'), 'book.txt:1-3\n');
  r = run('python3', ['skills/card-map/coverage.py', out, join(d, 'r.md')]); assert.equal(r.status, 1); assert.match(r.stdout, /未读 greet\.txt:1-/);
  r = run('python3', ['skills/card-map/export_card.py', card, '--out', 'map/x']); assert.notEqual(r.status, 0); assert.match(r.stderr, /不写进仓库/);
});
test('check_here：town 每个名字 / 别名 / 层·地点都落到对的标记', () => {
  const r = run('node', ['skills/card-map/check_here.mjs', 'town']); assert.equal(r.status, 0, r.stdout + r.stderr);
});
