// W1 世界书拓扑微语法（tools/build_worldbook_addon.py 的 [TOPO] 输出模式）：
// 结构校验（块完整、连通段在、出口只认层图、不混 lm_* 三维链接）+ 体积校验（≤ 等价散文边列版的 25%）。
// 直接跑真 builder（subprocess），临时目录落地、用完即删；builder 内部还有同口径 topo_selftest 双保险。
// 见 docs/plans/llm-campaign.md W1 / 裁决 12-13。
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// 与 modes.tokens / builder tokens 同一口径：CJK 1 字 1 token，其余 4 字符 1 token
const tokens = s => { let c = 0, o = 0; for (const ch of String(s || '')) { if (/[⺀-鿿＀-￯　-〿]/.test(ch)) c++; else o++; } return c + Math.ceil(o / 4); };

function buildBook() {
  const dir = mkdtempSync(join(tmpdir(), 'wbtopo-'));
  execFileSync('python3', ['tools/build_worldbook_addon.py', '--out', join(dir, 'book.json')],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });   // 非零退出（含 topo_selftest 失败）直接抛
  const book = JSON.parse(readFileSync(join(dir, 'book.json'), 'utf8'));
  const entries = Array.isArray(book.entries) ? book.entries : Object.values(book.entries || {});
  return { dir, entries };
}

test('结构：方位层条目带完整 [TOPO] 块；出口只认层图；不混 lm_* 三维地标链接', () => {
  const { dir, entries } = buildBook();
  try {
    const topo = entries.filter(e => (e.content || '').includes('[TOPO: '));
    assert.ok(topo.length >= 3, `至少三个层的方位条目带 TOPO，实际 ${topo.length}`);
    for (const e of topo) {
      const m = e.content.match(/\[TOPO: ([^\]]+)\]/);
      assert.ok(m, `${e.name}：TOPO 块不完整（缺右括号？）`);
      assert.ok(m[1].includes('连通: '), `${e.name}：TOPO 块缺连通段`);
      assert.ok(!/lm_[a-z_]+/.test(m[1]), `${e.name}：混入三维地标链接（lm_* 不是空间出口）`);
      const exits = m[1].split('出口: ')[1];
      if (exits) for (const pair of exits.split('、')) assert.match(pair, /\(.+\)/, `出口缺目标层：${pair}`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('体积：每个 [TOPO] 块 ≤ 等价散文边列版（无向图逐句叙述）的 25%', () => {
  const { dir, entries } = buildBook();
  try {
    for (const e of entries.filter(x => (x.content || '').includes('[TOPO: '))) {
      const block = e.content.match(/\[TOPO: [^\]]+\]/)[0];
      const names = (e.content.match(/连通: ([^；\]]+)/) || [])[1].split('、').filter(Boolean);
      if (names.length < 2) continue;
      // 散文基线：同一份连通信息按自然语言逐句叙述（每条连接一句、两方向都写）——TOPO 块要替代的东西
      const prose = names.flatMap(a => names.filter(b => b !== a).map(b => `从${a}可以步行前往${b}`)).join('。') + '。';
      const r = tokens(block) / tokens(prose);
      assert.ok(r <= 0.25, `${e.name}：TOPO ${tokens(block)} tokens vs 散文 ${tokens(prose)}（${(r * 100).toFixed(0)}% > 25%）`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
