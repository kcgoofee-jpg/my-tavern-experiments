// S4-4 T3: the host side's few product texts (splash title, script-library info line, self-check sentences, the "new events" toast) come from the pack's manifest `strings`:
// the first pack prints what it printed before, a pack without strings prints neutral words (no card term), and a manifest that is not there yet gives the neutral default.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { hostStr, DEFAULTS } from '../map/tavern/host-strings.mjs';
import { splashTitle } from '../map/tavern/splash.mjs';
import * as T from '../map/tavern/tavernhelper-api.mjs';
import * as SC from '../map/tavern/selfcheck.mjs';
import { buildReportText } from '../map/app/feedback-report.mjs';
import { HOST_SRC } from './_host_src.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const J = p => JSON.parse(fs.readFileSync(ROOT + p, 'utf8'));
const EDEN = J('map/packs/eden/manifest.json'), TOWN = J('map/packs/town/manifest.json');
const TERMS = ['伊甸', '天城', 'Eden', 'Tiancheng', 'Manor'];
const noTerm = s => TERMS.every(t => !String(s).includes(t));

test('hostStr: key@en in English, then key, then the fallback, then the neutral default; a missing manifest is fine', () => {
  const m = { strings: { a: '甲', 'a@en': 'A', b: '乙' } };
  assert.equal(hostStr(m, 'a', 'zh'), '甲'); assert.equal(hostStr(m, 'a', 'en'), 'A'); assert.equal(hostStr(m, 'b', 'en'), '乙', 'English falls back to the plain key');
  assert.equal(hostStr(m, 'zzz', 'zh', 'fb'), 'fb'); assert.equal(hostStr(m, 'app.name', 'zh'), '空间地图'); assert.equal(hostStr(null, 'app.name', 'en'), 'Spatial Map'); assert.equal(hostStr(undefined, 'nope', 'zh'), 'nope');
  assert.equal(hostStr({ strings: { 'app.name': '' } }, 'app.name', 'zh'), '空间地图', 'an empty string is not a string');
  for (const lang of ['zh', 'en']) for (const v of Object.values(DEFAULTS[lang])) assert.ok(noTerm(v), v);
});

test('the splash title: the first pack\'s name with the version (as before), a neutral one for a pack without strings', () => {
  assert.equal(splashTitle(hostStr(EDEN, 'app.name', 'zh'), '0.9.7', false), '伊甸地图 v0.9.7'); assert.equal(splashTitle(hostStr(EDEN, 'app.name', 'en'), '0.9.7', true), 'Eden Map v0.9.7');
  assert.equal(splashTitle(hostStr(TOWN, 'app.name', 'zh'), '0.9.7', false), '空间地图 v0.9.7'); assert.equal(splashTitle(hostStr(TOWN, 'app.name', 'en'), '', true), 'Spatial Map');
  assert.equal(splashTitle('', null, false), '空间地图');
});

test('the script-library info line: identical for the first pack in both languages, neutral for the second', () => {
  const o = { version: '0.9.6', channel: 'tag', warns: 0, checkAt: 0 };
  assert.equal(T.scriptInfo({ ...o, name: hostStr(EDEN, 'app.short', 'zh') }), '伊甸地图 v0.9.6 · tag · 自检：全部正常');
  assert.equal(T.scriptInfo({ ...o, en: true, name: hostStr(EDEN, 'app.short', 'en') }), 'Eden map v0.9.6 · tag · self-check OK');
  assert.equal(T.scriptInfo({ ...o, name: hostStr(TOWN, 'app.short', 'zh') }), '空间地图 v0.9.6 · tag · 自检：全部正常'); assert.equal(T.scriptInfo({ ...o, en: true }), 'Spatial map v0.9.6 · tag · self-check OK');
});

test('the self-check sentences: the update prompt names the imported script (first pack: as before), the lorebook line names the book the host found', () => {
  const eden = (en) => ({ script: hostStr(EDEN, 'app.script', en ? 'en' : 'zh') });
  assert.equal(SC.updatePromptText('0.9.7', 'tag', false, eden(false)).how, '你的脚本钉了版本：重新导入新版脚本「【地图】伊甸地图 v0.9.7」（同名覆盖）');
  assert.equal(SC.updatePromptText('0.9.7', 'tag', true, eden(true)).how, 'Your script is pinned: re-import the new script "[Map] Eden map v0.9.7" (same name, overwrite).');
  for (const en of [false, true]) assert.ok(noTerm(SC.updatePromptText('0.9.7', 'tag', en, { script: hostStr(TOWN, 'app.script', en ? 'en' : 'zh') }).how));
  assert.ok(noTerm(SC.updatePromptText('0.9.7', 'tag').how) && noTerm(SC.forceText('0.9.5', '0.9.6', '0.9.7', 'tag').lines.join()), 'no names given: neutral');
  assert.match(SC.forceText('0.9.5', '0.9.6', '0.9.7', 'tag', '', true, eden(true)).lines.join(), /\[Map\] Eden map v0\.9\.7/);
  const facts = book => ({ api: {}, worldbook: { missing: ['x'], imported: false, lore: false }, wbBook: book });
  const item = (f, en) => SC.evaluate(f).find(i => i.id === 'worldbook')[en ? 'en' : 'zh'];
  assert.match(item(facts('伊甸地图·世界书附加条目'), true), /import "伊甸地图·世界书附加条目" and activate it globally/); assert.match(item(facts('伊甸地图·世界书附加条目'), false), /导入「伊甸地图·世界书附加条目」/);
  assert.match(item(facts(''), true), /import the add-on lorebook and activate/);
  assert.ok(noTerm(item(facts('空间地图·世界书附加条目'), true).replace('空间地图·世界书附加条目', '')));
});

test('the "new events" toast and the feedback report header: the first pack\'s old words, neutral words otherwise', () => {
  assert.equal(hostStr(EDEN, 'ev.toast', 'zh'), '天城有新事态'); assert.equal(hostStr(EDEN, 'ev.toast', 'en'), 'New events in Tiancheng');
  assert.equal(hostStr(TOWN, 'ev.toast', 'zh'), '有新事态'); assert.equal(hostStr(TOWN, 'ev.toast', 'en'), 'New events');
  assert.equal(buildReportText({ title: EDEN.strings['app.report'], time: 't' }).split('\n')[0], '=== 伊甸地图反馈报告 / Eden Map feedback report ===');
  assert.ok(noTerm(buildReportText({ time: 't' }).split('\n')[0]), 'no title given: neutral');
  assert.ok(noTerm(J('map/i18n/zh.json')['app.report']) && noTerm(J('map/i18n/en.json')['app.report']));
});

test('the call sites: the host script asks for the texts through the manifest, the engine files carry no product name', () => {
  const host = HOST_SRC;   // S5-1：HS 调用点分在入口与 flow 模块里
  for (const k of ['ev.toast', 'app.name', 'app.short', 'app.script']) assert.ok(host.includes(`HS('${k}'`), k);
  for (const f of ['map/tavern/splash.mjs', 'map/tavern/tavernhelper-api.mjs', 'map/tavern/selfcheck.mjs', 'map/tavern/host-strings.mjs']) assert.ok(noTerm(fs.readFileSync(ROOT + f, 'utf8').replace(/^\s*\/\/.*$/gm, '')), f);
});
