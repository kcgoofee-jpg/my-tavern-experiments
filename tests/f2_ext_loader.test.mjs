// F2 扩展加载器的纯函数层（ext/loader-core.mjs）：线路表 / 地址 / head 校验 / 按卡开关 / 完整性判定。
// 浏览器侧（ext/index.js）不进 node——它要 DOM 和 crypto.subtle；真机步骤在 ext/README.md 的清单里。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  GH_LINES, ENGINE_REPO, ENTRY_PATH, EXT_INSTALLED_FLAG, EXT_IMPORT_MARKER, SCRIPT_IDS_KEY,
  ghUrl, headValid, pickHead, lineFor, parseCards, cardAllowed, headMatchesIntegrity, integrityVerdict,
} from '../ext/loader-core.mjs';

const ROOT = new URL('../', import.meta.url);   // URL 基准（非 ASCII 路径不能走 .pathname，见 agent-brief §8）

test('gh 线路表与 DIST-3 一致：jsdmirror → jsdelivr → fastly，没有 statically / raw', () => {
  assert.deepEqual(GH_LINES.map(l => l.host), ['cdn.jsdmirror.com', 'cdn.jsdelivr.net', 'fastly.jsdelivr.net']);
});

test('ghUrl：单一仓库 + @引用 钉死，三条线路路径结构相同', () => {
  const a = ghUrl('cdn.jsdmirror.com', 'abc123def456', ENTRY_PATH);
  const b = ghUrl('cdn.jsdelivr.net', 'abc123def456', ENTRY_PATH);
  assert.equal(a, `https://cdn.jsdmirror.com/gh/${ENGINE_REPO}@abc123def456/map/tavern/eden-map.js`);
  assert.equal(b.replace('cdn.jsdelivr.net', 'X'), a.replace('cdn.jsdmirror.com', 'X'));
});

test('headValid：构建号整数 + 提交号形状；缺一个都不算 head', () => {
  assert.ok(headValid({ build: 12, sha: 'faf9651e423713116ea9021d93852455589e3872' }));
  assert.ok(!headValid({ build: '12', sha: 'faf9651e' }));
  assert.ok(!headValid({ build: 12, sha: 'not a sha!' }));
  assert.ok(!headValid(null));
});

test('pickHead：多线路各取一份，取构建号最大的；无效行忽略；全空返回 null', () => {
  const rows = [
    { build: 361, sha: '2bb48e78de9f' },
    null,
    { build: 362, sha: 'faf9651e4237' },
    { build: 363, sha: 'zz' },
  ];
  assert.equal(pickHead(rows).build, 362);
  assert.equal(pickHead([null, undefined]), null);
});

test('lineFor：认识线路键；不认识的（旧值 / 拼错）退回第一条（国内镜像优先）', () => {
  assert.equal(lineFor('gh-js').host, 'cdn.jsdelivr.net');
  assert.equal(lineFor(undefined).key, 'gh-cn');
  assert.equal(lineFor('vpn').key, 'gh-cn');
});

test('parseCards：一行一个，空行与首尾空白清掉', () => {
  assert.deepEqual(parseCards(' 母畜庄园 \n\n 2 \n'), ['母畜庄园', '2']);
  assert.deepEqual(parseCards(''), []);
});

test('cardAllowed：开关关（默认）所有卡都挂；开 = 只认名单，按编号或卡名命中', () => {
  assert.ok(cardAllowed({}, 3, 'X'));
  assert.ok(cardAllowed({ perCard: false }, 3, 'X'));
  assert.ok(!cardAllowed({ perCard: true, allowedCards: [] }, 3, 'X'));
  assert.ok(cardAllowed({ perCard: true, allowedCards: ['3'] }, 3, 'X'));
  assert.ok(cardAllowed({ perCard: true, allowedCards: ['X'] }, 9, 'X'));
  assert.ok(!cardAllowed({ perCard: true, allowedCards: ['别的'] }, 3, 'X'));
});

