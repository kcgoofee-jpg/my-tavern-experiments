// W3 长程关键帧压缩（map/tavern/keyframes.mjs + timeline 兜底层）：
// 确定性与幂等（同输入字节级同输出、advance 内容没变返回原对象）、零漂移对账（压缩回放 vs 全量 walk
// 逐楼一致，session_replay 同款三件套口径）、截断显式标记（绝不用邻近帧冒充）、timeline approx 兜底、
// 模块纯度。见 docs/plans/llm-campaign.md W3 / 裁决 7；夹具全中性合成数据。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as KF from '../map/tavern/keyframes.mjs';
import * as TL from '../map/tavern/timeline.mjs';

// 200 楼合成聊天：每 5 楼换一次地点，40 个变更点
const PLACES = ['书房', '玫瑰园', '大厅', '7号井黑市', '霓虹街', '执法局', '修道院', '码头'];
const pts = [];
for (let f = 1; f <= 200; f++) {
  const here = PLACES[Math.floor((f - 1) / 5) % PLACES.length];
  if (!pts.length || pts[pts.length - 1].here !== here) pts.push({ floor: f, here, time: `${8 + Math.floor(f / 60)}:${String(f % 60).padStart(2, '0')}` });
}
const TOP = 200;

test('确定性 + 形状：同输入字节级同输出；帧跨度无缝衔接（floor..until 覆盖到 top）', () => {
  const a = KF.compress(pts, TOP), b = KF.compress([...pts].reverse(), TOP);   // 乱序进来也一样（内部排序）
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(a.truncated, 0);
  assert.equal(a.frames.length, pts.length);
  for (let i = 0; i < a.frames.length; i++) {
    assert.equal(a.frames[i].floor, pts[i].floor);
    if (i + 1 < a.frames.length) assert.equal(a.frames[i].until, pts[i + 1].floor - 1);   // 无缝
    else assert.equal(a.frames[i].until, TOP);   // 最后一帧到 top
  }
});

test('幂等：flatten → 再压缩 = 原样；advance 内容没变返回同一对象（不写）', () => {
  const v = KF.compress(pts, TOP);
  assert.equal(JSON.stringify(KF.compress(KF.flatten(v), TOP)), JSON.stringify(v));
  assert.equal(KF.advance(v, pts, TOP), v);   // 检查点式：没变不写
  const v2 = KF.advance(v, pts, TOP + 5);   // 新楼进了：变（直到帧延伸 + 可能的新帧）
  assert.notEqual(v2, v);
  assert.equal(v2.top, TOP + 5);
});

test('零漂移对账：压缩回放 vs 全量 walk 逐楼一致（here 逐楼相等、变更点序列相等）', () => {
  const v = KF.compress(pts, TOP);
  // 全量回放的「真相」：每楼属于哪个变更点（用 timeline.walk 同款去重口径造依赖）
  const byFloor = f => { let cur = null; for (const p of pts) { if (p.floor <= f) cur = p; else break; } return cur; };
  const deps = { getRaw: () => '', perFloorStat: () => null, patchPlace: raw => raw, keyAt: f => { const k = byFloor(f); return k ? { here: k.here, time: k.time } : null; } };
  for (let f = 1; f <= TOP; f++) {
    const k = KF.stateAt(v, f);
    const truth = byFloor(f);
    if (truth && truth.floor <= f) {
      assert.equal(k.here, truth.here, `第 ${f} 楼地点漂移`);
      assert.equal(k.time, truth.time, `第 ${f} 楼时刻漂移`);
    } else assert.equal(k, null);
    // timeline 兜底层与关键帧直接取值同口径（approx 只是标记，不影响地点）
    const st = TL.floorState(f, { ...deps, varMap: {} });
    assert.equal(st.here, truth?.here || '', `第 ${f} 楼 timeline 兜底漂移`);
  }
  // 变更点序列与全量 walk 一致（行程图层连弧的输入）
  const full = TL.walk(1, TOP, { perFloorStat: () => null, getRaw: f => JSON.stringify({ 0: [{ op: 'add', path: '/世界/当前地点', value: byFloor(f).here }] }), patchPlace: raw => { try { const j = JSON.parse(raw); return j[0]?.[0]?.value || ''; } catch (e) { return ''; } }, varMap: {} });
  assert.deepEqual(KF.flatten(v).map(p => p.floor), full.map(p => p.floor));
});

