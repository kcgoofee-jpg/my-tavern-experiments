// 通用化：tools/draft_pack_from_card.py 只读条目标题 / 触发词、不输出正文、拒绝写进仓库；草稿能喂给 new_pack
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const cwd = new URL('..', import.meta.url);
test('卡 → 草稿：地点候选按层分组，不带正文；--out 在仓库里时拒绝', () => {
  const d = mkdtempSync(join(tmpdir(), 'draft-')), card = join(d, 'card.json'), out = join(d, 'd.json');
  writeFileSync(card, JSON.stringify({ spec: 'chara_card_v2', data: { name: 'T', character_book: { entries: [
    { comment: '码头·鱼市', keys: ['鱼市', '鱼市场'], content: 'SECRET-1' }, { comment: '山上·旧堡', keys: ['旧堡'], content: 'SECRET-2' },
    { comment: '人物·某人', keys: ['某人'], content: 'SECRET-3' }, { comment: '灯塔', keys: ['码头灯塔'], content: 'SECRET-4' }] } } }));
  const r = spawnSync('python3', ['tools/draft_pack_from_card.py', card, '--layers', '山上,码头', '--out', out], { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const txt = readFileSync(out, 'utf8'); assert.doesNotMatch(txt, /SECRET/);
  const L = Object.fromEntries(JSON.parse(txt).layers.map(l => [l.name, l.places.map(p => p.name)]));
  assert.deepEqual(L, { 山上: ['旧堡'], 码头: ['鱼市', '灯塔'] });
  const bad = spawnSync('python3', ['tools/draft_pack_from_card.py', card, '--out', 'map/packs/x.json'], { cwd, encoding: 'utf8' });
  assert.notEqual(bad.status, 0); assert.match(bad.stderr, /不写进仓库/);
});
test('草稿：层名不当别名；MVU 当前地点路径只出键名不出值', () => {
  const d = mkdtempSync(join(tmpdir(), 'draft-')), card = join(d, 'card.json'), out = join(d, 'd.json');
  writeFileSync(card, JSON.stringify({ data: { name: 'T', character_book: { entries: [
    { comment: '码头·鱼市', keys: ['鱼市', '码头'], content: 'x' },
    { comment: '[mvu_update]变量', keys: [], content: 'stat_data:\n  世界:\n    当前地点: SECRET-LOC\n    时间: 早' }] } } }));
  const r = spawnSync('python3', ['tools/draft_pack_from_card.py', card, '--layers', '码头', '--out', out], { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const txt = readFileSync(out, 'utf8'), dr = JSON.parse(txt); assert.doesNotMatch(txt, /SECRET/);
  assert.deepEqual(dr.layers[0].places[0].alias, []); assert.deepEqual(dr.vars, { location: '世界.当前地点' });
});
