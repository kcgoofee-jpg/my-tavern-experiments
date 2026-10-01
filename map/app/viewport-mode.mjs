// 视口 / 设备档位标志（S5-2 自 util.mjs 拆出）：窄面板与粗指针。
export let narrow = false;
// 触屏或低内存设备：瓦片缓存减半（约 30 MB），避免手机 WebView 因内存被回收
export const coarse = matchMedia('(pointer: coarse)').matches || (navigator.deviceMemory || 8) <= 4;   // 手机 / 窄面板：隐藏小地图（信息卡的底部抽屉由 CSS 媒体查询处理）
export function setNarrow(v) { return (narrow = v); }