test('近窗精确、旧楼标 approx；首帧之前如实 null（不冒充）', () => {
  const v = KF.compress(pts, TOP);
  assert.equal(KF.stateAt(v, TOP).approx, false);   // 近窗内
  assert.equal(KF.stateAt(v, TOP - KF.W_RECENT + 1).approx, false);
  assert.equal(KF.stateAt(v, TOP - KF.W_RECENT).approx, true);   // 20 楼之前
  assert.equal(KF.stateAt(v, 0), null);   // 首帧（第 1 楼）之前
  assert.equal(KF.stateAt(null, 5), null);
  assert.equal(KF.stateAt(v, 9999), null);   // 超出 top 的帧不该有
});

test('截断：超 cap 丢最老并记数；回放不到就 null；截断后仍幂等', () => {
  const v = KF.compress(pts, TOP, { cap: 10 });
  assert.equal(v.truncated, pts.length - 10);
  assert.equal(v.frames.length, 10);
  assert.equal(v.frames[0].floor, pts[pts.length - 10].floor);   // 保留最新的 10 帧
  assert.equal(KF.stateAt(v, pts[0].floor), null);   // 被丢的历史：null，不冒充
  const again = KF.compress(KF.flatten(v), TOP, { cap: 10 });
  assert.deepEqual(again.frames, v.frames);   // 幂等（对保留的帧）；truncated 归零是内在语义——flatten 丢掉的历史无法凭空记账，
  assert.equal(again.truncated, 0);            // 全量原料（聊天原文重算）重压才会得到同一个 truncated=30（见零漂移对账）
});

test('脏输入收口：空 / 非数组 / 未来楼层 / 相邻同址与同楼覆盖', () => {
  assert.deepEqual(KF.compress(null, 5).frames, []);
  const v = KF.compress([{ floor: 3, here: 'A' }, { floor: 9, here: 'A' }, { floor: 5, here: 'B' }, { floor: 5, here: 'B2' }, { floor: 99, here: '未来' }], 10);
  assert.deepEqual(v.frames.map(f => [f.floor, f.here]), [[3, 'A'], [5, 'B2']]);   // 未来楼丢弃；同楼取后到；9 楼 A 与 3 楼 A 跨 5 楼 B 不合并
  assert.equal(v.frames[0].until, 4);
});

test('timeline approx 兜底：stat 与 JSONPatch 都拿不到时才退关键帧（顺序：MVU → Patch → 关键帧）', () => {
  const deps = { perFloorStat: () => null, getRaw: () => '', varMap: {}, keyAt: () => ({ here: '关键帧书房', time: '08:00' }) };
  const st = TL.floorState(7, deps);
  assert.equal(st.here, '关键帧书房'); assert.equal(st.approx, true);
  const better = TL.floorState(7, { ...deps, getRaw: () => '', patchPlace: () => '正文补的地点' });
  assert.equal(better.here, '正文补的地点'); assert.equal(better.approx, undefined);   // Patch 够用就不落关键帧
  const exact = TL.floorState(7, { ...deps, perFloorStat: () => ({}), mvuGet: (s, p) => (p === '/世界/当前地点' ? 'MVU地点' : '') });
  assert.equal(exact.here, 'MVU地点'); assert.equal(exact.approx, undefined);
  assert.equal(TL.floorState(7, { perFloorStat: () => null, getRaw: () => '', varMap: {} }).here, '');   // 没有关键帧依赖 = 老行为
});

test('模块纯度：keyframes 不碰 DOM / 全局 / 存储 / 网络（剥注释后扫，与看门狗同口径）', () => {
  const raw = readFileSync(fileURLToPath(new URL('../map/tavern/keyframes.mjs', import.meta.url)), 'utf8');
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(src, /\b(window|document|localStorage|sessionStorage|fetch|Mvu|SillyTavern|navigator)\b/);
  assert.ok(raw.split('\n').length < 400);
});
