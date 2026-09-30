// 动作注入底座（Part 6-4）：tests/action.test.mjs —— 纯模块，不发任何真实消息。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { KEY, TPL_KEY, MODES, DEFAULTS, KINDS, modeOf, readTpl, fill, buildAction, slashOf, describe, cleanName } from '../map/tavern/action.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('模式：只认 off / compose / sys，乱值一律 off（宁可不注入）', () => {
  const g = v => ({ [KEY]: v }).valueOf() && v;
  assert.equal(modeOf(k => (k === KEY ? 'sys' : '')), 'sys');
  assert.equal(modeOf(k => (k === KEY ? 'compose' : '')), 'compose');
  assert.equal(modeOf(k => (k === KEY ? '' : '')), 'off');
  assert.equal(modeOf(k => (k === KEY ? 'SEND' : '')), 'off');
  assert.equal(modeOf(() => { throw new Error('存储炸了'); }), 'off');
  assert.equal(modeOf(null), 'off');
  assert.deepEqual(MODES, ['off', 'compose', 'sys']);
});

test('模板：中英默认都在，用户改的优先，空串回默认', () => {
  const zh = readTpl(() => '', 'zh');
  assert.equal(zh.go, DEFAULTS.zh.go);
  assert.equal(readTpl(() => '', 'en').go, DEFAULTS.en.go);
  assert.equal(readTpl(k => (k === TPL_KEY ? JSON.stringify({ go: '去{name}看看' }) : '')).go, '去{name}看看');
  assert.equal(readTpl(k => (k === TPL_KEY ? '{坏 json' : '')).go, DEFAULTS.zh.go, '坏 JSON 不影响');
  assert.deepEqual(Object.keys(zh).sort(), [...KINDS].sort());
});

test('填名：{name} 替换 / 没有占位符就接在后面 / 空名不产生文案', () => {
  assert.equal(fill('前往{name}。', '圣都铁匠铺'), '前往圣都铁匠铺。');
  assert.equal(fill('看看', '铁匠铺'), '看看铁匠铺');
  assert.equal(fill('前往{name}。', ''), '');
  assert.equal(fill('前往{name}。', '   '), '');
  assert.equal(fill(null, '铁匠铺'), '铁匠铺');
  assert.ok(fill('前往{name}。', 'x'.repeat(500)).length <= 300, '名字太长要截断');
  assert.equal(cleanName('甲\n乙'), '甲 乙');
});

test('造消息：off 不发、空名不发、未知 kind 按 go、带上地图', () => {
  assert.equal(buildAction({ mode: 'off', name: '铁匠铺' }), null, 'off 一个都不发');
  assert.equal(buildAction({ mode: 'compose', name: '' }), null);
  assert.equal(buildAction({ mode: 'compose' }), null);
  const a = buildAction({ mode: 'compose', name: '铁匠铺', map: 'tc_mid' });
  assert.equal(a.type, 'eden-map:action');
  assert.equal(a.kind, 'go');
  assert.equal(a.text, '前往铁匠铺。');
  assert.equal(a.map, 'tc_mid');
  assert.equal(a.name, '铁匠铺');
  assert.equal(buildAction({ mode: 'compose', kind: '乱写', name: '铁匠铺' }).kind, 'go');
  assert.equal(buildAction({ mode: 'sys', kind: 'take', name: '账本', lang: 'en' }).text, 'Search 账本.');
  assert.equal(buildAction({ mode: 'compose', name: '铁匠铺', tpls: { go: '直奔{name}' } }).text, '直奔铁匠铺');
  assert.equal(buildAction({ mode: 'compose', name: '铁匠铺' }).map, undefined, '没给地图就不带这个字段');
});

test('斜杠命令：只有 sys 模式才给 /sys，管道符要转义', () => {
  const a = buildAction({ mode: 'sys', name: '铁匠铺' });
  assert.equal(slashOf(a, 'sys'), '/sys 前往铁匠铺。');
  assert.equal(slashOf(a, 'compose'), '');
  assert.equal(slashOf(a, 'off'), '');
  assert.equal(slashOf(null, 'sys'), '');
  assert.equal(slashOf({ text: 'a|b' }, 'sys'), '/sys a\\|b');
});

test('接线：协议表登记、宿主处理、查看器有入口与设置项', () => {
  const proto = readFileSync(join(ROOT, 'map/core/protocol.mjs'), 'utf8');
  assert.match(proto, /'eden-map:action': \[V2H,/, '协议表要登记这条消息');
  const host = readFileSync(join(ROOT, 'map/tavern/eden-map.js'), 'utf8');
  assert.match(host, /eden-map:action'\)\s*injectAction|type === 'eden-map:action'/, '宿主必须处理这条消息');
  assert.match(host, /tavern\/action\.mjs/, '实现走 tavern/action.mjs');
  assert.match(host, /composeIn\(a\.text\)/, 'sys 没有 triggerSlash 时退回只填不发');
  const links = readFileSync(join(ROOT, 'map/app/cardlinks.mjs'), 'utf8');
  assert.match(links, /data-inject/, '卡片要有注入入口');
  assert.match(links, /type: 'eden-map:action'/, '点了发 eden-map:action');
  const html = readFileSync(join(ROOT, 'map/viewer.html'), 'utf8');
  assert.match(html, /id="injSeg"/, '设置页要有模式开关');
  for (const f of ['map/i18n/zh.json', 'map/i18n/en.json']) {
    const j = JSON.parse(readFileSync(join(ROOT, f), 'utf8'));
    for (const k of ['s.inject', 's.inject_hint', 'inj.off', 'inj.compose', 'inj.sys', 'act.compose', 'act.sys']) assert.ok(j[k], `${f} 缺 ${k}`);
  }
});

test('摘要与纯度：不碰酒馆全局 / DOM / 存储', () => {
  assert.deepEqual(describe(k => (k === KEY ? 'sys' : '')), { mode: 'sys', kinds: ['go', 'look', 'take'] });
  const src = readFileSync(join(ROOT, 'map/tavern/action.mjs'), 'utf8').replace(/\/\/[^\n]*/g, '');
  for (const g of ['window', 'document', 'localStorage', 'Mvu', 'SillyTavern', 'postMessage']) {
    assert.ok(!new RegExp(`\\b${g}\\b`).test(src), `不该出现 ${g}`);
  }
});
