// F0-3b：记录式对拍（宿主调用序列的快照）。tests/helpers/f0_scenarios.mjs 里 8 个场景只经模块公开 API 驱动引擎，
// 假宿主（tests/helpers/f0_host_stub.mjs）把每一次接口调用记成「名字 + 归一化参数」的序列；时间戳、日期、超长数字
// 一律打码，所以同一份代码跑两遍字节一致。F0-2 把调用点改经 host-adapter 之前先录下快照，改完再跑必须逐条相同——
// 「脚本行为一致」因此是可核对的，而不是只看测试全绿。
// 重新录制（仅在确认改动是有意的之后）：F0_RECORD=1 node --test tests/f0_call_parity.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SCENARIOS, recordAll } from './helpers/f0_scenarios.mjs';
import { fpMask } from './helpers/f0_host_stub.mjs';

const FIX = fileURLToPath(new URL('./fixtures/f0_host_calls.json', import.meta.url));
const got = await recordAll();
const calls = Object.values(got).reduce((n, s) => n + s.filter(l => !l.startsWith('THREW')).length, 0);
if (process.env.F0_RECORD === '1') writeFileSync(FIX, JSON.stringify(got, null, 1) + '\n');
// 快照按同一口径读进来：指纹打码是录制之后才加的，老快照里的 eden_hash 是当时那次时钟的摘要，不是行为差异
const want = existsSync(FIX) ? JSON.parse(readFileSync(FIX, 'utf8')) : null;
const wantOf = id => Array.isArray(want?.[id]) ? want[id].map(fpMask) : want?.[id];

test(`快照覆盖 ${SCENARIOS.length} 个场景、${calls} 次宿主调用，且没有一个场景跑挂`, () => {
  assert.deepEqual(Object.keys(got).sort(), SCENARIOS.map(s => s.id).sort());
  assert.ok(calls > 100, '没记录到调用就是对拍空转');
  for (const [id, seq] of Object.entries(got)) assert.ok(!seq.some(l => l.startsWith('THREW')), `${id} 跑挂了：${seq[0]}`);
});

for (const sc of SCENARIOS) {
  test(`对拍 ${sc.id}：宿主调用序列与快照逐条一致`, () => {
    assert.ok(want, `缺少快照 ${FIX}：先跑 F0_RECORD=1 node --test tests/f0_call_parity.test.mjs`);
    assert.deepEqual(got[sc.id], wantOf(sc.id), `${sc.id} 的调用序列变了`);
  });
}