test('headMatchesIntegrity：截断提交号也对表；对不上就是没对上', () => {
  const head = { sha: 'faf9651e423713116ea9021d93852455589e3872' };
  assert.ok(headMatchesIntegrity(head, { head_sha: 'faf9651e4237' }));
  assert.ok(!headMatchesIntegrity(head, { head_sha: '2bb48e78de9f' }));
  assert.ok(!headMatchesIntegrity(null, { head_sha: 'faf9651e4237' }));
});

test('integrityVerdict：全对过；一处对不过就失败关死，报出路径和原因', () => {
  const manifest = { files: { 'map/tavern/eden-map.js': 'a'.repeat(64), 'map/core/ledger.mjs': 'b'.repeat(64) } };
  assert.deepEqual(integrityVerdict(manifest, { 'map/tavern/eden-map.js': 'a'.repeat(64), 'map/core/ledger.mjs': 'b'.repeat(64) }), { ok: true, bad: [] });
  const v = integrityVerdict(manifest, { 'map/tavern/eden-map.js': 'c'.repeat(64), 'map/core/ledger.mjs': 'b'.repeat(64) });
  assert.equal(v.ok, false);
  assert.equal(v.bad[0].path, 'map/tavern/eden-map.js');
  assert.equal(v.bad[0].reason, 'mismatch');
  const u = integrityVerdict(manifest, { 'map/tavern/eden-map.js': null });
  assert.equal(u.ok, false);
  assert.equal(u.bad.length, 2);
  assert.equal(u.bad[0].reason, 'unreadable');
});

test('integrityVerdict：没有清单 = 失败关死（不静默放行）', () => {
  for (const m of [null, undefined, {}, { files: {} }]) {
    const v = integrityVerdict(m, {});
    assert.equal(v.ok, false);
    assert.equal(v.bad[0].reason, 'no-manifest');
  }
});

test('双开握手旗标名与引擎入口的读法一致（eden-map.js 的门卫行）', () => {
  const entry = readFileSync(fileURLToPath(new URL('map/tavern/eden-map.js', ROOT)), 'utf-8');
  assert.ok(entry.includes(EXT_INSTALLED_FLAG), '入口要读扩展接管旗标');
  assert.ok(entry.includes(EXT_IMPORT_MARKER), '入口要认扩展自己的 import 标记');
  assert.ok(entry.includes(SCRIPT_IDS_KEY), '扩展让路查的脚本登记表就是入口写的那张');
});

test('ext/ 清单形状（CCST 的字段表）与引用的文件都在', () => {
  const man = JSON.parse(readFileSync(fileURLToPath(new URL('ext/manifest.json', ROOT)), 'utf-8'));
  for (const k of ['display_name', 'loading_order', 'requires', 'optional', 'js', 'css', 'author', 'version', 'homePage', 'auto_update']) {
    assert.ok(k in man, `manifest.json 缺字段 ${k}`);
  }
  assert.ok(existsSync(fileURLToPath(new URL('ext/' + man.js, ROOT))), '清单指的 js 文件不存在');
  assert.ok(existsSync(fileURLToPath(new URL('ext/' + man.css, ROOT))), '清单指的 css 文件不存在');
});

test('integrity 工具与引擎的扫描面同源：GLOBS 覆盖 ENGINE_GLOBS 的每一条', () => {
  const tool = readFileSync(fileURLToPath(new URL('tools/build_integrity.py', ROOT)), 'utf-8');
  const gate = readFileSync(fileURLToPath(new URL('tools/check_architecture.py', ROOT)), 'utf-8');
  const block = gate.slice(gate.indexOf('ENGINE_GLOBS = ['), gate.indexOf(']', gate.indexOf('ENGINE_GLOBS = [')));
  const globs = [...block.matchAll(/'(map\/[^']+)'/g)].map(m => m[1]);
  assert.ok(globs.length >= 10, '没取到 ENGINE_GLOBS 块');
  for (const g of globs) assert.ok(tool.includes(`'${g}'`), `integrity 工具没覆盖 ${g}`);
  assert.ok(tool.includes("PATH = 'map/data/integrity.json'"), '工具写明输出路径');
});
