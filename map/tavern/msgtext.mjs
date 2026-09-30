// 消息正文的解析预处理（eden-map.js readMsgs 与 node 单测共用，G1 / P0）：标签解析 / 关键词扫描用的文本里，
// 剥掉不该参与解析的块——思考链（含多重 / 未闭合的流式尾）与变量更新块（同含流式尾）。
// CoT 回声（模型在思考链里复述 / 起草事件标签）不许种进事件与人物标签：docs/reviews/architecture_and_stream_perf.md §1.4 G1。
// 第二层（任务二 Anti-Preset Interceptor）：第三方预设的思考分隔标记（`<!-- Prism … -->`、`<!-- 1·思考结束 -->`）
// 与思考块家族一起剥——它们同样是展示层碎片，不是叙事；实现在 sanitize.mjs（剥块 / 剥标记同一套）。
// raw 永远不经这里：行程的 JSONPatch、变量提取都要完整原文（readMsgs 另存 raw）。
import { stripMarks } from './sanitize.mjs';

/** 思考块家族：单数 think、<thinking>、<thought>、<analysis>、<reasoning>、redacted 变体（自封体名回引，带属性也认） */
const THINK = /<(think|thinking|thought|analysis|reasoning|redacted_thinking|cot)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi;
/** 变量更新块：同上（闭合的整块剥掉；流式半截从开标签起算到末尾） */
const UV = /<UpdateVariable\b[^>]*>[\s\S]*?(?:<\/UpdateVariable\s*>|$)/gi;

/**
 * 标签解析文本：剥思考链（G1）+ 变量更新块（通读 R6）+ CoT / Prism 标记残留。
 * 三条都做成「含没闭合的尾」——流式半截时余下全文都算块内；多重思考块逐对剥（不依赖只有一对）。
 */
export function parseText(raw) {
  return stripMarks(String(raw).replace(THINK, ' ').replace(UV, ' '));
}
