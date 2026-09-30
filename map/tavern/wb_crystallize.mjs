// 剧情事实自动结晶（W7，docs/plans/llm-campaign.md Part B 任务二）：把剧情里坐实的长期事实
//（⌖事实 地点：内容，W7 新标签）沉淀成**我们附加书**里的关键词触发条目——下次聊到同一地点，
// 世界书自动把事实喂回上下文，长篇不遗忘。
// 数据流：宿主把消息窗口交给 collectFacts（从 ⌖事实 标签重放收集，同 key 取最新——聊天记录是唯一真相，
// 无第二状态存储）→ drafts 按内容指纹给稳定 id（map.fact.<hash>）+ LRU 容量上限 + 墓碑过滤 → 宿主经
// wbsync 同族写路径进附加书（绝不碰用户自己的书）。已写过的 id 由宿主水位（written 表）去重，重放幂等。
// 纯模块：不碰酒馆全局 / DOM / 存储 / 网络。tests/wb_crystallize.test.mjs。
import { hash } from './events.mjs';

export const PREFIX_ID = 'map.fact.';
export const MAX_FACTS = 40;        // LRU：最多沉淀这么多条（按楼层取最近的）
export const XTAL_VER = 'xtal1';    // 结晶条目的 eden_ver 标记（与发布件条目区分，wbsync merge 视为用户侧不动）

/** 消息窗口 → 事实候选 [{key, text, floor}]：同 key 取最新（最新楼的说法为准），按楼层升序。
 *  parseTags = mvu.parseCustomTags（注入，便于单测）；msg = {floor, text}。 */
export function collectFacts(msgs, parseTags) {
  const map = new Map();
  for (const m of Array.isArray(msgs) ? msgs : []) {
    const floor = Math.round(+m?.floor);
    if (!Number.isFinite(floor) || floor < 0 || typeof m?.text !== 'string') continue;
    for (const t of parseTags?.(m.text) || []) {
      if (t?.op !== 'fact' || !t.key || !t.value) continue;
      map.set(t.key, { key: String(t.key).slice(0, 40), text: String(t.value).slice(0, 160), floor });
    }
  }
  return [...map.values()].sort((a, b) => a.floor - b.floor);
}

/**
 * 事实 → 附加书条目草案：内容照抄剧情原文（canon 纪律），id = map.fact.<hash(key)> 稳定可去重；
 * LRU 按楼层取最近 cap 条；墓碑（用户删过的 id）永不复活（裁决 11）。
 * 返回 [{ id, name, enabled, content, strategy:{type:'selective',keys}, position:{type,order}, extra:{eden_id, eden_ver} , floor }]。
 */
export function drafts(facts, { tombstones = [], cap = MAX_FACTS, order = 430 } = {}) {
  const tomb = new Set(tombstones || []);
  return (Array.isArray(facts) ? facts : [])
    .filter(f => f?.key && f?.text && !tomb.has(PREFIX_ID + hash(f.key)))
    .slice(-Math.max(1, Math.round(+cap) || MAX_FACTS))
    .map(f => {
      const id = PREFIX_ID + hash(f.key);
      return {
        id, name: `剧情事实-${f.key}`, enabled: true, floor: f.floor,
        content: `<剧情事实·${f.key}>\n${f.key}：${f.text}\n</剧情事实·${f.key}>`,
        strategy: { type: 'selective', keys: [f.key] },
        position: { type: 'after_character_definition', order },
        extra: { eden_id: id, eden_ver: XTAL_VER },
      };
    });
}

/** 幂等过滤：already = 已写过 / 已在书里的 id 集合（Set）→ 只留真正新增的草案。 */
export const newDrafts = (draftList, already) => (Array.isArray(draftList) ? draftList : []).filter(d => !already?.has?.(d.id));

/** 墓碑登记（宿主持有的 id 数组上追加，返回新数组；容量对齐 LRU 上限防膨胀）。 */
export const entomb = (tombstones, id) => [...new Set([...(tombstones || []), id])].slice(-MAX_FACTS * 2);
