// 社区预设文本净化管线（Part 7，2026-09-30）：第三方高级预设（Ako / 斯德哥尔摩症 / 智脑-Z 这类）会在楼层原文里
// 注入思考链、状态栏、锚点等半结构化块。这些块不参与事件 / 人物标签解析（与 msgtext.mjs 的 G1 同理——思考链里
// 复述的标签不许种进事态），也不该进行程与摘要；其中状态栏里写明的「地点 / 在场」反而可以吸收成兜底提示。
// 纯数据进出：不碰酒馆全局、不碰 DOM。宿主按设置把标签表递给 ContextPipeline（edenMapSanitize 关 / edenMapSanitizeTags 自定义）；
// node 单测直接喂数据（tests/sanitize.test.mjs）。

/** 默认剥离的预设块标签（大小写不敏感、带属性也认）：用户点名的四类 + 常见变体。
 *  <think> / <UpdateVariable> 由 msgtext.mjs parseText 惯例处理，不在这里重复。 */
export const DEFAULT_STRIP_TAGS = ['thinking', 'liwe', 'state', 'anchor', 'collapse', 'hidden'];

/** 设置 → 标签表（宿主构造 ContextPipeline 时用）：edenMapSanitize=0 全关；edenMapSanitizeTags 是 JSON 数组自定义表；其余默认表。 */
export const resolveTags = (get, fallback = DEFAULT_STRIP_TAGS) => {
  try { if (get('edenMapSanitize') === '0') return []; const c = get('edenMapSanitizeTags');
    const list = c ? JSON.parse(c) : null;
    return Array.isArray(list) && list.length ? list.map(String).filter(t => typeof t === 'string') : fallback;
  } catch (e) { return fallback; }
};

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 剥掉指定标签的成块内容：<tag …>…</tag>，含没闭合的流式尾（余下全文都算块内，G1 同一手法）；
 *  再顺手清掉成对剥离后残留的孤儿闭标签。tags 为空原样返回。 */
export function stripBlocks(text, tags) {
  let out = String(text ?? '');
  for (const t of Array.isArray(tags) ? tags : []) {
    if (typeof t !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(t)) continue;   // 只认合法标签名，防正则注入
    out = out.replace(new RegExp(`<${t}(?:\\s[^>]*)?>[\\s\\S]*?(?:</${t}>|$)`, 'gi'), ' ')
             .replace(new RegExp(`</${t}>`, 'gi'), ' ');
  }
  return out;
}

/** 一次性净化（ContextPipeline.readMsgs 的 raw 路径用）：剥社区预设块，保留 <UpdateVariable>（行程的 JSONPatch 要用）。 */
export const sanitize = (raw, tags) => stripBlocks(raw, tags);

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
