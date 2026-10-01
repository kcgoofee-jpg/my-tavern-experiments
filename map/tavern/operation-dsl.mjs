// 受限操作 DSL 沙盒（W4，docs/plans/llm-campaign.md；脚本化世界模型的「结构化变更优于自由文本」落地）：
// 后台领航员不许用自由正文改状态——只能返回**原子操作块**，这里负责提取、校验、翻成标准行形状。
// 四个操作（v1 就这四个，裁决 2/3）：
//   OP_EVENT   {cat, place, text, lvl?, layer?}  → 事态显示行（会话级叠加，走 events 同一套类型白名单）
//   OP_CLUE    {name, nx, ny, urgency?}          → 线索节点（core/quests 行形状）
//   OP_MARKER  {id, nx, ny, label}               → 会话级叠加标记（不落任何持久层）
//   OP_SUGGEST {text}                            → 文本建议（永不自动注入聊天，交给宿主 / 用户决定）
// 校验纪律：**throw-not-coerce**（core/layer-registry.mjs normChain 同一口径）——字段类型不对该 op 直接丢弃并计数，
// 绝不猜测转换；每条响应最多 MAX_OPS 个 op；文本命中 events 的示范原文（isExample）（模型复读世界书）→ 丢弃。
// 纯模块：不碰全局 / DOM / 存储 / 网络；不执行任何副作用（apply 只产出描述，送达由宿主做）。
// 前置条件：宿主必须先过 sanitize 链（stripBlocks + msgtext 剥 <think> / <UpdateVariable>）再喂进来——
// CoT 回声不得起草 op（G1 同款风险）。node 单测 tests/operation-dsl.test.mjs。
import { classify, getGeo, isExample } from './events-parse.mjs';
import { seedOf } from '../core/rng.mjs';

export const OPS = ['OP_EVENT', 'OP_CLUE', 'OP_MARKER', 'OP_SUGGEST'];
export const MAX_OPS = 3;
export const MAX_TEXT = 120;

const clip = (v, n) => [...String(v)].slice(0, n).join('');
const isStr = (v, lo, hi) => typeof v === 'string' && [...v].length >= lo && [...v].length <= hi;
const isXY = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const bad = msg => { throw new TypeError(msg); };

/** 各操作的字段校验（收严：缺 / 错类型就 throw，由 parse 捕获计 dropped；多余字段剥掉不报错） */
const VALIDATE = {
  OP_EVENT: o => {
    const { cat, type } = classify(o.cat);
    if (!cat || type === 'other') bad('cat 不在类型白名单（归到「其他」桶的等于在发明类型，裁决 3）');
    if (!isStr(o.place, 1, 60)) bad('place');
    if (!isStr(o.text, 1, 80)) bad('text');
    const lvl = o.lvl === undefined ? 2 : o.lvl;
    if (!Number.isInteger(lvl) || lvl < 0 || lvl > 3) bad('lvl');
    if (o.layer !== undefined && o.layer !== null && !(getGeo()?.layers() ?? [o.layer]).includes(o.layer)) bad('layer');
    return { op: 'OP_EVENT', cat, place: clip(o.place, 60), text: clip(o.text, 80), lvl, ...(o.layer ? { layer: o.layer } : {}) };
  },
  OP_CLUE: o => {
    if (!isStr(o.name, 1, 40)) bad('name');
    if (!isXY(o.nx) || !isXY(o.ny)) bad('nx/ny');
    const urgency = o.urgency === undefined ? 1 : o.urgency;
    if (!Number.isInteger(urgency) || urgency < 1 || urgency > 3) bad('urgency');
    return { op: 'OP_CLUE', name: clip(o.name, 40), nx: o.nx, ny: o.ny, urgency };
  },
  OP_MARKER: o => {
    if (!isStr(o.id, 1, 40)) bad('id');
    if (!isXY(o.nx) || !isXY(o.ny)) bad('nx/ny');
    if (!isStr(o.label, 1, 40)) bad('label');
    return { op: 'OP_MARKER', id: clip(o.id, 40), nx: o.nx, ny: o.ny, label: clip(o.label, 40) };
  },
  OP_SUGGEST: o => {
    if (!isStr(o.text, 1, MAX_TEXT)) bad('text');
    return { op: 'OP_SUGGEST', text: clip(o.text, MAX_TEXT) };
  },
};

/** 文本里提取 + 校验 op 块：行首 `OP_XXX {…}`（JSON 平衡扫描，不依赖换行）。
 *  返回 { ops:[…], dropped, hash }；文本为空 / 没有块 → { ops: [], dropped: 0, hash }。 */
export function parse(text) {
  const s = String(text || '');
  const ops = [];
  let dropped = 0;
  const re = /OP_(EVENT|CLUE|MARKER|SUGGEST)\s*\{/g;
  for (let m; (m = re.exec(s)) && ops.length <= MAX_OPS;) {
    const start = m.index + m[0].length - 1;   // 指向 {
    let depth = 0, end = -1, inStr = false, esc = false;
    for (let i = start; i < s.length && i < start + 2000; i++) {
      const c = s[i];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}') { depth--; if (!depth) { end = i; break; } }
    }
    if (end < 0) { dropped++; break; }   // JSON 没闭合：整条响应的 op 段到此为止（防拖尾噪声连坐）
    re.lastIndex = end + 1;
    const name = 'OP_' + m[1];
    let obj = null;
    try { obj = JSON.parse(s.slice(start, end + 1)); } catch (e) { dropped++; continue; }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) { dropped++; continue; }
    const txt = obj.text;
    if (typeof txt === 'string' && isExample(txt)) { dropped++; continue; }   // 回声黑名单：复读世界书示范原文
    try { ops.push(VALIDATE[name](obj)); } catch (e) { dropped++; }
  }
  return { ops: ops.slice(0, MAX_OPS), dropped: dropped + Math.max(0, ops.length - MAX_OPS), hash: s ? seedOf(s).toString(36) : '' };
}

/** 纯应用描述：把（已校验的）ops 翻成各系统的标准行形状 + 送达目标；**宿主只负责送达**（validate-then-apply，
 *  takeLoot 同款：真实性核对在宿主）。ctx = { floor? }。src 一律 'op'（会话级叠加，非聊天记录真相）。 */
export function apply(ops, ctx = {}) {
  const floor = Number.isInteger(+ctx?.floor) ? +ctx.floor : null;
  const out = { events: [], clues: [], markers: [], suggests: [] };
  for (const op of Array.isArray(ops) ? ops : []) switch (op?.op) {
    case 'OP_EVENT': out.events.push({ cat: op.cat, layer: op.layer || '', place: op.place, lvl: op.lvl, text: op.text, src: 'op', floor, xy: null }); break;
    case 'OP_CLUE': out.clues.push({ name: op.name, nx: op.nx, ny: op.ny, urgency: op.urgency, src: 'op' }); break;
    case 'OP_MARKER': out.markers.push({ id: op.id, nx: op.nx, ny: op.ny, label: op.label, src: 'op' }); break;
    case 'OP_SUGGEST': out.suggests.push(op.text); break;
  }
  return out;
}

/** 响应哈希水位（会话级，state = { seen: [] } 由宿主持有）：同一条响应（按全文指纹）永不处理两次。 */
export function filterSeen(state, parsed) {
  if (!state || !Array.isArray(state.seen)) state = { seen: [] };
  const h = parsed?.hash;
  if (!h) return parsed;
  if (state.seen.includes(h)) return { ...parsed, ops: [], duplicate: true };
  state.seen = [...state.seen, h].slice(-40);
  return parsed;
}
