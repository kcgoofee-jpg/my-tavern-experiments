// 社区预设文本净化管线（Part 7，2026-09-30）：第三方高级预设（Ako / 斯德哥尔摩症 / 智脑-Z 这类）会在楼层原文里
// 注入思考链、状态栏、锚点等半结构化块。这些块不参与事件 / 人物标签解析（与 msgtext.mjs 的 G1 同理——思考链里
// 复述的标签不许种进事态），也不该进行程与摘要；其中状态栏里写明的「地点 / 在场」反而可以吸收成兜底提示。
// 纯数据进出：不碰酒馆全局、不碰 DOM。宿主按设置把标签表递给 ContextPipeline（edenMapSanitize 关 / edenMapSanitizeTags 自定义）；
// node 单测直接喂数据（tests/sanitize.test.mjs）。

/**
 * 第三方预设往正文里塞的**展示用容器**（大小写不敏感、带属性也认）：这些块只在预设自己的「显示时」正则里
 * 被渲染成卡片 / 面板，正文解析（事件、人物栏、⌖ 标签）不该看见里面的复述内容——与思考链同一风险，
 * 所以在解析文本这一侧一律剥掉（渲染层不动，聊天记录一个字节都不改）。
 *
 * 收表的判据：块内**只可能是展示内容**，绝不承载地图自己的 ⌖ / data-tcmap 标签。
 * 明确**不收**的两个（与判据冲突，收进来会把地图标签一起吃掉）：
 *   htm1fenge —— ⌖ 事件标签就写在里面（tests/events-parse.test.mjs 的 span() 夹具就是这个形状）；
 *   now_plot  —— 块内是正文对话 / 旁白本体，剥掉等于把整段叙事从解析里删掉。
 */
export const PRESET_BLOCK_TAGS = ['meow_fm', 'time_format', 'branches', 'aftertalk', 'parallel_world', 'variablecheck', 'finish', '状态面板', '角色状态面板'];
/** 默认剥离的预设块标签：原先的六类（用户点名的四类 + 常见变体）+ 上表。
 *  <think> / <UpdateVariable> 由 msgtext.mjs parseText 惯例处理，不在这里重复。 */
export const DEFAULT_STRIP_TAGS = ['thinking', 'liwe', 'state', 'anchor', 'collapse', 'hidden', ...PRESET_BLOCK_TAGS];

/** 设置 → 标签表（宿主构造 ContextPipeline 时用）：edenMapSanitize=0 全关；edenMapSanitizeTags 是 JSON 数组自定义表；其余默认表。 */
export const resolveTags = (get, fallback = DEFAULT_STRIP_TAGS) => {
  try { if (get('edenMapSanitize') === '0') return []; const c = get('edenMapSanitizeTags');
    const list = c ? JSON.parse(c) : null;
    return Array.isArray(list) && list.length ? list.map(String).filter(t => typeof t === 'string') : fallback;
  } catch (e) { return fallback; }
};

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** 合法标签名（防正则注入）：ASCII 或中文起始，后接 ASCII / 数字 / 下划线 / 连字符 / 中文；≤32 字 */
const TAG_NAME = /^[A-Za-z\u4e00-\u9fff][A-Za-z0-9_\u4e00-\u9fff-]{0,31}$/;

/** 剥掉指定标签的成块内容：<tag …>…</tag>，含没闭合的流式尾（余下全文都算块内，G1 同一手法）；
 *  再顺手清掉成对剥离后残留的孤儿闭标签。tags 为空原样返回。 */
export function stripBlocks(text, tags) {
  let out = String(text ?? '');
  for (const t of Array.isArray(tags) ? tags : []) {
    if (typeof t !== 'string' || !TAG_NAME.test(t)) continue;   // 只认合法标签名，防正则注入
    out = out.replace(new RegExp(`<${t}(?:\\s[^>]*)?>[\\s\\S]*?(?:</${t}>|$)`, 'gi'), ' ')
             .replace(new RegExp(`</${t}>`, 'gi'), ' ');
  }
  return out;
}

