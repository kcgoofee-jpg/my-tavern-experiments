// 检定失败报告环（W2，docs/plans/llm-campaign.md；环境反馈自省闭环的输入半）：负面检定（潜行被目击、
// 搜刮失手）→ 结构化报告（类型 / 地点 / 坐标 / DC / 掷值 / 差值 / 目击者 / 楼层）→ 下一轮注入给模型，
// 让它基于客观事实做围捕 / 质询 / 警报的连贯剧情，而不是凭空续写「其实没被发现」。
// 纯模块：数据进、报告出。环形缓冲是会话级内存态——报告是提示、不是真相（聊天记录才是唯一真相），
// 丢了可由重算再生：不落聊天变量、不登记存储键、永不进 feedback-report 诊断通道（战役裁决 4）。
// 楼层水位（_inj 标记）保证同一条报告只注入一次；注入通道是 eden-map-events 数组追加（宿主唯一动作）。
// 掷骰口径见 core/stash.mjs search（roll 由调用方给；确定性用 core/rng.mjs seedOf(chatId, floor, id)）。
// node 单测 tests/action_reflection.test.mjs。
import { seedOf } from '../core/rng.mjs';

export const MAX_REPORTS = 5;
export const PREFIX = '[地图检定·环境反馈，已发生的事实] ';
export const KINDS = ['stealth', 'search'];

/** 一次失败检定 → 标准报告。字段收严：kind 不认识 / dc 不是正数 → null（绝不 coerce——layers.normChain 同一口径）。 */
export function failureReport(o) {
  const { kind, place, at, dc, roll, margin, witnesses, floor } = o || {};
  if (!KINDS.includes(kind)) return null;
  const d = Math.round(+dc); if (!Number.isFinite(d) || d <= 0) return null;
  const r = { kind, dc: d, witnesses: [], floor: Number.isInteger(+floor) && +floor >= 0 ? +floor : null, id: '' };
  const p = String(place || '').trim(); if (p) r.place = [...p].slice(0, 60).join('');
  if (Array.isArray(at) && at.length === 2 && at.every(Number.isFinite)) r.at = [Math.round(+at[0] * 1000) / 1000, Math.round(+at[1] * 1000) / 1000];
  if (Number.isFinite(+roll)) r.roll = Math.max(1, Math.min(20, Math.round(+roll)));
  if (Number.isFinite(+margin)) r.margin = Math.round(+margin);
  r.witnesses = [...new Set((Array.isArray(witnesses) ? witnesses : []).map(x => String(x || '').replace(/\s+/g, '')).filter(Boolean))].slice(0, 3);
  r.id = seedOf(r.kind, r.floor ?? '', r.place || '', r.at ? r.at.join(',') : '', r.dc).toString(36);
  return r;
}

/** 入环：同 id（同楼层同地点同检定）刷新不重复；超 cap 淘汰最旧。state = { list: [] }（宿主持有，原地更新）。 */
export function push(state, r) {
  if (!state || !r?.id) return state;
  state.list = (state.list || []).filter(x => x.id !== r.id).concat(r).slice(-MAX_REPORTS);
  return state;
}

/** 渲染一条：`潜行失败：书房，被巡逻甲目击（DC 14，掷 8，差 6）`；地点缺就报坐标；再缺就是「途中」。 */
export function render(r) {
  const where = r?.place || (r?.at ? `坐标(${r.at[0]},${r.at[1]})` : '途中');
  const w = r?.witnesses?.length ? `，被${r.witnesses.join('、')}目击` : '';
  const head = r?.kind === 'stealth' ? `潜行失败：${where}${w}` : `搜刮失败：${where}`;
  const nums = `（DC ${r?.dc}${r?.roll != null ? `，掷 ${r.roll}` : ''}，差 ${r?.margin ?? '?'}）`;
  return head + nums;
}

/** 待注入摘要：单行、带指令前缀（events.summarize 同款格式）；没有未注入的报告 → ''。 */
export function digest(state) {
  const pend = (state?.list || []).filter(x => !x._inj);
  return pend.length ? PREFIX + pend.map(render).join('；') : '';
}

/** 注入水位：digest 的内容发出后由宿主调用（同一拍），之后同一条报告不再出现。 */
export const markInjected = state => { for (const x of state?.list || []) x._inj = true; };
