// 查看器的核心状态（原内联主脚本的全局 let）：当前地图、注册表、OSD 实例、焦点请求。别的模块读用 import（活绑定），写用 set*()。
// 从 viewer.html 内联主脚本拆出（arch-v2 §6 第 6 步）。模块之间显式 import；可变状态只由声明它的模块写，别处经 set*()。
export let osdViewer, aspect = 1, worldData, mapRegistry, currentMapId = null, currentMapData = null, overviewMapData = null, depthData = null, sleeping = null, pendingFocus = null, pendingHome = false;
export function setCurrentMapId(v) { return (currentMapId = v); }
export function setAspect(v) { return (aspect = v); }
export function setPendingFocus(v) { return (pendingFocus = v); }
export function setCurrentMapData(v) { return (currentMapData = v); }
export function setOverviewMapData(v) { return (overviewMapData = v); }
export function setDepthData(v) { return (depthData = v); }   // 该层的纵深数据（maps.json 的 depth 字段；没有该字段时为 null）
export function setPendingHome(v) { return (pendingHome = v); }
export function setSleeping(v) { return (sleeping = v); }
export function setOsdViewer(v) { return (osdViewer = v); }
export function setMapRegistry(v) { return (mapRegistry = v); }
export function setWorldData(v) { return (worldData = v); }
