// 地图标记开卡时画记录卡的那对函数（app/markers.mjs 调，app/place-card.mjs 装）。
// 单独一个小模块是为了躲开成环：markers 与 place-card 本来就互相需要（showCard ↔ 记录卡），
// 放在这里就没有求值顺序的问题了。纯数据，不碰 DOM。
export const placeCardBridge = { recordOf: null, prependRecord: null };
