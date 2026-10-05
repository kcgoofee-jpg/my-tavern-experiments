// F3 状态外置钉（IN-1）：TT 更新会清空克隆目录（留 .git），扩展目录里存不了任何东西——
// 扩展加载器和原生适配层一律不碰本机存储，持久化只走宿主自己的 settings / metadata 保存接口。
// 静态扫描钉死：这三个文件里出现 localStorage / sessionStorage / indexedDB / document.cookie / caches 即失败。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const STATE_RE = /\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|document\.cookie|\bcaches\b|openDatabase/;

for (const rel of ['ext/index.js', 'ext/loader-core.mjs', 'map/tavern/host-native.mjs']) {
  test(`F3 状态外置：${rel} 不碰任何本机存储`, () => {
    const src = read(rel);
    const m = src.match(STATE_RE);
    assert.ok(!m, `${rel} 出现本机存储触点：${m && m[0]}`);
  });
}

test('F3 状态外置：原生适配层的持久化只有宿主保存接口', () => {
  const src = read('map/tavern/host-native.mjs');
  assert.ok(src.includes('saveSettingsDebounced'), 'script 变量走 saveSettingsDebounced');
  assert.ok(src.includes('saveMetadataDebounced'), 'chat 变量走 saveMetadataDebounced');
  assert.ok(!/setExtensionPrompt[^)]*write/.test(src), '注入接口没有旁路写入');
});

test('F3 状态外置：加载器把适配层换成原生实现，自身无状态', () => {
  const src = read('ext/loader-core.mjs');
  assert.ok(src.includes('host-native'), '加载器导入原生适配层');
  assert.ok(!/\bvar\b|\blet\b [a-zA-Z_$]+ = (?:\[\]|\{\}|new Map|new Set)/.test(src), '加载核心没有可变全局累积');
});
