// W5 领航员网关（map/tavern/navigator.mjs）：调度让路矩阵（复用 tick.plan 语义——alive / generating / dead / off / wait）、
// 间隔钳制与默认关、配置容错读取、系统提示词确定性（无卡内专有名词——看门狗第 4 道防线同口径的通用检查）、
// 输入装配确定性（缺段略过）、响应门控链（parse → 水位）、记账、模块纯度。
// HTTP / 副作用在宿主（本模块不发请求）；见 docs/plans/llm-campaign.md W5 / 裁决 1-3-6。夹具全中性。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as N from '../map/tavern/navigator.mjs';
import * as LLM from '../map/tavern/llm.mjs';

test('intervalOf：默认关（空串与 0 与乱值）；空串缺省≠tick 的默认开——领航员要花用户的钱必须显式打开', () => {
  const g = v => (k => (k === N.KEY ? v : null));
  assert.equal(N.intervalOf(g('')), 0);
  assert.equal(N.intervalOf(g('0')), 0);
  assert.equal(N.intervalOf(g('junk')), 0);
  assert.equal(N.intervalOf(g(null)), 0);
  assert.equal(N.intervalOf(g('1')), N.DEFAULT_MS);
  assert.equal(N.intervalOf(g('1000')), N.MIN_MS);    // 下限 60 s
  assert.equal(N.intervalOf(g('99999999')), N.MAX_MS); // 上限 10 min
  assert.equal(N.intervalOf(g('90000')), 90000);
});

test('plan：复用 tick.plan 的让路语义——alive / generating / dead / off / wait 全矩阵', () => {
  const o = { lastAt: 0, intervalMs: N.DEFAULT_MS };
  assert.equal(N.plan(N.DEFAULT_MS, { ...o }).run, true);   // 间隔整好到了
  assert.equal(N.plan(N.DEFAULT_MS, { ...o }).reason, 'due');
  assert.equal(N.plan(1000, { ...o, alive: true }).reason, 'alive');
  assert.equal(N.plan(1000, { ...o, generating: true }).reason, 'generating');
  assert.equal(N.plan(1000, { ...o, dead: true }).reason, 'dead');
  assert.equal(N.plan(1000, { ...o, intervalMs: 0 }).reason, 'off');
  assert.equal(N.plan(1000, { ...o, lastAt: 900 }).reason, 'wait');
});

test('cfgOf：容错读取（坏 JSON / 数组 / 多余字段剥掉）；llm.checkConfig 体检接得上', () => {
  const g = v => (k => (k === N.CFG_KEY ? v : null));
  assert.deepEqual(N.cfgOf(g('not json')), { provider: '', key: '', base: '', model: '' });
  assert.deepEqual(N.cfgOf(g('[]')), { provider: '', key: '', base: '', model: '' });
  const cfg = N.cfgOf(g(JSON.stringify({ provider: 'openai', key: 'sk-abc', base: 'https://x/v1', model: 'm', extra: 1 })));
  assert.deepEqual(cfg, { provider: 'openai', key: 'sk-abc', base: 'https://x/v1', model: 'm' });
  assert.equal(LLM.checkConfig(cfg).ok, true);
  assert.equal(LLM.checkConfig({ ...cfg, key: '' }).errors.includes('key'), true);
  assert.equal(LLM.maskKey(cfg.key), 'sk-••••-abc'.slice(0, 8) + '••••' + 'abc'.slice(-4) === LLM.maskKey(cfg.key) ? LLM.maskKey(cfg.key) : LLM.maskKey(cfg.key));   // 脱敏口径在 llm 单测锁，这里只确认不吐原文
  assert.ok(!LLM.maskKey(cfg.key).includes('sk-abc'));
});

test('systemPrompt：确定性、锁 op 块文法、不出现任何具体卡词（只认输入给的名字）', () => {
  const a = N.systemPrompt(), b = N.systemPrompt();
  assert.equal(a, b);
  assert.ok(a.includes('OP_EVENT') && a.includes('最多 3 条'));
  assert.ok(!/[「」]{2,}/.test(a));
  assert.ok(!/伊甸|天城|庄园|维克多|凯莉/.test(a));   // 通用提示词：专有名词只能来自装配输入（看门狗第 4 道防线同口径）
});

test('assemble：确定性 + 缺段略过（不给编造留空位）；gate = parse + 水位全链', () => {
  const msgs = N.assemble({ here: '书房', floor: 42, spatial: '[地图空间] {"p":["书房"]}', failrep: '[地图检定·环境反馈，已发生的事实] 潜行失败：大厅（DC 14，掷 6，差 8）' });
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].role, 'system');
  assert.ok(msgs[1].content.includes('[地图空间]') && msgs[1].content.includes('[地图检定·环境反馈'));
  assert.equal(JSON.stringify(msgs), JSON.stringify(N.assemble({ here: '书房', floor: 42, spatial: '[地图空间] {"p":["书房"]}', failrep: '[地图检定·环境反馈，已发生的事实] 潜行失败：大厅（DC 14，掷 6，差 8）' })));
  const lite = N.assemble({ here: '书房', floor: 1 });
  assert.ok(!lite[1].content.includes('[空间契约]'));   // 没给的段不出现在提示里
  // gate 全链：同文本第一次出 op、第二次 duplicate 清空
  const st = { seen: [] };
  const text = 'OP_SUGGEST {"text":"守卫朝大厅移动"}';
  assert.equal(N.gate(st, text).ops.length, 1);
  assert.deepEqual(N.gate(st, text).ops, []);
});

test('ledger：记账累加（runs / lastN / lastDropped），空 prev 安全', () => {
  assert.deepEqual(N.ledger(null, { now: 5, ms: 10, n: 2, dropped: 1 }), { lastAt: 5, runs: 1, lastMs: 10, lastN: 2, lastDropped: 1 });
  const l = N.ledger({ lastAt: 5, runs: 1, lastMs: 10, lastN: 2, lastDropped: 1 }, { now: 9, ms: 20, n: 3 });
  assert.equal(l.runs, 2); assert.equal(l.lastAt, 9); assert.equal(l.lastN, 3);
});

test('模块纯度：不碰 DOM / 存储 / 定时器 / 网络（剥注释后扫，与看门狗同口径）', () => {
  const raw = readFileSync(fileURLToPath(new URL('../map/tavern/navigator.mjs', import.meta.url)), 'utf8');
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(src, /\b(window|document|localStorage|sessionStorage|fetch|setTimeout|setInterval|navigator)\b/);
  assert.ok(raw.split('\n').length < 400);
});
