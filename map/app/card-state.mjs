// 版权申明页的角色卡信息三种状态（I-16）：纯函数，测试直接断言。
// no_host = 没有宿主（单独打开）；no_card = 宿主在、但各档都没读到卡信息（列出试过的档）；ok = 有。
export const TIER_NAMES = { bridge: 'bridge', context: 'context' };

/** embedded: 是否嵌在酒馆里；card: 已读到的卡信息或 null；tried: 宿主报告试过的档（['bridge','context']，空 = 一档也没有可用接口） */
export function cardState({ embedded, card, tried } = {}) {
  if (card) return { kind: 'ok' };
  if (!embedded) return { kind: 'no_host' };
  const t = (Array.isArray(tried) ? tried : []).map(String).filter(x => TIER_NAMES[x]);
  return { kind: 'no_card', tried: t.length ? t : ['none'] };
}

/** 状态 → 文案 [键, 缺省中文, 变量]（交给 uiTextOr）；ok 返回 null */
export function cardStateText(st) {
  if (st.kind === 'no_host') return ['s.lic_no_host', '未接入酒馆，读不到角色卡信息', {}];
  if (st.kind === 'no_card') return ['s.lic_no_card', '已接入酒馆，但没读到角色卡信息（已试：{tiers}）。可以在聊天里重新打开地图再试', { tiers: st.tried.join(' / ') }];
  return null;
}
