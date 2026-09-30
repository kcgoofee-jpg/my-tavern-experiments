// 零 Token 确定性世界时钟（Part 6-5）：tests/clock.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MIN_PER_DAY, DEFAULT_MIN_PER_ROUND, PERIODS, normClock, periodOf, advance, hhmm, describeClock, summarize } from '../map/core/clock.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('规范化：乱输入不抛，回到第 1 日 00:00', () => {
  assert.deepEqual(normClock(null), { day: 1, min: 0 });
  assert.deepEqual(normClock({ day: -3, min: -10 }), { day: 1, min: 1430 });
  assert.deepEqual(normClock({ day: 5, min: 1500 }), { day: 5, min: 60 });
  assert.deepEqual(normClock({ day: 2.7, min: 90.9 }), { day: 2, min: 90 });
});

test('时段划分：五个区间无缝覆盖 1440 分钟，无空洞无重叠', () => {
  let cover = 0;
  for (let m = 0; m < MIN_PER_DAY; m++) if (periodOf(m)) cover++;
  assert.equal(cover, MIN_PER_DAY);
  assert.equal(periodOf(0).id, 'night');
  assert.equal(periodOf(360).id, 'dawn');
  assert.equal(periodOf(720).id, 'day');
  assert.equal(periodOf(1080).id, 'dusk');
  assert.equal(periodOf(1320).id, 'night');
  assert.equal(periodOf(9999).id, 'night', '越界按取模回绕（9999 % 1440 = 1359）');
  const ids = PERIODS.map(p => p.id);
  assert.ok(ids.includes('night') && ids.includes('day'));
});

test('推进：按轮数走分钟，跨日 +1，负轮回溯', () => {
  assert.deepEqual(advance({ day: 1, min: 0 }, 1), { day: 1, min: DEFAULT_MIN_PER_ROUND });
  assert.deepEqual(advance({ day: 1, min: 1430 }, 3), { day: 2, min: 20 }, '跨日：30 分钟跨过零点');
  assert.deepEqual(advance({ day: 2, min: 0 }, -3, 10), { day: 1, min: 1410 }, '回溯到前一天');
  assert.deepEqual(advance({ day: 1, min: 0 }, -3, 10), { day: 1, min: 0 }, '不退回开局之前');
  assert.deepEqual(advance({ day: 1, min: 0 }, 0), { day: 1, min: 0 });
  assert.deepEqual(advance({ day: 1, min: 0 }, 'x'), { day: 1, min: 0 }, '乱输入不推进');
  assert.deepEqual(advance({ day: 1, min: 0 }, 2, 30), { day: 1, min: 60 });
});

test('钟面：HH:MM、中英短串、夜间标记', () => {
  assert.equal(hhmm(0), '00:00');
  assert.equal(hhmm(1425), '23:45');
  const d = describeClock({ day: 3, min: 725 });
  assert.equal(d.time, '12:05');
  assert.equal(d.period, 'day');
  assert.equal(d.night, false);
  assert.equal(d.short, '第3日 12:05');
  assert.equal(d.short_en, 'Day 3 12:05');
  assert.equal(describeClock({ day: 1, min: 60 }).night, true);
  assert.deepEqual(summarize({ day: 4, min: 600 }), { day: 4, time: '10:00', period: 'day' });
});

test('确定性：同起点同轮数永远同一结果（回放 / 截图对拍靠这条）', () => {
  let c = { day: 1, min: 480 };
  const seq = [];
  for (let i = 0; i < 200; i++) { c = advance(c, 1); seq.push(describeClock(c).time); }
  let d = { day: 1, min: 480 };
  const again = [];
  for (let i = 0; i < 200; i++) { d = advance(d, 1); again.push(describeClock(d).time); }
  assert.deepEqual(seq, again);
  assert.ok(new Set(seq).size > 100, '200 轮里时间确实在走');
});

test('纯核心身份：不碰 DOM / 存储 / 酒馆全局，也不读系统时间', () => {
  const src = readFileSync(join(ROOT, 'map/core/clock.mjs'), 'utf8').replace(/\/\/[^\n]*/g, '');
  for (const g of ['window', 'document', 'localStorage', 'navigator', 'Mvu', 'SillyTavern', 'Date.now', 'Math.random']) {
    assert.ok(!new RegExp(`\\b${g.replace('.', '\\.')}\\b`).test(src), `不该出现 ${g}`);
  }
});
