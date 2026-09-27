// 双语：zh / en 键一致；查看器与外挂脚本用到的静态键在两份字典里都有
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
const rd = f => readFileSync(new URL('../map/' + f, import.meta.url), 'utf8');
const zh = JSON.parse(rd('i18n/zh.json')), en = JSON.parse(rd('i18n/en.json'));
test('zh / en 键一致', () => { assert.deepEqual(Object.keys(zh).filter(k => !(k in en)), []); assert.deepEqual(Object.keys(en).filter(k => !(k in zh) && k !== 'names'), []); });
test('用到的键都有翻译', () => {
  const files = ['viewer.html', ...readdirSync(new URL('../map/', import.meta.url)).filter(f => /\.js$/.test(f)), ...readdirSync(new URL('../map/app/', import.meta.url)).map(f => 'app/' + f)];
  const used = new Set(); for (const f of files) { const s = rd(f);
    for (const m of s.matchAll(/data-i18n(?:-title|-aria|-ph)?="([^"]+)"/g)) used.add(m[1]);
    for (const m of s.matchAll(/\b(?:tx|T)\('([a-z0-9_.]+)'/g)) used.add(m[1]); }
  assert.deepEqual([...used].filter(k => !k.endsWith('_') && !(k in en)), []);
});
