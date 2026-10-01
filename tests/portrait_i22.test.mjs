// I-22: portraits from other image hosts never reached the people list. The host's extraction and the pack rule accepted all 15
// entries of the card's table (checked on the real card file, locally); the viewer then dropped every address that was not on the
// author's CDN. The chain host extraction -> pack rule -> roster -> viewer lookup is pinned here with name + URL shape only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { portraitFor, viewerUrlOk } from '../map/core/portrait-lookup.mjs';
import { RosterSystem as Roster } from '../map/core/roster.mjs';
import { useEden } from './helpers/eden-profile.mjs';
import { findPortraits } from '../map/tavern/mvu-readers.mjs';
useEden();

const CDN = 'https://cdn.jsdelivr.net/gh/Yehehua1311/mu-pig@main/', POST = 'https://i.postimg.cc/', PICO = 'https://picgocloud.com/';
const F = [
  ...['绫濑遥', '伊莎贝拉·罗斯柴尔德', '维多利亚', '神宫寺凛', '凯莉·露易丝', '罗莎琳德·海尔加', '顾衍容', '伊薇特·施奈德'].map(n => [n, `${CDN}${encodeURIComponent(n)}/sfw/p.png`]),
  ...['阿斯特丽德·露易丝', '克洛伊', '塞拉菲娜·阿尔贝蒂', '苍穹', '陈若曦'].map((n, i) => [n, `${POST}Ab${i}Cd/p${i}.png`]),
  ...['叶梨莎·艾珐·伍斯特', '瑞秋·卡特'].map((n, i) => [n, `${PICO}m/x${i}.jpg`]),
];
const card = `const x = 1;\nconst defaultPortraits = {\n${F.map(([n, u]) => `  "${n}": "${u}",`).join('\n')}\n};\nrender();`;

test('host extraction + pack rule: all 15 entries of the table are accepted', () => {
  const got = findPortraits([card]);
  assert.deepEqual(Object.keys(got).sort(), F.map(f => f[0]).sort());
});

test('viewer: every accepted address is shown (any https image address the host let through); non-image shapes stay out', () => {
  for (const [, u] of F) assert.equal(viewerUrlOk(u), true, u);
  for (const u of ['http://i.postimg.cc/a.png', 'https://i.postimg.cc/a.png?x=1', 'https://i.postimg.cc/a.png#f', 'https://i.postimg.cc/a.html', 'data:image/png;base64,AAAA', '', null, undefined])
    assert.equal(viewerUrlOk(u), false, String(u));
});

test('lookup: full name, first segment, and the one table key sharing the first segment (a row that spells only the short name)', () => {
  const T = Object.fromEntries(F);
  assert.equal(portraitFor(T, '阿斯特丽德·露易丝'), T['阿斯特丽德·露易丝']);
  assert.equal(portraitFor(T, '阿斯特丽德'), T['阿斯特丽德·露易丝'], 'short row name -> the long table key');
  assert.equal(portraitFor(T, '克洛伊·某'), T['克洛伊'], 'first segment of the row name');
  assert.equal(portraitFor(T, '不在表里'), '');
  assert.equal(portraitFor({ 'A·x': 'https://h.example/a.png', 'A·y': 'https://h.example/b.png' }, 'A'), '', 'two keys share the segment: no guess');
  assert.equal(portraitFor({ 'A·x': 'http://h.example/a.png' }, 'A'), '', 'a refused shape is never returned');
  assert.equal(portraitFor(null, 'A'), '');
});

test('roster rows of the fallback roster: all 15 entries reach a row and pass the viewer lookup', () => {
  const members = JSON.parse(readFileSync(fileURLToPath(new URL('../map/data/fallback_roster.json', import.meta.url)), 'utf8')).members;
  const table = findPortraits([card]), R = new Roster(); R.use('fallback', { rows: () => members.map(m => ({ name: m.name })) });
  R.attachPortraits(table);
  const shown = R.rows({}).filter(r => portraitFor(table, r.name));
  assert.equal(shown.length, 15);
  assert.equal(R.rows({}).filter(r => r.portrait).length, 15);
});
