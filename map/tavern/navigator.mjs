// 领航员网关（W5，docs/plans/llm-campaign.md）：私有 API Key 驱动的后台推演——调度、输入装配、响应门控
// 全在这里（纯模块）；HTTP 请求与一切副作用在宿主（llm.mjs 只算「该怎么发」，本模块不碰网络 / 存储 / 定时器）。
// 调度复用 tick.plan 的让路语义（面板活着 / 正在生成 / 实例已死 / 间隔未到一律不跑；tick.mjs 一行不动，裁决 1），
// 但自有节奏与下限（60 s：真打 API 的后台服务，不该像本地缓存预热那么勤快）。
// 输入装配 = 空间坐标契约（W1）+ 事态摘要（events.summarize）+ 失败报告摘要（W2，Orak 反思环的输入），
// 系统提示词把它锁死在 op 块文法里（W4）；默认关、首跑显式同意（wbsync 先例，裁决 3）；日志只出脱敏形态。
// node 单测 tests/navigator.test.mjs。
import { plan as yieldPlan } from './tick.mjs';

export const KEY = 'edenMapNav';                 // 开关 / 节奏：'' 缺省=关（默认不开）、'1'=默认节奏、数字=毫秒
export const CFG_KEY = 'edenMapNavCfg';          // 配置 JSON：{ provider, key, base, model }（llm.checkConfig 的形状）
export const CONSENT_KEY = 'edenMapNavConsent';  // 首跑同意水位：'1' = 用户已点头
export const DEFAULT_MS = 120000;
export const MIN_MS = 60000;
export const MAX_MS = 600000;

/** 设置项 → 间隔（毫秒）。'' / '0' / 乱值 = 关（默认不开——领航员要花用户的钱，必须显式打开） */
export function intervalOf(get) {
  try {
    const s = String(get?.(KEY) ?? '').trim();
    if (!s || s === '0') return 0;
    if (s === '1') return DEFAULT_MS;
    const v = Number(s);
    if (!Number.isFinite(v) || v <= 0) return 0;
    return Math.max(MIN_MS, Math.min(MAX_MS, Math.round(v)));
  } catch (e) { return 0; }
}

/** 配置读取（容错）：只取四个字段，其余剥掉；key 原样取（只进请求头，日志走 llm.redact） */
export function cfgOf(get) {
  const blank = { provider: '', key: '', base: '', model: '' };
  try {
    const o = JSON.parse(get?.(CFG_KEY) || '{}');
    if (!o || typeof o !== 'object' || Array.isArray(o)) return blank;
    return { provider: String(o.provider || '').trim(), key: String(o.key || ''), base: String(o.base || '').trim(), model: String(o.model || '').trim() };
  } catch (e) { return blank; }
}

/** 系统提示词（确定性字符串，不掺卡内专有名词——类型 / 地名词表由装配时的输入给出） */
export function systemPrompt() {
  return [
    '你是地图领航员：基于给出的事实（空间坐标契约、事态、检定失败报告）提出下一步的地图层建议。',
    '铁律：',
    '- 只输出 <eden-ops> 包裹的 op 块，一行一个：OP_EVENT {…} / OP_CLUE {…} / OP_MARKER {…} / OP_SUGGEST {…}',
    '- 最多 3 条；op 块之外一个字都不要写；没有值得建议的就输出空的 <eden-ops></eden-ops>',
    '- 只依据给出的事实，不编造没有发生的事件；地点 / 类型名必须用输入里出现过的写法',
    '- 事实之间的矛盾按失败报告（检定结果）为准：它代表已发生的客观结果',
  ].join('\n');
}

/** 输入装配：o = { here?, floor?, spatial?, eventsSummary?, failrep? } → messages（system + user 两段）。
 *  只拼给出的事实；缺的段直接略过（不给模型留编造的空位）。确定性：同输入同输出。 */
export function assemble(o = {}) {
  const parts = [];
  const sp = String(o.spatial || '').trim();
  const ev = String(o.eventsSummary || '').trim();
  const fr = String(o.failrep || '').trim();
  if (sp) parts.push('[空间契约]\n' + sp);
  if (ev) parts.push('[事态]\n' + ev);
  if (fr) parts.push('[检定事实]\n' + fr);
  const user = [`【当前】${String(o.here || '').trim()}（第 ${Number.isInteger(+o.floor) ? +o.floor : '?'} 楼）`, ...parts, '任务：给出 ≤3 条 op 建议；没有就给空块。'].join('\n\n');
  return [{ role: 'system', content: systemPrompt() }, { role: 'user', content: user }];
}

/** 响应门控：宿主已过 sanitize 链（剥 think / 变量块）→ op 解析 + 响应水位（同响应永不二次）。 */
export function gate(state, text) {
  const p = parse(text);
  return filterSeen(state, p);
}

/** 调度判定：直接复用 tick.plan 的让路语义（alive / generating / dead / wait），裁决 1 的「tick 一行不动」。 */
export const plan = (now, o) => yieldPlan(now, o);

/** 记账（tick.ledger 同形状）：自检与设置页看得到「领航员在不在干活 / 上次跑出几条 op」。 */
export function ledger(prev, { now, ms = 0, n = 0, dropped = 0 } = {}) {
  const p = prev && typeof prev === 'object' ? prev : {};
  return { lastAt: Number(now) || p.lastAt || 0, runs: (Number(p.runs) || 0) + 1,
    lastMs: Math.max(0, Math.round(Number(ms) || 0)), lastN: Math.max(0, Math.round(Number(n) || 0)),
    lastDropped: Math.max(0, Math.round(Number(dropped) || 0)) };
}

export { parse, filterSeen, apply } from './ops.mjs';
import { parse, filterSeen } from './ops.mjs';