// ---------------- CoT / 标记碎片（Anti-Preset Interceptor 第二层） ----------------
// 预设的思考块分隔标记形如 `<!-- 1·思考结束 -->` / `<!-- end_of_Subtext_think -->`（Prism 一类的溢出标记同理）。
// 闭合的注释一律剥掉——它是纯粹的展示标记，里面不可能有叙事；**没闭合**的那一截要小心：可能只是模型吐坏了，
// 但后面未必是垃圾。判据用「像不像一行标记」而不是「有没有汉字」：标记是短的一行、没有句读；
// 正文再短也多半带句读（，。！？）或换行，所以只要出现句读 / 换行就整段留着（宁可留着脏，也不切掉正文）。
const CLOSED_COMMENT = /<!--[\s\S]*?-->/g;
const MARK_TAIL = /^(?![^\n]*[，。！？；：、,.!?;:])[^\n]{0,60}$/;
/** 剥 CoT / Prism 标记残留：闭合注释全剥；没闭合的那截在「像一行标记」时从那里切到末尾。 */
export function stripMarks(text) {
  const out = String(text ?? '').replace(CLOSED_COMMENT, ' ');
  const i = out.indexOf('<!--');
  if (i < 0) return out;
  return MARK_TAIL.test(out.slice(i + 4)) ? out.slice(0, i) : out;
}

/** 一次性净化（ContextPipeline.readMsgs 的 raw 路径用）：剥社区预设块与 CoT 标记，保留 <UpdateVariable>
 *  （行程的 JSONPatch 要用；变量块是卡自己的机器块，地图只读不改）。 */
export const sanitize = (raw, tags) => stripMarks(stripBlocks(raw, tags));

