// I-18：头像 require 按域名作用；原作立绘表 15 条全部放行，作者 CDN 上不在 /sfw/ 的仍然拒绝。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { portraitOk } from '../map/core/profile.mjs';
import { RosterSystem as Roster } from '../map/core/roster.mjs';

const OV = JSON.parse(readFileSync(fileURLToPath(new URL('../map/packs/eden/overlay.v2.json', import.meta.url)), 'utf8'));
const AV = OV.entities.avatar;
const CDN = 'https://cdn.jsdelivr.net/gh/Yehehua1311/mu-pig@main/', POST = 'https://i.postimg.cc/', PICO = 'https://picgocloud.com/';

// 15 条：只保留 (名字, 域名 + 路径形状)；8 条作者 CDN（/sfw/）、5 条 postimg、2 条 picgocloud
const F = [
  ...['绫濑遥', '伊莎贝拉·罗斯柴尔德', '维多利亚', '神宫寺凛', '凯莉·露易丝', '罗莎琳德·海尔加', '顾衍容', '伊薇特·施奈德'].map(n => [n, `${CDN}${n}/sfw/${n}_sfw_1.png`]),
  ...['阿斯特丽德', '克洛伊', '塞拉菲娜', '苍穹', '陈若曦'].map((n, i) => [n, `${POST}Ab${i}Cd/p${i}.png`]),
  ...['叶梨莎', '瑞秋'].map((n, i) => [n, `${PICO}i/2024/09/29/x${i}.jpg`]),
];

test('第一包：require 写成按域名作用的表，只作用在作者 CDN 前缀', () => {
  assert.deepEqual(AV.require, { 'cdn.jsdelivr.net/gh/Yehehua1311/': ['/sfw/'] });
});

test('15 条立绘：15 放行、0 丢弃', () => {
  assert.equal(F.length, 15);
  const dropped = F.filter(([, u]) => !portraitOk(AV, u));
  assert.deepEqual(dropped, []);
});

test('作者 CDN 上不在 /sfw/ 的地址仍拒绝；受限词仍拒绝；别的图床不被 /sfw/ 卡住', () => {
  assert.equal(portraitOk(AV, `${CDN}绫濑遥/other/a.png`), false);
  assert.equal(portraitOk(AV, `${CDN}绫濑遥/性交/a.png`), false);
  assert.equal(portraitOk(AV, `${CDN}绫濑遥/sfw/口交.png`), false);
  assert.equal(portraitOk(AV, `${POST}x/性交.png`), false);
  assert.equal(portraitOk(AV, `${POST}x/no-sfw-here.png`), true);
  assert.equal(portraitOk(AV, 'https://evil.example/sfw/a.png'), false);
});

test('旧的列表形式含义不变：只约束带路径前缀的条目', () => {
  const old = { hosts: ['cdn.jsdelivr.net/gh/Yehehua1311/', 'i.postimg.cc'], require: ['/sfw/'], deny: [] };
  assert.equal(portraitOk(old, `${CDN}a/other/a.png`), false); assert.equal(portraitOk(old, `${CDN}a/sfw/a.png`), true); assert.equal(portraitOk(old, `${POST}x/a.png`), true);
});

test('名字挂载：立绘表的名字与名单行精确或按首段别名对上（15 条都挂得上）', () => {
  const members = JSON.parse(readFileSync(fileURLToPath(new URL('../map/data/fallback_roster.json', import.meta.url)), 'utf8')).members;
  const R = new Roster(); R.use('fallback', { rows: () => members.map(m => ({ name: m.name })) });
  R.attachPortraits(Object.fromEntries(F));
  const rows = R.rows({}), got = rows.filter(r => r.portrait);
  assert.equal(got.length, 15, '没挂上：' + F.map(f => f[0]).filter(n => !got.some(r => r.name === n || r.name.startsWith(n + '·') || n.startsWith(r.name + '·'))).join('、'));
  assert.equal(R.describe().unmappedPortraits, 0);
  assert.equal(rows.find(r => r.name === '玛嘉烈·临光').portrait, undefined, '卡里没有这一条，不挂');
});
