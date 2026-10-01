// 时间轴回放（Part 5-4）node 单测：floorState 的四级取数与兜底、人物去重、walk 足迹压缩、纯度。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { floorOf, floorState, walk, hasState } from '../map/tavern/timeline.mjs';
import { HOST_SRC } from './_host_src.mjs';

const LP = '/世界/当前地点';
const RAW = {
  0: '',
  1: '{"path":"/世界/当前地点","value":"7 号井黑市"}',
  2: '开打了。<span style="display:none">⌖人物 维克多 @ 下层·7号井</span>',
  3: '⌖人物 维克多 @ 上层·伊甸庄园；⌖人物 雷恩 @ 中层·执法局总局',
};
const STAT = {
  1: { 世界: { 当前地点: '/7 号井黑市', 当前时刻: '22:15' } },
  2: { 世界: { 当前地点: '执法局总局', 当前时刻: '23:40' }, 在场人物: { 维克多: {} } },
  3: { 世界: { 当前地点: '伊甸庄园', 当前时刻: '09:05' } },
};
const deps = (no = {}) => ({
  lp: LP, varMap: { location: '世界.当前地点', time: '世界.当前时刻', present: '世界.在场人物' },
  getRaw: f => RAW[f] || '',
  perFloorStat: no.stat ? null : (f => STAT[f] || null),
  mvuGet: no.mvuGet ? null : ((st, p) => { const o = st?.[p.slice(1).split('/')[0]]; return o ? o[p.slice(1).split('/')[1]] : undefined; }),
  patchPlace: no.patchPlace ? null : ((txt) => { const m = txt.match(/"value"\s*:\s*"([^"]+)"/); return m ? m[1] : ''; }),
  mvuChars: no.mvuChars ? null : ((st, here) => (st?.在场人物 ? Object.keys(st.在场人物).map(n => ({ name: n, place: here, present: true })) : [])),
  parseChars: no.parseChars ? null : (txt => [...txt.matchAll(/⌖人物\s+([^\s@＠]+)\s*[@＠]\s*([^<\n，。；]{1,40})/g)].map(m => ({ name: m[1].trim(), place: m[2].trim() }))),
});

test('floorOf：只认 ≥ 0 的整数', () => {
  assert.equal(floorOf(3), 3);
  assert.equal(floorOf('4'), 4);
  assert.equal(floorOf(4.4), 4);
  assert.equal(floorOf(-1), -1);
  assert.equal(floorOf('x'), -1);
  assert.equal(floorOf(null), -1);
  assert.equal(floorOf(NaN), -1);
});

test('floorState：地点取 MVU 那一楼的变量，没有 stat_data 就退回正文的 JSONPatch', () => {
  const s2 = floorState(2, deps());
  assert.equal(s2.floor, 2);
  assert.equal(s2.here, '执法局总局', 'MVU 说了算');
  assert.equal(s2.time, '23:40');
  const noStat = floorState(1, { ...deps(), perFloorStat: () => null });
  assert.equal(noStat.here, '7 号井黑市', '没有那一楼的 stat_data：读正文里最后一次写地点');
  assert.equal(noStat.time, '', '时刻也一样拿不到');
  assert.equal(floorState(0, deps()).here, '', '空楼 = 空地点（但状态不为 null）');
  assert.equal(floorState(-1, deps()), null, '拖到开局之前 = 没有状态');
});

test('floorState：同一楼的人物 MVU 优先，正文标签补齐 MVU 没说的', () => {
  const s = floorState(3, { ...deps(), perFloorStat: () => ({ 世界: { 当前地点: '伊甸庄园' }, 在场人物: { 维克多: {} } }) });
  assert.deepEqual(s.chars.map(c => c.name), ['维克多', '雷恩']);
  assert.equal(s.chars[0].src, 'infer', '在场表里没写位置：按和你同处');
  assert.equal(s.chars[0].place, '伊甸庄园');
  assert.equal(s.chars[1].src, 'tag', '只有聊天标签提过的补齐');
  assert.equal(s.chars[1].place, '中层·执法局总局');
  const only = floorState(2, { ...deps(), perFloorStat: () => null });
  assert.deepEqual(only.chars.map(c => c.name), ['维克多'], '没有 MVU：只有标签');
});

test('floorState：缺依赖 / 依赖炸了都不抛，拿不到的字段是空（回放 UI 不能因为一层坏了整条轴废掉）', () => {
  assert.deepEqual(floorState(2, {}), { floor: 2, here: '', time: '', chars: [] });
  assert.deepEqual(floorState(2, { getRaw: () => { throw new Error('读取失败'); } }), { floor: 2, here: '', time: '', chars: [] });
  assert.deepEqual(floorState(2, { perFloorStat: () => ({ 世界: {} }), getRaw: () => 'x', mvuGet: () => { throw new Error('boom'); } }).chars, []);
  assert.equal(floorState(2, { perFloorStat: () => null, getRaw: () => 'x', mvuGet: null, patchPlace: null }).here, '');
  assert.equal(floorState(2, null).chars.length, 0, 'deps 为 null 也照算');
});

test('walk：足迹按楼递进，同一个地点连着好几楼只留第一处', () => {
  const many = { ...deps() };
  const w = walk(1, 3, many);
  assert.deepEqual(w.map(p => p.here), ['/7 号井黑市', '执法局总局', '伊甸庄园'], '原始值原样带出（不替开场户型修字符串）');
  assert.deepEqual(w.map(p => p.floor), [1, 2, 3]);
  const same = { ...deps(), perFloorStat: () => ({ 世界: { 当前地点: '执法局总局' } }), getRaw: () => '' };
  assert.deepEqual(walk(1, 3, same), [{ floor: 1, here: '执法局总局', time: '' }], '地点没变：只留一处');
  assert.deepEqual(walk(3, 1, same), [], '范围反了 = 空');
  assert.deepEqual(walk(-1, 3, same), [], '非法楼层 = 空');
  assert.equal(walk(1, 3, same, 2).length, 1, 'step 跳采样');
});

test('hasState / 接线：有地点或有人或有时钟就算有；宿主按本模块的签名调用', () => {
  assert.equal(hasState(floorState(2, deps())), true);
  assert.equal(hasState(floorState(0, deps())), false, '空楼没得看');
  assert.equal(hasState(null), false);
  const host = HOST_SRC;
  assert.match(host, /tavern\/timeline\.mjs/, '宿主从 core 之外的 tavern/ 取本模块');
  assert.match(host, /timelineModule\.floorState\(/, '宿主按 floorState(f, deps) 调用');
  const src = readFileSync(new URL('../map/tavern/timeline.mjs', import.meta.url), 'utf8').replace(/\/\/[^\n]*/g, '');
  for (const g of ['window', 'document', 'localStorage', 'Mvu', 'SillyTavern', 'postMessage']) {
    assert.ok(!new RegExp(`\\b${g}\\b`).test(src), `不该出现 ${g}`);
  }
});
