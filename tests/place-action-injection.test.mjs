// 动作注入底座（Part 6-4）：tests/place-action-injection.test.mjs —— 纯模块，不发任何真实消息。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PLACE_ACTION_INJECTION_STORAGE_KEY, TPL_KEY, MODES, DEFAULTS, KINDS, modeOf, readTpl, fill, buildAction, slashOf, describe, cleanName } from '../map/tavern/place-action-injection.mjs';
import { HOST_SRC } from './_host_src.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('模式：只认 off / compose / sys，乱值一律 off（宁可不注入）', () => {
  const g = v => ({ [PLACE_ACTION_INJECTION_STORAGE_KEY]: v }).valueOf() && v;
  assert.equal(modeOf(k => (k === PLACE_ACTION_INJECTION_STORAGE_KEY ? 'sys' : '')), 'sys');
  assert.equal(modeOf(k => (k === PLACE_ACTION_INJECTION_STORAGE_KEY ? 'compose' : '')), 'compose');
  assert.equal(modeOf(k => (k === PLACE_ACTION_INJECTION_STORAGE_KEY ? '' : '')), 'off');
  assert.equal(modeOf(k => (k === PLACE_ACTION_INJECTION_STORAGE_KEY ? 'SEND' : '')), 'off');
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
  assert.match(proto, /'eden-map:action': \[VIEWER_TO_HOST,/, '协议表要登记这条消息');
  const host = HOST_SRC;   // S5-1：injectAction 搬进了 stash-flow.mjs（S6-2 前叫 loot-flow）
  assert.match(host, /eden-map:action'\)\s*injectAction|type === 'eden-map:action'/, '宿主必须处理这条消息');
  assert.match(host, /tavern\/place-action-injection\.mjs/, '实现走 tavern/place-action-injection.mjs');
  assert.match(host, /composeIn\(a\.text\)/, 'sys 没有 triggerSlash 时退回只填不发');
  const links = readFileSync(join(ROOT, 'map/app/card-links.mjs'), 'utf8');
  assert.match(links, /data-inject/, '卡片要有注入入口');
  assert.match(links, /type: 'eden-map:action'/, '点了发 eden-map:action');
  const html = ['map/viewer.html', 'map/app/settings-pages.mjs', 'map/app/ai-cards.mjs'].map(f => { try { return readFileSync(join(ROOT, f), 'utf8'); } catch (e) { return ''; } }).join('\n');   // the switch lives on the AI link page (S7-1)
  assert.match(html, /id="injSeg"/, '设置页要有模式开关');
  for (const f of ['map/i18n/zh.json', 'map/i18n/en.json']) {
    const j = JSON.parse(readFileSync(join(ROOT, f), 'utf8'));
    for (const k of ['s.inject', 's.inject_hint', 'inj.off', 'inj.compose', 'inj.sys', 'act.compose', 'act.sys']) assert.ok(j[k], `${f} 缺 ${k}`);
  }
});

test('loot（Part 5-1 拾取）：模板里的 {item} 换成拾到的东西，老模板没有占位符也接得上', () => {
  assert.equal(fill(DEFAULTS.zh.loot, '主人主卧', '机密账本'), '在主人主卧发现机密账本，收进随身仓。');
  assert.equal(fill(DEFAULTS.en.loot, 'Master Bedroom', 'Ledger'), 'In Master Bedroom: found Ledger and pocketed it.');
  assert.equal(fill('查看{name}。', '书房', '旧卷·残页'), '查看书房旧卷·残页。', '没有 {item}：接在句末标点之前');
  const a = buildAction({ mode: 'sys', kind: 'loot', name: '主人主卧', item: '机密账本' });
  assert.equal(a.kind, 'loot');
  assert.equal(a.text, '在主人主卧发现机密账本，收进随身仓。');
  assert.equal(buildAction({ mode: 'off', kind: 'loot', name: '主人主卧', item: '机密账本' }), null, 'off 模式拾取也不发');
});

test('stealth（Part 5-2 潜行）：{dc} 换成 core/vision.mjs 算出的难度，也能塞进别的占位符', () => {
  assert.equal(fill(DEFAULTS.zh.stealth, '环城军营带', { dc: 14 }), '穿过环城军营带避开巡逻视线：潜行检定 DC 14。');
  assert.equal(fill(DEFAULTS.en.stealth, 'Ring Barracks', { dc: 14 }), 'Slip past the patrol watching Ring Barracks: stealth check DC 14.');
  const a = buildAction({ mode: 'compose', kind: 'stealth', name: '环城军营带', vars: { dc: 14 } });
  assert.equal(a.kind, 'stealth');
  assert.equal(a.text, '穿过环城军营带避开巡逻视线：潜行检定 DC 14。');
  assert.deepEqual(Object.keys(readTpl(() => '')).sort(), [...KINDS].sort(), '模板表与 KINDS 同源（新增 kind 必被 ctor 一把覆盖）');
});

test('摘要与纯度：不碰酒馆全局 / DOM / 存储', () => {
  assert.deepEqual(describe(k => (k === PLACE_ACTION_INJECTION_STORAGE_KEY ? 'sys' : '')), { mode: 'sys', kinds: ['go', 'look', 'take', 'loot', 'stealth', 'fail'] });   // W2：检定失败环新增 fail kind
  const src = readFileSync(join(ROOT, 'map/tavern/place-action-injection.mjs'), 'utf8').replace(/\/\/[^\n]*/g, '');
  for (const g of ['window', 'document', 'localStorage', 'Mvu', 'SillyTavern', 'postMessage']) {
    assert.ok(!new RegExp(`\\b${g}\\b`).test(src), `不该出现 ${g}`);
  }
});
