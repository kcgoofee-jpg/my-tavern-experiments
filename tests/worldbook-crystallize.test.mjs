// W7 剧情事实自动结晶（map/tavern/worldbook-crystallize.mjs + mvu ⌖事实 分支）：
// 消息窗口重放收集（同 key 取最新 = 幂等）、id 稳定（map.fact.<hash>）、LRU 容量、墓碑永不复活、
// newDrafts 只留新增、⌖事实 不落 custom items（applyTags 跳过、normCustom 不受污染）、内容照抄原文。
// 见 docs/plans/llm-campaign.md W7 / 裁决 3-11-12；夹具全中性合成数据。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as X from '../map/tavern/worldbook-crystallize.mjs';
import * as MV from '../map/tavern/mvu-readers.mjs';

const msgs = [
  { floor: 5, text: '一些剧情 <span style="display:none">⌖事实 书房：暗格通向地下室</span> 后续' },
  { floor: 7, text: '⌖事实 书房：暗格通向地下室' },                        // 同 key 重写 → 取第 7 楼
  { floor: 8, text: '⌖用途 书房：夜里看星图' },                            // note 混进来不收
  { floor: 9, text: '⌖事实 玫瑰园：西侧篱笆有缺口' },
  { floor: 10, text: '```⌖事实 代码块：不收```' },
  { floor: 11, text: '⌖事实 地点：坐实的事实' },                           // 命中 CUSTOM_EXAMPLES（示范原文照抄不落）
  { floor: 12, text: '⌖事实 ' },                                           // 空 value
];

test('collectFacts：窗口重放收集（同 key 最新、note/代码块/示范/空值不收、按楼层升序）', () => {
  const fs = X.collectFacts(msgs, MV.parseCustomTags);
  assert.deepEqual(fs.map(f => [f.key, f.floor]), [['书房', 7], ['玫瑰园', 9]]);
  assert.equal(fs[0].text, '暗格通向地下室');
  assert.deepEqual(X.collectFacts(null, MV.parseCustomTags), []);
  assert.deepEqual(X.collectFacts(msgs, null), []);
});

test('drafts：id 稳定（map.fact.<hash>）、内容照抄原文、关键词触发、LRU 按楼层取最近', () => {
  const fs = X.collectFacts(msgs, MV.parseCustomTags);
  const d = X.drafts(fs);
  assert.equal(d.length, 2);
  assert.ok(d[0].id.startsWith('map.fact.'));
  assert.equal(d[0].id, X.drafts(fs)[0].id);   // 同 key 同 id（幂等去重键）
  assert.ok(d[0].content.includes('书房：暗格通向地下室') && d[0].content.includes('<剧情事实·书房>'));   // 照抄原文
  assert.deepEqual(d[0].strategy.keys, ['书房']);
  assert.equal(d[0].extra.eden_ver, X.XTAL_VER);
  const big = Array.from({ length: 60 }, (_, i) => ({ key: `地${i}`, text: '事实', floor: i + 1 }));
  const capped = X.drafts(big);
  assert.equal(capped.length, X.MAX_FACTS);
  assert.equal(capped[0].floor, 60 - X.MAX_FACTS + 1);   // 保留最近的
});

test('墓碑：删过的 id 永不复活（entomb 累积去重 + drafts 过滤）', () => {
  const fs = X.collectFacts(msgs, MV.parseCustomTags);
  const d0 = X.drafts(fs);
  const t = X.entomb([], d0[0].id);
  const d1 = X.drafts(fs, { tombstones: t });
  assert.equal(d1.length, 1);
  assert.equal(d1[0].id, d0[1].id);
  const t2 = X.entomb(X.entomb(t, d0[1].id), d0[1].id);   // 重复登记去重
  assert.deepEqual(X.drafts(fs, { tombstones: t2 }), []);
  assert.equal(X.entomb([], 'x').length, 1);
});

test('newDrafts：已写过的 id 不再产出（宿主水位去重 → 重放幂等）', () => {
  const fs = X.collectFacts(msgs, MV.parseCustomTags);
  const d = X.drafts(fs);
  const already = new Set([d[0].id]);
  assert.deepEqual(X.newDrafts(d, already).map(x => x.id), [d[1].id]);
  assert.equal(X.newDrafts(d, new Set(d.map(x => x.id))).length, 0);   // 全部写过 = 零新增（幂等）
});

test('⌖事实 不落 custom items（applyTags 跳过 fact，normCustom 不被污染）', () => {
  const r = MV.applyTags({}, [{ floor: 3, text: '⌖事实 书房：暗格通向地下室' }], -1);
  assert.equal(r.applied.length, 0);          // 不进 applied（custom 状态机不认识它）
  assert.deepEqual(r.custom.items, {});       // custom 干净
  const tags = MV.parseCustomTags('⌖事实 书房：暗格通向地下室');
  assert.deepEqual(tags, [{ op: 'fact', key: '书房', value: '暗格通向地下室' }]);   // 解析仍给出（结晶器消费）
  // 改名 / 用途照旧（既有行为不回归）
  const r2 = MV.applyTags({}, [{ floor: 3, text: '⌖改名 书房 → 观星室' }], -1);
  assert.equal(r2.applied.length, 1);   // 改名 / 用途照旧（既有行为不回归）
});

test('模块纯度：不碰 DOM / 全局 / 存储 / 网络（剥注释后扫，与看门狗同口径）', () => {
  for (const f of ['worldbook-crystallize.mjs']) {
    const raw = readFileSync(fileURLToPath(new URL(`../map/tavern/${f}`, import.meta.url)), 'utf8');
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    assert.doesNotMatch(src, /\b(window|document|localStorage|sessionStorage|fetch|Mvu|SillyTavern|navigator)\b/);
    assert.ok(raw.split('\n').length < 400);
  }
});
