// U-FIX-4（TT sweep-1 H3-01）：时钟胶囊点了没反应，找不到时段切换。决定：胶囊上的弹层「跟随聊天时间 / 包的各时段」，
// 选了某档只换地图的看法（tod / night / view），聊天时间、日程、注入不动；会话内有效。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { applyView, setView, viewNow, bandName } from '../map/tavern/clock-view.mjs';

const BANDS = [{ id: 'dawn' }, { id: 'day' }, { id: 'dusk' }, { id: 'night', dark: true }];
const CLOCK = { date: '2088-01-01', time: '23:00', period: '', short: '1月1日 23:00', full: '', night: true, tod: 'night', pre: false, bands: BANDS };

test('follow chat time: the clock passes through unchanged', () => {
  setView('');
  assert.deepEqual(applyView(CLOCK), CLOCK);
});

test('a chosen period rewrites tod / night / view only; the time stays the chat time', () => {
  applyView(CLOCK);
  assert.equal(setView('day'), 'day');
  const v = applyView(CLOCK);
  assert.equal(v.tod, 'day'); assert.equal(v.night, false); assert.equal(v.view, 'day');
  assert.equal(v.time, '23:00'); assert.equal(v.short, CLOCK.short);
  setView('night'); assert.equal(applyView({ ...CLOCK, tod: 'day', night: false, time: '12:00' }).night, true);
  setView('');
});

test('a period the pack does not have is refused (follow)', () => {
  applyView(CLOCK);
  assert.equal(setView('noon'), ''); assert.equal(viewNow(), '');
});

test('neutral labels for the default bands, the id for a pack band', () => {
  assert.equal(bandName('dusk', 'zh'), '黄昏'); assert.equal(bandName('dusk', 'en'), 'Dusk'); assert.equal(bandName('tide', 'zh'), 'tide');
});

test('wiring: the chip mounts the popover, the host re-pushes on em-period, the viewer honours view', () => {
  const src = f => readFileSync(fileURLToPath(new URL('../map/' + f, import.meta.url)), 'utf8');
  assert.match(src('tavern/host-lifecycle.mjs'), /mountClockPop\(clk/);
  assert.match(src('tavern/chars-flow.mjs'), /addEventListener\('em-period'/);
  assert.match(src('tavern/chars-flow.mjs'), /post\(\{ type: 'eden-map:clock', \.\.\.shown \}\)/);
  assert.match(src('custom-tint.mjs'), /clock\?\.view \|\|/);
});
