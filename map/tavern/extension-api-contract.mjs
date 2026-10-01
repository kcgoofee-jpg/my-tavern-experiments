// window.parent.EdenMap 公共 API 的机读契约（G6 / P0，handoff 准则 1）。文档面在 docs/content-compat.md；
// 这张表是单测可断言的机读面（tests/extension-api-contract.test.mjs），宿主暴露时逐项过 fnGuard（host-tavernhelper.mjs）。
// 值 = 该方法的最少形参个数（fn.length，默认参数不计长）；契约里的方法「是函数且形参够」才进暴露面——
// 不符的（缺席 / 形参不足）被剔除并单次告警，调用方拿到 undefined，走自己的降级。
import { fnGuard } from './host-tavernhelper.mjs';

export const EDEN_API = {
  setCustom: 1, removeCustom: 1, getCustom: 0, setWorldbookSync: 1,   // setCustom 的 patch 有默认值：fn.length = 1
  setRoomAlias: 2, removeRoomAlias: 1, getRooms: 0,
  setInv: 1, removeInv: 1, getInv: 0,   // 空间化背包（Part 5-1）：setInv(name, patch) / removeInv(idOrName) / getInv()
  getOutfit: 0, getClock: 0, setAvatar: 2, storage: 0, removeAvatar: 1,
  getCharacters: 0, flyTo: 1, sources: 0, selfcheck: 0, on: 2, off: 2,   // selfcheck 的 o 有默认值：fn.length = 0
};

/** 暴露面 = api 逐项过守卫：契约里的方法「是函数且形参够」才带出去（不符的单次告警并剔除）；契约外的字段（值字段等）原样带过。 */
export function guardApi(api, contract = EDEN_API, guard = fnGuard) {
  const src = api || {}, out = {};
  for (const [k, v] of Object.entries(src)) {
    if (contract[k] === undefined) { out[k] = v; continue; }
    const g = guard(`EdenMap.${k}`, v, contract[k]);
    if (g) out[k] = g;
  }
  for (const k of Object.keys(contract)) if (!(k in src)) guard(`EdenMap.${k}`, src[k], contract[k]);   // 契约里有、api 没有：也告警一次（暴露面里自然没有它）
  return Object.freeze(out);
}
