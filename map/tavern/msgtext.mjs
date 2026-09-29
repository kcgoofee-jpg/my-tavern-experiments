// 消息正文的解析预处理（eden-map.js readMsgs 与 node 单测共用，G1 / P0）：标签解析 / 关键词扫描用的文本里，
// 剥掉不该参与解析的块——思考链（<think>，含没闭合的流式尾）与变量更新块（<UpdateVariable>，同含流式尾）。
// CoT 回声（模型在思考链里复述 / 起草事件标签）不许种进事件与人物标签：docs/reviews/architecture_and_stream_perf.md §1.4 G1。
// raw 永远不经这里：行程的 JSONPatch、变量提取都要完整原文（readMsgs 另存 raw）。
const THINK = /<think>[\s\S]*?(?:<\/think>|$)/gi;
const UV = /<UpdateVariable>[\s\S]*?(?:<\/UpdateVariable>|$)/gi;

/** 标签解析文本：剥思考链（G1）与变量更新块（通读 R6）。两条都做成「含没闭合的尾」——流式半截时余下全文都算块内。 */
export function parseText(raw) { return String(raw).replace(THINK, ' ').replace(UV, ' '); }