const HERE_KEY = /(?:地点|位置|所在|当前位置|当前所在|location)\s*[:：＝=]\s*/i;
const HERE_BRACKET = /[【\[]\s*(?:地点|位置|所在|当前位置|当前所在|location)\s*[】\]]\s*[:：]?/i;   // 【地点】…（无冒号的中括号状态栏）
const PRESENT_KEY = /(?:在场|在场人物|在场人员|同行|队伍|present|present\s*characters|characters\s*present)\s*[:：＝=]\s*/i;
const TRIM_VAL = s => String(s || '').replace(/^[\s【\[「《"'“‘—-]+|[\s】\]」》"'”‘—-]+$/g, '').trim();

/** 从社区预设的状态栏输出里吸收「当前地点」提示（here 兜底链的最后一级用；MVU / 正文 ⌖ 标签都没有时才轮到它）。
 *  规则保守：先剥思考链与变量块（那里面有权威数据，别把变量块里的示例当地点），再取最后一个 key 行（后写的覆盖先写的）；
 *  值剥掉包裹装饰（【】「」引号、markdown），长度 1–60，含换行不算。返回 { here: string|null }。 */
export function presetHereHint(raw) {
  const text = String(raw ?? '').replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, ' ')
    .replace(/<UpdateVariable>[\s\S]*?(?:<\/UpdateVariable>|$)/gi, ' ')
    .replace(/<thinking>[\s\S]*?(?:<\/thinking>|$)/gi, ' ');
  let here = null;
  for (const line of text.split('\n')) {
    let val = null;
    if (HERE_KEY.test(line)) val = (line.match(new RegExp(HERE_KEY.source + '(.*)', 'i')) || [])[1];
    else if (HERE_BRACKET.test(line)) val = (line.match(new RegExp(HERE_BRACKET.source + '(.*)', 'i')) || [])[1];
    if (val == null) continue;
    const v = TRIM_VAL(val);
    if (v && !/^(?:无|未知|unknown|none|—|-|－+|…+|\.{1,})$/i.test(v) && v.length <= 60) here = v;
  }
  return { here };
}

// ---------------- 泄露防御网（任务三）：模型把整段 HTML / 占位符吐进正文时静默抹掉 ----------------
// 三类泄露：① 卡片没消费掉的占位标识符（`<StatusPlaceHolderImpl/>`）；② 模型把卡的整段状态栏 HTML
// 源码（`<!DOCTYPE html>` 或 `<div class="statusbar-container">` 起手，含 <style> / <script>）当正文吐出来；
// ③ 没闭合的 `<UpdateVariable>` 残片。全部是**渲染层的脏东西**，不是聊天内容——正文一个字都不动。
// 纯函数：只做字符串进出，不碰 DOM / 全局；幂等（清干净的文本再跑一遍原样返回）。tests/html_leak_filter.test.mjs。
/** 占位标识符（自闭合 / 带属性 / 成对都认） */
export const PLACEHOLDER_RX = /<\s*StatusPlaceHolderImpl\b[^>]*\/?>(?:[\s\S]*?<\s*\/\s*StatusPlaceHolderImpl\s*>)?/gi;
const DOCTYPE_RX = /<!DOCTYPE\s+html\b[\s\S]*?<\s*\/\s*html\s*>/gi;
const DOCTYPE_OPEN_RX = /<!DOCTYPE\s+html\b/i;
const STATUS_DIV_RX = /<div\b[^>]*class\s*=\s*["']?[^"'>]*statusbar-container/i;
const DIV_TAG_RX = /<\/?div\b[^>]*>/gi;
const UV_OPEN_RX = /<UpdateVariable\b[^>]*>/i;
const UV_CLOSE_RX = /<\/\s*UpdateVariable\s*>/gi;
const BLANK_RX = /\n{3,}/g;
// 判定用副本：不带 g（/g/ 正则的 lastIndex 会残留，让 .test() 时真时假）
const PLACEHOLDER_HINT = /StatusPlaceHolderImpl/i, UV_CLOSE_HINT = /<\/\s*UpdateVariable\s*>/i;

/** 从 openEnd 起对 div 配平，返回闭合标签之后的位置；配不平（流式半截）返回 -1 = 到正文末尾 */
function balanceDiv(s, openEnd) {
  const re = new RegExp(DIV_TAG_RX.source, 'gi'); re.lastIndex = openEnd;
  let depth = 1;
  for (let m; (m = re.exec(s));) {
    if (m[0].startsWith('</')) { if (--depth === 0) return m.index + m[0].length; }
    else depth++;
  }
  return -1;
}
/**
 * 变量块残片：闭合的整块**原样留着**（那是卡自己的正则负责隐藏的机器块，地图一个字节都不动它）；
 * 没闭合的从开标签起到末尾切掉（流式半截就是这个形状）；整段里连开标签都没有的孤儿闭标签清掉。
 * 幂等是硬要求：绝不能在头一遍就把闭合块的闭标签当孤儿抹掉——那样第二遍会把它后面的正文一起切了。
 */
function stripUvFragments(s) {
  let out = s;
  for (let from = 0; ;) {
    const open = out.indexOf('<UpdateVariable', from);
    if (open < 0) break;
    const openEnd = out.indexOf('>', open);
    const close = openEnd < 0 ? -1 : out.indexOf('</UpdateVariable', openEnd);
    if (close < 0) { out = out.slice(0, open); break; }
    from = close + 1;   // 闭合块：跳过，继续往后找（不动它）
  }
  return out.indexOf('<UpdateVariable') < 0 ? out.replace(UV_CLOSE_RX, '') : out;
}
/** 抹掉正文里的三类泄露块（保留换行结构；连着的空行压到一行）。 */
export function stripLeaks(text) {
  let out = String(text ?? '');
  if (!out) return out;
  out = out.replace(PLACEHOLDER_RX, '');
  out = out.replace(DOCTYPE_RX, '\n');
  if (DOCTYPE_OPEN_RX.test(out)) out = out.slice(0, out.search(DOCTYPE_OPEN_RX));   // 没收尾的 doctype：从它起到末尾都是源码
  for (let i = 0; i < 12; i++) {   // 一段状态栏 HTML 里可能套着好几个同 class 的块
    const m = STATUS_DIV_RX.exec(out);
    if (!m) break;
    const openEnd = out.indexOf('>', m.index + m[0].length - 1);
    if (openEnd < 0) { out = out.slice(0, m.index); break; }
    const end = balanceDiv(out, openEnd + 1);
    out = end < 0 ? out.slice(0, m.index) : out.slice(0, m.index) + out.slice(end);
  }
  return stripUvFragments(out).replace(BLANK_RX, '\n\n');
}
/** 这段文本里有没有泄露块（宿主据此决定要不要动渲染出来的 DOM；没泄露 = 一个字节都不动）。 */
export const hasLeak = text => {
  const s = String(text ?? '');
  if (!s) return false;
  return PLACEHOLDER_HINT.test(s) || DOCTYPE_OPEN_RX.test(s) || STATUS_DIV_RX.test(s) || UV_CLOSE_HINT.test(s);
};

/** 状态栏「在场」行 → 名字数组（人物栏的补充来源，只报不写）：顿号 / 逗号 / 斜杠 / 空格分隔，最多 12 个、每个 ≤ 20 字。 */
export function presetPresentHint(raw) {
  const text = String(raw ?? '').replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, ' ')
    .replace(/<UpdateVariable>[\s\S]*?(?:<\/UpdateVariable>|$)/gi, ' ');
  let present = [];
  for (const line of text.split('\n')) {
    if (!PRESENT_KEY.test(line)) continue;
    const m = line.match(new RegExp(PRESENT_KEY.source + '(.*)', 'i'));
    const v = TRIM_VAL(m?.[1] ?? '');
    if (!v || /^无|unknown|none$/i.test(v)) continue;
    const names = v.split(/[、,，/;；·]+/).map(x => TRIM_VAL(x)).filter(x => x && x.length <= 20);
    if (names.length && names.length <= 12) present = names;
  }
  return { present };
}
